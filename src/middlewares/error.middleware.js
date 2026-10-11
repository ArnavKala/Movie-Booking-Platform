const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  let status = 500;
  let message = 'Internal server error';
  let errors;

  if (err instanceof ApiError) {
    status = err.statusCode;
    message = err.message;
    errors = err.errors;
  } else if (err.name === 'ValidationError' && err.errors) {
    status = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for field "${err.path}"`;
  } else if (err.code === 11000) {
    status = 409;
    const fields = Object.keys(err.keyPattern || {});
    message = fields.length ? `Duplicate value for: ${fields.join(', ')}` : 'Duplicate value';
  } else if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
    status = 401;
    message = 'Invalid or expired token';
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON in request body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body too large';
  }

  if (status >= 500) logger.error(`${req.method} ${req.originalUrl}`, err);

  const body = { success: false, message };
  if (errors) body.errors = errors;
  res.status(status).json(body);
};
