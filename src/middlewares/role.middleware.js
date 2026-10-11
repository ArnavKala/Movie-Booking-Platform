const ApiError = require('../utils/ApiError');
const { ROLES } = require('../utils/constants');

const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return next(ApiError.unauthorized());
  if (!roles.includes(req.user.role)) return next(ApiError.forbidden());
  return next();
};

const adminOnly = authorize(ROLES.ADMIN);

module.exports = { authorize, adminOnly };
