const movieService = require('../services/movie.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await movieService.list(req.query);
  return ok(res, items, 'Movies fetched', meta);
});
exports.getById = asyncHandler(async (req, res) => ok(res, await movieService.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => created(res, await movieService.create(req.body), 'Movie created'));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await movieService.update(req.params.id, req.body), 'Movie updated'));
exports.remove = asyncHandler(async (req, res) => {
  await movieService.remove(req.params.id);
  return ok(res, undefined, 'Movie deleted');
});
