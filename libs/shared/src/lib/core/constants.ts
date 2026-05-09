// core/constants.ts
import * as dotenv from 'dotenv';

dotenv.config();
export const SALE_DURATION_MS = (Number(process.env['SALE_DURATION_MINUTES']) || 30) * 60 * 1000;
export const SECOND_SALE_DELAY_MS = 5 * 60 * 1000;
export const getSeedProducts = () => {
  const currentTime = Date.now();
  return [
    {
      productId: 'iphone-15',
      name: 'Iphone 15 Pro Max Flash Sale',
      stock: 1000,
      price: 1500,
      imageUrl: 'https://cdn2.cellphones.com.vn/insecure/rs:fill:0:358/q:90/plain/https://cellphones.com.vn/media/catalog/product/i/p/iphone-15-plus_1__1.png',
      startTime: new Date(currentTime).toISOString(),
      endTime: new Date(currentTime + SALE_DURATION_MS).toISOString()
    },
    {
      productId: 'macbook-m3',
      name: 'Macbook Air M3',
      stock: 500,
      price: 2000,
      imageUrl: 'https://store.storeimages.cdn-apple.com/1/as-images.apple.com/is/macbook-air-size-unselect-202601-gallery-1_FMT_WHH?wid=690&hei=720&fmt=p-jpg&qlt=80&.v=YTFkSnBPS2tMZFdhaFNRRkx6VnJZaUd4WmthcldkemtncUgvMzhXenFEVndhQ3N1TEt4d0ZKdVZUQ3ZrNzhjK3cxNEx1QmdlVkdRQUhOMXl2K3pkY3dBb0pjWml6bllCL0Y5a1RKc2gxZjlFM2V1RWVXTHBHVzUxMVFmU1Z0Y2ZNdFgzTjZuSWt6SW96N2hDL1hWZkxR&traceId=1',
      startTime: new Date(currentTime + SECOND_SALE_DELAY_MS).toISOString(),
      endTime: new Date(currentTime + SECOND_SALE_DELAY_MS + SALE_DURATION_MS).toISOString()
    }
  ];
};