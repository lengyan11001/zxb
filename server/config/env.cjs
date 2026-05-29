const path = require('path');
const dotenv = require('dotenv');

dotenv.config({ path: path.join(__dirname, '..', '..', '.env') });

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number(raw);
  return Number.isFinite(n) ? n : fallback;
}

function required(name, fallback) {
  const value = process.env[name] || fallback;
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: numberFromEnv('PORT', 3001),
  apiPrefix: process.env.API_PREFIX || '/zxbaip',
  publicWebOrigin: process.env.PUBLIC_WEB_ORIGIN || 'http://localhost:5173',
  databaseUrl: required('DATABASE_URL', 'postgres://zxb_app:zxb_app@localhost:5432/zxb_intel'),
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379/0',
  jwtSecret: required('JWT_SECRET', 'dev-only-change-me'),
  adminEmail: process.env.ADMIN_EMAIL || 'admin',
  adminPassword: process.env.ADMIN_PASSWORD || 'admin2026',
  deepseekApiKey: process.env.DEEPSEEK_API_KEY || '',
  deepseekApiUrl: process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/chat/completions',
  deepseekModel: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
  maxUploadEnterprises: numberFromEnv('MAX_UPLOAD_ENTERPRISES', 500),
  collectQueueConcurrency: numberFromEnv('COLLECT_QUEUE_CONCURRENCY', 5),
  scriptQueueConcurrency: numberFromEnv('SCRIPT_QUEUE_CONCURRENCY', 3),
  rateLimitWindowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 60_000),
  rateLimitMax: numberFromEnv('RATE_LIMIT_MAX', 300),
};

module.exports = { env };
