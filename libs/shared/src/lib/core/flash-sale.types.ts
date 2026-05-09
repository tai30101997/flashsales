export interface FlashSaleProduct {
  id: string;
  name: string;
  price: number;
  description: string;
  stock: number;
}

export class Order {
  id?: number;
  userEmail: string = '';
  productId: string = '';
  status: 'pending' | 'completed' | 'failed' = 'pending';
  createdAt?: string;
}
export class Product {
  id: string = '';
  name: string = '';
  product_id: string = '';
  price: number = 0;
  description: string = '';
  image_url: string = '';
  stock: number = 0;
  start_time: string = '';
  end_time: string = '';
}
export class ProductInfo {
  productId: string = '';
  name: string = '';
  price: number = 0;
  description: string = '';
  start_time: string = '';
  end_time: string = '';
  image_url: string = '';
  status: 'upcoming' | 'ongoing' | 'ended' = 'upcoming';
  remainingStock: number = 0;
}
export class GetAllProductsResponse {
  products: ProductInfo[] = [];
}
export interface PurchaseResponse {
  orderId?: string;
}
export class TryPurchaseInput {
  productId: string = '';
  userEmail: string = '';
  start_time: string = '';
  end_time: string = '';
}