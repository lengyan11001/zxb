const axios = require('axios');
const { env } = require('../config/env.cjs');

const SYSTEM_PROMPT = `你是B2B电话销售总监、科技金融顾问和企业服务顾问的合体。
规则：
1. 第一通电话只做开场、建立可信度、确认需求、预约下一步；
2. 不使用“打扰、方便、占用、免费评估、不过不收费、全程代办”等话术；
3. 每句话尽量短，口语化，避免IPO、资本化、闭环等虚词；
4. 必须引用企业画像中的具体线索；
5. 结尾必须使用二选一邀约；
6. 输出JSON：{"full":"完整话术","concise":"精简话术","opening":"前30秒开场","hookPoints":[],"keyClues":[],"objectionPrep":[],"structureRatio":{}}`;

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
  const signals = asArray(enterprise.signals);
  const profile = enterprise.profile || {};
  const userPrompt = `产品：${product.name}
产品价值：${product.core_value || product.coreValue || ''}
目标客户：${product.target_customer || product.targetCustomer || ''}
产品优势：${product.unique_advantage || product.uniqueAdvantage || ''}
客户痛点：${asArray(product.pain_points || product.painPoints).join('、')}
产品收益：${asArray(product.benefits).join('、')}
成功案例：${asArray(product.success_cases || product.successCases).slice(0, 3).join('；')}

企业：${enterprise.name}
行业：${enterprise.industry}
规模：${enterprise.scale}
地区：${enterprise.location}
联系人：${enterprise.contact_person || enterprise.contactPerson || profile.legalPerson || '负责人'}
工商状态：${profile.registrationStatus || '未知'}
经营范围：${profile.businessScope || ''}
信号：${signals.map((s) => `${s.label || s.type}：${s.evidence || s.description || ''}`).join('；')}

请生成第一通电话话术。`;

  const payload = {
    model: env.llmModel,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userPrompt },
    ],
    temperature: Math.min(1, 0.55 + variation * 0.08),
    response_format: { type: 'json_object' },
  };

  const res = await postChatWithRetry(payload);

  const content = parseModelContent(res.data);
  return normalizeScript(content, env.llmProvider);
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
  const benefit = asArray(product.benefits)[0] || '降低资金成本并提升政策申报成功率';
  const caseText = asArray(product.success_cases || product.successCases)[0] || '我们服务过同类型企业，通常先做材料诊断，再匹配融资或认定路径。';

  const opening = `${contact}您好，我是科技企业服务顾问。看到${enterprise.name}在${enterprise.industry || '企业服务'}方向有布局，想跟您确认一个政策和融资机会。`;
  const full = `${opening}

我不是随机打来的，看到的线索是：${clue}

像这类企业，常见问题不是没有条件，而是研发、知识产权、订单和银行材料没有放在一套逻辑里。${caseText}

我们这边的${productName}，核心是帮企业先判断条件，再看能不能拿到${benefit}。

我建议先约10分钟，把贵司目前材料和可走路径过一遍。您看明天上午，还是后天下午更合适？`;

  return normalizeScript({
    full,
    concise: `${contact}您好，看到${enterprise.name}有${enterprise.industry || '企业服务'}相关线索：${clue}。我们做${productName}，先帮企业判断认定和融资路径。明天上午或后天下午，哪个时间适合简单过一下？`,
    opening,
    hookPoints: [primary?.label || '企业画像切入', productName],
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
  return {
    full: content.full || content.fullScript || content.完整话术 || '',
    concise: content.concise || content.conciseScript || content.精简话术 || '',
    opening: content.opening || content.开场 || '',
    hookPoints: content.hookPoints || content.切入点 || [],
    keyClues: content.keyClues || content.线索 || [],
    objectionPrep: content.objectionPrep || content.异议预案 || [],
    structureRatio: content.structureRatio || { opening: 15, clue: 25, value: 35, invite: 25 },
    provider,
  };
}

module.exports = { generateScript };
