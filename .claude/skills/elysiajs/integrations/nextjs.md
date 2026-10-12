
# Next.js Integration

## What It Is
Run Elysia on Next.js App Router.

## Setup
1. Create `app/api/[[...slugs]]/route.ts`
2. Define Elysia + export handlers:
```typescript
// app/api/[[...slugs]]/route.ts
import { Elysia, t } from 'elysia'

const app = new Elysia({ prefix: '/api' })
  .get('/', 'Hello Nextjs')
  .post('/', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })

export const GET = app.fetch
export const POST = app.fetch
```

WinterCG compliance - works as normal Next.js API route.

## Prefix for Non-Root
If placed in `app/user/[[...slugs]]/route.ts`, set prefix:
```typescript
const app = new Elysia({ prefix: '/user' })
  .get('/', 'Hello Nextjs')

export const GET = app.fetch
export const POST = app.fetch
```

## Eden (End-to-End Type Safety)
Isomorphic fetch pattern:
- Server: Direct calls (no network)
- Client: Network calls

1. Export type:
```typescript
// app/api/[[...slugs]]/route.ts
export const app = new Elysia({ prefix: '/api' })
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
import type { app } from '../app/api/[[...slugs]]/route'

export const api =
  typeof process !== 'undefined'
    ? treaty(app).api
    : treaty<typeof app>('localhost:3000').api
```

Use `typeof process` not `typeof window` (window undefined at build time → hydration error).

3. Use in components:
```tsx
// app/page.tsx
import { api } from '../lib/eden'

export default async function Page() {
  const message = await api.get()
  return <h1>Hello, {message}</h1>
}
```

Works with server/client components + ISR.

## React Query
```tsx
import { useQuery } from '@tanstack/react-query'

function App() {
  const { data: response } = useQuery({
    queryKey: ['get'],
    queryFn: () => getTreaty().get()
  })
  
  return response?.data
}
```

Works with all React Query features.

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
