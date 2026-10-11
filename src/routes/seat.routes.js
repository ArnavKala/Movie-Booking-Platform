const router = require('express').Router();
const controller = require('../controllers/seat.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { idParam } = require('../validators/common.validator');
const validators = require('../validators/seat.validator');

router.get('/', validate({ query: validators.seatQuery }), controller.list);
router.get('/:id', validate({ params: idParam }), controller.getById);

router.post('/bulk', authenticate, adminOnly, validate({ body: validators.bulkSeats }), controller.createBulk);
router.post('/', authenticate, adminOnly, validate({ body: validators.createSeat }), controller.create);
router.put('/:id', authenticate, adminOnly, validate({ params: idParam, body: validators.updateSeat }), controller.update);
router.patch('/:id', authenticate, adminOnly, validate({ params: idParam, body: validators.updateSeat }), controller.update);
router.delete('/:id', authenticate, adminOnly, validate({ params: idParam }), controller.remove);

module.exports = router;
