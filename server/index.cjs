const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const pinoHttp = require('pino-http');
const path = require('path');
const { env } = require('./config/env.cjs');
const { logger } = require('./utils/logger.cjs');
const { migrate } = require('./database/migrate.cjs');
const { seed } = require('./database/seed.cjs');
const routes = require('./routes/index.cjs');

async function main() {
  await migrate();
  if (process.env.SEED_ON_START !== 'false') await seed();

  const app = express();
  app.set('trust proxy', 1);

  app.use(pinoHttp({ logger }));
  app.use(helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(cookieParser());
  app.use(cors({
    origin(origin, callback) {
      const allowed = new Set([
        env.publicWebOrigin,
        'http://localhost:5173',
        'http://localhost:3001',
      ]);
      if (!origin || allowed.has(origin)) return callback(null, true);
      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
  }));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(rateLimit({
    windowMs: env.rateLimitWindowMs,
    limit: env.rateLimitMax,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use(env.apiPrefix, routes);

  const distDir = path.join(__dirname, '..', 'dist');
  app.use(express.static(distDir, { maxAge: env.isProduction ? '1h' : 0 }));
  app.use((req, res, next) => {
    if (req.path.startsWith(env.apiPrefix)) return next();
    return res.sendFile(path.join(distDir, 'index.html'));
  });

  app.use((err, req, res, next) => {
    req.log?.error({ err }, 'Request failed');
    const status = err.status || 500;
    res.status(status).json({
      error: env.isProduction && status >= 500 ? '服务器内部错误' : err.message,
    });
  });

  app.listen(env.port, '0.0.0.0', () => {
    logger.info({
      port: env.port,
      apiPrefix: env.apiPrefix,
      webOrigin: env.publicWebOrigin,
    }, 'Enterprise Intelligence API started');
  });
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
