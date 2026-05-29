const fs = require('fs');
const path = require('path');
const { pool, withTransaction } = require('./pool.cjs');
const { logger } = require('../utils/logger.cjs');

const migrationsDir = path.join(__dirname, 'migrations');

async function ensureMigrationTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function migrate() {
  const files = fs.readdirSync(migrationsDir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  await withTransaction(async (client) => {
    await ensureMigrationTable(client);
    const applied = await client.query('SELECT id FROM schema_migrations');
    const appliedIds = new Set(applied.rows.map((row) => row.id));

    for (const file of files) {
      if (appliedIds.has(file)) continue;
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
      logger.info({ migration: file }, 'Applying migration');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
    }
  });
}

if (require.main === module) {
  migrate()
    .then(async () => {
      logger.info('Database migrations complete');
      await pool.end();
    })
    .catch(async (err) => {
      logger.error({ err }, 'Database migration failed');
      await pool.end();
      process.exit(1);
    });
}

module.exports = { migrate };
