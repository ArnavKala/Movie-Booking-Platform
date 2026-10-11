const screenService = require('../services/screen.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await screenService.list(req.query);
  return ok(res, items, 'Screens fetched', meta);
});
exports.getById = asyncHandler(async (req, res) => ok(res, await screenService.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => created(res, await screenService.create(req.body), 'Screen created'));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await screenService.update(req.params.id, req.body), 'Screen updated'));
exports.setLayout = asyncHandler(async (req, res) =>
  ok(res, await screenService.setLayout(req.params.id, req.body.layout), 'Seat layout replaced'));
exports.remove = asyncHandler(async (req, res) => {
  await screenService.remove(req.params.id);
  return ok(res, undefined, 'Screen deleted');
});
