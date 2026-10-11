const { MongoMemoryReplSet } = require('mongodb-memory-server');

/**
 * Transactions need a replica set, so tests run against an in-memory single-node replica set.
 * To use your own (Atlas) cluster instead, set TEST_MONGODB_URI. Tests use a throw-away
 * database with a unique name and drop it afterwards, but prefer a separate test cluster/project.
 */
module.exports = async () => {
  if (process.env.TEST_MONGODB_URI) return;
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
  globalThis.__REPLSET__ = replSet;
  process.env.MONGO_TEST_URI = replSet.getUri();
};
