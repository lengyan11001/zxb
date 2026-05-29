const express = require('express');
const dashboardRepo = require('../repositories/dashboardRepo.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
  res.json(await dashboardRepo.getDashboard(req.organizationId, req.user.id, req.user.role));
}));

module.exports = router;
