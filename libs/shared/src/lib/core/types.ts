import * as dotenv from 'dotenv';
dotenv.config();
export type Optional<T> = T | undefined;
export type Nullable<T> = T | null;

export const FLASH_SALE_QUEUE = 'flash-sale';
export const QUEUE_NAME = 'flashSale';
export const PROCESS_ORDER_JOB = 'processOrder';
export type ValidationLocation = 'body' | 'query' | 'params';

export const REDIS_CONFIG = {
  connection: {
    host: process.env['REDIS_HOST'] || 'localhost',
    port: Number(process.env['REDIS_PORT']) || 6379,
    maxRetriesPerRequest: null,
    lazyConnect: true,

  }
};


export class ErrorInfo {
  errorCode: string = '';
  errorMessage: string = '';
  item?: any;
}

export class ResponseModel<T> {
  success: boolean = false;
  message: Nullable<string> = null;
  data?: Nullable<T> = null;
  errors: ErrorInfo[] = [];
}
export interface IRedisClient {
}
