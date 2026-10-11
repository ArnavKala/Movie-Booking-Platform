const { Movie, Show } = require('../models');
const ApiError = require('../utils/ApiError');
const { escapeRegex, exactInsensitive, parsePagination, paginationMeta } = require('../utils/query');

async function list(query) {
  const { q, genre, language, status, sortBy = 'releaseDate', order = 'desc' } = query;
  const { page, limit, skip } = parsePagination(query);

  const filter = {};
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ title: rx }, { director: rx }];
  }
  if (genre) filter.genres = exactInsensitive(genre);
  if (language) filter.languages = exactInsensitive(language);
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    Movie.find(filter).sort({ [sortBy]: order === 'asc' ? 1 : -1, _id: 1 }).skip(skip).limit(limit).lean(),
    Movie.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const movie = await Movie.findById(id).lean();
  if (!movie) throw ApiError.notFound('Movie not found');
  return movie;
}

const create = (data) => Movie.create(data);

async function update(id, data) {
  const movie = await Movie.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  if (!movie) throw ApiError.notFound('Movie not found');
  return movie;
}

async function remove(id) {
  const movie = await Movie.findById(id);
  if (!movie) throw ApiError.notFound('Movie not found');
  if (await Show.exists({ movie: id })) {
    throw ApiError.conflict('Movie has shows scheduled and cannot be deleted; set its status to ENDED instead');
  }
  await movie.deleteOne();
}

module.exports = { list, getById, create, update, remove };
