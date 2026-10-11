const theatreService = require('../services/theatre.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await theatreService.list(req.query);
  return ok(res, items, 'Theatres fetched', meta);
});
exports.getById = asyncHandler(async (req, res) => ok(res, await theatreService.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) =>
  created(res, await theatreService.create(req.body), 'Theatre created'));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await theatreService.update(req.params.id, req.body), 'Theatre updated'));
exports.remove = asyncHandler(async (req, res) => {
  await theatreService.remove(req.params.id);
  return ok(res, undefined, 'Theatre deleted');
});
