const crypto = require('crypto');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');

function assertConfigured() {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new ApiError(503, 'Cloudinary uploads are not configured. Set the Cloudinary environment variables first.');
  }
}

function signUpload() {
  assertConfigured();
  const timestamp = Math.floor(Date.now() / 1000);
  // Cloudinary signs the exact sorted parameter string, excluding file,
  // api_key, cloud_name, and resource_type.
  const payload = `folder=${env.CLOUDINARY_FOLDER}&timestamp=${timestamp}`;
  const signature = crypto.createHash('sha1')
    .update(`${payload}${env.CLOUDINARY_API_SECRET}`)
    .digest('hex');
  return {
    cloudName: env.CLOUDINARY_CLOUD_NAME,
    apiKey: env.CLOUDINARY_API_KEY,
    timestamp,
    folder: env.CLOUDINARY_FOLDER,
    signature,
  };
}

module.exports = { signUpload };
