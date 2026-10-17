# Tanstack Start Integration

## What It Is
Elysia runs inside Tanstack Start server routes.

## Setup
1. Create `src/routes/api.$.ts`
2. Define Elysia server
3. Export handlers in `server.handlers`:
```typescript
// src/routes/api.$.ts
import { Elysia } from 'elysia'
import { createFileRoute } from '@tanstack/react-router'
import { createIsomorphicFn } from '@tanstack/react-start'

const app = new Elysia({
  prefix: '/api'
}).get('/', 'Hello Elysia!')

const handle = ({ request }: { request: Request }) => app.fetch(request)

export const Route = createFileRoute('/api/$')({
  server: {
    handlers: {
      GET: handle,
      POST: handle
    }
  }
})
```

Runs on `/api`. Add methods to `server.handlers` as needed.

## Eden (End-to-End Type Safety)
Isomorphic pattern with `createIsomorphicFn`:
```typescript
// src/routes/api.$.ts
export const getTreaty = createIsomorphicFn()
  .server(() => treaty(app).api)
  .client(() => treaty<typeof app>('localhost:3000').api)
```

- Server: Direct call (no HTTP overhead)
- Client: HTTP call

## Loader Data
Fetch before render:
```tsx
// src/routes/index.tsx
import { createFileRoute } from '@tanstack/react-router'
import { getTreaty } from './api.$'

export const Route = createFileRoute('/a')({
  component: App,
  loader: () => getTreaty().get().then((res) => res.data)
})

function App() {
  const data = Route.useLoaderData()
  return data
}
```

Executed server-side during SSR. No HTTP overhead. Type-safe.

## React Query
```tsx
import { useQuery } from '@tanstack/react-query'
import { getTreaty } from './api.$'

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
