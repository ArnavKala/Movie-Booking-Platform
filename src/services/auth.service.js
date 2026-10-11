const { User } = require('../models');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const { signToken } = require('../utils/jwt');

async function register({ name, email, password, phone }) {
  const existing = await User.findOne({ email });
  if (existing) throw ApiError.conflict('An account with this email already exists');

  // Public registration can only ever create USER accounts.
  const user = await User.create({ name, email, phone, password: await hashPassword(password), role: 'USER' });
  return { user, token: signToken(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select('+password');
  const valid = user && (await comparePassword(password, user.password));
  if (!valid) throw ApiError.unauthorized('Invalid email or password');
  if (!user.isActive) throw ApiError.forbidden('This account has been deactivated');

  return { user: await User.findById(user._id), token: signToken(user) };
}

module.exports = { register, login };
