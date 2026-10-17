
# Cloudflare Worker Integration

## What It Is
**Experimental** Cloudflare Worker adapter for Elysia.

## Setup
1. Install Wrangler:
```bash
wrangler init elysia-on-cloudflare
```

2. Apply adapter + compile:
```typescript
import { Elysia } from 'elysia'
import { CloudflareAdapter } from 'elysia/adapter/cloudflare-worker'

export default new Elysia({
  adapter: CloudflareAdapter
})
  .get('/', () => 'Hello Cloudflare Worker!')
  .compile()  // Required
```

3. Set compatibility date (min `2025-06-01`):
```json
// wrangler.json
{
  "name": "elysia-on-cloudflare",
  "main": "src/index.ts",
  "compatibility_date": "2025-06-01"
}
```

4. Dev server:
```bash
wrangler dev
# http://localhost:8787
```

No `nodejs_compat` flag needed.

## Limitations
1. `Elysia.file` + Static Plugin don't work (no `fs` module)
2. OpenAPI Type Gen doesn't work (no `fs` module)
3. Cannot define Response before server start
4. Cannot inline values:
```typescript
// ❌ Throws error
.get('/', 'Hello Elysia')

// ✅ Works
.get('/', () => 'Hello Elysia')
```

## Static Files
Use Cloudflare's built-in static serving:
```json
// wrangler.json
{
  "assets": { "directory": "public" }
}
```

Structure:
```
├─ public
│  ├─ kyuukurarin.mp4
│  └─ static/mika.webp
```

Access:
- `http://localhost:8787/kyuukurarin.mp4`
- `http://localhost:8787/static/mika.webp`

## Binding
Import env from `cloudflare:workers`:
```typescript
import { env } from 'cloudflare:workers'

export default new Elysia({ adapter: CloudflareAdapter })
  .get('/', () => `Hello ${await env.KV.get('my-key')}`)
  .compile()
```

## AoT Compilation
As of Elysia 1.4.7, AoT works with Cloudflare Worker. Drop `aot: false` flag.

Cloudflare now supports Function compilation during startup.

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
