const router = require('express').Router();
const controller = require('../controllers/admin.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { idParam } = require('../validators/common.validator');
const userValidators = require('../validators/user.validator');
const bookingValidators = require('../validators/booking.validator');
const cloudinaryService = require('../services/cloudinary.service');

router.use(authenticate, adminOnly);

router.get('/stats', controller.stats);
router.get('/uploads/signature', (req, res) =>
  require('../utils/apiResponse').ok(res, cloudinaryService.signUpload(), 'Cloudinary upload signature'));
router.get('/payments', validate({ query: require('../validators/common.validator').Joi.object(require('../validators/common.validator').paginationKeys()) }), require('../utils/asyncHandler')(async (req, res) => {
  const { items, meta } = await require('../services/payment.service').list(req.user, req.query, true);
  return require('../utils/apiResponse').ok(res, items, 'Payments', meta);
}));

router.get('/users', validate({ query: userValidators.adminUserQuery }), controller.listUsers);
router.get('/users/:id', validate({ params: idParam }), controller.getUser);
router.patch('/users/:id', validate({ params: idParam, body: userValidators.adminUpdateUser }), controller.updateUser);
router.delete('/users/:id', validate({ params: idParam }), controller.deleteUser);

router.get('/bookings', validate({ query: bookingValidators.adminBookingQuery }), controller.listBookings);
router.get('/bookings/:id', validate({ params: idParam }), controller.getBooking);
router.delete('/bookings/:id', validate({ params: idParam, body: bookingValidators.cancelBooking }), controller.cancelBooking);

module.exports = router;
