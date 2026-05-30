const express = require('express');
const productsRepo = require('../repositories/productsRepo.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { requireRole, requireUuidParam } = require('../middleware/auth.cjs');
const { audit } = require('../middleware/audit.cjs');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await productsRepo.listProducts(req.organizationId, req.query.status));
}));

router.get('/:id', requireUuidParam(), asyncHandler(async (req, res) => {
  const product = await productsRepo.getProduct(req.organizationId, req.params.id);
  if (!product) return res.status(404).json({ error: '产品不存在' });
  res.json(product);
}));

router.post('/', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const product = await productsRepo.createProduct(req.organizationId, req.user.id, req.body);
  await audit(req, 'create', 'product', product.id);
  res.status(201).json(product);
}));

router.put('/:id', requireRole('admin', 'manager'), requireUuidParam(), asyncHandler(async (req, res) => {
  const product = await productsRepo.updateProduct(req.organizationId, req.params.id, req.body);
  if (!product) return res.status(404).json({ error: '产品不存在' });
  await audit(req, 'update', 'product', product.id);
  res.json(product);
}));

router.delete('/:id', requireRole('admin', 'manager'), requireUuidParam(), asyncHandler(async (req, res) => {
  await productsRepo.archiveProduct(req.organizationId, req.params.id);
  await audit(req, 'archive', 'product', req.params.id);
  res.json({ success: true });
}));

module.exports = router;
