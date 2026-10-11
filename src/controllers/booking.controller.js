const bookingService = require('../services/booking.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

// A caller cannot bypass checkout by invoking the former free-booking endpoint.
exports.create = asyncHandler(async () => {
  throw new (require('../utils/ApiError'))(402, 'Payment required. Start checkout with POST /api/payments/orders.');
});

exports.list = asyncHandler(async (req, res) => {
  const { items, meta } = await bookingService.listForUser(req.user._id, req.query);
  return ok(res, items, 'Bookings fetched', meta);
});

exports.getById = asyncHandler(async (req, res) =>
  ok(res, await bookingService.getById(req.params.id, req.user)));

exports.cancel = asyncHandler(async (req, res) =>
  ok(res, await bookingService.cancel(req.params.id, req.user, req.body.reason), 'Booking cancelled'));
