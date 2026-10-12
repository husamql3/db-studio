# Astro Integration - SKILLS.md

## What It Is
Run Elysia on Astro via Astro Endpoint.

## Setup
1. Set output to server:
```javascript
// astro.config.mjs
export default defineConfig({
  output: 'server'
})
```

2. Create `pages/[...slugs].ts`
3. Define Elysia server + export handlers:
```typescript
// pages/[...slugs].ts
import { Elysia, t } from 'elysia'

const app = new Elysia()
  .get('/api', () => 'hi')
  .post('/api', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })

const handle = ({ request }: { request: Request }) => app.handle(request)

export const GET = handle
export const POST = handle
```

WinterCG compliance - works normally.

Recommended: Run Astro on Bun (Elysia designed for Bun).

## Prefix for Non-Root
If placed in `pages/api/[...slugs].ts`, set prefix:
```typescript
// pages/api/[...slugs].ts
const app = new Elysia({ prefix: '/api' })
  .get('/', () => 'hi')

const handle = ({ request }: { request: Request }) => app.handle(request)

export const GET = handle
export const POST = handle
```

Ensures routing works in any location.

## Benefits
Co-location of frontend + backend. End-to-end type safety with Eden.

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
