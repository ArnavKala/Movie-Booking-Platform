const { Joi, objectId, paginationKeys, password } = require('./common.validator');
const { ROLES } = require('../utils/constants');

const updateProfile = Joi.object({
  name: Joi.string().trim().min(2).max(80),
  phone: Joi.string().trim().pattern(/^\+?[0-9]{7,15}$/),
}).min(1);

const changePassword = Joi.object({
  currentPassword: Joi.string().max(72).required(),
  newPassword: password.required(),
});

const adminUpdateUser = Joi.object({
  role: Joi.string().valid(...Object.values(ROLES)),
  isActive: Joi.boolean(),
}).min(1);

const adminUserQuery = Joi.object({
  q: Joi.string().trim().max(100),
  role: Joi.string().valid(...Object.values(ROLES)),
  isActive: Joi.boolean(),
  ...paginationKeys(),
});

module.exports = { updateProfile, changePassword, adminUpdateUser, adminUserQuery, objectId };
