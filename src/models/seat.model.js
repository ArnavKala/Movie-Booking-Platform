const mongoose = require('mongoose');
const { SEAT_CATEGORIES } = require('../utils/constants');

/**
 * A physical seat in a screen. It never stores booking state:
 * availability is derived per show from the Booking collection.
 */
const seatSchema = new mongoose.Schema(
  {
    screen: { type: mongoose.Schema.Types.ObjectId, ref: 'Screen', required: true },
    row: { type: String, required: [true, 'Row is required'], trim: true, uppercase: true, match: [/^[A-Z]{1,2}$/, 'Row must be 1-2 letters'] },
    number: { type: Number, required: [true, 'Seat number is required'], min: 1, max: 200, validate: Number.isInteger },
    label: { type: String },
    category: { type: String, enum: SEAT_CATEGORIES, default: 'REGULAR' },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: (d, r) => { delete r.__v; return r; } } }
);

seatSchema.pre('validate', function setLabel(next) {
  if (this.row && this.number != null) this.label = `${this.row}${this.number}`;
  next();
});

seatSchema.index({ screen: 1, row: 1, number: 1 }, { unique: true });

module.exports = mongoose.model('Seat', seatSchema);
