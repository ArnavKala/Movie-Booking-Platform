const { Joi, objectId, paginationKeys } = require('./common.validator');
const { SEAT_CATEGORIES } = require('../utils/constants');

const seatFields = {
  row: Joi.string().trim().uppercase().pattern(/^[A-Z]{1,2}$/),
  number: Joi.number().integer().min(1).max(200),
  category: Joi.string().valid(...SEAT_CATEGORIES),
};

const createSeat = Joi.object({
  screen: objectId.required(),
  ...seatFields,
  isActive: Joi.boolean(),
}).fork(['row', 'number'], (s) => s.required());

const bulkSeats = Joi.object({
  screen: objectId.required(),
  seats: Joi.array()
    .items(Joi.object(seatFields).fork(['row', 'number'], (s) => s.required()))
    .min(1)
    .max(500)
    .required(),
});

const updateSeat = Joi.object({ ...seatFields, isActive: Joi.boolean() }).min(1);

const seatQuery = Joi.object({
  screen: objectId.required(),
  category: Joi.string().valid(...SEAT_CATEGORIES),
  isActive: Joi.boolean(),
  ...paginationKeys(500, 100),
});

module.exports = { createSeat, bulkSeats, updateSeat, seatQuery };
