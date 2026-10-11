const mongoose = require('mongoose');
const { BOOKING_STATUSES, SEAT_CATEGORIES } = require('../utils/constants');

const { ObjectId } = mongoose.Schema.Types;

const seatDetailSchema = new mongoose.Schema(
  {
    seat: { type: ObjectId, ref: 'Seat', required: true },
    label: { type: String, required: true },
    category: { type: String, enum: SEAT_CATEGORIES, required: true },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const bookingSchema = new mongoose.Schema(
  {
    bookingReference: { type: String, required: true, unique: true },
    user: { type: ObjectId, ref: 'User', required: true },
    show: { type: ObjectId, ref: 'Show', required: true },
    seats: {
      type: [{ type: ObjectId, ref: 'Seat' }],
      validate: [(v) => Array.isArray(v) && v.length > 0, 'At least one seat is required'],
    },
    seatDetails: [seatDetailSchema],
    totalAmount: { type: Number, required: true, min: 0 },
    status: { type: String, enum: BOOKING_STATUSES, default: 'CONFIRMED' },
    cancelledAt: Date,
    cancelledBy: { type: ObjectId, ref: 'User' },
    cancellationReason: { type: String, trim: true, maxlength: 300 },
    payment: { type: ObjectId, ref: 'Payment' },
    paymentStatus: { type: String, enum: ['PAID', 'REFUND_PENDING', 'REFUNDED'] },
    paymentId: String,
    testMode: Boolean,
    ticketNonce: { type: String, select: false },
    checkedInAt: Date,
    checkedInBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true, toJSON: { transform: (d, r) => { delete r.__v; return r; } } }
);

/**
 * THE double-booking guard.
 * Multikey unique index over (show, seat) restricted to CONFIRMED bookings:
 *  - the database itself rejects a second CONFIRMED booking containing the same seat for the same show,
 *    no matter how many requests race;
 *  - cancelling a booking flips only that booking to CANCELLED, which drops exactly its own
 *    entries from the index and cannot affect any other booking.
 */
bookingSchema.index(
  { show: 1, seats: 1 },
  { unique: true, partialFilterExpression: { status: 'CONFIRMED' }, name: 'unique_confirmed_seat_per_show' }
);
bookingSchema.index({ user: 1, createdAt: -1 });
bookingSchema.index({ show: 1, status: 1 });
bookingSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Booking', bookingSchema);
