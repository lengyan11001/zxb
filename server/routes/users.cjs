const express = require('express');
const usersRepo = require('../repositories/usersRepo.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { requireRole } = require('../middleware/auth.cjs');
const { audit } = require('../middleware/audit.cjs');

const router = express.Router();

router.get('/', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  res.json(await usersRepo.listUsers(req.organizationId));
}));

router.get('/assignable', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  res.json(await usersRepo.listAssignableUsers(req.organizationId));
}));

router.post('/', requireRole('admin'), asyncHandler(async (req, res) => {
  const user = await usersRepo.createUser(req.organizationId, req.body);
  await audit(req, 'create', 'user', user.id, { role: user.role, email: user.email });
  res.status(201).json(user);
}));

router.put('/:id', requireRole('admin'), asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id && req.body.status === 'disabled') {
    return res.status(400).json({ error: '不能禁用当前登录账号' });
  }
  const user = await usersRepo.updateUser(req.organizationId, req.params.id, req.body);
  if (!user) return res.status(404).json({ error: '用户不存在' });
  await audit(req, 'update', 'user', user.id, { role: user.role, status: user.status });
  res.json(user);
}));

module.exports = router;
