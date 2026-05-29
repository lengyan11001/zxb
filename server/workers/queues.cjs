const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const { env } = require('../config/env.cjs');

const connection = new IORedis(env.redisUrl, {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
});

const collectQueue = new Queue('enterprise-collect', { connection });
const scriptQueue = new Queue('script-generate', { connection });

module.exports = { connection, collectQueue, scriptQueue };
