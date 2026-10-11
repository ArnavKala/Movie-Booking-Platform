const jwt = require('jsonwebtoken');
const env = require('../config/env');

const signToken = (user) =>
  jwt.sign({ id: String(user._id), role: user.role }, env.JWT_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.JWT_EXPIRES_IN,
  });

const verifyToken = (token) => jwt.verify(token, env.JWT_SECRET, { algorithms: ['HS256'] });

module.exports = { signToken, verifyToken };
