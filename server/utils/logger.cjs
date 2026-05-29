const pino = require('pino');
const { env } = require('../config/env.cjs');

const logger = pino({
  level: process.env.LOG_LEVEL || (env.isProduction ? 'info' : 'debug'),
  transport: env.isProduction ? undefined : {
    target: 'pino-pretty',
    options: { colorize: true, translateTime: 'SYS:standard' },
  },
});

module.exports = { logger };
