const router = require('express').Router();
const controller = require('../controllers/user.controller');
const { authenticate } = require('../middlewares/auth.middleware');
const { validate } = require('../middlewares/validation.middleware');
const validators = require('../validators/user.validator');

router.use(authenticate);
router.get('/me', controller.getProfile);
router.put('/me', validate({ body: validators.updateProfile }), controller.updateProfile);
router.patch('/me', validate({ body: validators.updateProfile }), controller.updateProfile);
router.put('/me/password', validate({ body: validators.changePassword }), controller.changePassword);

module.exports = router;
