const { Joi, objectId, paginationKeys } = require('./common.validator');
const { SEAT_CATEGORIES, SCREEN_TYPES } = require('../utils/constants');

const layout = Joi.array()
  .items(
    Joi.object({
      row: Joi.string().trim().uppercase().pattern(/^[A-Z]{1,2}$/).required(),
      count: Joi.number().integer().min(1).max(50).required(),
      category: Joi.string().valid(...SEAT_CATEGORIES).default('REGULAR'),
    })
  )
  .min(1)
  .max(40);

const createScreen = Joi.object({
  theatre: objectId.required(),
  name: Joi.string().trim().max(50).required(),
  screenType: Joi.string().valid(...SCREEN_TYPES),
  layout,
});

const updateScreen = Joi.object({
  name: Joi.string().trim().max(50),
  screenType: Joi.string().valid(...SCREEN_TYPES),
  isActive: Joi.boolean(),
}).min(1);

const setLayout = Joi.object({ layout: layout.required() });

const screenQuery = Joi.object({
  theatre: objectId,
  isActive: Joi.boolean(),
  ...paginationKeys(),
});

module.exports = { createScreen, updateScreen, setLayout, screenQuery };
