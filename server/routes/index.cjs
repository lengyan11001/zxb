const express = require('express');
const authRoutes = require('./auth.cjs');
const productsRoutes = require('./products.cjs');
const enterprisesRoutes = require('./enterprises.cjs');
const dashboardRoutes = require('./dashboard.cjs');
const exportRoutes = require('./export.cjs');
const settingsRoutes = require('./settings.cjs');
const { requireAuth } = require('../middleware/auth.cjs');

const router = express.Router();

router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use('/auth', authRoutes);
router.use(requireAuth);
router.use('/products', productsRoutes);
router.use('/enterprises', enterprisesRoutes);
router.use('/dashboard', dashboardRoutes);
router.use('/export', exportRoutes);
router.use('/settings', settingsRoutes);

module.exports = router;
