const bcrypt = require('bcryptjs');
const env = require('../config/env');

const SALT_ROUNDS = env.isTest ? 4 : 12;

const hashPassword = (plain) => bcrypt.hash(plain, SALT_ROUNDS);
const comparePassword = (plain, hash) => bcrypt.compare(plain, hash);

module.exports = { hashPassword, comparePassword };
