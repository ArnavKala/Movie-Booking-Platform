
const dns = require('node:dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

const env = require('./config/env');
const { connectDB, disconnectDB } = require('./config/db');
const app = require('./app');
const logger = require('./utils/logger');

async function start() {
  await connectDB();
  const paymentService = require('./services/payment.service');
  const paymentTimer = setInterval(() => paymentService.sweep().catch(err => logger.error('Payment reconciliation failed:', err.message)), 60000);
  paymentTimer.unref();
  paymentService.sweep().catch(err => logger.error('Payment reconciliation failed:', err.message));

  const server = app.listen(env.PORT, () => {
    logger.info(
      `Server listening on http://localhost:${env.PORT} (${env.NODE_ENV})`
    );
  });

  const shutdown = async (signal) => {
    logger.info(`${signal} received, shutting down`);
    clearInterval(paymentTimer);

    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) =>
  logger.error('Unhandled rejection:', reason)
);

start().catch((err) => {
  logger.error('Failed to start server:', err.message);
  process.exit(1);
});
