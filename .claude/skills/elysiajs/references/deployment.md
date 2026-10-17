# Deployment

## Production Build

### Compile to Binary (Recommended)
```bash
bun build \
  --compile \
  --minify-whitespace \
  --minify-syntax \
  --target bun \
  --outfile server \
  src/index.ts
```

**Benefits:**
- No runtime needed on deployment server
- Smaller memory footprint (2-3x reduction)
- Faster startup
- Single portable executable

**Run the binary:**
```bash
./server
```

### Compile to JavaScript
```bash
bun build \
  --minify-whitespace \
  --minify-syntax \
  --outfile ./dist/index.js \
  src/index.ts
```

**Run:**
```bash
NODE_ENV=production bun ./dist/index.js
```

## Docker

### Basic Dockerfile
```dockerfile
FROM oven/bun:1 AS build

WORKDIR /app

# Cache dependencies
COPY package.json bun.lock ./
RUN bun install

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build \
  --compile \
  --minify-whitespace \
  --minify-syntax \
  --outfile server \
  src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000
```

### Build and Run
```bash
docker build -t my-elysia-app .
docker run -p 3000:3000 my-elysia-app
```

### With Environment Variables
```dockerfile
FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_URL=""
ENV JWT_SECRET=""

CMD ["./server"]

EXPOSE 3000
```

## Cluster Mode (Multiple CPU Cores)

```typescript
// src/index.ts
import cluster from 'node:cluster'
import os from 'node:os'
import process from 'node:process'

if (cluster.isPrimary) {
  for (let i = 0; i < os.availableParallelism(); i++) {
    cluster.fork()
  }
} else {
  await import('./server')
  console.log(`Worker ${process.pid} started`)
}
```

```typescript
// src/server.ts
import { Elysia } from 'elysia'

new Elysia()
  .get('/', () => 'Hello World!')
  .listen(3000)
```

## Environment Variables

### .env File
```env
NODE_ENV=production
PORT=3000
DATABASE_URL=postgresql://user:password@localhost:5432/db
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://example.com
```

### Load in App
```typescript
import { Elysia } from 'elysia'

const app = new Elysia()
  .get('/env', () => ({
    env: process.env.NODE_ENV,
    port: process.env.PORT
  }))
  .listen(parseInt(process.env.PORT || '3000'))
```

## Platform-Specific Deployments

### Railway
```typescript
// Railway assigns random PORT via env variable
new Elysia()
  .get('/', () => 'Hello Railway')
  .listen(process.env.PORT ?? 3000)
```

### Vercel
```typescript
// src/index.ts
import { Elysia } from 'elysia'

export default new Elysia()
  .get('/', () => 'Hello Vercel')

export const GET = app.fetch
export const POST = app.fetch
```

```json
// vercel.json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "bunVersion": "1.x"
}
```

### Cloudflare Workers
```typescript
import { Elysia } from 'elysia'
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker'

export default new Elysia({
  adapter: CloudflareAdapter
})
  .get('/', () => 'Hello Cloudflare!')
  .compile()
```

```toml
# wrangler.toml
name = "elysia-app"
main = "src/index.ts"
compatibility_date = "2025-06-01"
```

### Node.js Adapter
```typescript
import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'

const app = new Elysia({ adapter: node() })
  .get('/', () => 'Hello Node.js')
  .listen(3000)
```

## Performance Optimization

### Enable AoT Compilation
```typescript
new Elysia({
  aot: true  // Ahead-of-time compilation
})
```

### Use Native Static Response
```typescript
new Elysia({
  nativeStaticResponse: true
})
  .get('/version', 1)  // Optimized for Bun.serve.static
```

### Precompile Routes
```typescript
new Elysia({
  precompile: true  // Compile all routes ahead of time
})
```

## Health Checks

```typescript
new Elysia()
  .get('/health', () => ({
    status: 'ok',
    timestamp: Date.now()
  }))
  .get('/ready', ({ db }) => {
    // Check database connection
    const isDbReady = checkDbConnection()
    
    if (!isDbReady) {
      return status(503, { status: 'not ready' })
    }
    
    return { status: 'ready' }
  })
```

## Graceful Shutdown

```typescript
import { Elysia } from 'elysia'

const app = new Elysia()
  .get('/', () => 'Hello')
  .listen(3000)

process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully')
  app.stop()
  process.exit(0)
})

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully')
  app.stop()
  process.exit(0)
})
```

## Monitoring

### OpenTelemetry
```typescript
import { opentelemetry } from '@elysiajs/opentelemetry'

new Elysia()
  .use(opentelemetry({
    serviceName: 'my-service',
    endpoint: 'http://localhost:4318'
  }))
```

### Custom Logging
```typescript
.onRequest(({ request }) => {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url}`)
})
.onAfterResponse(({ request, set }) => {
  console.log(`[${new Date().toISOString()}] ${request.method} ${request.url} - ${set.status}`)
})
```

## SSL/TLS (HTTPS)

```typescript
import { Elysia, file } from 'elysia'

new Elysia({
  serve: {
    tls: {
      cert: file('cert.pem'),
      key: file('key.pem')
    }
  }
})
  .get('/', () => 'Hello HTTPS')
  .listen(3000)
```

## Best Practices

1. **Always compile to binary for production**
   - Reduces memory usage
   - Smaller deployment size
   - No runtime needed

2. **Use environment variables**
   - Never hardcode secrets
   - Use different configs per environment

3. **Enable health checks**
   - Essential for load balancers
   - K8s/Docker orchestration

4. **Implement graceful shutdown**
   - Handle SIGTERM/SIGINT
   - Close connections properly

5. **Use cluster mode**
   - Utilize all CPU cores
   - Better performance under load

6. **Monitor your app**
   - Use OpenTelemetry
   - Log requests/responses
   - Track errors

## Example Production Setup

```typescript
// src/server.ts
import { Elysia } from 'elysia'
import { cors } from '@elysiajs/cors'
import { opentelemetry } from '@elysiajs/opentelemetry'

export const app = new Elysia({
  aot: true,
  nativeStaticResponse: true
})
  .use(cors({
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000'
  }))
  .use(opentelemetry({
    serviceName: 'my-service'
  }))
  .get('/health', () => ({ status: 'ok' }))
  .get('/', () => 'Hello Production')
  .listen(parseInt(process.env.PORT || '3000'))

// Graceful shutdown
process.on('SIGTERM', () => {
  app.stop()
  process.exit(0)
})
```

```typescript
// src/index.ts (cluster)
import cluster from 'node:cluster'
import os from 'node:os'

if (cluster.isPrimary) {
  for (let i = 0; i < os.availableParallelism(); i++) {
    cluster.fork()
  }
} else {
  await import('./server')
}
```

```dockerfile
# Dockerfile
FROM oven/bun:1 AS build

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install

COPY ./src ./src

ENV NODE_ENV=production

RUN bun build --compile --outfile server src/index.ts

FROM gcr.io/distroless/base

WORKDIR /app

COPY --from=build /app/server server

ENV NODE_ENV=production

CMD ["./server"]

EXPOSE 3000
```
