const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { verifyToken } = require('../utils/jwt');
const { User } = require('../models');

/** Requires a valid Bearer token. The user (and role) is always re-read from the database. */
const authenticate = asyncHandler(async (req, res, next) => {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyToken(token);
  } catch (err) {
    throw ApiError.unauthorized('Invalid or expired token');
  }

  const user = await User.findById(payload.id);
  if (!user || !user.isActive) throw ApiError.unauthorized('Account not found or deactivated');

  req.user = user;
  next();
});

module.exports = { authenticate };
