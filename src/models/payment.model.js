const mongoose = require('mongoose');
const { ObjectId } = mongoose.Schema.Types;
const schema = new mongoose.Schema({
  user: { type: ObjectId, ref: 'User', required: true },
  show: { type: ObjectId, ref: 'Show', required: true },
  seats: [{ type: ObjectId, ref: 'Seat' }],
  seatDetails: [{ _id: false, seat: { type: ObjectId, ref: 'Seat' }, label: String, category: String, price: Number }],
  amount: { type: Number, required: true }, // Integer paise, frozen before checkout.
  currency: { type: String, default: 'INR' },
  requestId: { type: String, required: true },
  orderId: String,
  paymentId: String,
  booking: { type: ObjectId, ref: 'Booking' },
  state: { type: String, enum: ['CREATING', 'PENDING', 'PAID', 'EXPIRED', 'FAILED', 'REFUND_PENDING', 'REFUNDED'], default: 'CREATING' },
  holding: { type: Boolean, default: true },
  expiresAt: { type: Date, required: true },
  refundId: String,
  refundStatus: String,
  lastCheckedAt: { type: Date, default: () => new Date(0) },
  failureReason: String,
}, { timestamps: true });
schema.index({ user: 1, requestId: 1 }, { unique: true });
schema.index({ orderId: 1 }, { unique: true, sparse: true });
schema.index({ paymentId: 1 }, { unique: true, sparse: true });
schema.index({ show: 1, seats: 1 }, { unique: true, partialFilterExpression: { holding: true }, name: 'unique_checkout_seat' });
schema.index({ state: 1, lastCheckedAt: 1 });
module.exports = mongoose.model('Payment', schema);
