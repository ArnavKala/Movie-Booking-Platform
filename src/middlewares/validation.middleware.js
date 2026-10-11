const ApiError = require('../utils/ApiError');

/**
 * validate({ params, query, body }) - each value is a Joi schema.
 * Unknown keys are stripped, values are converted/defaulted and written back to the request.
 */
const validate = (schemas) => (req, res, next) => {
  for (const key of ['params', 'query', 'body']) {
    if (!schemas[key]) continue;
    const { value, error } = schemas[key].validate(req[key], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });
    if (error) {
      const errors = error.details.map((d) => ({
        field: d.path.join('.'),
        message: d.message.replace(/"/g, ''),
      }));
      return next(ApiError.badRequest('Validation failed', errors));
    }
    req[key] = value;
  }
  return next();
};

module.exports = { validate };
