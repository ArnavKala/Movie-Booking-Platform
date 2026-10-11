const { Theatre, Screen, Seat, Show } = require('../models');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { escapeRegex, exactInsensitive, parsePagination, paginationMeta } = require('../utils/query');

function normalize(data) {
  const doc = { ...data };
  if (doc.location) {
    doc.location = { type: 'Point', coordinates: [doc.location.longitude, doc.location.latitude] };
  }
  return doc;
}

async function list(query) {
  const { q, city, facility, isActive, lat, lng, radiusKm = 10 } = query;
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
  if (city) filter['address.city'] = exactInsensitive(city);
  if (facility) filter.facilities = exactInsensitive(facility);
  if (isActive !== undefined) filter.isActive = isActive;
  if (lat !== undefined && lng !== undefined) {
    filter.location = { $geoWithin: { $centerSphere: [[lng, lat], radiusKm / 6378.1] } };
  }

  const [items, total] = await Promise.all([
    Theatre.find(filter).sort({ name: 1 }).skip(skip).limit(limit).lean(),
    Theatre.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const theatre = await Theatre.findById(id).lean();
  if (!theatre) throw ApiError.notFound('Theatre not found');
  const screens = await Screen.find({ theatre: id }).select('name screenType totalSeats isActive').sort({ name: 1 }).lean();
  return { ...theatre, screens };
}

const create = (data) => Theatre.create(normalize(data));

async function update(id, data) {
  const theatre = await Theatre.findByIdAndUpdate(id, { $set: normalize(data) }, { new: true, runValidators: true });
  if (!theatre) throw ApiError.notFound('Theatre not found');
  return theatre;
}

async function remove(id) {
  const theatre = await Theatre.findById(id);
  if (!theatre) throw ApiError.notFound('Theatre not found');
  if (await Show.exists({ theatre: id })) {
    throw ApiError.conflict('Theatre has shows and cannot be deleted; deactivate it instead');
  }
  await withTransaction(async (session) => {
    const screenIds = await Screen.distinct('_id', { theatre: id }).session(session);
    await Seat.deleteMany({ screen: { $in: screenIds } }, { session });
    await Screen.deleteMany({ theatre: id }, { session });
    await Theatre.deleteOne({ _id: id }, { session });
  });
}

module.exports = { list, getById, create, update, remove };
