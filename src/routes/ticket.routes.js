const router = require('express').Router();
const service = require('../services/ticket.service');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { Joi, idParam } = require('../validators/common.validator');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/apiResponse');
const tokenBody = Joi.object({ token: Joi.string().max(2048).required() });
router.use(authenticate);
router.post('/validate', adminOnly, validate({ body: tokenBody }), asyncHandler(async (req, res) => ok(res, await service.validateToken(req.body.token))));
router.post('/check-in', adminOnly, validate({ body: tokenBody }), asyncHandler(async (req, res) => ok(res, await service.checkIn(req.body.token, req.user))));
router.get('/:id/pdf', validate({ params: idParam }), asyncHandler(async (req, res) => {
  const { buffer, filename } = await service.pdf(req.params.id, req.user);
  res.set('Cache-Control', 'no-store').type('pdf').attachment(filename).send(buffer);
}));
router.get('/:id', validate({ params: idParam }), asyncHandler(async (req, res) => {
  res.set('Cache-Control', 'no-store');
  return ok(res, await service.ticket(req.params.id, req.user));
}));
module.exports = router;
