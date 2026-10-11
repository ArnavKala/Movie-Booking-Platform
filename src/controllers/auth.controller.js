const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');

exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return created(res, result, 'Registration successful');
});

exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return ok(res, result, 'Login successful');
});

exports.me = asyncHandler(async (req, res) => ok(res, req.user, 'Current user'));
