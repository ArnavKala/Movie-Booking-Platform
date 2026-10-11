const request = require('supertest');
const crypto = require('crypto');
const app = require('../../src/app');
const gateway = require('../../src/services/razorpay.service');
const env = require('../../src/config/env');
const { auth } = require('./factories');
function signed(checkout, payment) {
  return { checkoutId: checkout._id, razorpay_order_id: checkout.orderId, razorpay_payment_id: payment.id,
    razorpay_signature: crypto.createHmac('sha256', env.RAZORPAY_SECRET).update(`${checkout.orderId}|${payment.id}`).digest('hex') };
}
async function book(token, showId, seatIds, extra = {}) {
  const order = await request(app).post('/api/payments/orders').set(auth(token)).send({ showId, seatIds, requestId: crypto.randomUUID(), ...extra });
  if (order.status !== 201) return order;
  const verified = await request(app).post('/api/payments/verify').set(auth(token)).send(signed(order.body.data, gateway.__pay(order.body.data.orderId)));
  // Preserve the booking fixture contract used by the existing integrity tests.
  if (verified.status === 200) return { status: 201, body: { ...verified.body, data: verified.body.data.booking } };
  return verified;
}
module.exports = { book, signed };
