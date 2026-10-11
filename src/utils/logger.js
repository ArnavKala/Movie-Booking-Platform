const silent = process.env.NODE_ENV === 'test';

const format = (level, args) => [`[${new Date().toISOString()}] ${level}`, ...args];

module.exports = {
  info: (...args) => { if (!silent) console.log(...format('INFO ', args)); },
  warn: (...args) => { if (!silent) console.warn(...format('WARN ', args)); },
  error: (...args) => { if (!silent) console.error(...format('ERROR', args)); },
};
