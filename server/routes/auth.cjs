const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/pool.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { signToken, requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

router.post('/login', asyncHandler(async (req, res) => {
  const account = String(req.body.account || req.body.email || '').trim();
  const { password } = req.body;
  if (!account || !password) return res.status(400).json({ error: '账号和密码不能为空' });

  const result = await query(
    `SELECT id, organization_id, email, password_hash, name, role, status
     FROM users WHERE email = $1 AND status = 'active'
     LIMIT 1`,
    [account]
  );
  const user = result.rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: '账号或密码错误' });
  }

  const token = signToken(user);
  res.json({
    token,
    user: {
      id: user.id,
      organizationId: user.organization_id,
      email: user.email,
      name: user.name,
      role: user.role,
    },
  });
}));

router.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({
    id: req.user.id,
    organizationId: req.user.organization_id,
    email: req.user.email,
    name: req.user.name,
    role: req.user.role,
  });
}));

module.exports = router;
