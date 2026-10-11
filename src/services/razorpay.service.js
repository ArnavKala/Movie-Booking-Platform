const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function assertConfigured() {
  if (!env.RAZORPAY_KEY || !env.RAZORPAY_SECRET) throw new ApiError(503, 'Razorpay test keys are not configured on the server');
  if (!env.RAZORPAY_KEY.startsWith('rzp_test_')) throw new ApiError(503, 'This integration requires Razorpay TEST keys');
}
async function api(path, method = 'GET', body, headers = {}) {
  assertConfigured();
  let response;
  try {
    response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method, signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY}:${env.RAZORPAY_SECRET}`).toString('base64')}`, 'Content-Type': 'application/json', ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch { throw new ApiError(502, 'Payment provider is temporarily unavailable. Check payment status before retrying.'); }
  if (!response.ok) throw new ApiError(502, `Payment provider rejected the request (${response.status}). Check the Razorpay test dashboard or retry status verification.`);
  return response.json();
}
function validSignature(value, signature, secret) {
  if (!secret || !/^[a-f0-9]{64}$/i.test(signature || '')) return false;
  return crypto.timingSafeEqual(crypto.createHmac('sha256', secret).update(value).digest(), Buffer.from(signature, 'hex'));
}
module.exports = {
  assertConfigured, validSignature,
  createOrder: data => api('/orders', 'POST', data),
  fetchPayment: id => api(`/payments/${encodeURIComponent(id)}`),
  fetchOrderPayments: id => api(`/orders/${encodeURIComponent(id)}/payments`),
  capture: (id, amount) => api(`/payments/${encodeURIComponent(id)}/capture`, 'POST', { amount, currency: 'INR' }),
  refund: payment => api(`/payments/${encodeURIComponent(payment.paymentId)}/refund`, 'POST', { amount: payment.amount, speed: 'normal', receipt: `refund_${payment._id}` }, { 'X-Refund-Idempotency': `goodshow-refund-${payment._id}` }),
  fetchRefund: id => api(`/refunds/${encodeURIComponent(id)}`),
};
