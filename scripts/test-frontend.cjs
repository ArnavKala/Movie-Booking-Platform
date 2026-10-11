// Isolated browser integration test. Never reads or writes the configured application database.
// Run with PLAYWRIGHT_MODULE pointing to an installed Playwright package, or install playwright.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'isolated-browser-test-secret';
process.env.RAZORPAY_TEST_API_KEY = 'rzp_test_browser';
process.env.RAZORPAY_TEST_API_SECRET = 'isolated-browser-payment-secret';
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const mongoose = require('mongoose');
const { MongoMemoryReplSet } = require('mongodb-memory-server');
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const crypto = require('node:crypto');
const gateway = require('../src/services/razorpay.service');
Object.assign(gateway, require('../tests/helpers/mockGateway').createMockGateway(gateway));

(async () => {
  let replica, api, vite, browser;
  try {
    replica = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replica.getUri(), { dbName: 'frontend_integration' });
    const models = require('../src/models');
    await Promise.all(Object.values(models).map(model => model.init()));
    const fixture = await require('../tests/helpers/factories').createBookableShow();
    const app = require('../src/app');
    api = await new Promise(resolve => { const server = app.listen(0, '127.0.0.1', () => resolve(server)); });
    const apiUrl = `http://127.0.0.1:${api.address().port}`;
    const { createServer } = await import(pathToFileURL(path.resolve(__dirname, '../../movie-hub/node_modules/vite/dist/node/index.js')).href);
    vite = await createServer({
      root: path.resolve(__dirname, '../../movie-hub'),
      define: { 'import.meta.env.VITE_API_URL': JSON.stringify('/api') },
      server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: apiUrl, changeOrigin: true } } },
    });
    await vite.listen();
    const url = `http://127.0.0.1:${vite.httpServer.address().port}`;
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROME_PATH || '/usr/bin/google-chrome', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    const page = await browser.newPage({ reducedMotion: 'reduce' });
    const pageErrors = [];
    await page.exposeFunction('testPayOrder', orderId => {
      const payment = gateway.__pay(orderId);
      return { razorpay_order_id: orderId, razorpay_payment_id: payment.id, razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_TEST_API_SECRET).update(`${orderId}|${payment.id}`).digest('hex') };
    });
    page.on('pageerror', error => pageErrors.push(error.message));
    // Exercise the accessible catalogue without depending on GPU or external artwork.
    await page.addInitScript(() => {
      // Only this isolated test browser replaces the external checkout UI.
      window.Razorpay = class {
        constructor(options) { this.options = options; }
        async open() { this.options.handler(await window.testPayOrder(this.options.order_id)); }
      };
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        if (type.startsWith('webgl')) return null;
        return original.call(this, type, ...args);
      };
    });
    await page.route(/^https:\/\//, route => route.abort());
    await page.goto(`${url}/lobby`);
    await page.getByRole('button', { name: 'Book tickets', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(fixture.movie.title) }).click();
    await page.getByRole('button', { name: new RegExp(fixture.theatre.name) }).click();
    await page.getByRole('button', { name: 'A1, REGULAR, ₹200, AVAILABLE', exact: true }).click();
    await page.getByRole('button', { name: 'B1, PREMIUM, ₹350, AVAILABLE', exact: true }).click();
    await page.getByRole('button', { name: 'Review →' }).click();
    await page.getByRole('button', { name: 'Sign in to pay' }).click();
    await page.getByRole('button', { name: 'Join the Cinema Club', exact: true }).click();
    await page.getByLabel('Your name').fill('Browser Customer');
    await page.getByLabel('Email address').fill('browser@example.com');
    await page.getByLabel('Password', { exact: true }).fill('BrowserPass123');
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('button', { name: 'Pay ₹550.00', exact: true }).click();
    await page.getByRole('heading', { name: 'Booking confirmed!' }).waitFor();
    let bookings = await models.Booking.find({ status: 'CONFIRMED' });
    assert.equal(bookings.length, 1);
    assert.equal(bookings[0].totalAmount, 550);
    const reference = bookings[0].bookingReference;
    assert.ok(await page.getByText(reference, { exact: true }).isVisible());
    await page.getByAltText(`Entry QR code for booking ${reference}`).waitFor();
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download PDF ticket' }).click()]);
    assert.equal(download.suggestedFilename(), `${reference}.pdf`);
    await page.getByRole('button', { name: 'Done', exact: true }).click();
    await page.reload();
    await page.getByRole('button', { name: 'My bookings', exact: true }).click();
    await page.getByText(reference, { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Cancel booking', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, cancel booking', exact: true }).click();
    await page.getByText('CANCELLED · ₹550', { exact: true }).waitFor();
    assert.equal(await models.Booking.countDocuments({ status: 'CONFIRMED' }), 0);
    await page.getByRole('button', { name: 'Close booking history' }).click();
    // Direct routes must resolve Mongo IDs and show released seats.
    await page.goto(`${url}/book/${fixture.movie._id}/${fixture.show._id}`);
    await page.getByRole('button', { name: 'A1, REGULAR, ₹200, AVAILABLE', exact: true }).click();
    await page.getByRole('button', { name: 'Review →' }).click();
    // Another customer takes the seat after this browser selected it.
    const other = await require('../tests/helpers/factories').createUser();
    await require('../src/services/booking.service').create(other.user, { showId: fixture.show._id, seatIds: [String(fixture.seats.A1._id)] });
    await page.getByRole('button', { name: 'Pay ₹200.00', exact: true }).click();
    await page.getByRole('button', { name: 'A1, REGULAR, ₹200, BOOKED', exact: true }).waitFor();
    assert.ok(await page.getByRole('button', { name: 'A1, REGULAR, ₹200, BOOKED', exact: true }).isDisabled());
    assert.equal(await models.Booking.countDocuments({ status: 'CONFIRMED' }), 1);
    await page.getByRole('button', { name: 'Close booking', exact: true }).click();
    await page.setViewportSize({ width: 1280, height: 900 });
    // Admin forms create a complete new catalogue through the actual API.
    const admin = await require('../tests/helpers/factories').createAdmin({ email: 'browseradmin@example.com' });
    await page.evaluate(token => localStorage.setItem('goodshow.token', token), admin.token);
    await page.goto(`${url}/admin`);
    await page.getByRole('button', { name: 'movies', exact: true }).click();
    await page.getByRole('button', { name: 'Add movie', exact: true }).click();
    await page.getByLabel('Title', { exact: true }).fill('Admin Browser Movie');
    await page.getByLabel('Genres (comma separated)').fill('Drama, Adventure');
    await page.getByLabel('Release date').fill('2026-01-01');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('cell', { name: /Admin Browser Movie/ }).waitFor();
    await page.getByRole('button', { name: 'theatres', exact: true }).click();
    await page.getByRole('button', { name: 'Add theatre', exact: true }).click();
    await page.getByLabel('Theatre name', { exact: true }).fill('Admin Browser Cinema');
    await page.getByLabel('Street address').fill('1 Demo Street');
    await page.getByLabel('City', { exact: true }).fill('Pune');
    await page.getByLabel('State', { exact: true }).fill('Maharashtra');
    await page.getByLabel('PIN code').fill('411001');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('cell', { name: /Admin Browser Cinema/ }).waitFor();
    await page.getByRole('button', { name: 'screens', exact: true }).click();
    await page.getByRole('button', { name: 'Add screen', exact: true }).click();
    await page.getByLabel('Theatre', { exact: true }).selectOption({ label: 'Admin Browser Cinema' });
    await page.getByLabel('Screen name').fill('Browser Screen');
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('cell', { name: /Browser Screen/ }).waitFor();
    await page.getByRole('button', { name: 'shows', exact: true }).click();
    await page.getByRole('button', { name: 'Add show', exact: true }).click();
    await page.getByLabel('Movie', { exact: true }).selectOption({ label: 'Admin Browser Movie' });
    await page.getByLabel('Theatre', { exact: true }).selectOption({ label: 'Admin Browser Cinema' });
    await page.getByLabel('Screen', { exact: true }).selectOption({ label: 'Browser Screen' });
    await page.getByLabel('Start time (your local time)').fill(new Date(Date.now() + 86400000).toISOString().slice(0, 16));
    await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.getByRole('cell', { name: /Admin Browser Movie/ }).waitFor();
    // Validate a paid ticket from another booking and check it in once.
    const held = await require('../src/services/payment.service').createOrder(other.user, { showId: fixture.show._id, seatIds: [String(fixture.seats.A2._id)], requestId: crypto.randomUUID() });
    const paid = gateway.__pay(held.orderId);
    const result = await require('../src/services/payment.service').verify(other.user, {
      checkoutId: held._id, razorpay_order_id: held.orderId, razorpay_payment_id: paid.id,
      razorpay_signature: crypto.createHmac('sha256', process.env.RAZORPAY_TEST_API_SECRET).update(`${held.orderId}|${paid.id}`).digest('hex'),
    });
    const qr = await require('../src/services/ticket.service').ticket(result.booking._id, other.user);
    await models.Show.updateOne({ _id: fixture.show._id }, { startTime: new Date(Date.now() + 3600000) });
    await page.goto(`${url}/admin/check-in?ticket=${encodeURIComponent(qr.token)}`);
    await page.getByRole('button', { name: 'Validate ticket', exact: true }).click();
    await page.getByRole('button', { name: 'Admit all 1 guests' }).click();
    await page.getByText(/Already checked in:/).waitFor();
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
    await page.getByLabel('Email address').fill('browser@example.com');
    await page.getByLabel('Password', { exact: true }).fill('wrong-password');
    await page.getByRole('button', { name: 'Sign in ➔' }).click();
    await page.getByText('Invalid email or password', { exact: true }).waitFor();
    await page.getByLabel('Password', { exact: true }).fill('BrowserPass123');
    await page.getByRole('button', { name: 'Sign in ➔' }).click();
    await page.getByRole('button', { name: 'My bookings', exact: true }).waitFor();
    await page.evaluate(() => localStorage.setItem('goodshow.token', 'expired-token'));
    await page.reload();
    await page.getByRole('button', { name: 'Sign in', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('goodshow.token')), null);
    await page.goto(`${url}/lobby`);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole('button', { name: 'Book tickets', exact: true }).click();
    await page.getByRole('button', { name: new RegExp(fixture.movie.title) }).click();
    await page.getByRole('button', { name: new RegExp(fixture.theatre.name) }).click();
    await page.getByRole('button', { name: 'B1, PREMIUM, ₹350, AVAILABLE', exact: true }).click();
    await page.getByRole('button', { name: 'Close booking', exact: true }).click();
    assert.deepEqual(pageErrors, []);
    console.log('PASS: browser registration, mocked Razorpay checkout with real server verification, QR/PDF, refunds, history, session restore, conflict, mobile, admin movie/theatre/screen/show forms and QR check-in.');
  } finally {
    await browser?.close();
    await vite?.close();
    if (api) await new Promise(resolve => api.close(resolve));
    await mongoose.disconnect();
    await replica?.stop();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
