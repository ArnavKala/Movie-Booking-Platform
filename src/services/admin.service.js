const { User, Movie, Theatre, Screen, Show, Booking } = require('../models');

async function getStats() {
  const [users, movies, theatres, screens, shows, confirmed, cancelled, revenue] = await Promise.all([
    User.countDocuments(),
    Movie.countDocuments(),
    Theatre.countDocuments(),
    Screen.countDocuments(),
    Show.countDocuments({ status: 'SCHEDULED' }),
    Booking.countDocuments({ status: 'CONFIRMED' }),
    Booking.countDocuments({ status: 'CANCELLED' }),
    Booking.aggregate([{ $match: { status: 'CONFIRMED' } }, { $group: { _id: null, total: { $sum: '$totalAmount' } } }]),
  ]);
  return {
    users,
    movies,
    theatres,
    screens,
    scheduledShows: shows,
    bookings: { confirmed, cancelled },
    revenue: revenue.length ? revenue[0].total : 0,
  };
}

module.exports = { getStats };
