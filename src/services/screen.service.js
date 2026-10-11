const mongoose = require('mongoose');
const { Screen, Seat, Show, Theatre } = require('../models');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { parsePagination, paginationMeta } = require('../utils/query');
const { buildSeats } = require('./seat.service');

async function list(query) {
  const { theatre, isActive } = query;
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (theatre) filter.theatre = theatre;
  if (isActive !== undefined) filter.isActive = isActive;

  const [items, total] = await Promise.all([
    Screen.find(filter).sort({ theatre: 1, name: 1 }).skip(skip).limit(limit).populate('theatre', 'name address.city').lean(),
    Screen.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const screen = await Screen.findById(id).populate('theatre', 'name address.city').lean();
  if (!screen) throw ApiError.notFound('Screen not found');
  const categories = await Seat.aggregate([
    { $match: { screen: new mongoose.Types.ObjectId(id), isActive: true } },
    { $group: { _id: '$category', count: { $sum: 1 } } },
  ]);
  const seatsByCategory = {};
  categories.forEach((c) => { seatsByCategory[c._id] = c.count; });
  return { ...screen, seatsByCategory };
}

async function create({ theatre, name, screenType, layout }) {
  if (!(await Theatre.exists({ _id: theatre }))) throw ApiError.notFound('Theatre not found');

  return withTransaction(async (session) => {
    const [screen] = await Screen.create([{ theatre, name, screenType }], { session });
    if (layout) {
      const seats = buildSeats(screen._id, layout);
      await Seat.insertMany(seats, { session });
      screen.totalSeats = seats.length;
      await screen.save({ session });
    }
    return screen;
  });
}

async function update(id, data) {
  const screen = await Screen.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  if (!screen) throw ApiError.notFound('Screen not found');
  return screen;
}

/** Replaces the whole seat layout. Only allowed while the screen has no shows (so no booking can reference old seats). */
async function setLayout(id, layout) {
  const screen = await Screen.findById(id);
  if (!screen) throw ApiError.notFound('Screen not found');
  if (await Show.exists({ screen: id })) {
    throw ApiError.conflict('Seat layout cannot be replaced once the screen has shows; edit individual seats instead');
  }
  return withTransaction(async (session) => {
    const seats = buildSeats(screen._id, layout);
    await Seat.deleteMany({ screen: id }, { session });
    await Seat.insertMany(seats, { session });
    return Screen.findByIdAndUpdate(id, { $set: { totalSeats: seats.length } }, { new: true, session });
  });
}

async function remove(id) {
  const screen = await Screen.findById(id);
  if (!screen) throw ApiError.notFound('Screen not found');
  if (await Show.exists({ screen: id })) {
    throw ApiError.conflict('Screen has shows and cannot be deleted; deactivate it instead');
  }
  await withTransaction(async (session) => {
    await Seat.deleteMany({ screen: id }, { session });
    await Screen.deleteOne({ _id: id }, { session });
  });
}

module.exports = { list, getById, create, update, setLayout, remove };
