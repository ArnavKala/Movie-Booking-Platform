const router = require('express').Router();
const controller = require('../controllers/movie.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { adminOnly } = require('../middlewares/role.middleware');
const { validate } = require('../middlewares/validation.middleware');
const { idParam } = require('../validators/common.validator');
const validators = require('../validators/movie.validator');

router.get('/', validate({ query: validators.movieQuery }), controller.list);
router.get('/:id', validate({ params: idParam }), controller.getById);

router.post('/', authenticate, adminOnly, validate({ body: validators.createMovie }), controller.create);
router.put('/:id', authenticate, adminOnly, validate({ params: idParam, body: validators.updateMovie }), controller.update);
router.patch('/:id', authenticate, adminOnly, validate({ params: idParam, body: validators.updateMovie }), controller.update);
router.delete('/:id', authenticate, adminOnly, validate({ params: idParam }), controller.remove);

module.exports = router;
