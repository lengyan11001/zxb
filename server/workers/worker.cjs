const { Worker } = require('bullmq');
const { env } = require('../config/env.cjs');
const { logger } = require('../utils/logger.cjs');
const { connection } = require('./queues.cjs');
const enterprisesRepo = require('../repositories/enterprisesRepo.cjs');
const productsRepo = require('../repositories/productsRepo.cjs');
const scriptsRepo = require('../repositories/scriptsRepo.cjs');
const { collectEnterprise } = require('../services/collector.cjs');
const { generateScript } = require('../services/scriptEngine.cjs');

function startWorkers() {
  const collectWorker = new Worker('enterprise-collect', async (job) => {
    const { organizationId, enterpriseId } = job.data;
    const enterprise = await enterprisesRepo.getEnterprise(organizationId, enterpriseId);
    if (!enterprise) throw new Error(`Enterprise not found: ${enterpriseId}`);

    await enterprisesRepo.updateEnterprise(organizationId, enterpriseId, {
      collectionStatus: 'collecting',
      collectionProgress: 20,
    });

    const collected = await collectEnterprise(enterprise.name);
    await enterprisesRepo.updateEnterprise(organizationId, enterpriseId, {
      industry: collected.industry,
      scale: collected.scale,
      location: collected.location,
      contactPerson: collected.contact_person,
      phone: collected.phone,
      phoneStatus: collected.phone_status,
      signals: collected.signals,
      profile: collected.profile,
      timeline: collected.timeline,
      collectionStatus: 'completed',
      collectionProgress: 100,
    });
  }, { connection, concurrency: env.collectQueueConcurrency });

  const scriptWorker = new Worker('script-generate', async (job) => {
    const { organizationId, scriptId, enterpriseId, productId } = job.data;
    await scriptsRepo.markGenerating(scriptId);
    const enterprise = await enterprisesRepo.getEnterprise(organizationId, enterpriseId);
    const product = await productsRepo.getProduct(organizationId, productId);
    if (!enterprise || !product) throw new Error('Enterprise or product not found');

    try {
      const generated = await generateScript(product, {
        ...enterprise,
        contact_person: enterprise.contactPerson,
      });
      await scriptsRepo.completeScript(scriptId, generated);
      await enterprisesRepo.updateEnterprise(organizationId, enterpriseId, { activeProductId: productId });
    } catch (err) {
      await scriptsRepo.failScript(scriptId, err.message);
      throw err;
    }
  }, { connection, concurrency: env.scriptQueueConcurrency });

  for (const worker of [collectWorker, scriptWorker]) {
    worker.on('failed', (job, err) => logger.error({ jobId: job?.id, queue: worker.name, err }, 'Worker job failed'));
    worker.on('completed', (job) => logger.info({ jobId: job.id, queue: worker.name }, 'Worker job completed'));
  }

  return { collectWorker, scriptWorker };
}

if (require.main === module) {
  startWorkers();
  logger.info('Workers started');
}

module.exports = { startWorkers };
