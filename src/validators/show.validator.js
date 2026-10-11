const { Joi, objectId, paginationKeys } = require('./common.validator');
const { SHOW_STATUSES, SHOW_FORMATS } = require('../utils/constants');

const prices = Joi.object({
  REGULAR: Joi.number().min(0).max(100000),
  PREMIUM: Joi.number().min(0).max(100000),
  RECLINER: Joi.number().min(0).max(100000),
});

const createShow = Joi.object({
  movie: objectId.required(),
  theatre: objectId.required(),
  screen: objectId.required(),
  startTime: Joi.date().iso().required(),
  prices: prices.keys({ REGULAR: Joi.number().min(0).max(100000).required() }).required(),
  language: Joi.string().trim().max(50),
  format: Joi.string().valid(...SHOW_FORMATS),
});

const updateShow = Joi.object({
  movie: objectId,
  theatre: objectId,
  screen: objectId,
  startTime: Joi.date().iso(),
  prices: prices.min(1),
  language: Joi.string().trim().max(50),
  format: Joi.string().valid(...SHOW_FORMATS),
  status: Joi.string().valid(...SHOW_STATUSES),
}).min(1);

const dateString = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/).messages({
  'string.pattern.base': 'date must be in YYYY-MM-DD format',
});

const showQuery = Joi.object({
  movie: objectId,
  theatre: objectId,
  screen: objectId,
  city: Joi.string().trim().max(80),
  date: dateString,
  tzOffset: Joi.number().integer().min(-840).max(840).default(0),
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  status: Joi.string().valid(...SHOW_STATUSES),
  language: Joi.string().trim().max(50),
  format: Joi.string().valid(...SHOW_FORMATS),
  upcoming: Joi.boolean(),
  ...paginationKeys(),
});

const showSeatsParams = Joi.object({ showId: objectId.required() });

module.exports = { createShow, updateShow, showQuery, showSeatsParams };
