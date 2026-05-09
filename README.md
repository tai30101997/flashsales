# 🚀 High-Concurrency Flash Sale System

A robust, high-performance flash sale implementation designed to handle massive spikes in traffic during limited-time sales events. The system leverages atomic in-memory operations and asynchronous persistence to ensure data consistency and high throughput.

---

## 🛠️ Technology Stack

- **Monorepo Management:** [Nx](https://nx.dev/)
- **Frontend:** [Next.js](https://nextjs.org/) + Tailwind CSS
- **Backend API:** [Express.js](https://expressjs.com/)
- **Background Worker:** Node.js + [BullMQ](https://docs.bullmq.io/)
- **Distributed Cache/Queue:** [Redis](https://redis.io/)
- **Database:** [SQLite](https://sqlite.org/) (via `better-sqlite3` in WAL mode)
- **Validation:** [Zod](https://zod.dev/)
- **Containerization:** [Docker](https://www.docker.com/)

---

## 🏗️ System Architecture

The system is designed for maximum efficiency during peak loads:

1. **Atomic Stock Management:** Uses **Redis Lua scripts** to perform atomic "check-and-decrement" operations. This prevents race conditions and ensures no overselling occurs.
2. **Asynchronous Order Processing:** Once stock is reserved in Redis, the API immediately acknowledges the order and pushes it to a **BullMQ** queue.
3. **Eventual Consistency:** A dedicated **Worker** service consumes jobs from the queue and persists the successful orders into the **SQLite** database.
4. **Performance Monitoring:** Integrated **Bull Board** provides real-time visibility into queue health and worker performance.

---

## 📦 Project Structure

- **`apps/api`**: The Gateway service. Handles product discovery and order placement.
- **`apps/worker`**: The Persistence service. Processes the order queue and writes to the database.
- **`apps/web-app`**: The User Interface. Next.js dashboard for viewing sales and placing orders.
- **`libs/shared`**: Shared logic, including:
  - `repositories/`: Unified data access for Redis and SQLite.
  - `core/`: Shared types, schemas, and constants.
  - `db.ts` & `queue.ts`: Initialization logic for persistence and messaging.

---

## ⚙️ Configuration

The system is configured via environment variables. A `.env` file is located in the root directory:

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | API Gateway port | `3333` |
| `DB_PATH` | Path to SQLite database | `sale.db` |
| `REDIS_HOST` | Redis server hostname | `localhost` |
| `REDIS_PORT` | Redis server port | `6379` |
| `SALE_DURATION_MINUTES` | Default sale duration | `60` |

---

## 🚀 How to Run

### Local Development

First, ensure you have a **Redis** instance running (default port 6379).

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run all services in parallel:**
   ```bash
   npm start
   ```

3. **Run services individually:**
   - **API:** `npm run api`
   - **Worker:** `npm run worker`
   - **Web App:** `npm run web`

### 🐳 Docker Deployment

The entire stack can be launched using Docker Compose. The Web App will be available at `http://localhost:4200` and the API at `http://localhost:3333`.

```bash
# Build and start all services
docker compose up -d --build

# View logs
docker compose logs -f

# Stop services
docker compose down
```

---

## 📊 Monitoring

You can monitor the order queue and worker status via the **Bull Board** dashboard:

**URL:** `http://localhost:3333/admin/queues`

---

## 🧪 System Verification

### API Endpoint
**POST** `/orders`
```json
{
  "productId": "some-product-id",
  "quantity": 1
}
```

### Resetting the System
If you need to clear the state for a fresh test:
```bash
# Flush Redis
docker compose exec redis redis-cli flushall

# Reset SQLite (Delete the local db file if present)
rm apps/api/sale.db 
```

---

## 📡 API Reference

All API routes are prefixed with `/api`. The API runs on `http://localhost:3333` by default.

---

### `POST /api/orders/purchase` — Place Order

Creates an order for a flash sale product. Stock is checked and reserved **atomically in Redis** before the order is queued for persistence.

#### Request Body

```json
{
  "productId": "iphone-15",
  "userEmail": "user@example.com"
}
```

| Field | Type | Validation | Description |
|-------|------|-----------|-------------|
| `productId` | `string` | Required, non-empty | The product identifier (e.g. `iphone-15`, `macbook-m3`) |
| `userEmail` | `string` | Required, valid email | The buyer's email address |

#### How Stock Validation Works

1. **Product & Sale Window Check** — The service verifies the product exists in SQLite and that the current time falls within the product's `start_time` / `end_time` window.
2. **Redis Lua Script (Atomic)** — A pre-loaded Lua script (`evalsha`) runs atomically on the Redis server with three keys:
   - `product:{productId}:stock` — remaining stock count
   - `product:{productId}:bought_users` — set of users who already purchased
   - `order:{productId}:{userEmail}` — tracks in-progress orders

   The script performs these steps in sequence:
   1. Rejects if `order:{productId}:{userEmail}` already exists → `ORDER_IN_PROGRESS_OR_COMPLETED`
   2. Rejects if `userEmail` is in `bought_users` set → `ALREADY_PURCHASED`
   3. Rejects if stock key is missing → `INVALID_STOCK`
   4. Rejects if stock ≤ 0 → `OUT_OF_STOCK`
   5. **DECR** stock by 1
   6. **SADD** user email to `bought_users` set
   7. **SET** `order:{productId}:{userEmail}` to `PROCESSING` with a 600-second TTL
   8. Returns `{1, newStock}` on success

3. **BullMQ Job Enqueued** — If the Lua script succeeds, a `processOrder` job is pushed to the `flash-sale` BullMQ queue.
4. **Worker Persists to SQLite** — The worker picks up the job and runs a transaction that decrements the SQLite stock and inserts the order record.

#### Success Response (200)

```json
{
  "success": true,
  "message": "Order is being processed",
  "data": null
}
```

#### Error Responses

| HTTP Status | `message` | Meaning |
|-------------|-----------|---------|
| `400` | `PRODUCT_NOT_FOUND` | The `productId` does not exist in the database |
| `400` | `FLASH_SALE_NOT_STARTED` | Current time is before the product's `start_time` |
| `400` | `FLASH_SALE_ENDED` | Current time is past the product's `end_time` |
| `400` | `ORDER_IN_PROGRESS_OR_COMPLETED` | A purchase for this user+product is already being processed |
| `400` | `ALREADY_PURCHASED` | This user has already purchased this product |
| `400` | `INVALID_STOCK` | No stock record found in Redis (run `sync-cache` first) |
| `400` | `OUT_OF_STOCK` | All units for this product have been sold |
| `400` | Validation Error | Request body failed Zod validation (see `details` array) |
| `500` | `SYSTEM_ERROR` | An unexpected server or Redis error occurred |

Validation error details format:
```json
{
  "success": false,
  "message": "Validation Error",
  "details": [
    { "path": "userEmail", "message": "Invalid email address" }
  ]
}
```

---

### `GET /api/orders/products` — List All Products

Returns all flash sale products with their current stock and sale status.

#### Response (200)

```json
{
  "success": true,
  "message": "Products retrieved successfully",
  "data": {
    "products": [
      {
        "productId": "iphone-15",
        "name": "Iphone 15 Pro Max Flash Sale",
        "price": 1500,
        "description": "",
        "image_url": "https://...",
        "start_time": "2026-05-09T12:00:00.000Z",
        "end_time": "2026-05-09T12:30:00.000Z",
        "remainingStock": 1000,
        "status": "ongoing"
      }
    ]
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `status` | `string` | One of `upcoming`, `ongoing`, or `ended` — computed by comparing current time with `start_time` / `end_time` |
| `remainingStock` | `number` | Current stock from the SQLite database |

---

### `GET /api/orders/status` — Get Flash Sale Status

Returns real-time stock and sale status for a specific product, reading the remaining stock directly from Redis.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `productId` | `string` | Yes | The product identifier |

#### Response (200)

```json
{
  "success": true,
  "message": "Success",
  "data": {
    "remainingStock": 987,
    "status": "ongoing"
  }
}
```

| `data.status` | Meaning |
|---------------|---------|
| `upcoming` | Sale has not yet started (remaining stock reported as 0) |
| `ongoing` | Sale is active and stock is available |
| `ended` | Sale window has expired or stock is depleted |

---

### `GET /api/orders/user-order` — Get User Order Status

Checks whether a specific user has placed an order for a given product.

#### Query Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `userEmail` | `string` | Yes | The buyer's email |
| `productId` | `string` | Yes | The product identifier |

#### Response (200)

```json
{
  "success": true,
  "message": "Order found",
  "data": {
    "id": 1,
    "userEmail": "user@example.com",
    "productId": "iphone-15",
    "status": "completed",
    "createdAt": "2026-05-09 12:00:01.123"
  }
}
```

If no order exists:
```json
{
  "success": false,
  "message": "Order not found",
  "data": null
}
```

---

### `POST /api/orders/sync-cache` — Initialize Redis Product Cache

Seeds (or refreshes) a product's stock into Redis so the atomic Lua script can operate on it. Must be called at least once per product before accepting orders.

#### Request Body

```json
{
  "productId": "iphone-15"
}
```

#### Response (200)

```json
{
  "success": true,
  "message": "Product cache successfully initialized"
}
```

The cache is set with a **1-hour TTL (3600 seconds)**. The `bought_users` set for the product is also cleared on initialization.

#### Error Response

```json
{
  "success": false,
  "message": "Product not exists in DB"
}
```

---

## 🔄 Processing Flow (End-to-End)

Below is the complete lifecycle of an order request through the system:

```
  ┌──────────┐      ┌──────────┐      ┌──────────┐      ┌──────────┐
  │  Client  │ ──►  │   API    │ ──►  │  Redis   │ ──►  │  Worker  │ ──►  │ SQLite  │
  │ (Browser)│ ◄──  │ (Express)│      │ (Lua +   │      │ (BullMQ) │      │  (DB)   │
  └──────────┘      └──────────┘      │  Queue)  │      └──────────┘      └─────────┘
                                       └──────────┘
```

### Step-by-Step

| Step | Component | Action |
|------|-----------|--------|
| **1** | **Client** | Sends `POST /api/orders/purchase` with `{ productId, userEmail }` |
| **2** | **API (Middleware)** | Zod validation middleware checks the request body — returns `400` with field-level errors if invalid |
| **3** | **API (Controller)** | `OrderController.createOrder()` receives the validated request and delegates to `OrderService.processOrder()` |
| **4** | **API (Service)** | `OrderService` checks product existence in SQLite and validates the flash sale time window (`start_time` / `end_time`) |
| **5** | **API (Service → Redis)** | Calls `orderRedisRepo.tryPurchase()` which executes the pre-loaded **Lua script via `evalsha`** on Redis |
| **6** | **Redis (Lua)** | Atomically checks: duplicate order → already purchased → stock exists → stock > 0. If all pass, **DECR** stock, **SADD** user, **SET** order key, returns success |
| **7** | **API (Service → BullMQ)** | On Lua success, enqueues a `processOrder` job to the `flash-sale` BullMQ queue with `{ userEmail, productId }` |
| **8** | **API (Response)** | Immediately responds to the client with `{ success: true, message: "Order is being processed" }` |
| **9** | **BullMQ (Queue)** | Holds the job until a worker is available; the worker pool runs with **50 concurrent workers** and a **rate limiter of 100 jobs/second** |
| **10** | **Worker** | Picks up the job, calls `SaleRepository.create()`, which runs a **SQLite transaction**: decrements `products.stock` and inserts into `orders` table |
| **11** | **SQLite** | Persists the order with `status = 'completed'`; if stock is already 0 in SQLite (race condition guard), the transaction throws `OUT_OF_STOCK_OR_INVALID_PRODUCT` |

### Key Design Decisions

- **Atomicity via Lua**: The entire check-and-decrement operation in Redis is atomic, preventing any race conditions between concurrent requests.
- **Dual-Write Pattern**: Stock is reserved in Redis first (fast), then asynchronously persisted to SQLite (durable). This gives low-latency responses while maintaining eventual consistency.
- **Worker Rate Limiting**: The BullMQ worker is configured with `max: 100` per `duration: 1000` ms to prevent overwhelming SQLite during rapid order bursts.
- **Duplicate Prevention**: The Lua script checks both an in-progress order key (`order:{pid}:{email}`) and a completed purchases set (`bought_users`), ensuring idempotency even if the client retries.
- **Cache Warmup**: Products must be explicitly synced to Redis via `POST /api/orders/sync-cache` before they can accept orders. The cache TTL is 1 hour.

---

## 🧪 Seeded Products

On first run, the system seeds two products into SQLite:

| `productId` | Name | Stock | Price | Sale Start |
|-------------|------|-------|-------|------------|
| `iphone-15` | Iphone 15 Pro Max Flash Sale | 1,000 | $1,500 | Immediately on server start |
| `macbook-m3` | Macbook Air M3 | 500 | $2,000 | 5 minutes after server start |

Both sales last for the duration specified by `SALE_DURATION_MINUTES` (default: 30 minutes).

---

## 🖥️ Bull Board Queue Monitoring

The Bull Board dashboard provides real-time visibility into the `flash-sale` queue:

- **URL:** `http://localhost:3333/admin/queues`
- View counts of waiting, active, completed, and failed jobs
- Inspect individual job data and stack traces for failed jobs
- Retry or remove jobs as needed

This is automatically mounted at server startup via the Express adapter.
```
