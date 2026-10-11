const { Show, Movie, Theatre, Screen, Booking, Payment } = require('../models');
const ApiError = require('../utils/ApiError');
const { withTransaction } = require('../utils/transaction');
const { exactInsensitive, parsePagination, paginationMeta } = require('../utils/query');

const POPULATE = [
  { path: 'movie', select: 'title posterUrl duration languages genres certificate status' },
  { path: 'theatre', select: 'name address.city address.line1' },
  { path: 'screen', select: 'name screenType totalSeats' },
];

const round2 = (n) => Math.round(n * 100) / 100;

/** PREMIUM / RECLINER default to 1.5x / 2x the REGULAR price when not provided. */
const normalizePrices = (p, current = {}) => {
  const REGULAR = p.REGULAR ?? current.REGULAR;
  return {
    REGULAR,
    PREMIUM: p.PREMIUM ?? current.PREMIUM ?? round2(REGULAR * 1.5),
    RECLINER: p.RECLINER ?? current.RECLINER ?? round2(REGULAR * 2),
  };
};

/** Start (inclusive) and end (exclusive) of a calendar day. tzOffset = minutes ahead of UTC (IST = 330). */
function dayRange(date, tzOffset = 0) {
  const [y, m, d] = date.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  if (utc.getUTCFullYear() !== y || utc.getUTCMonth() !== m - 1 || utc.getUTCDate() !== d) {
    throw ApiError.badRequest('date is not a valid calendar date');
  }
  const start = new Date(utc.getTime() - tzOffset * 60000);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60000) };
}

/**
 * Validates movie/theatre/screen/time and returns the resolved documents plus the computed endTime.
 * Ensures the screen belongs to the theatre and has no overlapping scheduled show.
 */
async function resolveSchedule(input, { excludeId, checkPast = true, checkMovieStatus = true } = {}) {
  const [movie, theatre, screen] = await Promise.all([
    Movie.findById(input.movie),
    Theatre.findById(input.theatre),
    Screen.findById(input.screen),
  ]);
  if (!movie) throw ApiError.notFound('Movie not found');
  if (!theatre) throw ApiError.notFound('Theatre not found');
  if (!screen) throw ApiError.notFound('Screen not found');

  if (checkMovieStatus && movie.status === 'ENDED') {
    throw ApiError.badRequest('Cannot schedule shows for a movie that has ended');
  }
  if (!theatre.isActive) throw ApiError.badRequest('Theatre is not active');
  if (String(screen.theatre) !== String(theatre._id)) {
    throw ApiError.badRequest('Screen does not belong to the given theatre');
  }
  if (!screen.isActive) throw ApiError.badRequest('Screen is not active');
  if (!screen.totalSeats) throw ApiError.badRequest('Screen has no seats configured');

  const startTime = new Date(input.startTime);
  if (checkPast && startTime <= new Date()) throw ApiError.badRequest('Show start time must be in the future');
  const endTime = new Date(startTime.getTime() + movie.duration * 60000);

  const overlap = { screen: screen._id, status: 'SCHEDULED', startTime: { $lt: endTime }, endTime: { $gt: startTime } };
  if (excludeId) overlap._id = { $ne: excludeId };
  if (await Show.exists(overlap)) {
    throw ApiError.conflict('Another show is already scheduled on this screen during that time');
  }
  return { movie, theatre, screen, startTime, endTime };
}

function assertLanguage(movie, language) {
  if (language && !movie.languages.some((l) => l.toLowerCase() === language.toLowerCase())) {
    throw ApiError.badRequest(`Language "${language}" is not available for this movie`);
  }
}

async function list(query) {
  const { movie, theatre, screen, city, date, tzOffset = 0, from, to, status = 'SCHEDULED', language, format, upcoming } = query;
  const { page, limit, skip } = parsePagination(query);

  const filter = { status };
  if (movie) filter.movie = movie;
  if (screen) filter.screen = screen;
  if (language) filter.language = exactInsensitive(language);
  if (format) filter.format = format;

  if (city) {
    const ids = await Theatre.distinct('_id', { 'address.city': exactInsensitive(city) });
    filter.theatre = theatre ? { $in: ids.filter((id) => String(id) === theatre) } : { $in: ids };
  } else if (theatre) {
    filter.theatre = theatre;
  }

  const range = {};
  if (date) {
    const { start, end } = dayRange(date, tzOffset);
    range.$gte = start;
    range.$lt = end;
  } else {
    if (from) range.$gte = new Date(from);
    if (to) range.$lte = new Date(to);
  }
  if (upcoming) {
    const now = new Date();
    if (!range.$gte || range.$gte < now) range.$gte = now;
  }
  if (Object.keys(range).length) filter.startTime = range;

  const [items, total] = await Promise.all([
    Show.find(filter).sort({ startTime: 1, _id: 1 }).skip(skip).limit(limit).populate(POPULATE).lean(),
    Show.countDocuments(filter),
  ]);
  return { items, meta: paginationMeta(total, page, limit) };
}

async function getById(id) {
  const show = await Show.findById(id).populate(POPULATE).lean();
  if (!show) throw ApiError.notFound('Show not found');
  return show;
}

async function create(data) {
  const { movie, theatre, screen, startTime, endTime } = await resolveSchedule(data);
  assertLanguage(movie, data.language);

  const show = await Show.create({
    movie: movie._id,
    theatre: theatre._id,
    screen: screen._id,
    startTime,
    endTime,
    prices: normalizePrices(data.prices),
    language: data.language || movie.languages[0],
    format: data.format,
  });
  return getById(show._id);
}

async function update(id, data) {
  const show = await Show.findById(id);
  if (!show) throw ApiError.notFound('Show not found');
  if (show.status === 'CANCELLED') throw ApiError.conflict('Cancelled shows cannot be modified');

  const changes = {};
  const scheduleChanged = ['movie', 'theatre', 'screen', 'startTime'].some((k) => data[k] !== undefined);

  if (scheduleChanged && (await Booking.exists({ show: id, status: 'CONFIRMED' }))) {
    throw ApiError.conflict('Movie, theatre, screen and start time cannot change once a show has confirmed bookings');
  }

  let movieDoc;
  if (scheduleChanged) {
    const resolved = await resolveSchedule(
      {
        movie: data.movie ?? show.movie,
        theatre: data.theatre ?? show.theatre,
        screen: data.screen ?? show.screen,
        startTime: data.startTime ?? show.startTime,
      },
      { excludeId: show._id, checkPast: data.startTime !== undefined, checkMovieStatus: data.movie !== undefined }
    );
    movieDoc = resolved.movie;
    Object.assign(changes, {
      movie: resolved.movie._id,
      theatre: resolved.theatre._id,
      screen: resolved.screen._id,
      startTime: resolved.startTime,
      endTime: resolved.endTime,
    });
  } else if (data.language !== undefined) {
    movieDoc = await Movie.findById(show.movie);
  }
  if (data.language !== undefined) {
    assertLanguage(movieDoc, data.language);
    changes.language = data.language;
  }
  if (data.format !== undefined) changes.format = data.format;
  if (data.prices) changes.prices = normalizePrices(data.prices, show.toObject().prices);

  if (data.status === 'CANCELLED') {
    // Cancel the show and every confirmed booking on it atomically.
    await withTransaction(async (session) => {
      await Show.updateOne({ _id: id }, { $set: { ...changes, status: 'CANCELLED' } }, { session });
      await Booking.updateMany(
        { show: id, status: 'CONFIRMED' },
        { $set: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Show cancelled by theatre' } },
        { session }
      );
      await Booking.updateMany({ show: id, status: 'CANCELLED', paymentStatus: 'PAID' }, { $set: { paymentStatus: 'REFUND_PENDING' } }, { session });
      await Payment.updateMany({ show: id, state: 'PAID' }, { $set: { state: 'REFUND_PENDING', holding: false } }, { session });
      await Payment.updateMany({ show: id, holding: true }, { $set: { state: 'EXPIRED', holding: false } }, { session });
    });
  } else if (Object.keys(changes).length) {
    await withTransaction(async session => {
      const current = await Show.findOneAndUpdate({ _id: id, status: 'SCHEDULED' }, { $inc: { bookingVersion: 1 } }, { new: true, session });
      if (!current) throw ApiError.conflict('Show is no longer scheduled');
      if (scheduleChanged && await Payment.exists({ show: id }).session(session)) throw ApiError.conflict('A show with payment attempts cannot be rescheduled; cancel it and create a new show');
      await Show.updateOne({ _id: id }, { $set: changes }, { runValidators: true, session });
    });
  }
  return getById(id);
}

async function remove(id) {
  await withTransaction(async session => {
    const show = await Show.findOneAndUpdate({ _id: id }, { $inc: { bookingVersion: 1 } }, { session });
    if (!show) throw ApiError.notFound('Show not found');
    if (await Booking.exists({ show: id }).session(session) || await Payment.exists({ show: id }).session(session)) {
      throw ApiError.conflict('Show has bookings or payments and cannot be deleted; cancel it instead');
    }
    await Show.deleteOne({ _id: id }, { session });
  });
}

module.exports = { list, getById, create, update, remove, dayRange };
