const mongoose = require('mongoose');
const { SHOW_STATUSES, SHOW_FORMATS } = require('../utils/constants');

const showSchema = new mongoose.Schema(
  {
    movie: { type: mongoose.Schema.Types.ObjectId, ref: 'Movie', required: true },
    theatre: { type: mongoose.Schema.Types.ObjectId, ref: 'Theatre', required: true },
    screen: { type: mongoose.Schema.Types.ObjectId, ref: 'Screen', required: true },
    startTime: { type: Date, required: [true, 'Start time is required'] },
    endTime: { type: Date, required: true },
    prices: {
      REGULAR: { type: Number, required: [true, 'REGULAR price is required'], min: 0 },
      PREMIUM: { type: Number, required: true, min: 0 },
      RECLINER: { type: Number, required: true, min: 0 },
    },
    language: { type: String, trim: true },
    format: { type: String, enum: SHOW_FORMATS, default: '2D' },
    status: { type: String, enum: SHOW_STATUSES, default: 'SCHEDULED' },
    bookingVersion: { type: Number, default: 0 },
  },
  { timestamps: true, toJSON: { transform: (d, r) => { delete r.__v; return r; } } }
);

showSchema.index({ movie: 1, startTime: 1 });
showSchema.index({ theatre: 1, startTime: 1 });
showSchema.index({ startTime: 1 });
// Two scheduled shows can never start at the exact same time on the same screen.
showSchema.index(
  { screen: 1, startTime: 1 },
  { unique: true, partialFilterExpression: { status: 'SCHEDULED' } }
);

module.exports = mongoose.model('Show', showSchema);
