const bcrypt = require('bcryptjs');
const { query } = require('../database/pool.cjs');

const USER_COLUMNS = `
  id, organization_id, email, name, role, status, created_at, updated_at
`;
const USER_SELECT = `
  u.id, u.organization_id, u.email, u.name, u.role, u.status, u.created_at, u.updated_at
`;

function mapUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    enterpriseCount: Number(row.enterprise_count || 0),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listUsers(organizationId) {
  const result = await query(
    `SELECT ${USER_SELECT},
            COUNT(e.id)::int AS enterprise_count
     FROM users u
     LEFT JOIN enterprises e ON e.owner_id = u.id AND e.organization_id = u.organization_id
     WHERE u.organization_id = $1
     GROUP BY u.id
     ORDER BY
       CASE u.role WHEN 'admin' THEN 1 WHEN 'manager' THEN 2 ELSE 3 END,
       u.created_at ASC`,
    [organizationId]
  );
  return result.rows.map(mapUser);
}

async function listAssignableUsers(organizationId) {
  const result = await query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE organization_id = $1
       AND status = 'active'
       AND role IN ('manager', 'sdr')
     ORDER BY CASE role WHEN 'manager' THEN 1 ELSE 2 END, name`,
    [organizationId]
  );
  return result.rows.map(mapUser);
}

async function getUser(organizationId, id) {
  const result = await query(
    `SELECT ${USER_COLUMNS}
     FROM users
     WHERE organization_id = $1 AND id = $2`,
    [organizationId, id]
  );
  return mapUser(result.rows[0]);
}

async function createUser(organizationId, data) {
  const email = String(data.email || '').trim().toLowerCase();
  const name = String(data.name || '').trim();
  const role = data.role;
  const password = String(data.password || '');
  if (!email || !name || !password) {
    const err = new Error('邮箱、姓名和初始密码不能为空');
    err.status = 400;
    throw err;
  }
  if (!['admin', 'manager', 'sdr'].includes(role)) {
    const err = new Error('无效角色');
    err.status = 400;
    throw err;
  }
  if (password.length < 8) {
    const err = new Error('密码至少 8 位');
    err.status = 400;
    throw err;
  }
  const passwordHash = await bcrypt.hash(password, 12);
  const result = await query(
    `INSERT INTO users (organization_id, email, password_hash, name, role, status)
     VALUES ($1,$2,$3,$4,$5,'active')
     RETURNING ${USER_COLUMNS}`,
    [organizationId, email, passwordHash, name, role]
  );
  return mapUser(result.rows[0]);
}

async function updateUser(organizationId, id, data) {
  const fields = [];
  const params = [organizationId, id];
  const allowed = {
    email: 'email',
    name: 'name',
    role: 'role',
    status: 'status',
  };
  for (const [key, column] of Object.entries(allowed)) {
    if (Object.prototype.hasOwnProperty.call(data, key)) {
      let value = data[key];
      if (key === 'email') value = String(value || '').trim().toLowerCase();
      if (key === 'name') value = String(value || '').trim();
      if (key === 'role' && !['admin', 'manager', 'sdr'].includes(value)) {
        const err = new Error('无效角色');
        err.status = 400;
        throw err;
      }
      if (key === 'status' && !['active', 'disabled'].includes(value)) {
        const err = new Error('无效状态');
        err.status = 400;
        throw err;
      }
      params.push(value);
      fields.push(`${column} = $${params.length}`);
    }
  }
  if (Object.prototype.hasOwnProperty.call(data, 'password') && data.password) {
    if (String(data.password).length < 8) {
      const err = new Error('密码至少 8 位');
      err.status = 400;
      throw err;
    }
    params.push(await bcrypt.hash(String(data.password), 12));
    fields.push(`password_hash = $${params.length}`);
  }
  if (!fields.length) return getUser(organizationId, id);
  const result = await query(
    `UPDATE users SET ${fields.join(', ')}, updated_at = now()
     WHERE organization_id = $1 AND id = $2
     RETURNING ${USER_COLUMNS}`,
    params
  );
  return mapUser(result.rows[0]);
}

module.exports = {
  mapUser,
  listUsers,
  listAssignableUsers,
  getUser,
  createUser,
  updateUser,
};
