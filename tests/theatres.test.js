const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');
const { createUser, createAdmin, auth, createTheatre, createBookableShow } = require('./helpers/factories');
const { Seat, Screen } = require('../src/models');

beforeAll(db.connect);
afterAll(db.disconnect);
afterEach(db.clear);

const payload = {
  name: 'PVR Orion',
  address: { line1: 'Dr Rajkumar Rd', city: 'Bengaluru', state: 'Karnataka', pincode: '560055' },
  location: { latitude: 13.0108, longitude: 77.5551 },
  facilities: ['Parking', 'Food Court'],
};

describe('theatres', () => {
  it('admin can create a theatre with GeoJSON location; users cannot', async () => {
    const { token: userToken } = await createUser();
    const { token } = await createAdmin();
    expect((await request(app).post('/api/theatres').set(auth(userToken)).send(payload)).status).toBe(403);
    const res = await request(app).post('/api/theatres').set(auth(token)).send(payload);
    expect(res.status).toBe(201);
    expect(res.body.data.location.coordinates).toEqual([77.5551, 13.0108]);
  });

  it('filters by city, facility, name and distance', async () => {
    const { token } = await createAdmin();
    await request(app).post('/api/theatres').set(auth(token)).send(payload);
    await createTheatre({ name: 'Mumbai Cinema', address: { line1: 'x', city: 'Mumbai', state: 'MH', pincode: '400001' } });

    const count = async (qs) => (await request(app).get(`/api/theatres?${qs}`)).body.data.length;
    expect(await count('city=bengaluru')).toBe(1);
    expect(await count('city=Mumbai')).toBe(1);
    expect(await count('facility=parking')).toBe(1);
    expect(await count('q=orion')).toBe(1);
    expect(await count('lat=13.01&lng=77.55&radiusKm=5')).toBe(1);
    expect(await count('lat=19.07&lng=72.87&radiusKm=5')).toBe(0);
  });

  it('updates and rejects duplicate name in the same city', async () => {
    const { token } = await createAdmin();
    const a = await request(app).post('/api/theatres').set(auth(token)).send(payload);
    const dup = await request(app).post('/api/theatres').set(auth(token)).send(payload);
    expect(dup.status).toBe(409);
    const upd = await request(app).patch(`/api/theatres/${a.body.data._id}`).set(auth(token)).send({ facilities: ['IMAX'] });
    expect(upd.body.data.facilities).toEqual(['IMAX']);
  });

  it('refuses to delete a theatre with shows, deletes an empty one with its screens and seats', async () => {
    const { token } = await createAdmin();
    const { theatre } = await createBookableShow();
    expect((await request(app).delete(`/api/theatres/${theatre._id}`).set(auth(token))).status).toBe(409);

    const empty = await request(app).post('/api/theatres').set(auth(token)).send({ ...payload, name: 'Empty' });
    const id = empty.body.data._id;
    const screen = await request(app).post('/api/screens').set(auth(token))
      .send({ theatre: id, name: 'S1', layout: [{ row: 'A', count: 3 }] });
    expect(screen.status).toBe(201);
    expect((await request(app).delete(`/api/theatres/${id}`).set(auth(token))).status).toBe(200);
    expect(await Screen.countDocuments({ theatre: id })).toBe(0);
    expect(await Seat.countDocuments({ screen: screen.body.data._id })).toBe(0);
  });
});

describe('screens and seats', () => {
  it('creates a screen with a seat layout and exposes seats', async () => {
    const { token } = await createAdmin();
    const theatre = await createTheatre();
    const res = await request(app).post('/api/screens').set(auth(token)).send({
      theatre: theatre._id,
      name: 'Screen 1',
      screenType: 'IMAX',
      layout: [{ row: 'A', count: 5, category: 'REGULAR' }, { row: 'B', count: 3, category: 'RECLINER' }],
    });
    expect(res.status).toBe(201);
    expect(res.body.data.totalSeats).toBe(8);

    const detail = await request(app).get(`/api/screens/${res.body.data._id}`);
    expect(detail.body.data.seatsByCategory).toEqual({ REGULAR: 5, RECLINER: 3 });

    const seats = await request(app).get(`/api/seats?screen=${res.body.data._id}`);
    expect(seats.body.data).toHaveLength(8);
    expect(seats.body.data[0]).toMatchObject({ row: 'A', number: 1, label: 'A1', category: 'REGULAR' });
    expect((await request(app).get('/api/seats')).status).toBe(400);
  });

  it('adds, updates and deletes individual seats and keeps totalSeats in sync', async () => {
    const { token } = await createAdmin();
    const theatre = await createTheatre();
    const screen = (await request(app).post('/api/screens').set(auth(token)).send({ theatre: theatre._id, name: 'S1', layout: [{ row: 'A', count: 2 }] })).body.data;

    const seat = await request(app).post('/api/seats').set(auth(token)).send({ screen: screen._id, row: 'c', number: 1, category: 'PREMIUM' });
    expect(seat.status).toBe(201);
    expect(seat.body.data).toMatchObject({ row: 'C', label: 'C1' });
    expect((await Screen.findById(screen._id)).totalSeats).toBe(3);

    expect((await request(app).post('/api/seats').set(auth(token)).send({ screen: screen._id, row: 'C', number: 1 })).status).toBe(409);

    const bulk = await request(app).post('/api/seats/bulk').set(auth(token)).send({ screen: screen._id, seats: [{ row: 'D', number: 1 }, { row: 'D', number: 2 }] });
    expect(bulk.status).toBe(201);
    expect((await Screen.findById(screen._id)).totalSeats).toBe(5);

    const upd = await request(app).patch(`/api/seats/${seat.body.data._id}`).set(auth(token)).send({ category: 'RECLINER' });
    expect(upd.body.data.category).toBe('RECLINER');

    expect((await request(app).delete(`/api/seats/${seat.body.data._id}`).set(auth(token))).status).toBe(200);
    expect((await Screen.findById(screen._id)).totalSeats).toBe(4);
  });

  it('replaces the layout only while the screen has no shows', async () => {
    const { token } = await createAdmin();
    const theatre = await createTheatre();
    const screen = (await request(app).post('/api/screens').set(auth(token)).send({ theatre: theatre._id, name: 'S1' })).body.data;
    const res = await request(app).put(`/api/screens/${screen._id}/layout`).set(auth(token)).send({ layout: [{ row: 'A', count: 10 }] });
    expect(res.status).toBe(200);
    expect(res.body.data.totalSeats).toBe(10);

    const withShow = await createBookableShow();
    const blocked = await request(app).put(`/api/screens/${withShow.screen._id}/layout`).set(auth(token)).send({ layout: [{ row: 'A', count: 1 }] });
    expect(blocked.status).toBe(409);
    expect((await request(app).delete(`/api/screens/${withShow.screen._id}`).set(auth(token))).status).toBe(409);
  });
});
