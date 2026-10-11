// Optional real-provider TEST-mode smoke test. Uses a disposable local database.
// Creates a test order/payment and refunds it; never accepts live-mode keys.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-razorpay-browser-secret';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const gateway = require('../src/services/razorpay.service');
gateway.assertConfigured();

(async () => {
  let replica, api, vite, browser, page;
  try {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replica.getUri(), { dbName: 'razorpay_sandbox_check' });
    const models = require('../src/models');
    await Promise.all(Object.values(models).map(model => model.init()));
    const { createBookableShow, createUser } = require('../tests/helpers/factories');
    const fixture = await createBookableShow();
    const customer = await createUser({ name: 'Goodshow Test Customer', email: 'goodshow-test@example.com' });
    api = await new Promise(resolve => { const server = require('../src/app').listen(0, '127.0.0.1', () => resolve(server)); });
    const { createServer } = await import(pathToFileURL(path.resolve(__dirname, '../../movie-hub/node_modules/vite/dist/node/index.js')).href);
    vite = await createServer({ root: path.resolve(__dirname, '../../movie-hub'), define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') }, server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: `http://127.0.0.1:${api.address().port}`, changeOrigin: true } } } });
    await vite.listen();
    const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage({ reducedMotion: 'reduce' });
    await page.goto(url);
    await page.evaluate(token => localStorage.setItem('goodshow.token', token), customer.token);
    await page.goto(`${url}/book/${fixture.movie._id}/${fixture.show._id}`);
    await page.getByRole('button', { name: 'A1, REGULAR, ₹200, AVAILABLE', exact: true }).click();
    await page.getByRole('button', { name: 'Review →' }).click();
    await page.getByRole('button', { name: 'Pay ₹200.00', exact: true }).click();
    const frame = page.frameLocator('iframe.razorpay-checkout-frame');
    await frame.locator('body').waitFor();
    // Keep diagnostics concise and omit network headers, keys and signatures.
    console.log('Razorpay checkout loaded.');
    const contact = frame.getByTestId('contact-overlay-container');
    await contact.waitFor({ timeout: 15000 });
    await contact.getByPlaceholder('Mobile number', { exact: true }).fill('9000090000');
    await contact.getByRole('button', { name: /continue/i }).click();
    await frame.getByText('Netbanking', { exact: true }).first().click({ timeout: 15000 });
    const popupPromise = page.waitForEvent('popup', { timeout: 20000 });
    // Test-mode availability varies by account; choose one offered by this checkout.
    await frame.getByText('Canara Bank', { exact: true }).first().click({ timeout: 15000 });
    const payButton = frame.getByRole('button', { name: /pay|continue/i }).last();
    if (await payButton.isVisible().catch(() => false)) await payButton.click();
    const popup = await popupPromise;
    await popup.getByRole('button', { name: 'Success', exact: true }).click();
    await page.getByRole('heading', { name: 'Booking confirmed!' }).waitFor({ timeout: 45000 });
    const booking = await models.Booking.findOne({ user: customer.user._id });
    assert.equal(booking.paymentStatus, 'PAID');
    await page.getByAltText(`Entry QR code for booking ${booking.bookingReference}`).waitFor();
    const providerPayment = await gateway.fetchPayment(booking.paymentId);
    assert.equal(providerPayment.status, 'captured');
    assert.equal(providerPayment.amount, 20000);
    await require('../src/services/booking.service').cancel(booking._id, customer.user, 'Sandbox integration test complete');
    const payment = await models.Payment.findById(booking.payment);
    assert.ok(payment.refundId, 'Test refund must be accepted by Razorpay');
    console.log(`PASS: real Razorpay TEST checkout, signature verification, capture, QR ticket, and refund (${payment.refundStatus}).`);
  } catch (error) {
    if (page) {
      await page.screenshot({ path: '/tmp/goodshow-razorpay-check.png', fullPage: true }).catch(() => {});
      for (const frame of page.frames()) {
        if (frame.url().includes('razorpay')) console.log('Checkout visible text:', (await frame.locator('body').innerText().catch(() => '')).slice(0, 3500));
      }
    }
    throw error;
  } finally {
    await browser?.close(); await vite?.close();
    if (api) await new Promise(resolve => api.close(resolve));
    await mongoose.disconnect(); await replica?.stop();
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
