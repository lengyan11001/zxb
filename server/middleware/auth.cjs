const jwt = require('jsonwebtoken');
const { env } = require('../config/env.cjs');
const { query } = require('../database/pool.cjs');

function signToken(user) {
  return jwt.sign({
    sub: user.id,
    organizationId: user.organization_id,
    role: user.role,
    email: user.email,
    name: user.name,
  }, env.jwtSecret, { expiresIn: '12h' });
}

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : req.cookies?.token;
  if (!token) return res.status(401).json({ error: 'UNAUTHORIZED' });

  try {
    const payload = jwt.verify(token, env.jwtSecret);
    const result = await query(
      `SELECT id, organization_id, email, name, role, status
       FROM users WHERE id = $1 AND status = 'active'`,
      [payload.sub]
    );
    if (!result.rowCount) return res.status(401).json({ error: 'UNAUTHORIZED' });
    req.user = result.rows[0];
    req.organizationId = req.user.organization_id;
    return next();
  } catch {
    return res.status(401).json({ error: 'UNAUTHORIZED' });
  }
}

function requireRole(...roles) {
  return function roleGuard(req, res, next) {
    if (!req.user) return res.status(401).json({ error: 'UNAUTHORIZED' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'FORBIDDEN' });
    return next();
  };
}

module.exports = { signToken, requireAuth, requireRole };
