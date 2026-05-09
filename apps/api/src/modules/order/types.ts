import { OrderRedisRepository, SaleRepository, ResponseModel, } from "@media-scra/shared";
import { Queue } from "bullmq";

export interface IOrderService {
  processOrder(input: CreateOrderInput): Promise<ResponseModel<any>>;
  getUserOrder(input: GetUserOrderInput): Promise<ResponseModel<GetUserOrderStatusResponse>>;
  getSalesStatus(input: GetSalesStatusInput): Promise<ResponseModel<GetSalesStatusResponse>>;
  syncProductCache(input: SyncProductCacheInput): Promise<ResponseModel<any>>;
}

export interface IOrderServiceOptions {
  orderRedisRepository: OrderRedisRepository;
  saleRepository: SaleRepository;
  queueService: Queue;
}

export class CreateOrderResponse {
}
export class CreateOrderInput {
  productId: string = '';
  userEmail: string = '';
};
export class GetSalesStatusResponse {
  remainingStock: number = 0;
  status: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';
}
export class GetUserOrderStatusResponse {

}
export class GetSalesStatusInput {
  productId: string = '';
}
export class GetUserOrderInput {
  userEmail: string = '';
  productId: string = '';
}
export class SyncProductCacheInput {
  productId: string = '';
}