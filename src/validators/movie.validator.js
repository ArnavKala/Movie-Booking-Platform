const { Joi, paginationKeys } = require('./common.validator');
const { MOVIE_STATUSES, CERTIFICATES } = require('../utils/constants');

const url = Joi.string().trim().uri({ scheme: ['http', 'https'] });

const fields = {
  title: Joi.string().trim().max(200),
  description: Joi.string().trim().allow('').max(5000),
  genres: Joi.array().items(Joi.string().trim().max(50)).min(1).max(10),
  languages: Joi.array().items(Joi.string().trim().max(50)).min(1).max(10),
  duration: Joi.number().integer().min(1).max(600),
  releaseDate: Joi.date().iso(),
  status: Joi.string().valid(...MOVIE_STATUSES),
  certificate: Joi.string().valid(...CERTIFICATES),
  director: Joi.string().trim().max(100),
  cast: Joi.array().items(Joi.string().trim().max(100)).max(50),
  posterUrl: url,
  trailerUrl: url,
};

const createMovie = Joi.object(fields).fork(
  ['title', 'duration', 'releaseDate', 'genres', 'languages'],
  (schema) => schema.required()
);

const updateMovie = Joi.object(fields).min(1);

const movieQuery = Joi.object({
  q: Joi.string().trim().max(100),
  genre: Joi.string().trim().max(50),
  language: Joi.string().trim().max(50),
  status: Joi.string().valid(...MOVIE_STATUSES),
  sortBy: Joi.string().valid('releaseDate', 'title', 'createdAt', 'duration').default('releaseDate'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
  ...paginationKeys(),
});

module.exports = { createMovie, updateMovie, movieQuery };
