const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const routes = require('./routes');
const { sanitize } = require('./middlewares/sanitize.middleware');
const notFound = require('./middlewares/notFound.middleware');
const errorHandler = require('./middlewares/error.middleware');
const logger = require('./utils/logger');
const env = require('./config/env');

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(cors({
  origin: env.CORS_ORIGINS,
}));
// Razorpay signs the exact bytes, before JSON parsing or sanitization.
app.post('/api/payments/webhook', express.raw({ type: 'application/json', limit: '100kb' }), require('./utils/asyncHandler')(async (req, res) => {
  await require('./services/payment.service').webhook(req.body, req.get('x-razorpay-signature'));
  res.json({ success: true });
}));
app.use(express.json({ limit: '100kb' }));
app.use(sanitize);

app.use((req, res, next) => {
  const started = Date.now();
  res.on('finish', () => logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${Date.now() - started}ms`));
  next();
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Movie Booking Platform API is running'
  });
});

app.use('/api', routes);
app.use(notFound);
app.use(errorHandler);

module.exports = app;
