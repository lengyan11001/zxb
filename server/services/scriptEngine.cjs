const axios = require('axios');
const { env } = require('../config/env.cjs');

const SYSTEM_PROMPT = `你是B2B电话销售总监、科技金融顾问和企业服务顾问的合体。
请按正式外呼标准生成第一通电话话术，只输出合法 JSON 对象，不要输出 Markdown。

质量标准：
1. full 为 380-700 个汉字，分成 4-6 个短段落，口语化，适合真人第一通电话照读；
2. opening 为前 30 秒开场，必须包含联系人称呼、企业名称或企业线索、产品价值；
3. full 必须引用企业画像里的具体线索，例如行业、经营范围、地区、工商状态、天眼查导入线索或需求信号；
4. full 必须讲清楚产品能解决什么问题，但不能承诺包过、保证融资、免费评估或全程代办；
5. 结尾必须是明确时间二选一邀约，例如“您看明天上午10点，还是后天下午3点，我和您过一遍材料清单？”；
6. 不使用“打扰、方便、占用、免费评估、不过不收费、全程代办、包过、保证通过、有没有需求、是否有需求”等话术；
7. hookPoints、keyClues、objectionPrep 各给 3-5 条。

输出 JSON Schema：
{"full":"完整话术","concise":"精简话术","opening":"前30秒开场","hookPoints":[],"keyClues":[],"objectionPrep":[],"structureRatio":{"opening":15,"clue":25,"value":35,"invite":25}}`;

function asArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function asTextArray(value) {
  return asArray(value)
    .map((item) => {
      if (item == null) return '';
      if (typeof item === 'string') return item;
      return item.evidence || item.description || item.label || item.name || JSON.stringify(item);
    })
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function compact(value, max = 800) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

async function generateScript(product, enterprise, variation = 0) {
  if (env.llmApiKey) {
    try {
      return await generateWithChatCompletions(product, enterprise, variation);
    } catch (err) {
      return { ...generateLocal(product, enterprise), provider: 'local-fallback', error: err.message };
    }
  }
  return generateLocal(product, enterprise);
}

async function generateWithChatCompletions(product, enterprise, variation) {
  let userPrompt = buildUserPrompt(product, enterprise);
  let lastIssues = [];
  let lastScript = null;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const payload = {
      model: env.llmModel,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      temperature: Math.min(0.9, 0.45 + variation * 0.06 + attempt * 0.04),
      response_format: { type: 'json_object' },
    };

    try {
      const res = await postChatWithRetry(payload);
      lastScript = normalizeScript(parseModelContent(res.data), env.llmProvider);
      lastIssues = validateGeneratedScript(lastScript, product, enterprise);
      if (!lastIssues.length) return lastScript;
    } catch (err) {
      lastIssues = [`返回不是合法JSON或接口异常：${err.message}`];
    }

    userPrompt = buildRepairPrompt(product, enterprise, lastScript, lastIssues);
  }

  throw new Error(`LLM output failed quality check: ${lastIssues.join('；')}`);
}

function buildUserPrompt(product, enterprise) {
  const signals = asArray(enterprise.signals).slice(0, 8);
  const profile = enterprise.profile || {};
  const payload = {
    product: {
      name: product.name,
      category: product.category,
      coreValue: product.core_value || product.coreValue || '',
      targetCustomer: product.target_customer || product.targetCustomer || '',
      uniqueAdvantage: product.unique_advantage || product.uniqueAdvantage || '',
      priceStrategy: product.price_strategy || product.priceStrategy || '',
      painPoints: asTextArray(product.pain_points || product.painPoints),
      benefits: asTextArray(product.benefits),
      successCases: asTextArray(product.success_cases || product.successCases).slice(0, 3),
    },
    enterprise: {
      name: enterprise.name,
      industry: enterprise.industry,
      scale: enterprise.scale,
      location: enterprise.location,
      contactPerson: enterprise.contact_person || enterprise.contactPerson || profile.legalPerson || '负责人',
      registrationStatus: profile.registrationStatus || '未知',
      businessScope: compact(profile.businessScope, 900),
      signals: signals.map((signal) => ({
        label: signal.label || signal.type || '',
        evidence: signal.evidence || signal.description || '',
        confidence: signal.confidence || undefined,
      })),
    },
  };

  return `请基于以下产品和天眼查/企查查导入的企业画像，生成第一通电话话术。
要求严格满足系统提示词里的质量标准。

${JSON.stringify(payload, null, 2)}`;
}

function buildRepairPrompt(product, enterprise, previousScript, issues) {
  return `${buildUserPrompt(product, enterprise)}

上一次输出未达标，问题如下：
${issues.map((issue, index) => `${index + 1}. ${issue}`).join('\n')}

上一次输出：
${JSON.stringify(previousScript || {}, null, 2)}

请重新输出完整 JSON。必须修复以上问题，尤其要补足完整话术长度，并用明确时间二选一邀约收尾。`;
}

async function postChatWithRetry(payload) {
  const delays = [1200, 2500, 5000];
  let lastError;
  for (let attempt = 0; attempt <= delays.length; attempt += 1) {
    try {
      return await axios.post(env.llmApiUrl, payload, {
        headers: {
          Authorization: `Bearer ${env.llmApiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: env.llmTimeoutMs,
      });
    } catch (err) {
      lastError = err;
      const status = err.response?.status;
      const retryable = status === 429 || status >= 500 || err.code === 'ECONNRESET' || err.code === 'ETIMEDOUT';
      if (!retryable || attempt === delays.length) break;
      await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
    }
  }
  throw lastError;
}

function parseModelContent(data) {
  const raw = data?.choices?.[0]?.message?.content || data?.choices?.[0]?.text || data?.output_text || '';
  if (typeof raw === 'object') return raw;
  const text = String(raw || '').trim().replace(/^```json\s*/i, '').replace(/```$/i, '').trim();
  return JSON.parse(text);
}

function generateLocal(product, enterprise) {
  const signals = asArray(enterprise.signals);
  const primary = signals[0];
  const profile = enterprise.profile || {};
  const contact = enterprise.contact_person || enterprise.contactPerson || profile.legalPerson || '负责人';
  const productName = product.name || '科技金融方案';
  const clue = primary?.evidence || profile.businessScope || `${enterprise.industry || '科技'}企业，具备进一步核验价值。`;
  const benefit = asTextArray(product.benefits)[0] || '降低资金成本并提升政策申报成功率';
  const pain = asTextArray(product.pain_points || product.painPoints)[0] || '研发、知识产权、合同和银行材料没有放在同一套逻辑里';
  const caseText = asTextArray(product.success_cases || product.successCases)[0] || '我们服务过同类型企业，通常先做材料诊断，再匹配融资或认定路径。';

  const opening = `${contact}您好，我是科技企业服务顾问。看到${enterprise.name}在${enterprise.industry || '企业服务'}方向有布局，想跟您确认一个政策和融资机会。`;
  const full = `${opening}

我先说明一下来意。我们不是泛泛推荐产品，而是先看企业画像。贵司目前能看到的线索是：${clue}

像这类企业，常见问题不是完全没有条件，而是${pain}。这些材料如果没有提前梳理，后面做国高认定、科技贷款或授信沟通时，就容易反复补材料，时间被拖长。

我们这边的${productName}，核心是帮企业先判断条件，再把研发费用、知识产权、经营数据和银行材料放到一张清单里。能走政策认定就先排路径，能匹配科技融资就提前看额度和材料缺口，目标是${benefit}。

${caseText} 所以我建议先做一次10分钟沟通，不直接推方案，先把贵司目前材料和可走路径过一遍。

您看明天上午10点，还是后天下午3点，我和您过一遍材料清单？`;

  return normalizeScript({
    full,
    concise: `${contact}您好，看到${enterprise.name}有${enterprise.industry || '企业服务'}相关线索：${clue}。我们做${productName}，先帮企业判断认定和融资路径。您看明天上午10点，还是后天下午3点，哪个时间适合过一下材料清单？`,
    opening,
    hookPoints: [primary?.label || '企业画像切入', productName, enterprise.industry || '企业行业线索'],
    keyClues: signals.slice(0, 3).map((s) => s.evidence || s.description || s.label).filter(Boolean),
    objectionPrep: [
      '已经有合作方：可以作为第二方案做交叉验证，不影响现有合作。',
      '暂时不需要：先判断条件和额度空间，企业有数后再决定。',
      '怕麻烦：前期只需要基础材料清单，先做10分钟诊断。',
    ],
    structureRatio: { opening: 15, clue: 25, value: 35, invite: 25 },
  }, 'local');
}

function normalizeScript(content, provider) {
  const source = content?.script || content?.result || content || {};
  return {
    full: String(readFirst(source, ['full', 'fullScript', '完整话术', '完整电话话术', '电话话术', '话术']) || '').trim(),
    concise: String(readFirst(source, ['concise', 'conciseScript', '精简话术', '摘要']) || '').trim(),
    opening: String(readFirst(source, ['opening', '开场', '前30秒开场']) || '').trim(),
    hookPoints: asTextArray(readFirst(source, ['hookPoints', 'hooks', '切入点'])),
    keyClues: asTextArray(readFirst(source, ['keyClues', 'clues', '线索', '企业线索'])),
    objectionPrep: asTextArray(readFirst(source, ['objectionPrep', 'objections', '异议预案', '异议处理'])),
    structureRatio: readFirst(source, ['structureRatio', '结构占比']) || { opening: 15, clue: 25, value: 35, invite: 25 },
    provider,
  };
}

function readFirst(source, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(source, key) && source[key] != null) return source[key];
  }
  return undefined;
}

function validateGeneratedScript(script, product, enterprise) {
  const issues = [];
  const full = String(script.full || '').trim();
  const opening = String(script.opening || '').trim();
  const cjkCount = countChinese(full);
  const bannedWords = ['打扰', '方便', '占用', '免费评估', '不过不收费', '全程代办', '包过', '保证通过', '有没有需求', '是否有需求'];

  if (cjkCount < 360) issues.push(`完整话术过短，当前约${cjkCount}个汉字，至少需要360个汉字`);
  if (cjkCount > 900) issues.push(`完整话术过长，当前约${cjkCount}个汉字，最多900个汉字`);
  if (!opening || countChinese(opening) < 35) issues.push('opening 过短或缺失');
  if (enterprise.name && !full.includes(enterprise.name)) issues.push('完整话术没有出现企业名称');
  if (!hasConcreteEnterpriseClue(full, enterprise)) issues.push('完整话术没有引用足够具体的企业画像线索');
  if (!hasTimeChoiceInvite(full)) issues.push('结尾不是明确时间二选一邀约');
  if (!mentionsProductValue(full, product)) issues.push('完整话术没有讲清楚产品价值或收益');

  for (const word of bannedWords) {
    if (full.includes(word) || opening.includes(word)) issues.push(`包含禁用话术：${word}`);
  }

  if (asTextArray(script.hookPoints).length < 3) issues.push('hookPoints 少于3条');
  if (asTextArray(script.keyClues).length < 3) issues.push('keyClues 少于3条');
  if (asTextArray(script.objectionPrep).length < 3) issues.push('objectionPrep 少于3条');

  return Array.from(new Set(issues));
}

function countChinese(text) {
  return (String(text || '').match(/[\u3400-\u9fff]/g) || []).length;
}

function hasConcreteEnterpriseClue(text, enterprise) {
  const profile = enterprise.profile || {};
  const signals = asArray(enterprise.signals);
  const candidates = [
    enterprise.industry,
    enterprise.scale,
    enterprise.location,
    profile.registrationStatus,
    ...extractTerms(profile.businessScope),
    ...signals.flatMap((signal) => [signal.label, signal.evidence, signal.description]),
  ];
  return candidates
    .map((item) => String(item || '').trim())
    .filter((item) => item.length >= 3)
    .some((item) => text.includes(item) || text.includes(item.slice(0, Math.min(8, item.length))));
}

function extractTerms(text) {
  return String(text || '')
    .split(/[，,；;、。\s（）()]+/)
    .map((term) => term.trim())
    .filter((term) => term.length >= 4)
    .slice(0, 12);
}

function hasTimeChoiceInvite(text) {
  const tail = String(text || '').slice(-120);
  const time = '(明天|后天|今天|周[一二三四五六日天]|星期[一二三四五六日天]|上午|下午|早上|晚上|\\d{1,2}点)';
  return new RegExp(`${time}[\\s\\S]{0,35}(还是|或者|或)[\\s\\S]{0,35}${time}`).test(tail);
}

function mentionsProductValue(text, product) {
  const candidates = [
    product.name,
    product.core_value || product.coreValue,
    ...asTextArray(product.benefits),
    ...asTextArray(product.pain_points || product.painPoints),
  ];
  return candidates
    .map((item) => String(item || '').trim())
    .filter((item) => item.length >= 3)
    .some((item) => text.includes(item) || text.includes(item.slice(0, Math.min(8, item.length))));
}

module.exports = { generateScript, validateGeneratedScript };
