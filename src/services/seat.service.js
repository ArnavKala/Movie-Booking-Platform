const { Seat, Screen, Show, Booking, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { parsePagination, paginationMeta } = require('../utils/query');
const { MAX_SEATS_PER_SCREEN } = require('../utils/constants');

/** Expands [{ row: 'A', count: 10, category }] into seat documents for a screen. */
function buildSeats(screenId, layout) {
  const rows = new Set();
  const seats = [];
  for (const { row, count, category = 'REGULAR' } of layout) {
    const name = row.toUpperCase();
    if (rows.has(name)) throw ApiError.badRequest(`Duplicate row "${name}" in layout`);
    rows.add(name);
    for (let number = 1; number <= count; number += 1) {
      seats.push({ screen: screenId, row: name, number, label: `${name}${number}`, category });
    }
  }
  if (seats.length > MAX_SEATS_PER_SCREEN) {
    throw ApiError.badRequest(`A screen cannot have more than ${MAX_SEATS_PER_SCREEN} seats`);
  }
  return seats;
}

/** True if any of the seats is part of a CONFIRMED booking for a show that has not started yet. */
async function hasUpcomingBookings(seatIds, session) {
  if (await Payment.exists({ holding: true, expiresAt: { $gt: new Date() }, seats: { $in: seatIds } }).session(session || null)) return true;
  const bookings = await Booking.find({ status: 'CONFIRMED', seats: { $in: seatIds } })
    .select('show')
    .session(session || null)
    .lean();
  if (!bookings.length) return false;
  const upcoming = await Show.exists({
    _id: { $in: bookings.map((b) => b.show) },
    startTime: { $gt: new Date() },
  }).session(session || null);
  return Boolean(upcoming);
}

async function recountScreen(screenId, session) {
  const total = await Seat.countDocuments({ screen: screenId, isActive: true }).session(session || null);
  await Screen.updateOne({ _id: screenId }, { $set: { totalSeats: total } }, { session });
}

async function assertScreen(screenId) {
  const screen = await Screen.findById(screenId);
  if (!screen) throw ApiError.notFound('Screen not found');
  return screen;
}

async function list(query) {
  const { screen, category, isActive } = query;
  const { page, limit, skip } = parsePagination(query);
  const filter = { screen };
  if (category) filter.category = category;
  if (isActive !== undefined) filter.isActive = isActive;

  const [items, total] = await Promise.all([
    Seat.find(filter).sort({ row: 1, number: 1 }).skip(skip).limit(limit).lean(),
    Seat.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const seat = await Seat.findById(id).lean();
  if (!seat) throw ApiError.notFound('Seat not found');
  return seat;
}

async function create(data) {
  await assertScreen(data.screen);
  return withTransaction(async (session) => {
    const [seat] = await Seat.create([data], { session });
    await recountScreen(seat.screen, session);
    return seat;
  });
}

async function createBulk({ screen, seats }) {
  await assertScreen(screen);
  const keys = new Set();
  for (const s of seats) {
    const key = `${s.row}-${s.number}`;
    if (keys.has(key)) throw ApiError.badRequest(`Duplicate seat ${s.row}${s.number} in request`);
    keys.add(key);
  }
  const existing = await Seat.countDocuments({ screen });
  if (existing + seats.length > MAX_SEATS_PER_SCREEN) {
    throw ApiError.badRequest(`A screen cannot have more than ${MAX_SEATS_PER_SCREEN} seats`);
  }
  return withTransaction(async (session) => {
    const docs = seats.map((s) => ({ ...s, screen, label: `${s.row}${s.number}` }));
    const created = await Seat.insertMany(docs, { session });
    await recountScreen(screen, session);
    return created;
  });
}

async function update(id, data) {
  return withTransaction(async (session) => {
    const seat = await Seat.findById(id).session(session);
    if (!seat) throw ApiError.notFound('Seat not found');
    await Show.updateMany({ screen: seat.screen }, { $inc: { bookingVersion: 1 } }, { session });
    if (await hasUpcomingBookings([seat._id], session)) throw ApiError.conflict('Seat is booked or held for checkout and cannot be modified');
    seat.set(data);
    await seat.save({ session });
    await recountScreen(seat.screen, session);
    return seat;
  });
}

async function remove(id) {
  await withTransaction(async (session) => {
    const seat = await Seat.findById(id).session(session);
    if (!seat) throw ApiError.notFound('Seat not found');
    await Show.updateMany({ screen: seat.screen }, { $inc: { bookingVersion: 1 } }, { session });
    if (await hasUpcomingBookings([seat._id], session)) throw ApiError.conflict('Seat is booked or held for checkout and cannot be deleted');
    await Seat.deleteOne({ _id: id }, { session });
    await recountScreen(seat.screen, session);
  });
}

const rowOrder = (a, b) => a.row.length - b.row.length || a.row.localeCompare(b.row) || a.number - b.number;

/** Seat map for one show: every active seat of the screen plus its availability for THIS show only. */
async function getShowAvailability(showId) {
  const show = await Show.findById(showId)
    .populate('movie', 'title duration languages')
    .populate('theatre', 'name address.city')
    .populate('screen', 'name screenType')
    .lean();
  if (!show) throw ApiError.notFound('Show not found');

  const [seats, bookings, holds] = await Promise.all([
    Seat.find({ screen: show.screen._id, isActive: true }).lean(),
    Booking.find({ show: show._id, status: 'CONFIRMED' }).select('seats').lean(),
    Payment.find({ show: show._id, holding: true, expiresAt: { $gt: new Date() } }).select('seats').lean(),
  ]);

  const booked = new Set();
  bookings.forEach((b) => b.seats.forEach((s) => booked.add(String(s))));
  const held = new Set(holds.flatMap(h => h.seats.map(String)));

  const items = seats.sort(rowOrder).map((seat) => ({
    _id: seat._id,
    row: seat.row,
    number: seat.number,
    label: seat.label,
    category: seat.category,
    price: show.prices[seat.category],
    status: booked.has(String(seat._id)) ? 'BOOKED' : held.has(String(seat._id)) ? 'HELD' : 'AVAILABLE',
  }));

  const bookedCount = items.filter((s) => s.status === 'BOOKED').length;
  return {
    show: {
      _id: show._id,
      movie: show.movie,
      theatre: show.theatre,
      screen: show.screen,
      startTime: show.startTime,
      endTime: show.endTime,
      status: show.status,
      prices: show.prices,
    },
    summary: { total: items.length, booked: bookedCount, available: items.filter(s => s.status === 'AVAILABLE').length },
    seats: items,
  };
}

module.exports = {
  buildSeats,
  hasUpcomingBookings,
  list,
  getById,
  create,
  createBulk,
  update,
  remove,
  getShowAvailability,
};
