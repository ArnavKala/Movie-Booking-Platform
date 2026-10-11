const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

const dns = require('dns');
dns.setServers(['8.8.8.8', '1.1.1.1']);

/**
 * Connects to MongoDB and makes sure every collection and index exists.
 * Index creation matters for correctness: the partial unique index on bookings
 * is what guarantees a seat can't be double-booked, and collections must exist
 * before they are used inside multi-document transactions.
 */
async function connectDB(uri = env.MONGODB_URI, options = {}) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000, ...options });
  require('../models');
  await Promise.all(Object.values(mongoose.models).map((model) => model.init()));
  logger.info(`MongoDB connected (db: ${mongoose.connection.name})`);
}

async function disconnectDB() {
  await mongoose.disconnect();
}

module.exports = { connectDB, disconnectDB };
