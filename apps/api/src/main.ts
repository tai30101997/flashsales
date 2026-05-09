import express from 'express';
import * as path from 'path';
import cors from 'cors';
import { Redis } from 'ioredis';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';

import {
  initDatabase,
  FlashSaleQueue,
  orderRedisRepo,
} from '@media-scra/shared';

import testRouter from './modules/test/test.routes';
import orderRouter from './modules/order/order.routes';

async function initServer() {
  const app = express();
  const port = process.env.PORT || 3333;

  // 1. Setup Bull Board 
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  createBullBoard({
    queues: [new BullMQAdapter(FlashSaleQueue)],
    serverAdapter: serverAdapter,
  });

  // 2. Middlewares
  app.use(express.json({ limit: '10mb' }));
  app.use(cors());
  app.use('/assets', express.static(path.join(__dirname, 'assets')));
  try {
    // init (SQLite)
    await initDatabase();
    console.log('SQLite Database initialized');
    await orderRedisRepo.init();
    // 5. Routes
    app.get('/api', (req, res) => {
      res.send({ message: 'Welcome to Flash Sale API!' });
    });
    app.set('trust proxy', 1);
    app.use('/admin/queues', serverAdapter.getRouter());
    app.use('/api/test', testRouter);
    app.use('/api/orders', orderRouter);

    const server = app.listen(port, () => {
      console.log(`Listening at http://localhost:${port}/api`);
      console.log(`BullBoard at http://localhost:${port}/admin/queues`);
    });

    server.on('error', (err) => {
      console.error('Server Error:', err);
    });

  } catch (error) {
    console.error(' Failed to initialize server:', error);
    process.exit(1); // Exit with failure code
  }
}

initServer();