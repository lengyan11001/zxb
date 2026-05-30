const { query, withTransaction } = require('../database/pool.cjs');

function mapEnterprise(row) {
  if (!row) return null;
  return {
    id: row.id,
    batchId: row.batch_id,
    ownerId: row.owner_id,
    activeProductId: row.active_product_id,
    name: row.name,
    unifiedCreditCode: row.unified_credit_code,
    industry: row.industry,
    scale: row.scale,
    location: row.location,
    contactPerson: row.contact_person,
    phone: row.phone,
    phoneStatus: row.phone_status,
    collectionStatus: row.collection_status,
    collectionProgress: row.collection_progress,
    signals: row.signals || [],
    profile: row.profile || {},
    timeline: row.timeline || [],
    notes: row.notes,
    latestCallResult: row.latest_call_result || '未拨打',
    callCount: Number(row.call_count || 0),
    aiScript: row.ai_script || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listEnterprises(organizationId, filters = {}) {
  const params = [organizationId];
  const where = ['e.organization_id = $1'];

  if (filters.search) {
    params.push(`%${filters.search}%`);
    where.push(`(e.name ILIKE $${params.length} OR e.contact_person ILIKE $${params.length} OR e.phone ILIKE $${params.length})`);
  }
  if (filters.industry) {
    params.push(filters.industry);
    where.push(`e.industry = $${params.length}`);
  }
  if (filters.status) {
    params.push(filters.status);
    where.push(`e.collection_status = $${params.length}`);
  }
  if (filters.ownerId) {
    params.push(filters.ownerId);
    where.push(`e.owner_id = $${params.length}`);
  }

  const result = await query(
    `SELECT e.*,
      latest.result AS latest_call_result,
      latest_script.ai_script AS ai_script,
      counts.call_count
     FROM enterprises e
     LEFT JOIN LATERAL (
       SELECT cr.result FROM call_records cr
       WHERE cr.enterprise_id = e.id
       ORDER BY cr.called_at DESC
       LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT s.full_script AS ai_script FROM scripts s
       WHERE s.enterprise_id = e.id AND s.status = 'completed'
       ORDER BY s.created_at DESC
       LIMIT 1
     ) latest_script ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS call_count FROM call_records cr
       WHERE cr.enterprise_id = e.id
     ) counts ON true
     WHERE ${where.join(' AND ')}
     ORDER BY e.created_at DESC
     LIMIT 1000`,
    params
  );

  return result.rows.map(mapEnterprise);
}

async function getEnterprise(organizationId, id, filters = {}) {
  const params = [organizationId, id];
  const where = ['e.organization_id = $1', 'e.id = $2'];
  if (filters.ownerId) {
    params.push(filters.ownerId);
    where.push(`e.owner_id = $${params.length}`);
  }
  const result = await query(
    `SELECT e.*,
      latest.result AS latest_call_result,
      latest_script.full_script AS ai_script,
      counts.call_count
     FROM enterprises e
     LEFT JOIN LATERAL (
       SELECT cr.result FROM call_records cr
       WHERE cr.enterprise_id = e.id
       ORDER BY cr.called_at DESC
       LIMIT 1
     ) latest ON true
     LEFT JOIN LATERAL (
       SELECT s.full_script FROM scripts s
       WHERE s.enterprise_id = e.id AND s.status = 'completed'
       ORDER BY s.created_at DESC
       LIMIT 1
     ) latest_script ON true
     LEFT JOIN LATERAL (
       SELECT COUNT(*)::int AS call_count FROM call_records cr
       WHERE cr.enterprise_id = e.id
     ) counts ON true
     WHERE ${where.join(' AND ')}`,
    params
  );
  return mapEnterprise(result.rows[0]);
}

async function createBatch(organizationId, userId, filename, source, names) {
  return withTransaction(async (client) => {
    const batch = await client.query(
      `INSERT INTO upload_batches (organization_id, uploaded_by, filename, source, total_count, status)
       VALUES ($1,$2,$3,$4,$5,'queued') RETURNING *`,
      [organizationId, userId, filename || null, source || 'manual', names.length]
    );

    const enterprises = [];
    for (const name of names) {
      const trimmed = String(name || '').trim();
      if (!trimmed) continue;
      const result = await client.query(
        `INSERT INTO enterprises (organization_id, batch_id, owner_id, name, collection_status, collection_progress)
         VALUES ($1,$2,$3,$4,'queued',0)
         ON CONFLICT (organization_id, name)
         DO UPDATE SET batch_id = EXCLUDED.batch_id, updated_at = now()
         RETURNING *`,
        [organizationId, batch.rows[0].id, userId, trimmed]
      );
      enterprises.push(mapEnterprise(result.rows[0]));
    }

    return { batch: batch.rows[0], enterprises };
  });
}

async function createEnterprise(organizationId, userId, data) {
  const result = await query(
    `INSERT INTO enterprises (
      organization_id, owner_id, active_product_id, name, industry, scale, location,
      contact_person, phone, phone_status, collection_status, collection_progress,
      signals, profile, timeline, notes
    )
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
    ON CONFLICT (organization_id, name)
    DO UPDATE SET updated_at = now()
    RETURNING *`,
    [
      organizationId,
      userId,
      data.activeProductId || data.active_product_id || null,
      data.name,
      data.industry || '',
      data.scale || '',
      data.location || '',
      data.contactPerson || data.contact_person || '',
      data.phone || '',
      data.phoneStatus || data.phone_status || 'pending',
      data.collectionStatus || data.collection_status || 'pending',
      data.collectionProgress || data.collection_progress || 0,
      JSON.stringify(data.signals || []),
      JSON.stringify(data.profile || {}),
      JSON.stringify(data.timeline || []),
      data.notes || '',
    ]
  );
  return mapEnterprise(result.rows[0]);
}

async function createImportedBatch(organizationId, userId, filename, source, records) {
  return withTransaction(async (client) => {
    const batch = await client.query(
      `INSERT INTO upload_batches (organization_id, uploaded_by, filename, source, total_count, status)
       VALUES ($1,$2,$3,$4,$5,'completed') RETURNING *`,
      [organizationId, userId, filename || null, source || 'file', records.length]
    );

    let inserted = 0;
    let updated = 0;
    const enterprises = [];
    for (const record of records) {
      const name = String(record.name || '').trim();
      if (!name) continue;
      const result = await client.query(
        `INSERT INTO enterprises (
          organization_id, batch_id, owner_id, name, unified_credit_code, industry, scale, location,
          contact_person, phone, phone_status, collection_status, collection_progress,
          signals, profile, timeline, notes
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (organization_id, name)
        DO UPDATE SET
          batch_id = EXCLUDED.batch_id,
          unified_credit_code = COALESCE(NULLIF(EXCLUDED.unified_credit_code, ''), enterprises.unified_credit_code),
          industry = COALESCE(NULLIF(EXCLUDED.industry, ''), enterprises.industry),
          scale = COALESCE(NULLIF(EXCLUDED.scale, ''), enterprises.scale),
          location = COALESCE(NULLIF(EXCLUDED.location, ''), enterprises.location),
          contact_person = COALESCE(NULLIF(EXCLUDED.contact_person, ''), enterprises.contact_person),
          phone = COALESCE(NULLIF(EXCLUDED.phone, ''), enterprises.phone),
          phone_status = EXCLUDED.phone_status,
          collection_status = EXCLUDED.collection_status,
          collection_progress = EXCLUDED.collection_progress,
          signals = EXCLUDED.signals,
          profile = EXCLUDED.profile,
          timeline = EXCLUDED.timeline,
          notes = COALESCE(NULLIF(EXCLUDED.notes, ''), enterprises.notes),
          updated_at = now()
        RETURNING *, (xmax = 0) AS inserted`,
        [
          organizationId,
          batch.rows[0].id,
          userId,
          name,
          record.unifiedCreditCode || '',
          record.industry || '',
          record.scale || '',
          record.location || '',
          record.contactPerson || '',
          record.phone || '',
          record.phoneStatus || 'pending',
          record.collectionStatus || 'completed',
          record.collectionProgress || 100,
          JSON.stringify(record.signals || []),
          JSON.stringify(record.profile || {}),
          JSON.stringify(record.timeline || []),
          record.notes || '',
        ]
      );
      const row = result.rows[0];
      if (row.inserted) inserted += 1;
      else updated += 1;
      enterprises.push(mapEnterprise(row));
    }

    return { batch: batch.rows[0], enterprises, summary: { inserted, updated, total: enterprises.length } };
  });
}

async function updateEnterprise(organizationId, id, data) {
  const fields = [];
  const params = [organizationId, id];
  const allowed = {
    activeProductId: 'active_product_id',
    industry: 'industry',
    scale: 'scale',
    location: 'location',
    contactPerson: 'contact_person',
    phone: 'phone',
    phoneStatus: 'phone_status',
    collectionStatus: 'collection_status',
    collectionProgress: 'collection_progress',
    signals: 'signals',
    profile: 'profile',
    timeline: 'timeline',
    notes: 'notes',
  };

  for (const [key, column] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      let value = data[key];
      if (['signals', 'profile', 'timeline'].includes(key)) value = JSON.stringify(value || (key === 'profile' ? {} : []));
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    }
  }

  if (!fields.length) return getEnterprise(organizationId, id);
  const result = await query(
    `UPDATE enterprises SET ${fields.join(', ')}, updated_at = now()
     WHERE organization_id = $1 AND id = $2 RETURNING *`,
    params
  );
  return mapEnterprise(result.rows[0]);
}

async function assignEnterprises(organizationId, ids, ownerId) {
  if (!Array.isArray(ids) || !ids.length) return { updated: 0 };
  const result = await query(
    `UPDATE enterprises
     SET owner_id = $3, updated_at = now()
     WHERE organization_id = $1 AND id = ANY($2::uuid[])
     RETURNING id`,
    [organizationId, ids, ownerId || null]
  );
  return { updated: result.rowCount };
}

async function deleteEnterprise(organizationId, id) {
  await query('DELETE FROM enterprises WHERE organization_id = $1 AND id = $2', [organizationId, id]);
}

async function addCallRecord(organizationId, userId, enterpriseId, result, notes) {
  const created = await query(
    `INSERT INTO call_records (organization_id, user_id, enterprise_id, result, notes)
     VALUES ($1,$2,$3,$4,$5) RETURNING *`,
    [organizationId, userId, enterpriseId, result, notes || '']
  );
  return created.rows[0];
}

async function listCallRecords(organizationId, enterpriseId) {
  const result = await query(
    `SELECT * FROM call_records
     WHERE organization_id = $1 AND enterprise_id = $2
     ORDER BY called_at DESC`,
    [organizationId, enterpriseId]
  );
  return result.rows;
}

module.exports = {
  mapEnterprise,
  listEnterprises,
  getEnterprise,
  createBatch,
  createImportedBatch,
  createEnterprise,
  updateEnterprise,
  assignEnterprises,
  deleteEnterprise,
  addCallRecord,
  listCallRecords,
};
