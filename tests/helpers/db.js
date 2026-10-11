const mongoose = require('mongoose');

async function connect() {
  const uri = process.env.TEST_MONGODB_URI || process.env.MONGO_TEST_URI;
  const dbName = `mbtest_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  await mongoose.connect(uri, { dbName });
  require('../../src/models');
  await Promise.all(Object.values(mongoose.models).map((m) => m.init()));
}

async function clear() {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

module.exports = { connect, clear, disconnect };
