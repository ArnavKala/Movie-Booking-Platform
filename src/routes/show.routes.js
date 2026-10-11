const router = require('express').Router();
const controller = require('../controllers/show.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { idParam } = require('../validators/common.validator');
const validators = require('../validators/show.validator');

router.get('/', validate({ query: validators.showQuery }), controller.list);
router.get('/:showId/seats', validate({ params: validators.showSeatsParams }), controller.getSeats);
router.get('/:id', validate({ params: idParam }), controller.getById);

router.post('/', authenticate, adminOnly, validate({ body: validators.createShow }), controller.create);
router.put('/:id', authenticate, adminOnly, validate({ params: idParam, body: validators.updateShow }), controller.update);
router.patch('/:id', authenticate, adminOnly, validate({ params: idParam, body: validators.updateShow }), controller.update);
router.delete('/:id', authenticate, adminOnly, validate({ params: idParam }), controller.remove);

module.exports = router;
