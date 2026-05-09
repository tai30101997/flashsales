import { OrderRedisRepository, SaleRepository, PROCESS_ORDER_JOB, RedisClient, ResponseModel, Product, GetAllProductsResponse, ProductInfo } from "@media-scra/shared";
import { Queue } from "bullmq";
import { isNil } from 'lodash';
import { IOrderServiceOptions, IOrderService, CreateOrderResponse, CreateOrderInput, GetSalesStatusResponse, GetUserOrderStatusResponse, GetUserOrderInput, GetSalesStatusInput, SyncProductCacheInput } from "./types";

export class OrderService implements IOrderService {
  private queueService: Queue;
  private orderRedisRepo: OrderRedisRepository;
  private saleRepository: SaleRepository;
  constructor(options: IOrderServiceOptions) {
    if (!options.orderRedisRepository) {
      throw new Error("Flash sale Redis repository is required");
    }
    if (!options.saleRepository) {
      throw new Error("Order repository is required");
    }
    if (!options.queueService) {
      throw new Error("Queue service is required");
    }
    this.orderRedisRepo = options.orderRedisRepository;
    this.saleRepository = options.saleRepository;
    this.queueService = options.queueService;
  }
  async syncProductCache(input: SyncProductCacheInput): Promise<ResponseModel<any>> {
    const rs = new ResponseModel<any>();
    rs.success = false;
    rs.message = 'Failed to sync product cache';
    try {
      const productExists = await this.saleRepository.findByProductId(input.productId);
      console.log(productExists);
      if (isNil(productExists)) {
        console.log(`[OrderService] Product ${input.productId} not  exists in DB, skipping cache init`);
        rs.success = false;
        rs.message = 'Product not exists in DB';
        return rs;
      }
      const existingStock = productExists.stock ?? 0;
      await this.orderRedisRepo.initProductCache(input.productId, existingStock);
      console.log(`[OrderService] Cache for product ${input.productId} with stock ${existingStock}`);
      rs.success = true;
      rs.message = 'Product cache successfully initialized';

    } catch (error) {
      console.error(`[OrderService] Sync product cache failed for product ${input.productId}:`, error);
      throw error;
    }

    return rs;
  }
  async processOrder(input: CreateOrderInput): Promise<ResponseModel<CreateOrderResponse>> {
    let rs = new ResponseModel<CreateOrderResponse>();
    rs.success = false;
    rs.message = 'Order failed';

    try {
      const product = await this.saleRepository.findByProductId(input.productId);
      if (!product) {
        rs.success = false;
        rs.message = 'PRODUCT_NOT_FOUND';
        return rs;
      }
      const now = new Date();
      const startTime = new Date(product.start_time);
      const endTime = new Date(product.end_time);

      if (now < startTime) {
        rs.success = false;
        rs.message = 'FLASH_SALE_NOT_STARTED';
        return rs;
      }

      if (now > endTime) {
        rs.success = false;
        rs.message = 'FLASH_SALE_ENDED';
        return rs;
      }

      const redisResult = await this.orderRedisRepo.tryPurchase({
        productId: input.productId,
        userEmail: input.userEmail,
        start_time: product.start_time,
        end_time: product.end_time
      });
      if (!redisResult.success) {
        return redisResult;
      }
      await this.queueService.add(PROCESS_ORDER_JOB, { userEmail: input.userEmail, productId: input.productId }, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: true,
        removeOnFail: true, // or keep failed for debugging
      });
      rs.message = 'Order is being processed';
      rs.success = true;
    } catch (error) {
      console.error('[OrderService] Redis error:', error);
      rs.message = 'SYSTEM_ERROR';
    }
    console.log(`Order placed by ${input.userEmail} for product ${input.productId}`);
    return rs;
  }
  async getUserOrder(input: GetUserOrderInput): Promise<ResponseModel<GetUserOrderStatusResponse>> {
    const rs = new ResponseModel<GetUserOrderStatusResponse>();
    rs.success = false;
    rs.message = 'Order not found';
    try {
      const order = await this.saleRepository.findByUserEmailAndProductId(input.userEmail, input.productId);
      if (!order) {
        return rs;
      }
      rs.success = true;
      rs.message = 'Order found';
      rs.data = order;
    } catch (error) {
      console.error('[OrderService] Get user order error:', error);
      rs.message = error instanceof Error ? error.message : 'Unknown error';
    }
    return rs;
  }
  async findAllProducts(): Promise<ResponseModel<GetAllProductsResponse>> {
    const rs = new ResponseModel<GetAllProductsResponse>();
    rs.success = false;
    rs.message = 'Failed to retrieve products';
    let productInfos: ProductInfo[] = [];
    try {
      const products = await this.saleRepository.findAllProducts();

      rs.success = true;
      rs.message = 'Products retrieved successfully';
      for (const p of products) {
        const redisStock = await this.orderRedisRepo.getStockRedis(p.product_id);
        const now = new Date();
        const start = new Date(p.start_time);
        const end = new Date(p.end_time);
        let status: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';
        if (now < start) {
          status = 'upcoming';
        } else if (now > end) {
          status = 'ended';
        } else {
          status = 'ongoing';
        }
        productInfos.push({
          productId: p.product_id,
          name: p.name,
          price: p.price,
          description: p.description,
          image_url: p.image_url,
          start_time: p.start_time,
          end_time: p.end_time,
          remainingStock: redisStock ?? p.stock,
          status: status
        });
      }
      rs.data = {
        products: productInfos
      };

    } catch (error) {
      console.error('[OrderService] Find all products error:', error);
      rs.message = error instanceof Error ? error.message : 'Unknown error';
    }
    return rs;
  }
  async getSalesStatus(input: GetSalesStatusInput): Promise<ResponseModel<GetSalesStatusResponse>> {
    const rs = new ResponseModel<GetSalesStatusResponse>();
    rs.success = false;
    rs.message = 'Product not be in flash sale';
    try {

      const product = await this.saleRepository.findByProductId(input.productId);
      if (!product) {
        rs.message = 'Product not found';
        return rs
      }
      const now = new Date();
      const start = new Date(product.start_time);
      const end = new Date(product.end_time);
      const stock = await this.orderRedisRepo.getStockRedis(input.productId);

      if (now < start) {
        rs.success = true;
        rs.message = 'Flash sale has not started';
        rs.data = { remainingStock: 0, status: 'upcoming' };
        return rs;
      }
      if (now > end || (stock !== null && stock <= 0)) {
        rs.success = true;
        rs.message = 'Flash sale has ended';
        rs.data = { remainingStock: 0, status: 'ended' };
        return rs;
      }
      rs.success = true;
      rs.message = 'Success';
      rs.data = { remainingStock: stock ?? 0, status: 'ongoing' };
    } catch (error) {
      console.error('[OrderService] Get sales status error:', error);
      rs.message = error instanceof Error ? error.message : 'Unknown error';
    }
    return rs
  }
}