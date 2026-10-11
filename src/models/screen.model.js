const mongoose = require('mongoose');
const { SCREEN_TYPES } = require('../utils/constants');

const screenSchema = new mongoose.Schema(
  {
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true },
    name: { type: String, required: [true, 'Screen name is required'], trim: true, maxlength: 50 },
    screenType: { type: String, enum: SCREEN_TYPES, default: 'STANDARD' },
    totalSeats: { type: Number, default: 0, min: 0 },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: (d, r) => { delete r.__v; return r; } } }
);

screenSchema.index({ theatre: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Screen', screenSchema);
