const { Joi, password } = require('./common.validator');

const register = Joi.object({
  name: Joi.string().trim().min(2).max(80).required(),
  email: Joi.string().trim().lowercase().email().required(),
  password: password.required(),
  phone: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/),
});

const login = Joi.object({
  email: Joi.string().trim().lowercase().email().required(),
  password: Joi.string().max(72).required(),
});

module.exports = { register, login };
