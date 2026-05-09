import { FlashSaleQueue, REDIS_CONFIG, SaleRepository, orderRedisRepo, } from '@media-scra/shared';
import { Router } from 'express';
import { validate } from '../../middlewares/validate.middleware';
import { OrderController } from './order.controller';
import { CreateOrderSchema } from './order.schema';
import { OrderService } from './order.service';
import { Redis } from 'ioredis';
import { ipRateLimit } from '../../middlewares/ratelimit.middleware';

const orderRepo = new SaleRepository();
const orderService = new OrderService({
  orderRedisRepository: orderRedisRepo,
  saleRepository: orderRepo,
  queueService: FlashSaleQueue,
});
const orderController = new OrderController({ orderService });
const orderRouter = Router();
const redisInstance = new Redis(REDIS_CONFIG.connection);

orderRouter.post(
  '/purchase',
  // ipRateLimit(redisInstance),
  validate(CreateOrderSchema),
  (req, res) => orderController.createOrder(req, res)
);
orderRouter.post(
  '/sync-cache',
  // ipRateLimit(redisInstance),
  (req, res) => orderController.syncProductCache(req, res)
);
orderRouter.get(
  '/status',
  // ipRateLimit(redisInstance),
  (req, res) => orderController.getSalesStatus(req, res)
);
orderRouter.get(
  '/user-order',
  // ipRateLimit(redisInstance),
  (req, res) => orderController.getUserOrder(req, res)
);
orderRouter.get(
  '/products',
  // ipRateLimit(redisInstance),
  (req, res) => orderController.getAllProducts(req, res)
);

export default orderRouter;