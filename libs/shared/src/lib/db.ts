import * as dotenv from 'dotenv';
import Database, { Database as DatabaseType } from 'better-sqlite3';
import { getSeedProducts } from './core/constants';
dotenv.config();

export const db: DatabaseType = new Database(process.env['DB_PATH'] || 'sale.db');

export function initDatabase() {
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT, 
      product_id TEXT NOT NULL UNIQUE,     
      name TEXT NOT NULL,
      stock INTEGER NOT NULL DEFAULT 0,
      price REAL DEFAULT 0,
      status TEXT DEFAULT 'active',
      start_time DATETIME,
      image_url TEXT,
      end_time DATETIME,
      updated_at DATETIME DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,    
      product_id TEXT NOT NULL,             
      status TEXT DEFAULT 'completed' CHECK(status IN ('pending', 'completed', 'failed')),
      created_at DATETIME DEFAULT (STRFTIME('%Y-%m-%d %H:%M:%f', 'NOW')),
      FOREIGN KEY (product_id) REFERENCES products(product_id)
    );

    CREATE INDEX IF NOT EXISTS idx_orders_user_email ON orders(user_email);
    CREATE INDEX IF NOT EXISTS idx_orders_product_id ON orders(product_id);
    CREATE INDEX IF NOT EXISTS idx_products_product_id ON products(product_id);
  `);

  console.log('SQLite Tables Initialized (Normalized Structure)');

  seedData();
}

function seedData() {
  const row = db.prepare('SELECT COUNT(*) as count FROM products').get() as { count: number };

  if (row.count === 0) {
    const productsToInsert = getSeedProducts();
    const insert = db.prepare(`
      INSERT INTO products (product_id, name, stock, price, start_time, end_time, image_url) 
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const insertMany = db.transaction((products) => {
      for (const p of products) {
        insert.run(p.productId, p.name, p.stock, p.price, p.startTime, p.endTime, p.imageUrl);
      }
    });

    insertMany(productsToInsert);
    console.log(`Seeded products with String IDs for Redis compatibility`);
  }
}