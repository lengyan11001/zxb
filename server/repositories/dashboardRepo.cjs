const { query } = require('../database/pool.cjs');

async function getDashboard(organizationId, userId, role) {
  const ownerFilter = role === 'sdr' ? 'AND owner_id = $2' : '';
  const ownerParams = role === 'sdr' ? [organizationId, userId] : [organizationId];

  const enterprises = await query(
    `SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE collection_status = 'completed')::int AS completed,
      COUNT(*) FILTER (WHERE collection_status IN ('pending','queued','collecting'))::int AS pending
     FROM enterprises
     WHERE organization_id = $1 ${ownerFilter}`,
    ownerParams
  );

  const calls = await query(
    `SELECT
      COUNT(*)::int AS total_calls,
      COUNT(*) FILTER (WHERE result = '已接通')::int AS connected,
      COUNT(*) FILTER (WHERE result = '有效通话')::int AS effective,
      COUNT(*) FILTER (WHERE result = '加微信')::int AS wechat,
      COUNT(*) FILTER (WHERE result = '约见')::int AS meetings
     FROM call_records
     WHERE organization_id = $1
       ${role === 'sdr' ? 'AND user_id = $2' : ''}
       AND called_at >= date_trunc('day', now())`,
    role === 'sdr' ? [organizationId, userId] : [organizationId]
  );

  const scripts = await query(
    `SELECT COUNT(*)::int AS total_scripts
     FROM scripts
     WHERE organization_id = $1 AND status = 'completed'`,
    [organizationId]
  );

  const recent = await query(
    `SELECT e.id, e.name, e.industry, e.phone, cr.result, cr.notes, cr.called_at
     FROM call_records cr
     JOIN enterprises e ON e.id = cr.enterprise_id
     WHERE cr.organization_id = $1 ${role === 'sdr' ? 'AND cr.user_id = $2' : ''}
     ORDER BY cr.called_at DESC
     LIMIT 10`,
    role === 'sdr' ? [organizationId, userId] : [organizationId]
  );

  return {
    enterprises: enterprises.rows[0],
    calls: calls.rows[0],
    scripts: scripts.rows[0].total_scripts,
    recentFollowups: recent.rows,
  };
}

module.exports = { getDashboard };
