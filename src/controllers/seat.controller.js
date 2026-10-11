const seatService = require('../services/seat.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await seatService.list(req.query);
  return ok(res, items, 'Seats fetched', meta);
});
exports.getById = asyncHandler(async (req, res) => ok(res, await seatService.getById(req.params.id)));
exports.create = asyncHandler(async (req, res) => created(res, await seatService.create(req.body), 'Seat created'));
exports.createBulk = asyncHandler(async (req, res) =>
  created(res, await seatService.createBulk(req.body), 'Seats created'));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await seatService.update(req.params.id, req.body), 'Seat updated'));
exports.remove = asyncHandler(async (req, res) => {
  await seatService.remove(req.params.id);
  return ok(res, undefined, 'Seat deleted');
});
