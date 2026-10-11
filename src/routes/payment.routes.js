const router = require('express').Router();
const service = require('../services/payment.service');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { Joi, objectId, idParam, paginationKeys } = require('../validators/common.validator');
const { createBooking } = require('../validators/booking.validator');
const asyncHandler = require('../utils/asyncHandler');
const { ok, created } = require('../utils/apiResponse');
router.use(authenticate);
const orderSchema = createBooking.keys({ requestId: Joi.string().guid({ version: 'uuidv4' }).required() });
router.post('/orders', validate({ body: orderSchema }), asyncHandler(async (req, res) => created(res, await service.createOrder(req.user, req.body), 'Checkout created')));
router.post('/verify', validate({ body: Joi.object({
  checkoutId: objectId.required(),
  razorpay_order_id: Joi.string().pattern(/^order_[A-Za-z0-9]+$/).required(),
  razorpay_payment_id: Joi.string().pattern(/^pay_[A-Za-z0-9]+$/).required(),
  razorpay_signature: Joi.string().hex().length(64).required(),
}) }), asyncHandler(async (req, res) => ok(res, await service.verify(req.user, req.body))));
router.get('/', validate({ query: Joi.object(paginationKeys()) }), asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.user, req.query); return ok(res, items, 'Payments', meta);
}));
router.post('/:id/reconcile', validate({ params: idParam }), asyncHandler(async (req, res) => ok(res, await service.reconcile(req.params.id, req.user))));
module.exports = router;
