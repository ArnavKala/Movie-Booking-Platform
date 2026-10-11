const crypto = require('crypto');
const { Booking, Show, Seat, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { parsePagination, paginationMeta } = require('../utils/query');
const { ROLES } = require('../utils/constants');

const round2 = (n) => Math.round(n * 100) / 100;

const generateReference = () =>
  `BMS${Date.now().toString(36).toUpperCase()}${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

const showPopulate = {
  path: 'show',
  select: 'movie theatre screen startTime endTime status format language',
  populate: [
    { path: 'movie', select: 'title posterUrl duration languages' },
    { path: 'theatre', select: 'name address.city address.line1' },
    { path: 'screen', select: 'name screenType' },
  ],
};
const populateFor = (isAdmin) => (isAdmin ? [{ path: 'user', select: 'name email' }, showPopulate] : [showPopulate]);

/** Duplicate-key error raised by the partial unique (show, seat) index. */
const isSeatConflict = (err) =>
  err && err.code === 11000 && (err.keyPattern ? 'seats' in err.keyPattern : /unique_confirmed_seat_per_show/.test(err.message));

/**
 * Books seats for a show.
 *  1. Everything runs in one transaction (snapshot read, majority write; Atlas compatible).
 *  2. Prices come from the Show document, never from the client.
 *  3. The unique partial index { show, seats } (CONFIRMED only) is the final arbiter: if two requests
 *     race for the same seat, the database rejects one of them and it is reported as 409.
 */
async function create(user, { showId, seatIds }) {
  const ids = [...new Set(seatIds.map(String))];
  if (ids.length !== seatIds.length) throw ApiError.badRequest('Duplicate seats in request');

  let bookingId;
  try {
    bookingId = await withTransaction(async (session) => {
      const show = await Show.findById(showId).session(session);
      if (!show) throw ApiError.notFound('Show not found');
      if (show.status !== 'SCHEDULED') throw ApiError.conflict('This show has been cancelled');
      if (show.startTime <= new Date()) throw ApiError.badRequest('Bookings are closed: the show has already started');

      const seats = await Seat.find({ _id: { $in: ids }, screen: show.screen, isActive: true }).session(session);
      if (seats.length !== ids.length) {
        throw ApiError.badRequest('One or more seats do not exist or do not belong to this show\'s screen');
      }

      const taken = await Booking.findOne({ show: show._id, status: 'CONFIRMED', seats: { $in: ids } })
        .select('seatDetails seats')
        .session(session)
        .lean();
      if (taken) {
        const takenIds = new Set(taken.seats.map(String));
        const labels = seats.filter((s) => takenIds.has(String(s._id))).map((s) => s.label);
        throw ApiError.conflict(`Seat(s) already booked: ${labels.join(', ')}`);
      }

      const seatDetails = seats.map((seat) => ({
        seat: seat._id,
        label: seat.label,
        category: seat.category,
        price: show.prices[seat.category],
      }));
      const totalAmount = round2(seatDetails.reduce((sum, d) => sum + d.price, 0));

      const [booking] = await Booking.create(
        [{
          bookingReference: generateReference(),
          user: user._id,
          show: show._id,
          seats: seats.map((s) => s._id),
          seatDetails,
          totalAmount,
          status: 'CONFIRMED',
        }],
        { session }
      );
      return booking._id;
    });
  } catch (err) {
    if (isSeatConflict(err)) throw ApiError.conflict('One or more selected seats were just booked by someone else');
    throw err;
  }

  return Booking.findById(bookingId).populate(populateFor(false));
}

async function listForUser(userId, query) {
  const { status } = query;
  const { page, limit, skip } = parsePagination(query);
  const filter = { user: userId };
  if (status) filter.status = status;
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(populateFor(false)),
    Booking.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function listAll(query) {
  const { status, user, show, from, to } = query;
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (status) filter.status = status;
  if (user) filter.user = user;
  if (show) filter.show = show;
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) filter.createdAt.$lte = new Date(to);
  }
  const [items, total] = await Promise.all([
    Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate(populateFor(true)),
    Booking.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function getById(id, actor) {
  const isAdmin = actor.role === ROLES.ADMIN;
  const booking = await Booking.findById(id);
  // Other users' bookings are reported as "not found" so ids can't be probed.
  if (!booking || (!isAdmin && String(booking.user) !== String(actor._id))) {
    throw ApiError.notFound('Booking not found');
  }
  await booking.populate(populateFor(isAdmin));
  return booking;
}

/**
 * Cancels ONE booking. The update is conditional on { _id, status: CONFIRMED }, so it can only touch this
 * booking, only once, and the seats it frees are exactly the ones in its own `seats` array
 * (the partial unique index simply stops covering this document).
 */
async function cancel(id, actor, reason) {
  const isAdmin = actor.role === ROLES.ADMIN;

  await withTransaction(async (session) => {
    const booking = await Booking.findById(id).session(session);
    if (!booking || (!isAdmin && String(booking.user) !== String(actor._id))) {
      throw ApiError.notFound('Booking not found');
    }
    if (booking.status !== 'CONFIRMED') throw ApiError.conflict('Booking is already cancelled');
    if (booking.checkedInAt) throw ApiError.conflict('A checked-in ticket cannot be cancelled');

    if (!isAdmin) {
      const show = await Show.findById(booking.show).session(session).lean();
      if (show && show.startTime <= new Date()) {
        throw ApiError.badRequest('Bookings cannot be cancelled after the show has started');
      }
    }

    const updated = await Booking.findOneAndUpdate(
      { _id: booking._id, status: 'CONFIRMED' },
      { $set: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: actor._id, cancellationReason: reason } },
      { new: true, session }
    );
    if (!updated) throw ApiError.conflict('Booking is already cancelled');
    if (booking.payment) {
      await Payment.updateOne({ _id: booking.payment, state: 'PAID' }, { $set: { state: 'REFUND_PENDING', holding: false } }, { session });
      await Booking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'REFUND_PENDING' } }, { session });
    }
  });
  const cancelled = await Booking.findById(id);
  if (cancelled.payment) await require('./payment.service').processRefund(cancelled.payment).catch(() => {});
  return getById(id, actor);
}

module.exports = { create, listForUser, listAll, getById, cancel };
