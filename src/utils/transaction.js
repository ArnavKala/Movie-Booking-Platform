const mongoose = require('mongoose');

const TRANSACTION_OPTIONS = {
  readConcern: { level: 'snapshot' },
  writeConcern: { w: 'majority' },
};

/**
 * Runs `fn(session)` inside a MongoDB transaction (Atlas / replica-set compatible).
 * Mongoose uses session.withTransaction under the hood, so transient errors such as
 * write conflicts are retried automatically and the callback may run more than once.
 * The callback must therefore be free of non-database side effects.
 */
const withTransaction = (fn) => mongoose.connection.transaction(fn, TRANSACTION_OPTIONS);

module.exports = { withTransaction };
