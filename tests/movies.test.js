const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');
const { createUser, createAdmin, auth, createMovie, createBookableShow } = require('./helpers/factories');

beforeAll(db.connect);
afterAll(db.disconnect);
afterEach(db.clear);

const newMovie = {
  title: 'Space Odyssey',
  description: 'A journey',
  genres: ['Sci-Fi', 'Drama'],
  languages: ['English', 'Hindi'],
  duration: 150,
  releaseDate: '2026-01-15',
  status: 'NOW_SHOWING',
};

describe('movie listing and filtering (public)', () => {
  beforeEach(async () => {
    await createMovie({ title: 'Alpha Strike', genres: ['Action'], languages: ['English'], status: 'NOW_SHOWING' });
    await createMovie({ title: 'Beta Love', genres: ['Romance'], languages: ['Hindi', 'Tamil'], status: 'UPCOMING' });
    await createMovie({ title: 'Gamma Ray', genres: ['Action', 'Sci-Fi'], languages: ['Kannada'], status: 'ENDED' });
  });

  it('lists all movies with pagination meta', async () => {
    const res = await request(app).get('/api/movies');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(3);
    expect(res.body.meta).toMatchObject({ page: 1, total: 3, totalPages: 1 });
  });

  it('filters by genre, language and status (case-insensitive)', async () => {
    const titles = async (qs) => (await request(app).get(`/api/movies?${qs}`)).body.data.map((m) => m.title).sort();
    expect(await titles('genre=action')).toEqual(['Alpha Strike', 'Gamma Ray']);
    expect(await titles('language=HINDI')).toEqual(['Beta Love']);
    expect(await titles('status=UPCOMING')).toEqual(['Beta Love']);
    expect(await titles('genre=Action&status=ENDED')).toEqual(['Gamma Ray']);
  });

  it('searches by title and paginates', async () => {
    const search = await request(app).get('/api/movies?q=beta');
    expect(search.body.data).toHaveLength(1);
    const page = await request(app).get('/api/movies?limit=2&page=2');
    expect(page.body.data).toHaveLength(1);
    expect(page.body.meta.totalPages).toBe(2);
  });

  it('treats regex characters and operators in input literally / rejects them safely', async () => {
    const res = await request(app).get('/api/movies?q=.*');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(0);
    // operator injection is stripped and then fails validation instead of reaching MongoDB
    const inj = await request(app).get('/api/movies?status[$ne]=x');
    expect(inj.status).toBe(400);
  });

  it('returns details, 404 for unknown id and 400 for malformed id', async () => {
    const movie = await createMovie();
    expect((await request(app).get(`/api/movies/${movie._id}`)).body.data.title).toBe(movie.title);
    expect((await request(app).get('/api/movies/64b64c4f9a1d4c1f8c8e0000')).status).toBe(404);
    expect((await request(app).get('/api/movies/not-an-id')).status).toBe(400);
  });
});

describe('movie administration', () => {
  it('requires authentication and ADMIN role to write', async () => {
    const { token } = await createUser();
    expect((await request(app).post('/api/movies').send(newMovie)).status).toBe(401);
    expect((await request(app).post('/api/movies').set(auth(token)).send(newMovie)).status).toBe(403);
  });

  it('lets an admin create, update and delete a movie', async () => {
    const { token } = await createAdmin();
    const created = await request(app).post('/api/movies').set(auth(token)).send(newMovie);
    expect(created.status).toBe(201);
    const id = created.body.data._id;

    const updated = await request(app).put(`/api/movies/${id}`).set(auth(token)).send({ duration: 160 });
    expect(updated.status).toBe(200);
    expect(updated.body.data.duration).toBe(160);

    expect((await request(app).delete(`/api/movies/${id}`).set(auth(token))).status).toBe(200);
    expect((await request(app).get(`/api/movies/${id}`)).status).toBe(404);
  });

  it('validates input', async () => {
    const { token } = await createAdmin();
    const res = await request(app).post('/api/movies').set(auth(token)).send({ title: 'x' });
    expect(res.status).toBe(400);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  it('refuses to delete a movie that has shows', async () => {
    const { token } = await createAdmin();
    const { movie } = await createBookableShow();
    const res = await request(app).delete(`/api/movies/${movie._id}`).set(auth(token));
    expect(res.status).toBe(409);
  });
});
