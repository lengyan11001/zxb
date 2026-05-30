const { query } = require('../database/pool.cjs');

function mapScript(row) {
  if (!row) return null;
  return {
    id: row.id,
    enterpriseId: row.enterprise_id,
    productId: row.product_id,
    status: row.status,
    full: row.full_script,
    concise: row.concise_script,
    opening: row.opening,
    hookPoints: row.hook_points || [],
    keyClues: row.key_clues || [],
    objectionPrep: row.objection_prep || [],
    structureRatio: row.structure_ratio || {},
    provider: row.provider,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function createQueuedScript(organizationId, userId, enterpriseId, productId) {
  const result = await query(
    `INSERT INTO scripts (organization_id, created_by, enterprise_id, product_id, status)
     VALUES ($1,$2,$3,$4,'queued') RETURNING *`,
    [organizationId, userId, enterpriseId, productId]
  );
  return mapScript(result.rows[0]);
}

async function markGenerating(id) {
  await query(`UPDATE scripts SET status='generating', updated_at=now() WHERE id=$1`, [id]);
}

async function completeScript(id, data) {
  const result = await query(
    `UPDATE scripts SET
      status='completed',
      full_script=$2,
      concise_script=$3,
      opening=$4,
      hook_points=$5,
      key_clues=$6,
      objection_prep=$7,
      structure_ratio=$8,
      provider=$9,
      error_message=$10,
      updated_at=now()
     WHERE id=$1 RETURNING *`,
    [
      id,
      data.full || '',
      data.concise || '',
      data.opening || '',
      JSON.stringify(data.hookPoints || []),
      JSON.stringify(data.keyClues || []),
      JSON.stringify(data.objectionPrep || []),
      JSON.stringify(data.structureRatio || {}),
      data.provider || 'local',
      data.error || null,
    ]
  );
  return mapScript(result.rows[0]);
}

async function failScript(id, error) {
  await query(`UPDATE scripts SET status='failed', error_message=$2, updated_at=now() WHERE id=$1`, [id, error]);
}

async function getLatestScript(organizationId, enterpriseId, productId) {
  const params = [organizationId, enterpriseId];
  let where = 'organization_id = $1 AND enterprise_id = $2 AND status = \'completed\'';
  if (productId) {
    params.push(productId);
    where += ` AND product_id = $${params.length}`;
  }
  const result = await query(`SELECT * FROM scripts WHERE ${where} ORDER BY created_at DESC LIMIT 1`, params);
  return mapScript(result.rows[0]);
}

async function getScript(organizationId, enterpriseId, scriptId) {
  const result = await query(
    `SELECT * FROM scripts
     WHERE organization_id = $1 AND enterprise_id = $2 AND id = $3`,
    [organizationId, enterpriseId, scriptId]
  );
  return mapScript(result.rows[0]);
}

module.exports = { createQueuedScript, markGenerating, completeScript, failScript, getLatestScript, getScript, mapScript };
