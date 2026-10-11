const { Joi, paginationKeys } = require('./common.validator');

const address = Joi.object({
  line1: Joi.string().trim().max(200).required(),
  line2: Joi.string().trim().allow('').max(200),
  city: Joi.string().trim().max(80).required(),
  state: Joi.string().trim().max(80).required(),
  pincode: Joi.string().trim().pattern(/^[A-Za-z0-9 -]{3,10}$/).required(),
  country: Joi.string().trim().max(80),
});

const location = Joi.object({
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});

const fields = {
  name: Joi.string().trim().max(150),
  address,
  location,
  facilities: Joi.array().items(Joi.string().trim().max(60)).max(30),
  phone: Joi.string().trim().pattern(/^\+?[0-9 -]{7,20}$/),
  isActive: Joi.boolean(),
};

const createTheatre = Joi.object(fields).fork(['name', 'address'], (s) => s.required());
const updateTheatre = Joi.object(fields).min(1);

const theatreQuery = Joi.object({
  q: Joi.string().trim().max(100),
  city: Joi.string().trim().max(80),
  facility: Joi.string().trim().max(60),
  isActive: Joi.boolean(),
  lat: Joi.number().min(-90).max(90),
  lng: Joi.number().min(-180).max(180),
  radiusKm: Joi.number().min(0.1).max(500).default(10),
  ...paginationKeys(),
})
  .with('lat', 'lng')
  .with('lng', 'lat');

module.exports = { createTheatre, updateTheatre, theatreQuery };
