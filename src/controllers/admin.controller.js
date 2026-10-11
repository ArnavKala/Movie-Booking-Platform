const adminService = require('../services/admin.service');
const userService = require('../services/user.service');
const bookingService = require('../services/booking.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/apiResponse');

exports.stats = asyncHandler(async (req, res) => ok(res, await adminService.getStats(), 'Dashboard statistics'));

exports.listUsers = asyncHandler(async (req, res) => {
  const { items, meta } = await userService.adminList(req.query);
  return ok(res, items, 'Users fetched', meta);
});
exports.getUser = asyncHandler(async (req, res) => ok(res, await userService.adminGet(req.params.id)));
exports.updateUser = asyncHandler(async (req, res) =>
  ok(res, await userService.adminUpdate(req.params.id, req.body, req.user), 'User updated'));
exports.deleteUser = asyncHandler(async (req, res) => {
  await userService.adminRemove(req.params.id, req.user);
  return ok(res, undefined, 'User deleted');
});

exports.listBookings = asyncHandler(async (req, res) => {
  const { items, meta } = await bookingService.listAll(req.query);
  return ok(res, items, 'Bookings fetched', meta);
});
exports.getBooking = asyncHandler(async (req, res) =>
  ok(res, await bookingService.getById(req.params.id, req.user)));
exports.cancelBooking = asyncHandler(async (req, res) =>
  ok(res, await bookingService.cancel(req.params.id, req.user, req.body.reason || 'Cancelled by admin'), 'Booking cancelled'));
