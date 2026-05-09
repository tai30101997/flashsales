import { Router, Request, Response } from 'express';
import { Queue } from 'bullmq';
import { REDIS_CONFIG, db } from '@media-scra/shared';

// const scrapeQueue = new Queue(SCRAPE_QUEUE, REDIS_CONFIG);
const testRouter = Router();

testRouter.post('/load-test', async (req: Request, res: Response) => {
  // try {
  //   const total = 5000;
  //   const chunkSize = 1000;
  //   const testUrl = 'https://test.com';
  //   const testName = 'System Load Test';
  //   const status = 'active';

  //   // 1. Prepare statements (Optimization for SQLite)
  //   const insertSite = db.prepare(`
  //     INSERT OR IGNORE INTO sites (url, name, status)
  //     VALUES (?, ?, ?)
  //   `);
  //   const getSiteId = db.prepare(`SELECT id FROM sites WHERE url = ?`);

  //   // 2. Execute Get-or-Create logic
  //   // We only need 2 parameters: url and name
  //   insertSite.run(testUrl, testName, status);

  //   // Always fetch the ID, whether it was just created or already existed
  //   const siteRecord = getSiteId.get(testUrl) as { id: number };
  //   const currentSiteId = siteRecord.id;

  //   const links: string[] = [];
  //   for (let i = 1; i <= 100; i++) {
  //     if (i % 3 === 0) links.push(`https://www.24h.com.vn/?v=${i}`);
  //     else if (i % 3 === 1) links.push(`https://znews.vn/page${i}.html`);
  //     else links.push(`https://www.freepik.com/search?query=number-${i}`);
  //   }

  //   for (let i = 0; i < total; i += chunkSize) {
  //     const batch = [];
  //     for (let j = 0; j < chunkSize && (i + j) < total; j++) {
  //       const index = i + j;
  //       batch.push({
  //         name: 'scrape-task',
  //         data: {
  //           url: links[index % links.length],
  //           siteId: currentSiteId
  //         },
  //         opts: {
  //           attempts: 1,
  //           removeOnComplete: true,
  //           removeOnFail: true,
  //         }
  //       });
  //     }
  //     // Add 1000 jobs in one Redis command 
  //     await scrapeQueue.addBulk(batch);
  //   }

  //   return res.status(200).json({
  //     success: true,
  //     siteId: currentSiteId,
  //     message: `Successfully enqueued ${total} jobs`
  //   });
  // } catch (err) {
  //   console.error("Load test failed:", err);
  //   return res.status(500).json({ error: err.message });
  // }
});

testRouter.get('/stats', async (req: Request, res: Response) => {
  // try {
  //   const counts = await scrapeQueue.getJobCounts();

  //   const total = counts.waiting + counts.active + counts.completed + counts.failed;

  //   return res.json({
  //     waiting: counts.waiting,
  //     active: counts.active,
  //     completed: counts.completed,
  //     failed: counts.failed,
  //     total: total
  //   });
  // } catch (err) {
  //   return res.status(500).json({ error: err.message });
  // }
});

export default testRouter;