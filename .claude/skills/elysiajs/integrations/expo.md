# Expo Integration
Run Elysia on Expo (React Native)

## What It Is
Create API routes in Expo app (SDK 50+, App Router v3).

## Setup
1. Create `app/[...slugs]+api.ts`
2. Define Elysia server
3. Export `Elysia.fetch` as HTTP methods

```typescript
// app/[...slugs]+api.ts
import { Elysia, t } from 'elysia'

const app = new Elysia()
  .get('/', 'hello Expo')
  .post('/', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })

export const GET = app.fetch
export const POST = app.fetch
```

## Prefix for Non-Root
If placed in `app/api/[...slugs]+api.ts`, set prefix:
```typescript
const app = new Elysia({ prefix: '/api' })
  .get('/', 'Hello Expo')

export const GET = app.fetch
export const POST = app.fetch
```

Ensures routing works in any location.

## Eden (End-to-End Type Safety)
1. Export type:
```typescript
// app/[...slugs]+api.ts
const app = new Elysia()
  .get('/', 'Hello Nextjs')
  .post('/user', ({ body }) => body, {
    body: treaty.schema('User', { name: 'string' })
  })

export type app = typeof app

export const GET = app.fetch
export const POST = app.fetch
```

2. Create client:
```typescript
// lib/eden.ts
import { treaty } from '@elysiajs/eden'
import type { app } from '../app/[...slugs]+api'

export const api = treaty<app>('localhost:3000/api')
```

3. Use in components:
```tsx
// app/page.tsx
import { api } from '../lib/eden'

export default async function Page() {
  const message = await api.get()
  return <h1>Hello, {message}</h1>
}
```

## Deployment
- Deploy as normal Elysia app OR
- Use experimental Expo server runtime

With Expo runtime:
```bash
expo export
# Creates dist/server/_expo/functions/[...slugs]+api.js
```

Edge function, not normal server (no port allocation).

### Adapters
- Express
- Netlify
- Vercel

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
