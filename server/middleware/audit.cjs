const { query } = require('../database/pool.cjs');
const { logger } = require('../utils/logger.cjs');

async function audit(req, action, entityType, entityId, metadata = {}) {
  try {
    await query(
      `INSERT INTO audit_logs (organization_id, user_id, action, entity_type, entity_id, ip, user_agent, metadata)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        req.organizationId || null,
        req.user?.id || null,
        action,
        entityType,
        entityId || null,
        req.ip,
        req.headers['user-agent'] || '',
        metadata,
      ]
    );
  } catch (err) {
    logger.warn({ err, action, entityType }, 'Failed to write audit log');
  }
}

module.exports = { audit };
