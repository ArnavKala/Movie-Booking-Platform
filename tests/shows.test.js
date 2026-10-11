const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');
const {
  createUser, createAdmin, auth, futureDate, createMovie, createTheatre, createTheatreWithScreen, createBookableShow,
} = require('./helpers/factories');
const { Show } = require('../src/models');
const screenService = require('../src/services/screen.service');

beforeAll(db.connect);
afterAll(db.disconnect);
afterEach(db.clear);

describe('creating shows (admin)', () => {
  it('creates a show, computes endTime from movie duration and derives missing prices', async () => {
    const { token } = await createAdmin();
    const movie = await createMovie({ duration: 100, languages: ['Hindi'] });
    const { theatre, screen } = await createTheatreWithScreen();
    const startTime = futureDate(3, 12);
    const res = await request(app).post('/api/shows').set(auth(token)).send({
      movie: movie._id, theatre: theatre._id, screen: screen._id, startTime, prices: { REGULAR: 200 },
    });
    expect(res.status).toBe(201);
    expect(new Date(res.body.data.endTime) - new Date(res.body.data.startTime)).toBe(100 * 60000);
    expect(res.body.data.prices).toEqual({ REGULAR: 200, PREMIUM: 300, RECLINER: 400 });
    expect(res.body.data.language).toBe('Hindi');
    expect(res.body.data.movie.title).toBe(movie.title);
  });

  it('is admin-only', async () => {
    const { token } = await createUser();
    const res = await request(app).post('/api/shows').set(auth(token)).send({});
    expect(res.status).toBe(403);
  });

  it('rejects past start times, wrong screen/theatre pairs, ended movies and bad languages', async () => {
    const { token } = await createAdmin();
    const movie = await createMovie();
    const { theatre, screen } = await createTheatreWithScreen();
    const otherTheatre = await createTheatre();
    const base = { movie: movie._id, theatre: theatre._id, screen: screen._id, startTime: futureDate(2), prices: { REGULAR: 100 } };
    const post = (body) => request(app).post('/api/shows').set(auth(token)).send(body);

    expect((await post({ ...base, startTime: new Date(Date.now() - 3600000) })).status).toBe(400);
    expect((await post({ ...base, theatre: otherTheatre._id })).status).toBe(400);
    expect((await post({ ...base, language: 'Klingon' })).status).toBe(400);
    expect((await post({ ...base, prices: { REGULAR: -5 } })).status).toBe(400);
    const ended = await createMovie({ status: 'ENDED' });
    expect((await post({ ...base, movie: ended._id })).status).toBe(400);
    expect((await post({ ...base, movie: '64b64c4f9a1d4c1f8c8e0000' })).status).toBe(404);
  });

  it('rejects a screen with no seats and overlapping shows on the same screen', async () => {
    const { token } = await createAdmin();
    const movie = await createMovie({ duration: 120 });
    const theatre = await createTheatre();
    const emptyScreen = await screenService.create({ theatre: theatre._id, name: 'Empty' });
    const post = (body) => request(app).post('/api/shows').set(auth(token)).send(body);
    expect((await post({ movie: movie._id, theatre: theatre._id, screen: emptyScreen._id, startTime: futureDate(2), prices: { REGULAR: 1 } })).status).toBe(400);

    const { theatre: t2, screen } = await createTheatreWithScreen();
    const body = { movie: movie._id, theatre: t2._id, screen: screen._id, startTime: futureDate(2, 10), prices: { REGULAR: 100 } };
    expect((await post(body)).status).toBe(201);
    expect((await post({ ...body, startTime: futureDate(2, 11) })).status).toBe(409); // overlaps 10:00-12:00
    expect((await post({ ...body, startTime: futureDate(2, 12) })).status).toBe(201); // back-to-back is fine
  });
});

describe('browsing and filtering shows (public)', () => {
  it('filters by movie, theatre, city, date, format and upcoming', async () => {
    const a = await createBookableShow({ format: 'IMAX', startTime: futureDate(2, 10) });
    const b = await createBookableShow({ startTime: futureDate(5, 18) });

    const ids = async (qs) => (await request(app).get(`/api/shows?${qs}`)).body.data.map((s) => s._id).sort();
    const sort = (...xs) => xs.map(String).sort();

    expect(await ids('')).toEqual(sort(a.show._id, b.show._id));
    expect(await ids(`movie=${a.movie._id}`)).toEqual(sort(a.show._id));
    expect(await ids(`theatre=${b.theatre._id}`)).toEqual(sort(b.show._id));
    expect(await ids('city=bengaluru')).toEqual(sort(a.show._id, b.show._id));
    expect(await ids('city=Delhi')).toEqual([]);
    expect(await ids('format=IMAX')).toEqual(sort(a.show._id));

    const day = futureDate(5).toISOString().slice(0, 10);
    expect(await ids(`date=${day}`)).toEqual(sort(b.show._id));
    expect(await ids(`date=${day}&movie=${a.movie._id}`)).toEqual([]);
    expect((await request(app).get('/api/shows?date=2026-02-31')).status).toBe(400);
    expect((await request(app).get('/api/shows?date=nope')).status).toBe(400);

    const from = futureDate(4).toISOString();
    expect(await ids(`from=${from}`)).toEqual(sort(b.show._id));
    expect(await ids('upcoming=true')).toHaveLength(2);
  });

  it('returns populated show details, 404 and 400 on bad ids', async () => {
    const { show, theatre } = await createBookableShow();
    const res = await request(app).get(`/api/shows/${show._id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.theatre.name).toBe(theatre.name);
    expect((await request(app).get('/api/shows/64b64c4f9a1d4c1f8c8e0000')).status).toBe(404);
    expect((await request(app).get('/api/shows/xyz')).status).toBe(400);
  });
});

describe('seat availability', () => {
  it('lists every seat of the screen as AVAILABLE with category prices for a fresh show', async () => {
    const { show } = await createBookableShow();
    const res = await request(app).get(`/api/shows/${show._id}/seats`);
    expect(res.status).toBe(200);
    expect(res.body.data.summary).toEqual({ total: 6, booked: 0, available: 6 });
    const byLabel = Object.fromEntries(res.body.data.seats.map((s) => [s.label, s]));
    expect(byLabel.A1).toMatchObject({ status: 'AVAILABLE', category: 'REGULAR', price: 200 });
    expect(byLabel.B1).toMatchObject({ status: 'AVAILABLE', category: 'PREMIUM', price: 350 });
    expect(res.body.data.seats.map((s) => s.label)).toEqual(['A1', 'A2', 'A3', 'A4', 'B1', 'B2']);
  });

  it('is specific to the show: booking in one show does not affect another show on the same screen', async () => {
    const { show, movie, theatre, screen, seats } = await createBookableShow();
    const second = await request(app).post('/api/shows').set(auth((await createAdmin()).token)).send({
      movie: movie._id, theatre: theatre._id, screen: screen._id, startTime: futureDate(4, 10), prices: { REGULAR: 150 },
    });
    expect(second.status).toBe(201);

    const { token } = await createUser();
    const booked = await require('./helpers/paidBook').book(token, show._id, [seats.A1._id]);
    expect(booked.status).toBe(201);

    const first = await request(app).get(`/api/shows/${show._id}/seats`);
    const other = await request(app).get(`/api/shows/${second.body.data._id}/seats`);
    expect(first.body.data.seats.find((s) => s.label === 'A1').status).toBe('BOOKED');
    expect(other.body.data.seats.find((s) => s.label === 'A1').status).toBe('AVAILABLE');
    expect(other.body.data.seats.find((s) => s.label === 'A1').price).toBe(150);
  });
});

describe('updating and deleting shows', () => {
  it('updates prices, blocks schedule changes and deletion once bookings exist, and cancels bookings on show cancellation', async () => {
    const { token: adminToken } = await createAdmin();
    const { token } = await createUser();
    const { show, seats } = await createBookableShow();

    const price = await request(app).patch(`/api/shows/${show._id}`).set(auth(adminToken)).send({ prices: { REGULAR: 250 } });
    expect(price.body.data.prices).toMatchObject({ REGULAR: 250, PREMIUM: 350 });

    const booking = await require('./helpers/paidBook').book(token, show._id, [seats.A1._id]);
    expect(booking.body.data.totalAmount).toBe(250);

    expect((await request(app).patch(`/api/shows/${show._id}`).set(auth(adminToken)).send({ startTime: futureDate(6) })).status).toBe(409);
    expect((await request(app).delete(`/api/shows/${show._id}`).set(auth(adminToken))).status).toBe(409);

    const cancelled = await request(app).patch(`/api/shows/${show._id}`).set(auth(adminToken)).send({ status: 'CANCELLED' });
    expect(cancelled.status).toBe(200);
    expect((await Show.findById(show._id)).status).toBe('CANCELLED');
    const mine = await request(app).get(`/api/bookings/${booking.body.data._id}`).set(auth(token));
    expect(mine.body.data.status).toBe('CANCELLED');

    const retry = await require('./helpers/paidBook').book(token, show._id, [seats.A2._id]);
    expect(retry.status).toBe(409);
  });

  it('deletes a show without bookings', async () => {
    const { token } = await createAdmin();
    const { show } = await createBookableShow();
    expect((await request(app).delete(`/api/shows/${show._id}`).set(auth(token))).status).toBe(200);
    expect(await Show.countDocuments()).toBe(0);
  });
});
