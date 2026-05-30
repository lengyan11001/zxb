const express = require('express');
const multer = require('multer');
const ExcelJS = require('exceljs');
const JSZip = require('jszip');
const enterprisesRepo = require('../repositories/enterprisesRepo.cjs');
const usersRepo = require('../repositories/usersRepo.cjs');
const scriptsRepo = require('../repositories/scriptsRepo.cjs');
const { asyncHandler } = require('../utils/asyncHandler.cjs');
const { audit } = require('../middleware/audit.cjs');
const { requireRole, requireEnterpriseAccess, isUuid } = require('../middleware/auth.cjs');
const { env } = require('../config/env.cjs');
const { collectQueue, scriptQueue } = require('../workers/queues.cjs');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });
const enterpriseAccess = requireEnterpriseAccess(enterprisesRepo.getEnterprise);

const ROLE_UPDATE_FIELDS = {
  sdr: new Set(['activeProductId', 'notes']),
};

router.get('/', asyncHandler(async (req, res) => {
  const filters = {
    search: req.query.search,
    industry: req.query.industry,
    status: req.query.status,
    ownerId: req.user.role === 'sdr' ? req.user.id : req.query.ownerId,
  };
  res.json(await enterprisesRepo.listEnterprises(req.organizationId, filters));
}));

router.post('/assign', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const ids = Array.isArray(req.body.ids) ? req.body.ids : [];
  const ownerId = req.body.ownerId || null;
  if (!ids.length) return res.status(400).json({ error: '请选择要分配的企业' });
  if (!ids.every(isUuid)) return res.status(400).json({ error: '企业ID格式不正确' });
  if (ownerId && !isUuid(ownerId)) return res.status(400).json({ error: '接收人ID格式不正确' });
  if (ownerId) {
    const owner = await usersRepo.getUser(req.organizationId, ownerId);
    if (!owner || owner.status !== 'active' || !['manager', 'sdr'].includes(owner.role)) {
      return res.status(400).json({ error: '无效的接收人' });
    }
  }
  const result = await enterprisesRepo.assignEnterprises(req.organizationId, ids, ownerId);
  await audit(req, 'assign', 'enterprise', null, { count: result.updated, ownerId });
  res.json(result);
}));

router.get('/:id', enterpriseAccess, asyncHandler(async (req, res) => {
  res.json(req.enterprise);
}));

router.post('/', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const enterprise = await enterprisesRepo.createEnterprise(req.organizationId, req.user.id, req.body);
  await audit(req, 'create', 'enterprise', enterprise.id);
  res.status(201).json(enterprise);
}));

router.post('/batch', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  const names = normalizeNames(req.body.names || []);
  if (!names.length) return res.status(400).json({ error: '企业名单不能为空' });
  if (names.length > env.maxUploadEnterprises) {
    return res.status(400).json({ error: `单次最多导入 ${env.maxUploadEnterprises} 家企业` });
  }

  const { batch, enterprises } = await enterprisesRepo.createBatch(req.organizationId, req.user.id, req.body.filename, 'manual', names);
  await enqueueCollectJobs(req.organizationId, enterprises);
  await audit(req, 'batch_create', 'upload_batch', batch.id, { count: enterprises.length });
  res.status(201).json({ batch, enterprises });
}));

router.post('/upload', requireRole('admin', 'manager'), upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择文件' });
  const imported = await parseStructuredEnterpriseFile(req.file);
  if (imported.records.length) {
    if (imported.records.length > env.maxUploadEnterprises * 20) {
      return res.status(400).json({ error: `单次最多导入 ${env.maxUploadEnterprises * 20} 家企业` });
    }
    const result = await enterprisesRepo.createImportedBatch(
      req.organizationId,
      req.user.id,
      req.file.originalname,
      imported.source,
      imported.records
    );
    await audit(req, `upload_${imported.source}`, 'upload_batch', result.batch.id, result.summary);
    return res.status(201).json(result);
  }

  const names = await parseEnterpriseFile(req.file);
  if (!names.length) return res.status(400).json({ error: '文件中未识别到企业名称' });
  if (names.length > env.maxUploadEnterprises) {
    return res.status(400).json({ error: `单次最多导入 ${env.maxUploadEnterprises} 家企业` });
  }

  const { batch, enterprises } = await enterprisesRepo.createBatch(req.organizationId, req.user.id, req.file.originalname, 'file', names);
  await enqueueCollectJobs(req.organizationId, enterprises);
  await audit(req, 'upload', 'upload_batch', batch.id, { count: enterprises.length, filename: req.file.originalname });
  res.status(201).json({ batch, enterprises });
}));

router.put('/:id', enterpriseAccess, asyncHandler(async (req, res) => {
  const data = filterEnterpriseUpdate(req.user, req.body);
  if (!Object.keys(data).length) return res.status(403).json({ error: '当前角色不能修改这些字段' });
  const enterprise = await enterprisesRepo.updateEnterprise(req.organizationId, req.params.id, data);
  if (!enterprise) return res.status(404).json({ error: '企业不存在' });
  await audit(req, 'update', 'enterprise', enterprise.id, { fields: Object.keys(data) });
  res.json(enterprise);
}));

router.delete('/:id', requireRole('admin', 'manager'), asyncHandler(async (req, res) => {
  if (!isUuid(req.params.id)) return res.status(400).json({ error: '无效企业ID' });
  await enterprisesRepo.deleteEnterprise(req.organizationId, req.params.id);
  await audit(req, 'delete', 'enterprise', req.params.id);
  res.json({ success: true });
}));

router.post('/:id/collect', requireRole('admin', 'manager'), enterpriseAccess, asyncHandler(async (req, res) => {
  const enterprise = req.enterprise;
  await enterprisesRepo.updateEnterprise(req.organizationId, enterprise.id, { collectionStatus: 'queued', collectionProgress: 0 });
  const job = await collectQueue.add(
    'collect',
    { organizationId: req.organizationId, enterpriseId: enterprise.id },
    { attempts: 3, backoff: { type: 'exponential', delay: 3000 }, removeOnComplete: 1000, removeOnFail: 5000 }
  );
  res.json({ jobId: job.id, status: 'queued' });
}));

router.post('/:id/generate-script', enterpriseAccess, asyncHandler(async (req, res) => {
  const enterprise = req.enterprise;
  const productId = req.body.productId || enterprise.activeProductId;
  if (!productId) return res.status(400).json({ error: '请选择产品' });
  if (!isUuid(productId)) return res.status(400).json({ error: '无效产品ID' });

  const script = await scriptsRepo.createQueuedScript(req.organizationId, req.user.id, enterprise.id, productId);
  const job = await scriptQueue.add('generate', {
    organizationId: req.organizationId,
    scriptId: script.id,
    enterpriseId: enterprise.id,
    productId,
  }, { attempts: 2, backoff: { type: 'exponential', delay: 5000 }, removeOnComplete: 1000, removeOnFail: 5000 });
  await audit(req, 'generate_script', 'enterprise', enterprise.id, { productId, scriptId: script.id });
  res.status(202).json({ jobId: job.id, script });
}));

router.get('/:id/script', enterpriseAccess, asyncHandler(async (req, res) => {
  if (req.query.productId && !isUuid(req.query.productId)) return res.status(400).json({ error: '无效产品ID' });
  const script = await scriptsRepo.getLatestScript(req.organizationId, req.params.id, req.query.productId);
  if (!script) return res.status(404).json({ error: '暂无话术' });
  res.json(script);
}));

router.get('/:id/scripts/:scriptId', enterpriseAccess, asyncHandler(async (req, res) => {
  if (!isUuid(req.params.scriptId)) return res.status(400).json({ error: '无效话术ID' });
  const script = await scriptsRepo.getScript(req.organizationId, req.params.id, req.params.scriptId);
  if (!script) return res.status(404).json({ error: '话术不存在' });
  res.json(script);
}));

router.get('/:id/calls', enterpriseAccess, asyncHandler(async (req, res) => {
  res.json(await enterprisesRepo.listCallRecords(req.organizationId, req.params.id));
}));

router.post('/:id/calls', enterpriseAccess, asyncHandler(async (req, res) => {
  const { result, notes } = req.body;
  const valid = ['未拨打', '已接通', '未接', '拒绝', '有效通话', '加微信', '约见', '回拨'];
  if (!valid.includes(result)) return res.status(400).json({ error: '无效拨打结果' });
  const record = await enterprisesRepo.addCallRecord(req.organizationId, req.user.id, req.params.id, result, notes);
  await audit(req, 'create', 'call_record', record.id, { enterpriseId: req.params.id, result });
  res.status(201).json(record);
}));

function filterEnterpriseUpdate(user, body) {
  if (['admin', 'manager'].includes(user.role)) return body;
  const allowed = ROLE_UPDATE_FIELDS[user.role] || new Set();
  return Object.fromEntries(Object.entries(body || {}).filter(([key]) => allowed.has(key)));
}

function normalizeNames(names) {
  const arr = Array.isArray(names) ? names : String(names || '').split(/[\n,，;；]+/);
  return Array.from(new Set(arr.map((name) => String(name).trim()).filter(Boolean)));
}

async function parseEnterpriseFile(file) {
  const lower = file.originalname.toLowerCase();
  if (lower.endsWith('.txt') || lower.endsWith('.csv')) {
    return normalizeNames(file.buffer.toString('utf8'));
  }
  const workbookBuffer = await extractWorkbookBuffer(file);
  if (!workbookBuffer) return [];
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const headerRow = detectHeaderRow(sheet, ['name']) || 1;
  const headers = readHeaders(sheet, headerRow);
  const nameIndex = headers.findIndex((cell) => headerMatchesField(cell, 'name'));
  if (nameIndex < 0) return [];
  const names = [];
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    names.push(normalizeExportValue(sheet.getRow(rowNumber).getCell(nameIndex + 1).value));
  }
  return normalizeNames(names);
}

async function parseStructuredEnterpriseFile(file) {
  const workbookBuffer = await extractWorkbookBuffer(file);
  if (!workbookBuffer) return { source: 'file', records: [] };

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(workbookBuffer);
  const sheet = workbook.getWorksheet('高级搜索') || workbook.worksheets[0];
  if (!sheet) return { source: 'file', records: [] };

  const headerRow = detectHeaderRow(sheet, ['name', 'unifiedCreditCode', 'legalPerson', 'registeredCapital']);
  if (!headerRow) return { source: 'file', records: [] };
  const headers = readHeaders(sheet, headerRow);
  if (!headers.some((header) => headerMatchesField(header, 'name'))) return { source: 'file', records: [] };

  const source = detectSource(file.originalname, sheet.name, headers);
  const records = [];
  const seen = new Set();
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const raw = {};
    for (let column = 1; column <= sheet.columnCount; column += 1) {
      const header = headers[column - 1];
      if (!header) continue;
      raw[header] = normalizeExportValue(sheet.getRow(rowNumber).getCell(column).value);
    }
    const mapped = mapStructuredRecord(raw, source);
    if (!mapped.name || seen.has(mapped.name)) continue;
    seen.add(mapped.name);
    records.push(mapped);
  }
  return { source, records };
}

async function extractWorkbookBuffer(file) {
  const lower = file.originalname.toLowerCase();
  if (lower.endsWith('.zip')) {
    const zip = await JSZip.loadAsync(file.buffer);
    const entry = Object.values(zip.files).find((item) => !item.dir && item.name.toLowerCase().endsWith('.xlsx'));
    return entry ? entry.async('nodebuffer') : null;
  }
  return lower.endsWith('.xlsx') ? file.buffer : null;
}

const FIELD_ALIASES = {
  name: ['公司名称', '企业名称', '名称'],
  status: ['登记状态', '经营状态', '企业状态', '状态'],
  legalPerson: ['法定代表人', '法人', '法人代表'],
  scale: ['企业规模', '人员规模', '规模'],
  registeredCapital: ['注册资本'],
  paidInCapital: ['实缴资本'],
  foundedAt: ['成立日期', '成立时间'],
  approvedAt: ['核准日期'],
  businessTerm: ['营业期限', '经营期限'],
  province: ['所属省份', '省份', '省'],
  city: ['所属城市', '城市', '市'],
  district: ['所属区县', '区县', '区'],
  companyType: ['企业(机构)类型', '企业类型', '公司类型', '机构类型', '类型'],
  industryCategory: ['国标行业门类', '行业门类'],
  industryMajor: ['国标行业大类', '行业大类', '所属行业', '行业'],
  industryMiddle: ['国标行业中类', '行业中类', '行业分类'],
  formerName: ['曾用名'],
  englishName: ['英文名'],
  unifiedCreditCode: ['统一社会信用代码', '统一社会信用代码/注册号', '信用代码'],
  taxpayerId: ['纳税人识别号'],
  registrationNo: ['注册号'],
  organizationCode: ['组织机构代码'],
  insuredCount: ['参保人数'],
  insuredReportYear: ['参保人数所属年报', '年报年份'],
  phone: ['有效手机号', '手机号', '联系电话', '电话', '联系方式'],
  morePhones: ['更多电话', '其他电话', '备用电话'],
  registeredAddress: ['注册地址', '企业地址', '地址', '住所'],
  annualReportAddress: ['最新年报地址'],
  mailingAddress: ['通信地址'],
  website: ['网址', '官网', '网站', '公司网址'],
  email: ['邮箱', '电子邮箱', '有效邮箱'],
  otherEmails: ['其他邮箱', '更多邮箱'],
  businessScope: ['经营范围', '业务范围'],
};

function detectHeaderRow(sheet, importantFields) {
  let best = { rowNumber: 0, score: 0 };
  const maxRow = Math.min(sheet.rowCount, 8);
  for (let rowNumber = 1; rowNumber <= maxRow; rowNumber += 1) {
    const headers = readHeaders(sheet, rowNumber);
    const score = importantFields.reduce((sum, field) => sum + (headers.some((header) => headerMatchesField(header, field)) ? 1 : 0), 0);
    if (score > best.score) best = { rowNumber, score };
  }
  return best.score >= 1 ? best.rowNumber : 0;
}

function readHeaders(sheet, rowNumber) {
  const row = sheet.getRow(rowNumber);
  const headers = [];
  for (let column = 1; column <= sheet.columnCount; column += 1) {
    headers.push(cleanCell(row.getCell(column).value));
  }
  return headers;
}

function headerMatchesField(header, field) {
  const normalized = normalizeHeader(header);
  return (FIELD_ALIASES[field] || []).some((alias) => normalized === normalizeHeader(alias));
}

function getField(row, field) {
  const aliases = FIELD_ALIASES[field] || [];
  for (const alias of aliases) {
    const key = Object.keys(row).find((header) => normalizeHeader(header) === normalizeHeader(alias));
    if (key && row[key]) return row[key];
  }
  return '';
}

function detectSource(filename, sheetName, headers) {
  const text = `${filename} ${sheetName} ${headers.join(' ')}`;
  if (text.includes('企查查')) return 'qichacha';
  if (text.includes('天眼查') || text.includes('高级搜索')) return 'tianyancha';
  return 'enterprise-profile';
}

function mapStructuredRecord(row, source) {
  const phone = getField(row, 'phone') || firstValue(getField(row, 'morePhones'));
  const website = getField(row, 'website');
  const province = getField(row, 'province');
  const city = getField(row, 'city');
  const district = getField(row, 'district');
  const industryCategory = getField(row, 'industryCategory');
  const industryMajor = getField(row, 'industryMajor');
  const industryMiddle = getField(row, 'industryMiddle');
  const industry = [industryCategory, industryMajor, industryMiddle].filter(Boolean).join(' / ') || industryMajor;
  const name = getField(row, 'name');
  const status = getField(row, 'status');
  const signals = buildProfileSignals(row);
  const importedAt = new Date().toISOString();
  const providerLabel = source === 'qichacha' ? '企查查' : source === 'tianyancha' ? '天眼查' : '企业数据';

  return {
    name,
    unifiedCreditCode: getField(row, 'unifiedCreditCode'),
    industry,
    scale: getField(row, 'scale'),
    location: [province, city, district].filter(Boolean).join(' '),
    contactPerson: getField(row, 'legalPerson'),
    phone,
    phoneStatus: phone ? 'cleaned' : 'pending',
    collectionStatus: 'completed',
    collectionProgress: 100,
    signals,
    notes: [
      status ? `登记/经营状态：${status}` : '',
      getField(row, 'email') ? `邮箱：${getField(row, 'email')}` : '',
      website ? `网址：${website}` : '',
    ].filter(Boolean).join('\n'),
    profile: {
      sourceMode: `${source}-upload`,
      provider: source,
      importedAt,
      legalPerson: getField(row, 'legalPerson'),
      registrationStatus: status,
      registeredCapital: getField(row, 'registeredCapital'),
      paidInCapital: getField(row, 'paidInCapital'),
      foundedAt: getField(row, 'foundedAt'),
      approvedAt: getField(row, 'approvedAt'),
      businessTerm: getField(row, 'businessTerm'),
      province,
      city,
      district,
      companyType: getField(row, 'companyType'),
      industryCategory,
      industryMajor,
      industryMiddle,
      formerName: getField(row, 'formerName'),
      englishName: getField(row, 'englishName'),
      taxpayerId: getField(row, 'taxpayerId'),
      registrationNo: getField(row, 'registrationNo'),
      organizationCode: getField(row, 'organizationCode'),
      insuredCount: getField(row, 'insuredCount'),
      insuredReportYear: getField(row, 'insuredReportYear'),
      morePhones: getField(row, 'morePhones'),
      registeredAddress: getField(row, 'registeredAddress'),
      annualReportAddress: getField(row, 'annualReportAddress'),
      mailingAddress: getField(row, 'mailingAddress'),
      website,
      email: getField(row, 'email'),
      otherEmails: getField(row, 'otherEmails'),
      businessScope: getField(row, 'businessScope'),
      raw: row,
    },
    timeline: [
      { time: importedAt, title: `${providerLabel}数据导入`, detail: `导入企业：${name}` },
      { time: importedAt, title: '工商画像入库', detail: `${status || '未知状态'}，${industry || '未知行业'}` },
    ],
  };
}

function buildProfileSignals(row) {
  const text = Object.values(row).join(' ');
  const signals = [];
  if (/技术|科技|研发|软件|信息|互联网|数据|人工智能|云计算|芯片|专利|知识产权|物联网|系统集成/.test(text)) {
    signals.push({
      type: 'gaoxin',
      label: '高新/科技属性线索',
      description: '企业画像中包含科技、研发、软件、数据或知识产权相关关键词。',
      evidence: [getField(row, 'industryMajor'), getField(row, 'industryMiddle')].filter(Boolean).join(' / ') || '企业字段命中科技关键词',
      confidence: 72,
    });
  }
  if (/融资|租赁|供应链|设备|生产|制造|批发|贸易|进出口|资金|授信|应收/.test(text)) {
    signals.push({
      type: 'financing',
      label: '经营资金/融资线索',
      description: '企业经营范围或行业包含设备、供应链、贸易、制造或融资相关关键词。',
      evidence: '经营范围或行业存在资金周转、供应链或扩张相关描述。',
      confidence: 62,
    });
  }
  return signals;
}

function normalizeHeader(value) {
  return cleanCell(value).replace(/\s+/g, '').replace(/[：:]/g, '').toLowerCase();
}

function cleanCell(value) {
  if (value == null) return '';
  if (typeof value === 'object') return String(value.text || value.result || value.hyperlink || '').trim();
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
