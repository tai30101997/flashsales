import { REDIS_CONFIG, RedisClient, ResponseModel, TryPurchaseInput } from '@media-scra/shared';
import { Redis } from 'ioredis';

export class OrderRedisRepository extends RedisClient {
  private scriptSha: string = '';

  async init() {
    try {
      this.scriptSha = (await this.redis.script('LOAD', this.getLuaScript())) as string;
      console.log('[Redis] Lua script loaded:', this.scriptSha);
    } catch (error) {
      console.error('[Redis] Load script failed:', error);
      throw error;
    }
  }
  async getStockRedis(productId: string): Promise<number | null> {
    const stock = await this.redis.get(`product:{${productId}}:stock`);
    return stock !== null ? Number(stock) : null;
  }
  private getStockKey(productId: string) {
    return `product:{${productId}}:stock`;
  }
  async getOrderKey(productId: string, userEmail: string) {
    return `order:{${productId}}:${userEmail}`;
  }
  async initProductCache(productId: string, stock: number) {
    const pipeline = this.redis.pipeline();
    pipeline.set(`product:{${productId}}:stock`, stock, 'EX', 3600);
    pipeline.del(`product:{${productId}}:bought_users`);
    await pipeline.exec();
    console.log(`[Redis] Init product ${productId} stock=${stock}`);
  }

  async tryPurchase(input: TryPurchaseInput): Promise<ResponseModel<any>> {
    const rs = new ResponseModel<any>();

    const stockKey = `product:{${input.productId}}:stock`;
    const boughtKey = `product:{${input.productId}}:bought_users`;
    const orderKey = `order:{${input.productId}}:${input.userEmail}`;

    const currentTime = Date.now();
    const startTime = new Date(input.start_time).getTime();
    const endTime = new Date(input.end_time).getTime();

    try {
      const result = await this.redis.evalsha(
        this.scriptSha,
        3,
        stockKey,
        boughtKey,
        orderKey,
        input.userEmail,
        currentTime,
        startTime,
        endTime
      );

      const [status, data] = result as [number, string];

      if (status === 1) {
        rs.success = true;
        rs.message = 'PURCHASE_SUCCESS';
        rs.data = { remainingStock: Number(data) };
      } else {
        rs.success = false;
        rs.message = data;
      }
    } catch (error: any) {
      if (error.message.includes('NOSCRIPT')) {
        await this.init();
        return this.tryPurchase(input);
      }
      rs.success = false;
      rs.message = 'REDIS_ERROR';
      console.error('[Redis Lua Error]', error.message);
    }
    return rs;
  }

  private getLuaScript(): string {
    return `
    local stockKey, boughtKey, orderKey = KEYS[1], KEYS[2], KEYS[3]
    local userEmail = ARGV[1]
    local currentTime = tonumber(ARGV[2])
    local startTime = tonumber(ARGV[3])
    local endTime = tonumber(ARGV[4])
    if currentTime < startTime then 
      return {0, 'SALE_NOT_STARTED'} 
    end
    if currentTime > endTime then 
      return {0, 'SALE_ENDED'} 
    end
    local existingOrder = redis.call('GET', orderKey)
    if existingOrder then 
      return {0, 'ORDER_IN_PROGRESS_OR_COMPLETED'} 
    end
    if redis.call('SISMEMBER', boughtKey, userEmail) == 1 then 
      return {0, 'ALREADY_PURCHASED'} 
    end
    local stock = tonumber(redis.call('GET', stockKey))
    if not stock then 
      return {0, 'INVALID_STOCK'} 
    end
    if stock <= 0 then 
      return {0, 'OUT_OF_STOCK'} 
    end
    local newStock = redis.call('DECR', stockKey)
    redis.call('SADD', boughtKey, userEmail)
    redis.call('SET', orderKey, 'PROCESSING', 'EX', 86400)
    if redis.call('TTL', boughtKey) < 0 then 
      redis.call('EXPIRE', boughtKey, 86400) 
    end
    return {1, tostring(newStock)}
  `;
  }
}
const redisInstance = new Redis(REDIS_CONFIG.connection);

export const orderRedisRepo = new OrderRedisRepository(redisInstance);