process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production';
process.env.JWT_EXPIRES_IN = '1h';
process.env.RAZORPAY_TEST_API_KEY = 'rzp_test_isolated';
process.env.RAZORPAY_TEST_API_SECRET = 'isolated-payment-secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'isolated-webhook-secret';
