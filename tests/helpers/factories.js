const { User, Movie, Theatre } = require('../../src/models');
const { hashPassword } = require('../../src/utils/password');
const { signToken } = require('../../src/utils/jwt');
const screenService = require('../../src/services/screen.service');
const showService = require('../../src/services/show.service');

let counter = 0;
const next = () => { counter += 1; return counter; };

async function createUser(overrides = {}) {
  const password = overrides.password || 'Passw0rd123';
  const n = next();
  const user = await User.create({
    name: `Test User ${n}`,
    email: `user${n}_${Date.now()}@example.com`,
    role: 'USER',
    ...overrides,
    password: await hashPassword(password),
  });
  return { user, password, token: signToken(user) };
}

const createAdmin = (overrides = {}) => createUser({ role: 'ADMIN', ...overrides });

const auth = (token) => ({ Authorization: `Bearer ${token}` });

function futureDate(days = 1, hourUtc = 10) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  d.setUTCHours(hourUtc, 0, 0, 0);
  return d;
}

const createMovie = (overrides = {}) =>
  Movie.create({
    title: `Movie ${next()}`,
    genres: ['Action'],
    languages: ['English'],
    duration: 120,
    releaseDate: new Date('2025-01-01'),
    status: 'NOW_SHOWING',
    ...overrides,
  });

const createTheatre = (overrides = {}) =>
  Theatre.create({
    name: `Theatre ${next()}`,
    address: { line1: '1 Main Road', city: 'Bengaluru', state: 'Karnataka', pincode: '560001' },
    ...overrides,
  });

/** Theatre + screen with seats A1-A4 REGULAR and B1-B2 PREMIUM. */
async function createTheatreWithScreen() {
  const theatre = await createTheatre();
  const screen = await screenService.create({
    theatre: theatre._id,
    name: 'Screen 1',
    layout: [
      { row: 'A', count: 4, category: 'REGULAR' },
      { row: 'B', count: 2, category: 'PREMIUM' },
    ],
  });
  return { theatre, screen };
}

/** A bookable show: returns { movie, theatre, screen, show, seats } with seats keyed by label. */
async function createBookableShow(showOverrides = {}) {
  const { Seat } = require('../../src/models');
  const movie = await createMovie();
  const { theatre, screen } = await createTheatreWithScreen();
  const show = await showService.create({
    movie: movie._id,
    theatre: theatre._id,
    screen: screen._id,
    startTime: futureDate(2),
    prices: { REGULAR: 200, PREMIUM: 350 },
    ...showOverrides,
  });
  const seatDocs = await Seat.find({ screen: screen._id });
  const seats = {};
  seatDocs.forEach((s) => { seats[s.label] = s; });
  return { movie, theatre, screen, show, seats };
}

module.exports = { createUser, createAdmin, auth, futureDate, createMovie, createTheatre, createTheatreWithScreen, createBookableShow };
