import { db, Order, Product } from "@media-scra/shared";

export class SaleRepository {

  private get insertOrderStmt() {
    return db.prepare(`
      INSERT INTO orders (user_email, product_id, status) 
      VALUES (@userEmail, @productId, @status)
    `);
  }

  private get updateStockStmt() {
    return db.prepare(`
      UPDATE products 
      SET stock = stock - 1 
      WHERE product_id = ? AND stock > 0
    `);
  }

  private get selectProductStmt() {
    return db.prepare('SELECT * FROM products WHERE product_id = ?');
  }

  private get selectOrderStmt() {
    return db.prepare('SELECT * FROM orders WHERE user_email = ?');
  }

  private get selectOrderDualStmt() {
    return db.prepare('SELECT * FROM orders WHERE user_email = ? AND product_id = ?');
  }

  private get countOrdersStmt() {
    return db.prepare('SELECT COUNT(*) as total FROM orders');
  }

  private get findAllProductsStmt() {
    return db.prepare('SELECT * FROM products');
  }


  create(order: Order) {
    const executeTransaction = db.transaction((orderData: Order) => {
      const stockResult = this.updateStockStmt.run(orderData.productId);

      if (stockResult.changes === 0) {
        throw new Error(`OUT_OF_STOCK_OR_INVALID_PRODUCT: ${orderData.productId}`);
      }

      return this.insertOrderStmt.run({
        userEmail: orderData.userEmail,
        productId: orderData.productId,
        status: orderData.status || 'completed'
      });
    });

    return executeTransaction(order);
  }

  async findByUserEmail(userEmail: string): Promise<Order | null> {
    return (this.selectOrderStmt.get(userEmail) as Order) ?? null;
  }

  async findByUserEmailAndProductId(userEmail: string, productId: string): Promise<Order | null> {
    return (this.selectOrderDualStmt.get(userEmail, productId) as Order) ?? null;
  }

  async findByProductId(productId: string): Promise<Product | null> {
    return (this.selectProductStmt.get(productId) as Product) ?? null;
  }

  async findAllProducts(): Promise<Product[]> {
    return this.findAllProductsStmt.all() as Product[];
  }

  async countTotal(): Promise<number> {
    const result = this.countOrdersStmt.get() as { total: number };
    return result?.total ?? 0;
  }
}