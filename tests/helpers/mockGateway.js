// Test-only provider double: never installed by application code.
const crypto = require('crypto');
function createMockGateway(actual) {
  const orders = new Map();
  const payments = new Map();
  const refunds = new Map();
  return {
    ...actual,
    createOrder: async data => {
      const order = { ...data, id: `order_${crypto.randomBytes(8).toString('hex')}` };
      orders.set(order.id, order); return order;
    },
    fetchPayment: async id => { if (!payments.has(id)) throw new Error('Payment not found'); return payments.get(id); },
    fetchOrderPayments: async orderId => ({ items: [...payments.values()].filter(p => p.order_id === orderId) }),
    capture: async id => { const p = payments.get(id); p.status = 'captured'; return p; },
    refund: async payment => {
      const key = String(payment._id);
      if (!refunds.has(key)) refunds.set(key, { id: `rfnd_${crypto.randomBytes(8).toString('hex')}`, payment_id: payment.paymentId, amount: payment.amount, status: 'processed' });
      return refunds.get(key);
    },
    fetchRefund: async id => [...refunds.values()].find(r => r.id === id),
    __pay: (orderId, overrides = {}) => {
      const order = orders.get(orderId);
      const payment = { id: `pay_${crypto.randomBytes(8).toString('hex')}`, order_id: orderId, amount: order.amount, currency: order.currency, status: 'captured', amount_refunded: 0, ...overrides };
      payments.set(payment.id, payment); return payment;
    },
    __refunds: refunds,
  };
}
module.exports = { createMockGateway };
