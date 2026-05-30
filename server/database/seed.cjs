const bcrypt = require('bcryptjs');
const { withTransaction, pool } = require('./pool.cjs');
const { env } = require('../config/env.cjs');
const { logger } = require('../utils/logger.cjs');

const products = [
  {
    name: '国高认定+科技融资',
    category: '认定+融资',
    description: '国家高新技术企业认定辅导与科技贷款融资组合方案。',
    core_value: '先帮助企业建立国高认定材料基础，再匹配低成本科技金融授信。',
    target_customer: '有研发投入、专利或软著，年营收500万以上的科技型中小企业。',
    unique_advantage: '认定规划、研发费用归集、银行授信材料统一梳理，降低企业沟通成本。',
    price_strategy: '电话首触不谈价格，面谈阶段按服务范围报价。',
    success_cases: [
      '深圳某AI企业完成国高认定规划后，获得500万科技信用贷款。',
      '东莞某智能制造企业梳理研发费用后，成功取得银行授信。',
    ],
    pain_points: ['研发费用归集不规范', '认定材料准备周期长', '银行不理解轻资产科技企业'],
    benefits: ['企业所得税优惠', '科技贷款授信', '政府项目申报加分'],
  },
  {
    name: '专精特新成长贷',
    category: '认定+融资',
    description: '面向细分领域中小企业的专精特新认定与成长资金方案。',
    core_value: '围绕细分市场、创新能力和经营质量，建立认定与融资双路径。',
    target_customer: '细分行业深耕3年以上、有核心知识产权或稳定订单的制造/科技企业。',
    unique_advantage: '结合认定条件和订单/应收账款，为企业准备更贴近银行风控的材料。',
    price_strategy: '电话只约诊断，不报价。',
    success_cases: [
      '苏州某精密制造企业通过专精特新材料预审后，获得800万授信。',
      '杭州某芯片企业完成专精特新申报辅导后，取得园区政策支持。',
    ],
    pain_points: ['不知道是否符合认定', '订单增长但现金流紧张', '缺少政策材料经验'],
    benefits: ['政策补贴机会', '银行专属授信通道', '提升客户和供应链信任'],
  },
  {
    name: '知识产权质押贷',
    category: '融资',
    description: '将专利、软著等知识产权转化为银行授信依据。',
    core_value: '让轻资产科技企业的专利和软著成为可评估、可融资的资产。',
    target_customer: '拥有有效专利、软著或商标，缺少传统抵押物的科技企业。',
    unique_advantage: '把知识产权评估、质押登记和银行授信材料整合处理。',
    price_strategy: '电话阶段只确认资产和融资规划。',
    success_cases: [
      '武汉某新材料企业以专利组合获得1200万融资额度。',
      '深圳某软件企业以软著和订单流水完成信用增信。',
    ],
    pain_points: ['专利躺在账上不能变现', '不知道能贷多少', '质押流程复杂'],
    benefits: ['无需固定资产抵押', '盘活知识产权', '补充研发资金'],
  },
];

const dataSources = [
  ['tianyancha', '天眼查开放平台', '工商、股东、变更、知识产权等企业画像数据。'],
  ['qichacha', '企查查开放平台', '工商、风险、经营信息等企业数据。'],
  ['aiqicha', '爱企查/公开搜索', '公开工商信息、企业联系方式和网站线索。'],
  ['cnipa', '国家知识产权局', '专利、商标、软著等知识产权数据。'],
  ['news', '新闻舆情', '融资新闻、招投标、政府项目等动态信号。'],
];

async function seed() {
  await withTransaction(async (client) => {
    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug)
       VALUES ($1, $2)
       ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, updated_at = now()
       RETURNING id`,
      ['企业智能情报系统', 'default']
    );
    const organizationId = orgResult.rows[0].id;

    const passwordHash = await bcrypt.hash(env.adminPassword, 12);
    const userResult = await client.query(
      `INSERT INTO users (organization_id, email, password_hash, name, role)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, email)
       DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role, status = 'active', updated_at = now()
       RETURNING id`,
      [organizationId, env.adminEmail, passwordHash, '系统管理员', 'admin']
    );
    const adminId = userResult.rows[0].id;

    const demoUsers = [
      ['manager@zxb.local', '运营主管', 'manager', process.env.MANAGER_PASSWORD || 'manager2026'],
      ['sdr@zxb.local', '销售一号', 'sdr', process.env.SDR_PASSWORD || 'sdr2026'],
    ];

    for (const [email, name, role, password] of demoUsers) {
      const hash = await bcrypt.hash(password, 12);
      await client.query(
        `INSERT INTO users (organization_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (organization_id, email)
         DO UPDATE SET password_hash = EXCLUDED.password_hash, name = EXCLUDED.name, role = EXCLUDED.role, status = 'active', updated_at = now()`,
        [organizationId, email, hash, name, role]
      );
    }

    for (const product of products) {
      await client.query(
        `INSERT INTO products (
          organization_id, name, category, description, core_value, target_customer,
          unique_advantage, price_strategy, success_cases, pain_points, benefits, created_by
        )
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING`,
        [
          organizationId,
          product.name,
          product.category,
          product.description,
          product.core_value,
          product.target_customer,
          product.unique_advantage,
          product.price_strategy,
          JSON.stringify(product.success_cases),
          JSON.stringify(product.pain_points),
          JSON.stringify(product.benefits),
          adminId,
        ]
      );
    }

    for (const [key, name, description] of dataSources) {
      await client.query(
        `INSERT INTO data_sources (organization_id, key, name, description)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (organization_id, key)
         DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()`,
        [organizationId, key, name, description]
      );
    }
  });
}

if (require.main === module) {
  seed()
    .then(async () => {
      logger.info('Seed data complete');
      await pool.end();
    })
    .catch(async (err) => {
      logger.error({ err }, 'Seed data failed');
      await pool.end();
      process.exit(1);
    });
}

module.exports = { seed };
