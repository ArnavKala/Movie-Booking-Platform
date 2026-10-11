const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');
const { createUser, createAdmin, auth, createBookableShow } = require('./helpers/factories');
const { Booking, Show } = require('../src/models');

beforeAll(db.connect);
afterAll(db.disconnect);
afterEach(db.clear);

const { book } = require('./helpers/paidBook');

describe('successful booking', () => {
  it('books seats, calculates the total on the server and ignores client prices', async () => {
    const { token } = await createUser();
    const { show, seats } = await createBookableShow();
    const res = await book(token, show._id, [seats.A1._id, seats.B1._id], { totalAmount: 1, price: 1, prices: { REGULAR: 1 } });

    expect(res.status).toBe(201);
    expect(res.body.data.status).toBe('CONFIRMED');
    expect(res.body.data.totalAmount).toBe(550); // 200 REGULAR + 350 PREMIUM
    expect(res.body.data.bookingReference).toMatch(/^BMS[A-Z0-9]+$/);
    expect(res.body.data.seatDetails.map((d) => d.label).sort()).toEqual(['A1', 'B1']);
    expect(res.body.data.show.movie.title).toBeTruthy();

    const availability = await request(app).get(`/api/shows/${show._id}/seats`);
    expect(availability.body.data.summary).toEqual({ total: 6, booked: 2, available: 4 });
  });

  it('requires authentication and validates the payload', async () => {
    const { show, seats } = await createBookableShow();
    expect((await request(app).post('/api/bookings').send({ showId: show._id, seatIds: [seats.A1._id] })).status).toBe(401);
    const { token } = await createUser();
    expect((await book(token, show._id, [])).status).toBe(400);
    expect((await book(token, show._id, [seats.A1._id, seats.A1._id])).status).toBe(400);
    expect((await book(token, 'bad', [seats.A1._id])).status).toBe(400);
    expect((await book(token, '64b64c4f9a1d4c1f8c8e0000', [seats.A1._id])).status).toBe(404);
  });

  it('rejects seats of another screen, and shows that already started', async () => {
    const { token } = await createUser();
    const a = await createBookableShow();
    const b = await createBookableShow();
    expect((await book(token, a.show._id, [b.seats.A1._id])).status).toBe(400);

    await Show.updateOne({ _id: a.show._id }, { startTime: new Date(Date.now() - 60000) });
    expect((await book(token, a.show._id, [a.seats.A1._id])).status).toBe(400);
  });

  it('lists only the caller\'s bookings and protects other users\' bookings', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { token: adminToken } = await createAdmin();
    const { show, seats } = await createBookableShow();
    const mine = await book(alice.token, show._id, [seats.A1._id]);
    await book(bob.token, show._id, [seats.A2._id]);

    const list = await request(app).get('/api/bookings').set(auth(alice.token));
    expect(list.body.data).toHaveLength(1);
    expect(list.body.meta.total).toBe(1);

    expect((await request(app).get(`/api/bookings/${mine.body.data._id}`).set(auth(alice.token))).status).toBe(200);
    expect((await request(app).get(`/api/bookings/${mine.body.data._id}`).set(auth(bob.token))).status).toBe(404);

    const all = await request(app).get('/api/admin/bookings').set(auth(adminToken));
    expect(all.body.data).toHaveLength(2);
    expect((await request(app).get('/api/admin/bookings').set(auth(alice.token))).status).toBe(403);
    expect((await request(app).get(`/api/admin/bookings/${mine.body.data._id}`).set(auth(adminToken))).status).toBe(200);
  });
});

describe('duplicate and concurrent booking prevention', () => {
  it('rejects a second booking of an already booked seat with 409', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { show, seats } = await createBookableShow();
    expect((await book(alice.token, show._id, [seats.A1._id])).status).toBe(201);
    const res = await book(bob.token, show._id, [seats.A1._id, seats.A2._id]);
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/A1/);
    // all-or-nothing: A2 must not have been booked as a side effect
    expect(await Booking.countDocuments({ show: show._id, status: 'CONFIRMED' })).toBe(1);
  });

  it('lets exactly one of many simultaneous requests win the same seat', async () => {
    const { show, seats } = await createBookableShow();
    const users = await Promise.all(Array.from({ length: 8 }, () => createUser()));

    const results = await Promise.all(users.map((u) => book(u.token, show._id, [seats.A1._id])));
    const statuses = results.map((r) => r.status).sort();

    expect(statuses.filter((s) => s === 201)).toHaveLength(1);
    expect(statuses.filter((s) => s === 409)).toHaveLength(7);
    expect(await Booking.countDocuments({ show: show._id, status: 'CONFIRMED' })).toBe(1);
  });

  it('never partially books when seat sets overlap concurrently', async () => {
    const { show, seats } = await createBookableShow();
    const [u1, u2, u3] = await Promise.all([createUser(), createUser(), createUser()]);
    const results = await Promise.all([
      book(u1.token, show._id, [seats.A1._id, seats.A2._id]),
      book(u2.token, show._id, [seats.A2._id, seats.A3._id]),
      book(u3.token, show._id, [seats.A3._id, seats.A4._id]),
    ]);
    const won = results.filter((r) => r.status === 201);
    expect(won.length).toBeGreaterThanOrEqual(1);
    results.filter((r) => r.status !== 201).forEach((r) => expect(r.status).toBe(409));

    const confirmed = await Booking.find({ show: show._id, status: 'CONFIRMED' });
    const bookedSeats = confirmed.flatMap((b) => b.seats.map(String));
    expect(new Set(bookedSeats).size).toBe(bookedSeats.length); // no seat appears twice
    expect(confirmed).toHaveLength(won.length);
  });

  it('the database itself rejects a duplicate confirmed seat even if the service is bypassed', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { show, seats } = await createBookableShow();
    const doc = (user, ref) => ({
      bookingReference: ref, user: user.user._id, show: show._id, seats: [seats.A1._id],
      seatDetails: [{ seat: seats.A1._id, label: 'A1', category: 'REGULAR', price: 200 }], totalAmount: 200,
    });
    await Booking.create(doc(alice, 'REF-1'));
    await expect(Booking.create(doc(bob, 'REF-2'))).rejects.toMatchObject({ code: 11000 });
    // same seat in a different show is fine
    const other = await createBookableShow();
    await expect(Booking.create({ ...doc(bob, 'REF-3'), show: other.show._id, seats: [other.seats.A1._id], seatDetails: [{ seat: other.seats.A1._id, label: 'A1', category: 'REGULAR', price: 200 }] })).resolves.toBeTruthy();
  });
});

describe('cancellation', () => {
  it('cancels a booking, frees only its seats and lets someone else book them', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { show, seats } = await createBookableShow();
    const booking = await book(alice.token, show._id, [seats.A1._id, seats.A2._id]);
    await book(bob.token, show._id, [seats.A3._id]);

    const res = await request(app).delete(`/api/bookings/${booking.body.data._id}`).set(auth(alice.token)).send({ reason: 'Plans changed' });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'CANCELLED', cancellationReason: 'Plans changed' });
    expect(res.body.data.cancelledAt).toBeTruthy();

    const availability = await request(app).get(`/api/shows/${show._id}/seats`);
    const status = Object.fromEntries(availability.body.data.seats.map((s) => [s.label, s.status]));
    expect(status).toMatchObject({ A1: 'AVAILABLE', A2: 'AVAILABLE', A3: 'BOOKED' });

    expect((await book(bob.token, show._id, [seats.A1._id])).status).toBe(201);
  });

  it('cannot release seats that now belong to another booking', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { show, seats } = await createBookableShow();

    const first = await book(alice.token, show._id, [seats.A1._id]);
    expect((await request(app).delete(`/api/bookings/${first.body.data._id}`).set(auth(alice.token))).status).toBe(200);
    const second = await book(bob.token, show._id, [seats.A1._id]);
    expect(second.status).toBe(201);

    // Alice tries again with her old booking id: rejected, and Bob keeps the seat.
    const again = await request(app).delete(`/api/bookings/${first.body.data._id}`).set(auth(alice.token));
    expect(again.status).toBe(409);
    expect((await Booking.findById(second.body.data._id)).status).toBe('CONFIRMED');
    const seatMap = await request(app).get(`/api/shows/${show._id}/seats`);
    expect(seatMap.body.data.seats.find((s) => s.label === 'A1').status).toBe('BOOKED');
    expect((await book(alice.token, show._id, [seats.A1._id])).status).toBe(409);
  });

  it('only the owner (or an admin) can cancel; shows that started cannot be cancelled by users', async () => {
    const alice = await createUser();
    const bob = await createUser();
    const { token: adminToken } = await createAdmin();
    const { show, seats } = await createBookableShow();
    const a = await book(alice.token, show._id, [seats.A1._id]);
    const b = await book(alice.token, show._id, [seats.A2._id]);

    expect((await request(app).delete(`/api/bookings/${a.body.data._id}`).set(auth(bob.token))).status).toBe(404);
    expect((await request(app).delete(`/api/bookings/${a.body.data._id}`)).status).toBe(401);
    expect((await request(app).delete(`/api/admin/bookings/${a.body.data._id}`).set(auth(adminToken))).status).toBe(200);

    await Show.updateOne({ _id: show._id }, { startTime: new Date(Date.now() - 60000) });
    expect((await request(app).delete(`/api/bookings/${b.body.data._id}`).set(auth(alice.token))).status).toBe(400);
    expect((await Booking.findById(b.body.data._id)).status).toBe('CONFIRMED');
  });
});
