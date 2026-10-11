const { User, Booking } = require('../models');
const ApiError = require('../utils/ApiError');
const { hashPassword, comparePassword } = require('../utils/password');
const { escapeRegex, parsePagination, paginationMeta } = require('../utils/query');

async function getProfile(userId) {
  const user = await User.findById(userId);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function updateProfile(userId, data) {
  const user = await User.findByIdAndUpdate(userId, { $set: data }, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function changePassword(userId, { currentPassword, newPassword }) {
  const user = await User.findById(userId).select('+password');
  if (!user) throw ApiError.notFound('User not found');
  if (!(await comparePassword(currentPassword, user.password))) {
    throw ApiError.badRequest('Current password is incorrect');
  }
  user.password = await hashPassword(newPassword);
  await user.save();
}

/* ---------- admin operations ---------- */

async function adminList(query) {
  const { q, role, isActive } = query;
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (role) filter.role = role;
  if (isActive !== undefined) filter.isActive = isActive;
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    filter.$or = [{ name: rx }, { email: rx }];
  }
  const [items, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function adminGet(id) {
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function adminUpdate(id, data, actor) {
  if (String(actor._id) === String(id) && (data.role !== undefined || data.isActive === false)) {
    throw ApiError.badRequest('You cannot change your own role or deactivate your own account');
  }
  const user = await User.findByIdAndUpdate(id, { $set: data }, { new: true, runValidators: true });
  if (!user) throw ApiError.notFound('User not found');
  return user;
}

async function adminRemove(id, actor) {
  if (String(actor._id) === String(id)) throw ApiError.badRequest('You cannot delete your own account');
  const user = await User.findById(id);
  if (!user) throw ApiError.notFound('User not found');
  if (await Booking.exists({ user: id }) || await require('../models').Payment.exists({ user: id })) {
    throw ApiError.conflict('User has bookings or payment records and cannot be deleted; deactivate the account instead');
  }
  await user.deleteOne();
}

module.exports = { getProfile, updateProfile, changePassword, adminList, adminGet, adminUpdate, adminRemove };
