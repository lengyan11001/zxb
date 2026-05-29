const express = require('express');
const ExcelJS = require('exceljs');
const enterprisesRepo = require('../repositories/enterprisesRepo.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { audit } = require('../middleware/audit.cjs');

const router = express.Router();

router.post('/', asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  if (!ids.length) return res.status(400).json({ error: '请选择要导出的企业' });

  const all = await enterprisesRepo.listEnterprises(req.organizationId, {
    ownerId: req.user.role === 'sdr' ? req.user.id : undefined,
  });
  const selected = all.filter((enterprise) => ids.includes(enterprise.id));

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('企业外呼名单');
  sheet.columns = [
    { header: '企业名称', key: 'name', width: 32 },
    { header: '行业', key: 'industry', width: 18 },
    { header: '地区', key: 'location', width: 18 },
    { header: '规模', key: 'scale', width: 14 },
    { header: '联系人', key: 'contactPerson', width: 14 },
    { header: '手机号', key: 'phone', width: 18 },
    { header: '手机号状态', key: 'phoneStatus', width: 14 },
    { header: '需求信号', key: 'signals', width: 28 },
    { header: '话术', key: 'aiScript', width: 60 },
    { header: '备注', key: 'notes', width: 30 },
  ];
  selected.forEach((enterprise) => sheet.addRow({
    name: enterprise.name,
    industry: enterprise.industry,
    location: enterprise.location,
    scale: enterprise.scale,
    contactPerson: enterprise.contactPerson,
    phone: enterprise.phone,
    phoneStatus: enterprise.phoneStatus,
    signals: enterprise.signals.map((signal) => signal.label || signal.type).join('、'),
    aiScript: enterprise.aiScript,
    notes: enterprise.notes,
  }));
  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `企业外呼名单_${new Date().toISOString().slice(0, 10)}.xlsx`;

  await audit(req, 'export', 'enterprise', null, { count: selected.length });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
  res.send(buffer);
}));

module.exports = router;
