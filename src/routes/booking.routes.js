const router = require('express').Router();
const controller = require('../controllers/booking.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { idParam } = require('../validators/common.validator');
const validators = require('../validators/booking.validator');

router.use(authenticate);

router.post('/', validate({ body: validators.createBooking }), controller.create);
router.get('/', validate({ query: validators.bookingQuery }), controller.list);
router.get('/:id', validate({ params: idParam }), controller.getById);
router.delete('/:id', validate({ params: idParam, body: validators.cancelBooking }), controller.cancel);

module.exports = router;
