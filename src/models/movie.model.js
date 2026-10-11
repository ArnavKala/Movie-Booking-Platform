const mongoose = require('mongoose');
const { MOVIE_STATUSES, CERTIFICATES } = require('../utils/constants');

const nonEmpty = (label) => [(v) => Array.isArray(v) && v.length > 0, `At least one ${label} is required`];

const movieSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Title is required'], trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 5000, default: '' },
    genres: { type: [{ type: String, trim: true }], validate: nonEmpty('genre') },
    languages: { type: [{ type: String, trim: true }], validate: nonEmpty('language') },
    duration: { type: Number, required: [true, 'Duration (minutes) is required'], min: 1, max: 600 },
    releaseDate: { type: Date, required: [true, 'Release date is required'] },
    status: { type: String, enum: MOVIE_STATUSES, default: 'UPCOMING' },
    certificate: { type: String, enum: CERTIFICATES },
    director: { type: String, trim: true, maxlength: 100 },
    cast: [{ type: String, trim: true }],
    posterUrl: { type: String, trim: true },
    trailerUrl: { type: String, trim: true },
  },
  { timestamps: true, toJSON: { transform: (d, r) => { delete r.__v; return r; } } }
);

movieSchema.index({ title: 1 });
movieSchema.index({ status: 1, releaseDate: -1 });
movieSchema.index({ genres: 1 });
movieSchema.index({ languages: 1 });

module.exports = mongoose.model('Movie', movieSchema);
