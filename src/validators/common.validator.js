const Joi = require('joi');

const objectId = Joi.string().hex().length(24);

const idParam = Joi.object({ id: objectId.required() });

const paginationKeys = (maxLimit = 100, defaultLimit = 20) => ({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(maxLimit).default(defaultLimit),
});

const password = Joi.string()
  .min(8)
  .max(72)
  .pattern(/[A-Za-z]/)
  .pattern(/\d/)
  .messages({
    'string.pattern.base': 'Password must contain at least one letter and one number',
  });

module.exports = { Joi, objectId, idParam, paginationKeys, password };
