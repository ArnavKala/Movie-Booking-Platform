const mongoose = require('mongoose');

const theatreSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Theatre name is required'], trim: true, maxlength: 150 },
    address: {
      line1: { type: String, required: [true, 'Address line is required'], trim: true },
      line2: { type: String, trim: true },
      city: { type: String, required: [true, 'City is required'], trim: true },
      state: { type: String, required: [true, 'State is required'], trim: true },
      pincode: { type: String, required: [true, 'Pincode is required'], trim: true },
      country: { type: String, trim: true, default: 'India' },
    },
    // GeoJSON point: [longitude, latitude]. Left undefined when not provided
    // (an empty coordinates array would break the 2dsphere index).
    location: {
      type: { type: String, enum: ['Point'] },
      coordinates: {
        type: [Number],
        default: undefined,
        validate: [(v) => !v || v.length === 2, 'Coordinates must be [longitude, latitude]'],
      },
    },
    facilities: [{ type: String, trim: true }],
    phone: { type: String, trim: true, match: [/^\+?[0-9 -]{7,20}$/, 'Invalid phone number'] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true, toJSON: { transform: (d, r) => { delete r.__v; return r; } } }
);

theatreSchema.index({ name: 1, 'address.city': 1 }, { unique: true });
theatreSchema.index({ 'address.city': 1 });
theatreSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('Theatre', theatreSchema);
