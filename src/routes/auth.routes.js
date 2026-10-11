const router = require('express').Router();
const controller = require('../controllers/auth.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const validators = require('../validators/auth.validator');

router.post('/register', validate({ body: validators.register }), controller.register);
router.post('/login', validate({ body: validators.login }), controller.login);
router.get('/me', authenticate, controller.me);

module.exports = router;
