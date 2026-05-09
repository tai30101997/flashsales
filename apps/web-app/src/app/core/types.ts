interface OrderDetail {
  userEmail: string;
  productId: string;
  status: string;
  createdAt: string;
}

interface SaleInfo {
  status: "UPCOMING" | "ONGOING" | "ENDED";
  remainingStock: number;
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