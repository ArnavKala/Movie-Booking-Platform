const { Joi, objectId, paginationKeys } = require('./common.validator');
const { BOOKING_STATUSES, MAX_SEATS_PER_BOOKING } = require('../utils/constants');

// Only ids are accepted: prices/totals sent by a client are stripped and ignored.
const createBooking = Joi.object({
  showId: objectId.required(),
  seatIds: Joi.array().items(objectId).unique().min(1).max(MAX_SEATS_PER_BOOKING).required(),
});

const cancelBooking = Joi.object({
  reason: Joi.string().trim().max(300),
});

const bookingQuery = Joi.object({
  status: Joi.string().valid(...BOOKING_STATUSES),
  ...paginationKeys(),
});

const adminBookingQuery = Joi.object({
  status: Joi.string().valid(...BOOKING_STATUSES),
  user: objectId,
  show: objectId,
  from: Joi.date().iso(),
  to: Joi.date().iso(),
  ...paginationKeys(),
});

module.exports = { createBooking, cancelBooking, bookingQuery, adminBookingQuery };
