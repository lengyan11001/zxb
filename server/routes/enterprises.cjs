const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const enterprisesRepo = require('../repositories/enterprisesRepo.cjs');
const scriptsRepo = require('../repositories/scriptsRepo.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { audit } = require('../middleware/audit.cjs');
const { env } = require('../config/env.cjs');
const { collectQueue, scriptQueue } = require('../workers/queues.cjs');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    search: req.query.search,
    industry: req.query.industry,
    status: req.query.status,
    ownerId: req.user.role === 'sdr' ? req.user.id : req.query.ownerId,
  };
  res.json(await enterprisesRepo.listEnterprises(req.organizationId, filters));
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const enterprise = await enterprisesRepo.getEnterprise(req.organizationId, req.params.id);
  if (!enterprise) return res.status(404).json({ error: '企业不存在' });
  res.json(enterprise);
}));

router.post('/', asyncHandler(async (req, res) => {
  const enterprise = await enterprisesRepo.createEnterprise(req.organizationId, req.user.id, req.body);
  await audit(req, 'create', 'enterprise', enterprise.id);
  res.status(201).json(enterprise);
}));

router.post('/batch', asyncHandler(async (req, res) => {
  const names = normalizeNames(req.body.names || []);
  if (!names.length) return res.status(400).json({ error: '企业名单不能为空' });
  if (names.length > env.maxUploadEnterprises) return res.status(400).json({ error: `单次最多导入${env.maxUploadEnterprises}家企业` });

  const { batch, enterprises } = await enterprisesRepo.createBatch(req.organizationId, req.user.id, req.body.filename, 'manual', names);
  await enqueueCollectJobs(req.organizationId, enterprises);
  await audit(req, 'batch_create', 'upload_batch', batch.id, { count: enterprises.length });
  res.status(201).json({ batch, enterprises });
}));

router.post('/upload', upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const names = await parseEnterpriseFile(req.file);
  if (!names.length) return res.status(400).json({ error: '文件中未识别到企业名称' });
  if (names.length > env.maxUploadEnterprises) return res.status(400).json({ error: `单次最多导入${env.maxUploadEnterprises}家企业` });

  const { batch, enterprises } = await enterprisesRepo.createBatch(req.organizationId, req.user.id, req.file.originalname, 'file', names);
  await enqueueCollectJobs(req.organizationId, enterprises);
  await audit(req, 'upload', 'upload_batch', batch.id, { count: enterprises.length, filename: req.file.originalname });
  res.status(201).json({ batch, enterprises });
}));

router.put('/:id', asyncHandler(async (req, res) => {
  const enterprise = await enterprisesRepo.updateEnterprise(req.organizationId, req.params.id, req.body);
  if (!enterprise) return res.status(404).json({ error: '企业不存在' });
  await audit(req, 'update', 'enterprise', enterprise.id);
  res.json(enterprise);
}));

router.delete('/:id', asyncHandler(async (req, res) => {
  await enterprisesRepo.deleteEnterprise(req.organizationId, req.params.id);
  await audit(req, 'delete', 'enterprise', req.params.id);
  res.json({ success: true });
}));

router.post('/:id/collect', asyncHandler(async (req, res) => {
  const enterprise = await enterprisesRepo.getEnterprise(req.organizationId, req.params.id);
  if (!enterprise) return res.status(404).json({ error: '企业不存在' });
  await enterprisesRepo.updateEnterprise(req.organizationId, enterprise.id, { collectionStatus: 'queued', collectionProgress: 0 });
  const job = await collectQueue.add('collect', { organizationId: req.organizationId, enterpriseId: enterprise.id }, { attempts: 3, backoff: { type: 'exponential', delay: 3000 } });
  res.json({ jobId: job.id, status: 'queued' });
}));

router.post('/:id/generate-script', asyncHandler(async (req, res) => {
  const enterprise = await enterprisesRepo.getEnterprise(req.organizationId, req.params.id);
  if (!enterprise) return res.status(404).json({ error: '企业不存在' });
  const productId = req.body.productId || enterprise.activeProductId;
  if (!productId) return res.status(400).json({ error: '请选择产品' });

  const script = await scriptsRepo.createQueuedScript(req.organizationId, req.user.id, enterprise.id, productId);
  const job = await scriptQueue.add('generate', {
    organizationId: req.organizationId,
    scriptId: script.id,
    enterpriseId: enterprise.id,
    productId,
  }, { attempts: 2, backoff: { type: 'exponential', delay: 5000 } });
  await audit(req, 'generate_script', 'enterprise', enterprise.id, { productId, scriptId: script.id });
  res.status(202).json({ jobId: job.id, script });
}));

router.get('/:id/script', asyncHandler(async (req, res) => {
  const script = await scriptsRepo.getLatestScript(req.organizationId, req.params.id, req.query.productId);
  if (!script) return res.status(404).json({ error: '暂无话术' });
  res.json(script);
}));

router.get('/:id/calls', asyncHandler(async (req, res) => {
  res.json(await enterprisesRepo.listCallRecords(req.organizationId, req.params.id));
}));

router.post('/:id/calls', asyncHandler(async (req, res) => {
  const { result, notes } = req.body;
  const valid = ['未拨打', '已接通', '未接', '拒绝', '有效通话', '加微信', '约见', '回拨'];
  if (!valid.includes(result)) return res.status(400).json({ error: '无效拨打结果' });
  const record = await enterprisesRepo.addCallRecord(req.organizationId, req.user.id, req.params.id, result, notes);
  await audit(req, 'create', 'call_record', record.id, { enterpriseId: req.params.id, result });
  res.status(201).json(record);
}));

function normalizeNames(names) {
  const arr = Array.isArray(names) ? names : String(names || '').split(/[\n,，;；]+/);
  return Array.from(new Set(arr.map((name) => String(name).trim()).filter(Boolean)));
}

async function parseEnterpriseFile(file) {
  const lower = file.originalname.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
    return normalizeNames(file.buffer.toString('utf8'));
  }
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(file.buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows = [];
  sheet.eachRow((row) => {
    rows.push(row.values.slice(1));
  });
  const header = rows[0] || [];
  const nameIndex = Math.max(0, header.findIndex((cell) => String(cell).includes('企业') || String(cell).includes('公司') || String(cell).toLowerCase().includes('name')));
  return normalizeNames(rows.slice(1).map((row) => row[nameIndex]));
}

async function enqueueCollectJobs(organizationId, enterprises) {
  await Promise.all(enterprises.map((enterprise) => collectQueue.add(
    'collect',
    { organizationId, enterpriseId: enterprise.id },
    { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 1000, removeOnFail: 5000 }
  )));
}

module.exports = router;
