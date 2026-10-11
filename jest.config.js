module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  globalSetup: '<rootDir>/tests/helpers/globalSetup.js',
  globalTeardown: '<rootDir>/tests/helpers/globalTeardown.js',
  setupFiles: ['<rootDir>/tests/helpers/env.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/helpers/paymentSetup.js'],
  testTimeout: 60000,
  maxWorkers: 1,
};
