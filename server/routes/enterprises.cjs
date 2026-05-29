const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
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
  const tianyanchaRecords = await parseTianyanchaFile(req.file);
  if (tianyanchaRecords.length) {
    if (tianyanchaRecords.length > env.maxUploadEnterprises * 20) {
      return res.status(400).json({ error: `单次最多导入 ${env.maxUploadEnterprises * 20} 家企业` });
    }
    const result = await enterprisesRepo.createImportedBatch(
      req.organizationId,
      req.user.id,
      req.file.originalname,
      'tianyancha',
      tianyanchaRecords
    );
    await audit(req, 'upload_tianyancha', 'upload_batch', result.batch.id, result.summary);
    return res.status(201).json(result);
  }

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

async function parseTianyanchaFile(file) {
  const lower = file.originalname.toLowerCase();
  let workbookBuffer = file.buffer;
  if (lower.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file.buffer);
    const entry = Object.values(zip.files).find((item) => !item.dir && item.name.toLowerCase().endsWith('.xlsx'));
    if (!entry) return [];
    workbookBuffer = await entry.async('nodebuffer');
  } else if (!lower.endsWith('.xlsx')) {
    return [];
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const sheet = workbook.getWorksheet('高级搜索') || workbook.worksheets[0];
  if (!sheet) return [];

  const headers = [];
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    headers.push(cleanCell(sheet.getRow(2).getCell(column).value));
  }
  if (!headers.includes('公司名称') || !headers.includes('统一社会信用代码')) return [];

  const records = [];
  const seen = new Set();
  for (let rowNumber = 3; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = {};
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      row[headers[column - 1]] = normalizeExportValue(sheet.getRow(rowNumber).getCell(column).value);
    }
    const name = row['公司名称'];
    if (!name || seen.has(name)) continue;
    seen.add(name);
    records.push(mapTianyanchaRecord(row));
  }
  return records;
}

function mapTianyanchaRecord(row) {
  const cityParts = [row['所属省份'], row['所属城市'], row['所属区县']].filter(Boolean);
  const industryParts = [row['国标行业门类'], row['国标行业大类'], row['国标行业中类']].filter(Boolean);
  const phone = row['有效手机号'] || firstValue(row['更多电话']);
  const sourceUrl = row['网址'] || '';
  const signals = buildTianyanchaSignals(row);
  return {
    name: row['公司名称'],
    unifiedCreditCode: row['统一社会信用代码'],
    industry: industryParts.join(' / '),
    scale: row['企业规模'],
    location: cityParts.join(' '),
    contactPerson: row['法定代表人'],
    phone,
    phoneStatus: phone ? 'cleaned' : 'pending',
    collectionStatus: 'completed',
    collectionProgress: 100,
    signals,
    notes: [
      row['登记状态'] ? `登记状态：${row['登记状态']}` : '',
      row['邮箱'] ? `邮箱：${row['邮箱']}` : '',
      sourceUrl ? `网址：${sourceUrl}` : '',
    ].filter(Boolean).join('\n'),
    profile: {
      sourceMode: 'tianyancha-upload',
      provider: 'tianyancha',
      importedAt: new Date().toISOString(),
      legalPerson: row['法定代表人'],
      registrationStatus: row['登记状态'],
      registeredCapital: row['注册资本'],
      paidInCapital: row['实缴资本'],
      foundedAt: row['成立日期'],
      approvedAt: row['核准日期'],
      businessTerm: row['营业期限'],
      province: row['所属省份'],
      city: row['所属城市'],
      district: row['所属区县'],
      companyType: row['企业(机构)类型'],
      industryCategory: row['国标行业门类'],
      industryMajor: row['国标行业大类'],
      industryMiddle: row['国标行业中类'],
      formerName: row['曾用名'],
      englishName: row['英文名'],
      taxpayerId: row['纳税人识别号'],
      registrationNo: row['注册号'],
      organizationCode: row['组织机构代码'],
      insuredCount: row['参保人数'],
      insuredReportYear: row['参保人数所属年报'],
      morePhones: row['更多电话'],
      registeredAddress: row['注册地址'],
      annualReportAddress: row['最新年报地址'],
      mailingAddress: row['通信地址'],
      website: sourceUrl,
      email: row['邮箱'],
      otherEmails: row['其他邮箱'],
      businessScope: row['经营范围'],
      raw: row,
    },
    timeline: [
      { time: new Date().toISOString(), title: '天眼查数据导入', detail: `导入企业：${row['公司名称']}` },
      { time: new Date().toISOString(), title: '工商画像入库', detail: `${row['登记状态'] || '未知状态'}，${industryParts.join(' / ') || '未知行业'}` },
    ],
  };
}

function buildTianyanchaSignals(row) {
  const scope = row['经营范围'] || '';
  const industry = [row['国标行业门类'], row['国标行业大类'], row['国标行业中类']].join(' ');
  const text = `${row['公司名称']} ${industry} ${scope}`;
  const signals = [];
  if (/技术|科技|研发|软件|信息|互联网|数据|人工智能|云计算|芯片|专利|知识产权/.test(text)) {
    signals.push({
      type: 'gaoxin',
      label: '高新/科技属性线索',
      description: '企业经营范围或行业包含科技、研发、软件、数据等关键词。',
      evidence: [row['国标行业大类'], row['国标行业中类']].filter(Boolean).join(' / ') || '天眼查导入字段命中科技关键词',
      confidence: 72,
    });
  }
  if (/融资|租赁|供应链|设备|生产|制造|批发|贸易|进出口/.test(text)) {
    signals.push({
      type: 'financing',
      label: '经营资金/融资线索',
      description: '企业经营范围包含设备、供应链、贸易、制造或扩张相关关键词。',
      evidence: '经营范围存在资金周转或扩张相关业务描述。',
      confidence: 62,
    });
  }
  return signals;
}

function cleanCell(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.text || value.result || '').trim();
  return String(value).trim();
}

function normalizeExportValue(value) {
  const text = cleanCell(value);
  return text === '-' ? '' : text;
}

function firstValue(value) {
  return String(value || '').split(/[;,，、\s]+/).map((item) => item.trim()).find(Boolean) || '';
}

async function enqueueCollectJobs(organizationId, enterprises) {
  await Promise.all(enterprises.map((enterprise) => collectQueue.add(
    'collect',
    { organizationId, enterpriseId: enterprise.id },
    { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 1000, removeOnFail: 5000 }
  )));
}

module.exports = router;
