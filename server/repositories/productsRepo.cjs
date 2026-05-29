const { query } = require('../database/pool.cjs');

function mapProduct(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    status: row.status,
    description: row.description,
    coreValue: row.core_value,
    targetCustomer: row.target_customer,
    uniqueAdvantage: row.unique_advantage,
    priceStrategy: row.price_strategy,
    successCases: row.success_cases || [],
    painPoints: row.pain_points || [],
    benefits: row.benefits || [],
    objectionResponses: row.objection_responses || {},
    collectionDimensions: row.collection_dimensions || [],
    signalRules: row.signal_rules || [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listProducts(organizationId, status) {
  const params = [organizationId];
  let where = 'organization_id = $1';
  if (status) {
    params.push(status);
    where += ` AND status = $${params.length}`;
  }
  const result = await query(`SELECT * FROM products WHERE ${where} ORDER BY created_at DESC`, params);
  return result.rows.map(mapProduct);
}

async function getProduct(organizationId, id) {
  const result = await query('SELECT * FROM products WHERE organization_id = $1 AND id = $2', [organizationId, id]);
  return mapProduct(result.rows[0]);
}

async function createProduct(organizationId, userId, data) {
  const result = await query(
    `INSERT INTO products (
      organization_id, name, category, status, description, core_value, target_customer,
      unique_advantage, price_strategy, success_cases, pain_points, benefits,
      objection_responses, collection_dimensions, signal_rules, created_by
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    RETURNING *`,
    [
      organizationId,
      data.name,
      data.category || '服务',
      data.status || 'active',
      data.description || '',
      data.coreValue || data.core_value || '',
      data.targetCustomer || data.target_customer || '',
      data.uniqueAdvantage || data.unique_advantage || '',
      data.priceStrategy || data.price_strategy || '',
      JSON.stringify(data.successCases || data.success_cases || []),
      JSON.stringify(data.painPoints || data.pain_points || []),
      JSON.stringify(data.benefits || []),
      JSON.stringify(data.objectionResponses || data.objection_responses || {}),
      JSON.stringify(data.collectionDimensions || data.collection_dimensions || []),
      JSON.stringify(data.signalRules || data.signal_rules || []),
      userId,
    ]
  );
  return mapProduct(result.rows[0]);
}

async function updateProduct(organizationId, id, data) {
  const existing = await getProduct(organizationId, id);
  if (!existing) return null;
  const merged = { ...existing, ...data };
  const result = await query(
    `UPDATE products SET
      name=$3, category=$4, status=$5, description=$6, core_value=$7, target_customer=$8,
      unique_advantage=$9, price_strategy=$10, success_cases=$11, pain_points=$12,
      benefits=$13, objection_responses=$14, collection_dimensions=$15, signal_rules=$16,
      updated_at=now()
     WHERE organization_id=$1 AND id=$2
     RETURNING *`,
    [
      organizationId,
      id,
      merged.name,
      merged.category,
      merged.status,
      merged.description,
      merged.coreValue,
      merged.targetCustomer,
      merged.uniqueAdvantage,
      merged.priceStrategy,
      JSON.stringify(merged.successCases || []),
      JSON.stringify(merged.painPoints || []),
      JSON.stringify(merged.benefits || []),
      JSON.stringify(merged.objectionResponses || {}),
      JSON.stringify(merged.collectionDimensions || []),
      JSON.stringify(merged.signalRules || []),
    ]
  );
  return mapProduct(result.rows[0]);
}

async function archiveProduct(organizationId, id) {
  await query('UPDATE products SET status = $3, updated_at = now() WHERE organization_id = $1 AND id = $2', [organizationId, id, 'archived']);
}

module.exports = { listProducts, getProduct, createProduct, updateProduct, archiveProduct, mapProduct };
