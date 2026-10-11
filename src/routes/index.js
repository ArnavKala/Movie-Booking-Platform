const router = require('express').Router();
const mongoose = require('mongoose');
const { ok } = require('../utils/apiResponse');

const DB_STATES = ['disconnected', 'connected', 'connecting', 'disconnecting'];

router.get('/health', (req, res) =>
  ok(res, {
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: DB_STATES[mongoose.connection.readyState] || 'unknown',
  }, 'Service is running'));

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/movies', require('./movie.routes'));
router.use('/theatres', require('./theatre.routes'));
router.use('/screens', require('./screen.routes'));
router.use('/seats', require('./seat.routes'));
router.use('/shows', require('./show.routes'));
router.use('/bookings', require('./booking.routes'));
router.use('/payments', require('./payment.routes'));
router.use('/tickets', require('./ticket.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
