import { Queue } from 'bullmq';
import { REDIS_CONFIG, FLASH_SALE_QUEUE } from '@media-scra/shared';

export const FlashSaleQueue = new Queue(FLASH_SALE_QUEUE, REDIS_CONFIG);