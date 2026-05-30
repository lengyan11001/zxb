const express = require('express');
const { query } = require('../database/pool.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { requireRole } = require('../middleware/auth.cjs');
const { audit } = require('../middleware/audit.cjs');

const router = express.Router();

router.get('/data-sources', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT key, name, description, status, config, updated_at
     FROM data_sources WHERE organization_id = $1 ORDER BY key`,
    [req.organizationId]
  );
  res.json(result.rows.map((row) => ({
    key: row.key,
    name: row.name,
    description: row.description,
    status: row.status,
    config: row.config,
    updatedAt: row.updated_at,
  })));
}));

router.put('/data-sources/:key', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const { status, config } = req.body;
  await query(
    `UPDATE data_sources SET status = COALESCE($3, status), config = COALESCE($4, config), updated_at = now()
     WHERE organization_id = $1 AND key = $2`,
    [req.organizationId, req.params.key, status || null, config ? JSON.stringify(config) : null]
  );
  await audit(req, 'update', 'data_source', null, { key: req.params.key });
  res.json({ success: true });
}));

module.exports = router;
