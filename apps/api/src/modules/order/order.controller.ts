// apps/api/src/modules/orders/order.controller.ts
import { Request, Response } from 'express';
import { OrderService } from './order.service';

export class OrderController {
  private orderServices: OrderService;
  constructor(options: { orderService: OrderService }) {
    this.orderServices = options.orderService;
  }

  syncProductCache = async (req: Request, res: Response) => {
    const { productId } = req.body;
    try {
      const result = await this.orderServices.syncProductCache({ productId });
      return res.status(200).json(result);
    } catch (error) {
      console.error('[OrderController Error]', error);
      return res.status(500).json({ success: false, message: 'Failed to sync product cache' });
    }
  }
  getUserOrder = async (req: Request, res: Response) => {
    const { userEmail, productId } = req.query as { userEmail: string; productId: string };
    try {
      const result = await this.orderServices.getUserOrder({ userEmail, productId });
      return res.status(200).json(result);
    } catch (error) {
      console.error('[OrderController Error]', error);
      return res.status(500).json({ success: false, message: 'Failed to get user order status' });
    }
  }
  getSalesStatus = async (req: Request, res: Response) => {
    const { productId } = req.query as { productId: string };
    try {
      const result = await this.orderServices.getSalesStatus({ productId });
      return res.status(200).json(result);
    } catch (error) {
      console.error('[OrderController Error]', error);
      return res.status(500).json({ success: false, message: 'Failed to get sales status' });
    }
  }
  getAllProducts = async (req: Request, res: Response) => {
    try {
      const result = await this.orderServices.findAllProducts();
      return res.status(200).json(result);
    } catch (error) {
      console.error('[OrderController Error]', error);
      return res.status(500).json({ success: false, message: 'Failed to retrieve products' });
    }
  }
  createOrder = async (req: Request, res: Response) => {
    const { userEmail, productId } = req.body;
    try {
      const result = await this.orderServices.processOrder({ userEmail, productId });
      if (!result.success) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result)
    } catch (error) {
      console.error('[OrderController Error]', error);
      return res.status(500).json({ success: false, message: 'Unexpected error occurred' });
    }
  }
}