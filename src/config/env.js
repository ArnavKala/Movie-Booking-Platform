const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const NODE_ENV = process.env.NODE_ENV || 'development';
const trimEnv = (value) => {
  const trimmed = value?.trim();
  if (!trimmed) return trimmed;
  return trimmed.replace(/^(['"])(.*)\1$/, '$2').trim();
};

if (NODE_ENV !== 'test') {
  const missing = ['MONGODB_URI', 'JWT_SECRET'].filter((key) => !process.env[key]);
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Copy .env.example to .env and fill them in.`
    );
  }
}

module.exports = {
  NODE_ENV,
  isProduction: NODE_ENV === 'production',
  isTest: NODE_ENV === 'test',
  PORT: parseInt(process.env.PORT, 10) || 5000,
  MONGODB_URI: process.env.MONGODB_URI,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  RAZORPAY_KEY: process.env.RAZORPAY_TEST_API_KEY,
  RAZORPAY_SECRET: process.env.RAZORPAY_TEST_API_SECRET,
  RAZORPAY_WEBHOOK_SECRET: process.env.RAZORPAY_WEBHOOK_SECRET,
  PUBLIC_APP_URL: (
    process.env.PUBLIC_APP_URL ||
    (NODE_ENV === 'production' ? 'https://goodshowcinema-techteam.vercel.app' : 'http://localhost:5173')
  ).replace(/\/$/, ''),
  CORS_ORIGINS: (process.env.CORS_ORIGINS || 'http://localhost:5173,https://goodshowcinema-techteam.vercel.app')
    .split(',')
    .map((origin) => origin.trim().replace(/\/$/, ''))
    .filter(Boolean),
  CLOUDINARY_CLOUD_NAME: trimEnv(process.env.CLOUDINARY_CLOUD_NAME),
  CLOUDINARY_API_KEY: trimEnv(process.env.CLOUDINARY_API_KEY),
  CLOUDINARY_API_SECRET: trimEnv(process.env.CLOUDINARY_API_SECRET),
  CLOUDINARY_FOLDER: trimEnv(process.env.CLOUDINARY_FOLDER) || 'goodshow/movies',
};
