# Flash Sale System — Critical Architecture Analysis

## Table of Contents
1. [System Overview](#system-overview)
2. [Strengths (What's Done Well)](#strengths)
3. [Potential Issues & Risks](#potential-issues--risks)
4. [Scalability Assessment](#scalability-assessment)
5. [Recommendations](#recommendations)

---

## System Overview

This is a **dual-writer flash sale system** with the following flow:

```
Client → API (Express) → Redis (Lua: atomic stock check + decrement) → BullMQ → Worker → SQLite (persistence)
```

**Components:**
- **API** (`apps/api`): Express server, handles purchase requests, syncs cache, checks sale windows
- **Worker** (`apps/worker`): BullMQ consumer that persists orders to SQLite
- **Shared Lib** (`libs/shared`): Redis client, SQLite DB, queue definitions, types, Lua script
- **Web App** (`apps/web-app`): Next.js frontend with polling purchase confirmation
- **Infrastructure**: Redis (single node), SQLite (single file, WAL mode), BullMQ for async processing

---

## Strengths

### 1. Atomic Lua Script for Stock Decrement

The Lua script in `order.redis.repository.ts` (lines 59–84) is the **crown jewel** of this system. It atomically:

1. Checks for duplicate order keys (`order:...` key with TTL)
2. Checks if user is in `bought_users` set
3. Validates stock key exists (`INVALID_STOCK`)
4. Checks stock > 0 (`OUT_OF_STOCK`)
5. **DECR** stock atomically
6. Adds user to `bought_users` set
7. Sets an `orderKey` with 600s TTL marking the order as "PROCESSING"

All of this happens in a **single Redis eval/evalsha call** — this is the correct approach for flash sale stock deduction. No race condition on stock.

### 2. BullMQ for Async Persistence

Using BullMQ (`queue.ts` line 4, `order.service.ts` line 82) to decouple the hot path (Redis stock check) from the cold path (SQLite write) is architecturally sound. The API responds within milliseconds after the Lua script runs, while the worker handles the slower SQLite transaction asynchronously.

### 3. Dual-Write Pattern (Redis + SQLite)

The pattern of:
- **Redis**: Hot path, ephemeral, fast (`INVALID_STOCK`, `OUT_OF_STOCK`, `ALREADY_PURCHASED`)
- **SQLite**: Source of truth, durable, slower

This is a sensible separation of concerns. Redis handles the high-frequency read/write during the flash sale window, while SQLite provides the durable record.

### 4. Rate Limiting on Worker

The worker (`apps/worker/src/main.ts`, lines 39–42) has:
```ts
limiter: {
  max: 100,
  duration: 1000
}
```
This prevents the worker from overwhelming SQLite with >100 writes/second. Also the concurrency is capped at 50 (line 36–38).

### 5. Zod Validation

The schema in `order.schema.ts` validates `productId` (non-empty string) and `userEmail` (valid email) before the request reaches the controller. This is a good practice that prevents malformed data from reaching downstream services.

### 6. SQLite WAL Mode

`db.ts` line 9: `db.pragma('journal_mode = WAL')` enables Write-Ahead Logging, allowing concurrent reads during writes.

### 7. Bull Board Integration

The `main.ts` (lines 23–28) integrates Bull Board for queue observability — useful in production to monitor queue depth and job failures.

---

## Potential Issues & Risks

### 🔴 CRITICAL: Worker Crash After Redis Success But Before SQLite Writes (Data Inconsistency)

**Location:** `order.service.ts` line 78–82, `worker/src/main.ts` lines 14–32

**The problem:** When the Lua script succeeds, Redis has decremented stock, added user to `bought_users`, and set the `orderKey` to `PROCESSING`. The API then enqueues a BullMQ job (line 82). **If the worker crashes or throws after receiving the job but before `saleRepository.create()` completes in SQLite**, we have:

- Redis: Stock decremented, user marked as purchaser
- SQLite: No order record, stock not decremented

**Worse:** The user sees "Order is being processed" (line 83) but the order never materializes. The `orderKey` TTL is 600s, so after 10 minutes the order will appear as never existed in Redis. At that point the user could retry and succeed (stock was already decremented in Redis, but now they can try again — though `bought_users` still has them).

**Even worse:** If the worker fails after decrementing SQLite stock but before inserting the order record (`sale.repository.ts` lines 42–56), the SQLite transaction rolls back (since `db.transaction` atomically rolls back on error). But the BullMQ job may be retried (depending on config), leading to a **duplicate attempt** that hits the `bought_users` set and gets `ALREADY_PURCHASED` — which is actually correct protection. But if `removeOnFail` is not set, the failed job will be retried.

**Most dangerous scenario:** Worker successfully inserts order in SQLite but then **crashes before acknowledging completion to BullMQ**. BullMQ will retry the job, creating a **duplicate order** in SQLite. The Redis `orderKey` TTL and `bought_users` prevent duplicate decrements, but SQLite gets a duplicate row.

### 🔴 CRITICAL: No Auto-Sync — Lua Script Returns `INVALID_STOCK` If Cache Not Initialized

**Location:** `order.service.ts` lines 24–48 (syncProductCache), `order.redis.repository.ts` lines 70–72 (Lua script)

The Lua script checks:
```lua
local stock = tonumber(redis.call('GET', stockKey))
if not stock then 
  return {0, 'INVALID_STOCK'} 
end
```

If `sync-cache` has never been called for a product, the stock key **does not exist in Redis**. The API returns `INVALID_STOCK` to every user. There is no fallback mechanism to auto-populate the cache from SQLite.

**The web app** (`page.tsx` lines 28–50) has a "System Warm-up" button that calls `sync-cache` for all products — but this is a **manual step**. If the operator forgets, or if a new product is added mid-sale, every purchase fails silently.

### 🔴 HIGH: Lua Script TTL of 600s on Order Key — Worker May Take Longer

**Location:** `order.redis.repository.ts` line 79:
```lua
redis.call('SET', orderKey, 'PROCESSING', 'EX', 600)
```

The `orderKey` (`order:{productId}:{userEmail}`) expires after **600 seconds (10 minutes)**. The `bought_users` set has a TTL of 86400s (24h) set at line 80–82.

**Scenario:** If the queue backs up and the worker takes >10 minutes to process a job:
1. The `orderKey` expires in Redis
2. The user could theoretically purchase **again** (new `orderKey` is not set since TTL expired)
3. But `bought_users` still has them (24h TTL) so they get `ALREADY_PURCHASED`

This is *mostly* protected by `bought_users`, but consider: If both `orderKey` and `bought_users` expire (after 24h) but the job is still in the queue, a user could purchase again, creating a **second order** in SQLite when the first one finally processes.

More realistically: If the worker's rate limiter (100/s) and concurrency (50) can't keep up during a massive spike, the queue grows. If the queue wait time exceeds 10 minutes, orders that were "confirmed" to the user will fail in the worker because the `create` call in `sale.repository.ts` uses `db.transaction` which decrements SQLite stock and inserts the order. But if too many delayed jobs process, SQLite stock could go **negative** (the `UPDATE products SET stock = stock - 1 WHERE product_id = ? AND stock > 0` guard on line 16 would return `changes === 0`, throwing `OUT_OF_STOCK_OR_INVALID_PRODUCT`).

### 🔴 HIGH: No Retry Mechanism for Failed BullMQ Jobs

**Location:** `worker/src/main.ts` lines 12–44

The worker has **no retry configuration**. When a job fails (line 28–31, `throw error`), BullMQ's default behavior depends on the queue config in `queue.ts`:

```ts
export const FlashSaleQueue = new Queue(FLASH_SALE_QUEUE, REDIS_CONFIG);
```

No `defaultJobOptions` are set. BullMQ's default is `attempts: 1` — meaning a failed job is **permanently lost**. If the worker throws due to a transient SQLite error (`SQLITE_BUSY`, `SQLITE_LOCKED`), the order is gone forever.

The `saleRepository.create()` method (lines 41–57) wraps the SQLite operations in a transaction that throws on `changes === 0`. If concurrent workers cause a transaction to fail because another worker already decremented stock to 0, the job fails with no retry. This means **legitimate purchases that passed the Redis check can be silently dropped**.

### 🔴 HIGH: Race Condition — Sale Window Checked in Service Layer, Not in Lua

**Location:** `order.service.ts` lines 56–76

The time window check (`now < startTime`, `now > endTime`) happens **before** the Lua script runs (line 78). Between the time check and the `evalsha` call:

1. A request arrives at T+0ms — time check passes
2. Another concurrent request arrives at T+1ms — also passes
3. Sale ends at T+2ms
4. Lua script runs for both requests — both succeed

**Result:** Orders placed after the sale window closes. This is a correctness issue. The time check should be inside the Lua script for true atomicity, or at minimum the end time should be enforced in Redis (e.g., by setting a TTL on the stock key that matches the sale end time).

### 🔴 HIGH: No Distributed Rate Limiting Per-User

**Location:** `order.service.ts` lines 50–91 (entire `processOrder`)

There is **no per-user rate limiting**. A single user could:

- Spam the `/purchase` endpoint with thousands of requests per second
- Each request hits the Lua script, which checks `bought_users` and returns `ALREADY_PURCHASED` after the first success
- But before the first success, multiple requests could race — the Lua script **does** protect against duplicates via atomicity, so at most one succeeds per user per product

The real issue: **A malicious user could spam different productIds** or **create a denial-of-service attack** by saturating the API with invalid requests, causing unnecessary load on Redis and BullMQ.

### 🟡 MEDIUM: `bought_users` Set Never Cleaned Up (for expired products)

**Location:** `order.redis.repository.ts` lines 80–82

The Lua script sets `EXPIRE boughtKey 86400` only if `TTL < 0` (i.e., no expiry was set). This means:
- Each product's `bought_users` set lives for 24 hours after the **first purchase**
- After the sale ends, this data persists in Redis for up to 24h, consuming memory
- There is no cleanup mechanism to remove stale sets for ended sales

For 100k purchases across multiple products, the `bought_users` sets could consume significant memory.

### 🟡 MEDIUM: SQLite Single-Writer Bottleneck Despite Rate Limiting

**Location:** `sale.repository.ts` lines 5–56, `worker/src/main.ts` lines 36–42

SQLite uses **database-level locking**. Even with WAL mode (which helps reads), **writes are serialized**. The worker has:
- `concurrency: 50` (configurable via `MAX_CONCURRENT_ORDERS`)
- `limiter: { max: 100, duration: 1000 }`

With 50 concurrent worker threads all calling `saleRepository.create()` (which uses `db.transaction`), at most 100 SQLite write transactions can occur per second. But SQLite's actual throughput depends on disk I/O. On typical hardware, SQLite can handle:
- ~50–200 write transactions/second (with WAL, depending on fsync config)
- The rate limiter allows up to 100/s, which is at the upper end of SQLite's capability

**Bottleneck scenario:** If Redis successfully processes 1000 purchases/second (easily achievable), only 100 of those per second can be persisted to SQLite. The queue grows unboundedly. And with `concurrency: 50`, 50 threads contend for the SQLite write lock, causing `SQLITE_BUSY` errors.

The `synchronous = NORMAL` pragma (db.ts line 10) helps, but the fundamental single-writer nature of SQLite remains a bottleneck.

### 🟡 MEDIUM: Product Listing Reads Stale Stock from SQLite

**Location:** `order.service.ts` `findAllProducts()` (lines 110–153)

The `GET /api/orders/products` endpoint reads stock directly from SQLite (`saleRepository.findAllProducts()`), not from Redis. During a flash sale:

1. Redis stock decrements in real-time with each purchase
2. SQLite stock only decrements when the worker processes the BullMQ job
3. **There is always a lag** between the actual stock in Redis and the displayed stock in the API

The web app polls every 10 seconds (page.tsx line 54), but `remainingStock` shown to users could be **significantly higher** than actual available stock. This creates a poor user experience where users see "50 in stock," try to purchase, and get `OUT_OF_STOCK`.

### 🟡 MEDIUM: No Fallback If Redis Goes Down

**Location:** Entire system architecture

There is **no Redis fallback** mechanism. If Redis crashes or becomes unreachable:

1. All purchase requests fail with `REDIS_ERROR` (order.service.ts line 87, order.redis.repository.ts line 53)
2. The worker also fails because it depends on Redis for BullMQ
3. The entire flash sale is effectively **offline**

No circuit breaker, no caching layer fallback, no read-through cache pattern. A Redis outage is a full system outage.

### 🟡 LOW: Hardcoded Stock Bar Width

**Location:** `ProductCard.tsx` line 66:
```tsx
style={{ width: `${(product.remainingStock / 1000) * 100}%` }}
```

The progress bar assumes max stock is always 1000. The MacBook product (defined in `constants.ts` line 23) has `stock: 500`, so the bar would show 50% width at full stock. This is cosmetic but confusing.

### 🟡 LOW: `$` Hardcoded in Price Display

**Location:** `ProductCard.tsx` line 55

The price is prefixed with `$` — no locale/currency support. Minor but worth noting.

---

## Scalability Assessment

### Can it handle 10k concurrent users?

**Conditionally yes — for the hot path.** Here's the breakdown:

| Component | Capacity | Limitation |
|-----------|----------|------------|
| **Redis (Lua)** | 10k+ ops/sec on a single instance | Each Lua script is fast (microseconds). 10k concurrent users hitting at once = ~10k `evalsha` calls. A single Redis instance can handle 50k–100k ops/sec. **Redis is not the bottleneck.** |
| **API (Express)** | Depends on Node.js event loop | With 10k concurrent HTTP requests, Node.js will handle them fine as long as each request is non-blocking. The Redis call is async. **Likely OK** with proper load balancing. |
| **BullMQ Queue** | Unlimited queue depth | BullMQ uses Redis lists. It can queue millions of jobs. **Not a bottleneck.** |
| **Worker → SQLite** | ~50–100 writes/sec | **THIS IS THE BOTTLENECK.** At 100 writes/sec, processing 10k orders would take 100 seconds. The queue grows to 9,900+ pending jobs. Latency for order finalization becomes minutes. |
| **Polling (Web App)** | 15 polls × 2s = 30s timeout | The PurchaseModal (`PurchaseModal.tsx` lines 35–55) polls for 30 seconds max. If the worker queue has 100-second backlog, **every user's poll times out** and they see "High traffic. Order could not be finalized." despite their order being valid. |

**Verdict:** The hot path (click → Redis) works. The cold path (queue → SQLite) breaks down. User experience degrades severely because polling timeouts don't match queue processing time.

### Can it handle 100k concurrent users?

**No.** Not even close. The system would collapse at this scale:

1. **Single Express API instance:** Capped at `256MB` and `0.5 CPU` in Docker (docker-compose.yml lines 31–35). With 100k concurrent connections, memory exhausted, connection timeouts, socket exhaustion.

2. **SQLite writes:** 100k orders → at 100 writes/sec = **1,000 seconds (16+ minutes)** to persist all orders. Queue grows to 99,900+. Practically, `SQLITE_BUSY` errors become frequent as 50 concurrent workers contend for the write lock.

3. **Single Redis instance:** While Redis could handle the Lua operations for 100k requests (each is a few microseconds), the total would be ~100k × 3µs = 300ms of sequential CPU time. In reality, with pipeline and async I/O, it could work. But the **network** becomes the bottleneck — 100k concurrent connections to a single Redis connection pool (ioredis default: ~100 connections) would cause connection contention.

4. **BullMQ job metadata:** Each job creates keys in Redis for job data, logs, state. With 100k jobs, Redis memory usage grows significantly. No `removeOnComplete` or `removeOnFail` is set in the queue config.

### Key Bottleneck Summary

```
API (Express) ──► Redis (Lua: fast) ──► BullMQ Queue (unbounded) ──► Worker ──► SQLite (~50-100 TPS)
    ▲                                                                              ▲
    │                                                                              │
    └──► Without auto-scaling, throughput limited to SQLite write capacity ◄───────┘
```

**The bottleneck is SQLite write throughput.** Everything before it can handle orders of magnitude more load. Everything after it is rate-limited by disk I/O and database-level write locks.

---

## Recommendations

### 🔴 Critical Fixes

#### 1. Add Retry Logic to BullMQ Worker Jobs

**File:** `queue.ts`
```ts
export const FlashSaleQueue = new Queue(FLASH_SALE_QUEUE, {
  ...REDIS_CONFIG,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: true,
    removeOnFail: true, // or keep failed for debugging
  },
});
```

This ensures transient SQLite failures (e.g., `SQLITE_BUSY`) are retried.

#### 2. Add Idempotency Key to Prevent Duplicate Orders

The worker should use **idempotency** based on the `orderKey` stored in Redis:

```ts
// In worker's job processor:
const orderKey = `order:{${productId}}:${userEmail}`;
const existing = await redis.get(orderKey);
// At this point, the job should check if the order already exists in SQLite
const existingOrder = saleRepository.findByUserEmailAndProductId(userEmail, productId);
if (existingOrder) {
  return; // Already processed, skip
}
```

Also set `removeOnComplete: true` and `removeOnFail: true` (or a short TTL) to prevent re-processing after worker restarts.

#### 3. Move Sale Window Check Into Lua Script

**File:** `order.redis.repository.ts`, `getLuaScript()`

Pass the `startTime` and `endTime` as arguments to the Lua script so the time check is **atomic** with the stock decrement:

```lua
local stockKey, boughtKey, orderKey = KEYS[1], KEYS[2], KEYS[3]
local userEmail, startTime, endTime = ARGV[1], ARGV[2], ARGV[3]
local now = redis.call('TIME')[1]  -- Redis server time

if now < tonumber(startTime) then
  return {0, 'FLASH_SALE_NOT_STARTED'}
end
if now > tonumber(endTime) then
  return {0, 'FLASH_SALE_ENDED'}
end
-- ... rest of script
```

Store `start_time` and `end_time` as Redis keys (e.g., `product:{id}:start_time`, `product:{id}:end_time`) during `syncProductCache`.

#### 4. Auto-Sync on Startup + On-Demand Fallback

**File:** `order.service.ts`, `init()` in `main.ts`

After `initDatabase()` and `orderRedisRepo.init()`, automatically sync all active products into Redis:

```ts
const products = await saleRepository.findAllProducts();
for (const p of products) {
  await orderRedisRepo.initProductCache(p.product_id, p.stock);
  // Also store start/end times for Lua-based time checks
}
```

This eliminates the manual "System Warm-up" button dependency.

### 🟡 High Priority Improvements

#### 5. Replace SQLite with PostgreSQL

SQLite is fundamentally a single-writer embedded database. For any serious flash sale volume, replace it with PostgreSQL:
- **Concurrent writes** (no single-writer bottleneck)
- **Proper connection pooling** (PgBouncer or similar)
- **Better throughput** (thousands of writes/sec vs. ~100)
- **Durability guarantees** with proper WAL/fsync configuration

If SQLite must stay (embedded/simplicity constraints), at minimum:
- Increase `busy_timeout` to 5000ms to reduce `SQLITE_BUSY` errors
- Reduce worker concurrency to match SQLite's actual throughput (maybe 10 instead of 50)
- Use `PRAGMA journal_size_limit` and `PRAGMA cache_size` to tune performance

#### 6. Per-User Distributed Rate Limiting

**File:** `order.service.ts` `processOrder()` or middleware

Add a Redis-based rate limiter (e.g., **sliding window** using Redis sorted sets or **token bucket** using `INCR` + `EXPIRE`):

```ts
// Middleware or in service:
const rateKey = `ratelimit:{${userEmail}}:purchase`;
const count = await redis.incr(rateKey);
if (count === 1) await redis.pexpire(rateKey, 1000); // 1-second window
if (count > 5) return { success: false, message: 'TOO_MANY_REQUESTS' };
```

#### 7. Return Real-Time Stock from Redis in Product Listings

**File:** `order.service.ts` `findAllProducts()`

Instead of reading stock from SQLite, merge Redis stock into the response:

```ts
const redisStock = await this.orderRedisRepo.getStockRedis(p.product_id);
remainingStock: redisStock !== null ? redisStock : p.stock,
```

This ensures users see real-time stock levels, not stale SQLite data.

#### 8. Increase `orderKey` TTL or Make It Persistent

**File:** `order.redis.repository.ts` line 79

Change `'EX', 600` (10 minutes) to `'EX', 86400` (24 hours) to match `bought_users`. Or better: let the key persist until cleanup runs:

```lua
-- Either match bought_users TTL
redis.call('SET', orderKey, 'PROCESSING', 'EX', 86400)
-- Or skip TTL and clean up explicitly
redis.call('SET', orderKey, 'PROCESSING')
-- Then after SQLite write succeeds, delete the key
```

But **be careful**: if you remove the TTL and never clean up, it's a memory leak. Best approach: keep a long TTL and clean up after successful SQLite write.

#### 9. Add Redis Circuit Breaker and Fallback

Implement a health-check mechanism that periodically pings Redis. If Redis is down:
- Fall back to a **degraded mode**: direct SQLite writes (much slower, but functional)
- Return `503 Service Unavailable` with a `Retry-After` header instead of `REDIS_ERROR`

### 🟢 Nice-to-Have Improvements

#### 10. Clean Up Stale `bought_users` Sets

Add a scheduled job (cron) that scans for products whose sale has ended and deletes their Redis keys:

```ts
// After syncProductCache, or via cron:
const product = await saleRepository.findByProductId(productId);
const endTime = new Date(product.end_time);
if (endTime < new Date()) {
  await redis.del(`product:{${productId}}:bought_users`);
  await redis.del(`product:{${productId}}:stock`);
}
```

#### 11. Graceful Queue Backpressure Handling

The API should check queue depth before accepting requests:

```ts
const queueCounts = await this.queueService.getJobCounts();
const pending = queueCounts.waiting + queueCounts.active;
if (pending > 5000) {
  return { success: false, message: 'SYSTEM_AT_CAPACITY_TRY_AGAIN' };
}
```

This prevents the queue from growing unboundedly and gives users immediate feedback instead of silent failures.

#### 12. Multi-AZ / Redis Sentinel / Redis Cluster

For production:
- **Redis Sentinel** for high availability
- **Redis Cluster** if the key space exceeds a single node's capacity
- For the Lua script: ensure keys are on the same hash slot (they are, since they share the `{productId}` hash tag)

#### 13. Metrics and Monitoring

Add Prometheus metrics for:
- Lua script execution time
- Queue depth (already available via Bull Board)
- SQLite write latency and `SQLITE_BUSY` error rate
- Per-product purchase rate

#### 14. Docker Resource Limits

**File:** `docker-compose.yml`

The resource limits are quite low:
- API: `256MB`, `0.5 CPU`
- Worker: `512MB`, `0.5 CPU`
- Redis: `64MB`

For 10k+ concurrent users:
- API: at least `1GB`, `2 CPU`
- Worker: `1GB`, `2 CPU` (or more, depending on SQLite contention)
- Redis: `256MB` minimum

---

## Summary Table

| Area | Current State | Risk Level | Urgency |
|------|--------------|------------|---------|
| Worker crash after Redis success | Data inconsistency (phantom decrements) | 🔴 Critical | Fix now |
| No auto-sync before sale | All purchases return `INVALID_STOCK` | 🔴 Critical | Fix now |
| Sale window check outside Lua | Orders after sale close | 🔴 Critical | Fix now |
| No retry on worker jobs | Legitimate orders permanently lost | 🔴 Critical | Fix now |
| No per-user rate limiting | Spam / DoS vulnerability | 🟡 High | Fix soon |
| `orderKey` TTL too short (600s) | Queue backlog >10min breaks protection | 🟡 High | Fix soon |
| Stale stock in product listing | Users see incorrect stock | 🟡 High | Fix soon |
| SQLite single-writer bottleneck | Max ~100 TPS, queue grows unbounded | 🟡 High | Architecture |
| `bought_users` never cleaned | Memory leak | 🟡 Medium | Fix later |
| No Redis fallback | Full system outage on Redis failure | 🟡 Medium | Architecture |
| Hardcoded `1000` in progress bar | Wrong bar width for MacBook (500 stock) | 🟢 Low | Fix anytime |

---

**Bottom line:** The architecture has a solid foundation (atomic Lua + async queue) for the **detection** of flash sale winners, but it is **not production-ready for high concurrency** without addressing the SQLite write bottleneck, data inconsistency window, and missing retry/fallback mechanisms. For a true high-volume flash sale (10k+ concurrent), replace SQLite with PostgreSQL, add proper idempotency, and move time validation into the Lua script.
