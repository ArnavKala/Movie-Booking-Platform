const request = require('supertest');
const app = require('../src/app');
const db = require('./helpers/db');
const { createUser, createAdmin, auth } = require('./helpers/factories');
const { User } = require('../src/models');
const { signToken } = require('../src/utils/jwt');

beforeAll(db.connect);
afterAll(db.disconnect);
afterEach(db.clear);

describe('GET /api/health', () => {
  it('reports service and database state', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: 'ok', database: 'connected' });
  });
});

describe('registration', () => {
  const payload = { name: 'Asha Rao', email: 'Asha@Example.com', password: 'Passw0rd123' };

  it('registers a USER, hashes the password and never returns it', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...payload, role: 'ADMIN' });
    expect(res.status).toBe(201);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user).toMatchObject({ email: 'asha@example.com', role: 'USER' });
    expect(res.body.data.user.password).toBeUndefined();
    const stored = await User.findOne({ email: 'asha@example.com' }).select('+password');
    expect(stored.password).not.toBe(payload.password);
    expect(stored.password.startsWith('$2')).toBe(true);
  });

  it('rejects duplicate emails with 409', async () => {
    await request(app).post('/api/auth/register').send(payload);
    const res = await request(app).post('/api/auth/register').send(payload);
    expect(res.status).toBe(409);
  });

  it('rejects invalid input with 400 and field errors', async () => {
    const res = await request(app).post('/api/auth/register').send({ name: 'A', email: 'nope', password: 'short' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.errors.map((e) => e.field)).toEqual(expect.arrayContaining(['name', 'email', 'password']));
  });
});

describe('login', () => {
  it('logs in with correct credentials', async () => {
    const { user, password } = await createUser();
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password });
    expect(res.status).toBe(200);
    expect(res.body.data.token).toBeTruthy();
    expect(res.body.data.user.password).toBeUndefined();
  });

  it('rejects wrong password and unknown email identically with 401', async () => {
    const { user } = await createUser();
    const wrong = await request(app).post('/api/auth/login').send({ email: user.email, password: 'WrongPass1' });
    const unknown = await request(app).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'WrongPass1' });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(wrong.body.message).toBe(unknown.body.message);
  });

  it('blocks deactivated accounts', async () => {
    const { user, password } = await createUser({ isActive: false });
    const res = await request(app).post('/api/auth/login').send({ email: user.email, password });
    expect(res.status).toBe(403);
  });
});

describe('authentication & authorization', () => {
  it('GET /api/auth/me returns the current user', async () => {
    const { user, token } = await createUser();
    const res = await request(app).get('/api/auth/me').set(auth(token));
    expect(res.status).toBe(200);
    expect(res.body.data.email).toBe(user.email);
  });

  it('rejects missing, malformed and tampered tokens with 401', async () => {
    expect((await request(app).get('/api/auth/me')).status).toBe(401);
    expect((await request(app).get('/api/auth/me').set('Authorization', 'Bearer garbage')).status).toBe(401);
    const { token } = await createUser();
    expect((await request(app).get('/api/auth/me').set(auth(`${token}x`))).status).toBe(401);
  });

  it('rejects tokens of users that no longer exist or were deactivated', async () => {
    const { user, token } = await createUser();
    await User.updateOne({ _id: user._id }, { isActive: false });
    expect((await request(app).get('/api/auth/me').set(auth(token))).status).toBe(401);
    await User.deleteOne({ _id: user._id });
    expect((await request(app).get('/api/auth/me').set(auth(signToken(user)))).status).toBe(401);
  });

  it('forbids USER on admin routes (403) and allows ADMIN (200)', async () => {
    const { token: userToken } = await createUser();
    const { token: adminToken } = await createAdmin();
    expect((await request(app).get('/api/admin/stats').set(auth(userToken))).status).toBe(403);
    expect((await request(app).get('/api/admin/users').set(auth(userToken))).status).toBe(403);
    expect((await request(app).get('/api/admin/stats')).status).toBe(401);
    const res = await request(app).get('/api/admin/stats').set(auth(adminToken));
    expect(res.status).toBe(200);
    expect(res.body.data.users).toBe(2);
  });

  it('lets users update their profile and change password', async () => {
    const { token, password } = await createUser();
    const upd = await request(app).put('/api/users/me').set(auth(token)).send({ name: 'New Name', role: 'ADMIN' });
    expect(upd.status).toBe(200);
    expect(upd.body.data.name).toBe('New Name');
    expect(upd.body.data.role).toBe('USER');
    const bad = await request(app).put('/api/users/me/password').set(auth(token)).send({ currentPassword: 'nope12345', newPassword: 'Another123' });
    expect(bad.status).toBe(400);
    const good = await request(app).put('/api/users/me/password').set(auth(token)).send({ currentPassword: password, newPassword: 'Another123' });
    expect(good.status).toBe(200);
  });

  it('prevents an admin from demoting or deleting themselves', async () => {
    const { user, token } = await createAdmin();
    const demote = await request(app).patch(`/api/admin/users/${user._id}`).set(auth(token)).send({ role: 'USER' });
    expect(demote.status).toBe(400);
    const del = await request(app).delete(`/api/admin/users/${user._id}`).set(auth(token));
    expect(del.status).toBe(400);
  });
});
