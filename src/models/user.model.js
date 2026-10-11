const mongoose = require('mongoose');
const { ROLES } = require('../utils/constants');

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Name is required'], trim: true, minlength: 2, maxlength: 80 },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, 'Invalid email address'],
    },
    password: { type: String, required: true, select: false },
    phone: { type: String, trim: true, match: [/^\+?[0-9]{7,15}$/, 'Invalid phone number'] },
    role: { type: String, enum: Object.values(ROLES), default: ROLES.USER },
    isActive: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: { transform: (doc, ret) => { delete ret.password; delete ret.__v; return ret; } },
    toObject: { transform: (doc, ret) => { delete ret.password; delete ret.__v; return ret; } },
  }
);

userSchema.index({ role: 1 });

module.exports = mongoose.model('User', userSchema);
