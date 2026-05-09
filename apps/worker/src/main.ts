import {
  initDatabase,
  REDIS_CONFIG,
  FLASH_SALE_QUEUE,
  SaleRepository,
  orderRedisRepo,
} from '@media-scra/shared';
import { Worker, Job } from 'bullmq';

initDatabase();
const saleRepository = new SaleRepository();

const worker = new Worker(
  FLASH_SALE_QUEUE,
  async (job: Job) => {
    const { userEmail, productId } = job.data;
    console.log(`[Worker] is processing User ${userEmail} - Product ${productId}`);
    try {
      const redisStatus = await orderRedisRepo.getOrderKey(productId, userEmail);
      if (!redisStatus) {
        return;
      }
      const existingOrder = await saleRepository.findByUserEmailAndProductId(userEmail, productId);
      if (existingOrder) {
        console.log(`[Worker] Order already exists for ${userEmail}, skipping...`);
        return;
      }
      const result = saleRepository.create({
        userEmail,
        productId,
        status: 'completed'
      });

      if (result.changes > 0) {
        console.log(`[Worker] success for User ${userEmail}`);
      }

    } catch (error: any) {

      console.error(`[Worker Error] failed for User ${userEmail}: ${error.message}`);
      throw error;
    }
  },
  {
    ...REDIS_CONFIG,
    concurrency: process.env['MAX_CONCURRENT_ORDERS']
      ? parseInt(process.env['MAX_CONCURRENT_ORDERS'])
      : 50,
    limiter: {
      max: 100,
      duration: 1000
    }
  }
);

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} successfully completed.`);
});

worker.on('failed', (job, err) => {
  console.error(`[Worker] Job ${job?.id} failed: ${err.message}`);
});

console.log('Flash Sale Worker is running and listening to the queue...');