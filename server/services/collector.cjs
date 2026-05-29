const { cleanPhone } = require('./phoneCleaner.cjs');

const INDUSTRY_RULES = [
  [['半导体', '集成电路', '芯片', '微电子', '晶圆', '电路', 'PCB'], '半导体/集成电路'],
  [['人工智能', 'AI', '智控', '算法', '机器视觉', '深度学习', '数智'], '人工智能'],
  [['生物', '医药', '医疗', '制药', '基因', '诊断', '医疗器械'], '生物医药'],
  [['新能源', '光伏', '储能', '锂电池', '氢能', '风电', '动力', '电池'], '新能源'],
  [['精密', '制造', '自动化', '机器人', '数控', '模具', '装备', '激光', '机电'], '智能制造'],
  [['通信', '5G', '物联网', 'IoT', '射频', '天线', '互联'], '通信/物联网'],
  [['新材料', '纳米', '碳纤维', '复合材料', '石墨烯'], '新材料'],
  [['社交', '婚恋', '交友', '脱单', '社区', '平台'], '互联网平台'],
  [['金融', '支付', '助贷', '征信', '风控'], '金融科技'],
  [['软件', '信息', '科技', '网络', '数据', '云计算', 'SaaS', '系统'], '软件/SaaS'],
];

const CITIES = ['深圳市南山区', '深圳市宝安区', '广州市天河区', '杭州市余杭区', '苏州市工业园区', '上海市浦东新区', '北京市海淀区', '成都市高新区', '武汉市东湖高新区', '东莞市松山湖'];
const SCALES = ['1-49人', '50-199人', '200-499人', '500-999人', '1000-4999人', '5000人以上'];
const SURNAMES = ['王', '李', '张', '刘', '陈', '杨', '赵', '黄', '周', '吴'];
const NAMES = ['总', '经理', '主任', '老板'];

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i += 1) hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  return Math.abs(hash);
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

function analyzeIndustry(name) {
  for (const [keywords, industry] of INDUSTRY_RULES) {
    if (keywords.some((keyword) => name.includes(keyword))) return industry;
  }
  return '科技服务';
}

function generatePhone(seed) {
  const prefixes = ['138', '139', '136', '137', '135', '150', '151', '152', '158', '159', '186', '187', '188'];
  return `${pick(seed, prefixes)}${String((seed * 9301 + 49297) % 100000000).padStart(8, '0')}`;
}

function buildSignals(seed, name, industry) {
  const patentCount = (seed % 27) + 3;
  const signals = [];

  if (['半导体/集成电路', '人工智能', '软件/SaaS', '生物医药', '新能源', '智能制造'].includes(industry)) {
    signals.push({
      type: 'gaoxin',
      label: '国高认定需求',
      description: '具备科技型企业认定线索',
      evidence: `${industry}企业，疑似拥有${patentCount}项知识产权，可进一步核验研发费用归集。`,
      confidence: 65 + (seed % 25),
    });
  }

  if (['半导体/集成电路', '智能制造', '新能源', '新材料', '生物医药'].includes(industry)) {
    signals.push({
      type: 'zhuanjing',
      label: '专精特新需求',
      description: '细分领域属性明显',
      evidence: `企业名称呈现${industry}方向，适合核验细分市场、营收和知识产权条件。`,
      confidence: 60 + (seed % 28),
    });
  }

  if (seed % 3 !== 0 || name.includes('动力') || name.includes('融资')) {
    signals.push({
      type: 'financing',
      label: '科技融资需求',
      description: '可能存在研发或扩张资金需求',
      evidence: `同类${industry}企业在研发投入、设备采购和订单扩张阶段常有流动资金需求。`,
      confidence: 58 + (seed % 30),
    });
  }

  return signals.length > 1
    ? [{ type: 'combined', label: '多信号组合', description: '存在多个可切入信号', evidence: signals.map((s) => s.label).join(' + '), confidence: Math.max(...signals.map((s) => s.confidence)) }, ...signals]
    : signals;
}

async function collectEnterprise(name) {
  const seed = hashString(name);
  const industry = analyzeIndustry(name);
  const rawPhone = generatePhone(seed);
  const phone = cleanPhone(rawPhone);
  const now = new Date();

  return {
    name,
    industry,
    scale: pick(seed + 3, SCALES),
    location: pick(seed + 7, CITIES),
    contact_person: `${pick(seed + 11, SURNAMES)}${pick(seed + 13, NAMES)}`,
    phone: phone.cleaned,
    phone_status: phone.status,
    signals: buildSignals(seed, name, industry),
    profile: {
      sourceMode: 'simulated-provider',
      dataQuality: 'demo-enriched',
      warnings: ['当前为模拟采集结果，接入正式数据源后会保留同一字段结构。'],
    },
    timeline: [
      { time: new Date(now.getTime() - 8 * 60_000).toISOString(), title: '创建采集任务', detail: `企业：${name}` },
      { time: new Date(now.getTime() - 6 * 60_000).toISOString(), title: '企业画像识别', detail: `识别行业为${industry}` },
      { time: new Date(now.getTime() - 4 * 60_000).toISOString(), title: '联系方式清洗', detail: phone.reason },
      { time: new Date(now.getTime() - 2 * 60_000).toISOString(), title: '需求信号识别', detail: '完成国高、专精特新、融资信号打分' },
    ],
  };
}

module.exports = { collectEnterprise, analyzeIndustry };
