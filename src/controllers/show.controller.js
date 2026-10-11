const showService = require('../services/show.service');
const seatService = require('../services/seat.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await showService.list(req.query);
  return ok(res, items, 'Shows fetched', meta);
});
exports.getById = asyncHandler(async (req, res) => ok(res, await showService.getById(req.params.id)));
exports.getSeats = asyncHandler(async (req, res) =>
  ok(res, await seatService.getShowAvailability(req.params.showId), 'Seat availability fetched'));
exports.create = asyncHandler(async (req, res) => created(res, await showService.create(req.body), 'Show created'));
exports.update = asyncHandler(async (req, res) =>
  ok(res, await showService.update(req.params.id, req.body), 'Show updated'));
exports.remove = asyncHandler(async (req, res) => {
  await showService.remove(req.params.id);
  return ok(res, undefined, 'Show deleted');
});
