const userService = require('../services/user.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/apiResponse');

exports.getProfile = asyncHandler(async (req, res) => ok(res, await userService.getProfile(req.user._id)));

exports.updateProfile = asyncHandler(async (req, res) =>
  ok(res, await userService.updateProfile(req.user._id, req.body), 'Profile updated'));

exports.changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(req.user._id, req.body);
  return ok(res, undefined, 'Password changed successfully');
});
