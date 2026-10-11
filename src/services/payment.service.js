const crypto = require('crypto');
const { Payment, Booking, Show, Seat, Theatre, Screen } = require('../models');
const env = require('../config/env');
const gateway = require('./razorpay.service');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { parsePagination, paginationMeta } = require('../utils/query');

async function owned(id, actor) {
  const payment = await Payment.findById(id);
  if (!payment || (actor.role !== 'ADMIN' && String(payment.user) !== String(actor._id))) throw ApiError.notFound('Payment not found');
  return payment;
}
async function response(payment) {
  const booking = payment.booking ? await require('./booking.service').getById(payment.booking, { _id: payment.user, role: 'USER' }) : null;
  return {
    _id: payment._id, orderId: payment.orderId, amount: payment.amount, currency: payment.currency,
    state: payment.state, expiresAt: payment.expiresAt, key: env.RAZORPAY_KEY,
    testMode: true, booking, failureReason: payment.failureReason, refundStatus: payment.refundStatus,
    seatDetails: payment.seatDetails,
  };
}
async function expireHolds(session) {
  await Payment.updateMany({ holding: true, expiresAt: { $lte: new Date() } }, { $set: { holding: false, state: 'EXPIRED' } }, { session });
}
async function createOrder(actor, { showId, seatIds, requestId }) {
  gateway.assertConfigured();
  function assertSameSelection(payment) {
    if (String(payment.show) !== String(showId) || payment.seats.map(String).sort().join() !== seatIds.map(String).sort().join()) throw ApiError.conflict('This checkout request was already used for different seats');
  }
  const existing = await Payment.findOne({ user: actor._id, requestId });
  if (existing) {
    assertSameSelection(existing);
    return response(existing);
  }
  let payment;
  try {
    payment = await withTransaction(async session => {
      await expireHolds(session);
      // Shared write serializes reservations, confirmations and show cancellation.
      const show = await Show.findOneAndUpdate({ _id: showId }, { $inc: { bookingVersion: 1 } }, { new: true, session });
      if (!show) throw ApiError.notFound('Show not found');
      if (show.status !== 'SCHEDULED') throw ApiError.conflict('This show has been cancelled');
      if (show.startTime <= new Date()) throw ApiError.badRequest('Bookings are closed: the show has already started');
      const theatre = await Theatre.findById(show.theatre).session(session);
      const screen = await Screen.findById(show.screen).session(session);
      if (!theatre?.isActive || !screen?.isActive) throw ApiError.conflict('This theatre or screen is unavailable');
      const seats = await Seat.find({ _id: { $in: seatIds }, screen: show.screen, isActive: true }).session(session);
      if (seats.length !== seatIds.length) throw ApiError.badRequest('Some seats are invalid or belong to another screen');
      const taken = await Booking.findOne({ show: showId, status: 'CONFIRMED', seats: { $in: seatIds } }).session(session);
      const held = await Payment.findOne({ show: showId, holding: true, seats: { $in: seatIds } }).session(session);
      if (taken || held) throw ApiError.conflict(`Seat(s) already booked or held: ${seats.filter(s => (taken || held).seats.map(String).includes(String(s._id))).map(s => s.label).join(', ')}`);
      const seatDetails = seats.map(s => ({ seat: s._id, label: s.label, category: s.category, price: show.prices[s.category] }));
      const amount = Math.round(seatDetails.reduce((sum, s) => sum + s.price, 0) * 100);
      if (amount < 100) throw ApiError.badRequest('Online checkout requires a total of at least INR 1');
      const [created] = await Payment.create([{
        user: actor._id, show: showId, seats: seatIds, seatDetails, amount, requestId,
        expiresAt: new Date(Math.min(Date.now() + 10 * 60000, show.startTime.getTime())),
      }], { session });
      return created;
    });
  } catch (error) {
    if (error.code === 11000) {
      const retry = await Payment.findOne({ user: actor._id, requestId });
      if (retry) { assertSameSelection(retry); return response(retry); }
      throw ApiError.conflict('One or more seats are already held by another customer');
    }
    throw error;
  }
  try {
    const order = await gateway.createOrder({ amount: payment.amount, currency: 'INR', receipt: String(payment._id), notes: { checkoutId: String(payment._id) } });
    payment = await Payment.findOneAndUpdate({ _id: payment._id, state: 'CREATING' }, { orderId: order.id, state: 'PENDING' }, { new: true });
    if (!payment) throw ApiError.conflict('Checkout expired while contacting the payment provider');
  } catch (error) {
    await Payment.updateOne({ _id: payment?._id, state: 'CREATING' }, { $set: { state: 'FAILED', holding: false, failureReason: 'Could not create payment order. Start a new checkout.' } });
    throw error;
  }
  return response(payment);
}

async function processRefund(id) {
  const payment = await Payment.findById(id);
  if (!payment || payment.state !== 'REFUND_PENDING' || !payment.paymentId) return;
  // The same idempotency key is used on every retry, including after a timeout/crash.
  const refund = payment.refundId ? await gateway.fetchRefund(payment.refundId) : await gateway.refund(payment);
  if (refund.payment_id !== payment.paymentId || refund.amount !== payment.amount) throw new ApiError(502, 'Refund response does not match this payment');
  const state = refund.status === 'processed' ? 'REFUNDED' : 'REFUND_PENDING';
  await withTransaction(async session => {
    await Payment.updateOne({ _id: id, state: 'REFUND_PENDING' }, { $set: { refundId: refund.id, refundStatus: refund.status, state } }, { session });
    if (payment.booking) await Booking.updateOne({ _id: payment.booking }, { $set: { paymentStatus: state } }, { session });
  });
}

async function settle(payment, providerPayment) {
  if (providerPayment.order_id !== payment.orderId || providerPayment.amount !== payment.amount || providerPayment.currency !== 'INR') throw ApiError.badRequest('Payment order, amount or currency does not match');
  if (providerPayment.status === 'authorized') {
    try { providerPayment = await gateway.capture(providerPayment.id, payment.amount); }
    catch { providerPayment = await gateway.fetchPayment(providerPayment.id); }
  }
  if (providerPayment.status !== 'captured') return response(await Payment.findById(payment._id));
  if (providerPayment.amount_refunded > 0) throw ApiError.conflict('This payment has already been refunded. Contact the theatre.');
  await withTransaction(async session => {
    const current = await Payment.findById(payment._id).session(session);
    if (['PAID', 'REFUND_PENDING', 'REFUNDED'].includes(current.state)) return;
    const show = await Show.findOneAndUpdate({ _id: current.show }, { $inc: { bookingVersion: 1 } }, { new: true, session });
    const conflict = await Booking.exists({ show: current.show, status: 'CONFIRMED', seats: { $in: current.seats } }).session(session);
    const activeSeats = await Seat.countDocuments({ _id: { $in: current.seats }, screen: show?.screen, isActive: true }).session(session);
    const eligible = current.holding && current.expiresAt > new Date() && show?.status === 'SCHEDULED' && show.startTime > new Date() && !conflict && activeSeats === current.seats.length;
    current.paymentId = providerPayment.id;
    current.holding = false;
    if (!eligible) {
      current.state = 'REFUND_PENDING';
      current.failureReason = 'The seat reservation expired or the show became unavailable. A full refund has been queued.';
    } else {
      const [booking] = await Booking.create([{
        bookingReference: `BMS${crypto.randomBytes(10).toString('hex').toUpperCase()}`,
        user: current.user, show: current.show, seats: current.seats,
        seatDetails: current.seatDetails, totalAmount: current.amount / 100,
        status: 'CONFIRMED', payment: current._id, paymentStatus: 'PAID', paymentId: providerPayment.id,
        testMode: true, ticketNonce: crypto.randomBytes(16).toString('hex'),
      }], { session });
      current.booking = booking._id;
      current.state = 'PAID';
    }
    await current.save({ session });
  });
  // Refund queue remains durable when the provider is down.
  await processRefund(payment._id).catch(() => {});
  return response(await Payment.findById(payment._id));
}

async function verify(actor, input) {
  const payment = await owned(input.checkoutId, actor);
  if (payment.orderId !== input.razorpay_order_id || !gateway.validSignature(`${payment.orderId}|${input.razorpay_payment_id}`, input.razorpay_signature, env.RAZORPAY_SECRET)) throw ApiError.badRequest('Invalid payment signature');
  return settle(payment, await gateway.fetchPayment(input.razorpay_payment_id));
}
async function reconcile(id, actor) {
  const payment = actor ? await owned(id, actor) : await Payment.findById(id);
  if (!payment) throw ApiError.notFound('Payment not found');
  await Payment.updateOne({ _id: id }, { $set: { lastCheckedAt: new Date() } });
  if (payment.state === 'REFUND_PENDING') {
    await processRefund(id);
    return response(await Payment.findById(id));
  }
  if (payment.orderId && ['PENDING', 'EXPIRED'].includes(payment.state)) {
    const { items } = await gateway.fetchOrderPayments(payment.orderId);
    const paid = items.find(p => ['captured', 'authorized'].includes(p.status));
    if (paid) return settle(payment, paid);
  }
  await expireHolds();
  return response(await Payment.findById(id));
}
async function list(actor, query = {}, admin = false) {
  const { page, limit, skip } = parsePagination(query);
  const filter = admin ? {} : { user: actor._id };
  const [items, total] = await Promise.all([
    Payment.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('show', 'startTime').lean(), Payment.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}
async function webhook(raw, signature) {
  if (!Buffer.isBuffer(raw)) throw ApiError.badRequest('Webhook requires an application/json body');
  if (!env.RAZORPAY_WEBHOOK_SECRET) throw new ApiError(503, 'Webhook secret is not configured');
  if (!gateway.validSignature(raw, signature, env.RAZORPAY_WEBHOOK_SECRET)) throw ApiError.badRequest('Invalid webhook signature');
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { throw ApiError.badRequest('Invalid webhook JSON'); }
  const entity = event.payload?.payment?.entity;
  if (['payment.captured', 'order.paid'].includes(event.event) && entity?.order_id) {
    const payment = await Payment.findOne({ orderId: entity.order_id });
    if (payment) await settle(payment, await gateway.fetchPayment(entity.id));
  }
  const refund = event.payload?.refund?.entity;
  if (event.event?.startsWith('refund.') && refund?.payment_id) {
    const payment = await Payment.findOne({ paymentId: refund.payment_id, state: 'REFUND_PENDING' });
    if (payment) await processRefund(payment._id);
  }
}
let running = false;
async function sweep() {
  if (running || !env.RAZORPAY_KEY || !env.RAZORPAY_SECRET) return;
  running = true;
  try {
    await expireHolds();
    const pending = await Payment.find({ orderId: { $exists: true }, state: { $in: ['PENDING', 'EXPIRED', 'REFUND_PENDING'] } }).sort({ lastCheckedAt: 1 }).limit(25);
    for (const payment of pending) await reconcile(payment._id).catch(() => {});
  } finally { running = false; }
}
module.exports = { createOrder, verify, reconcile, list, webhook, sweep, processRefund };
