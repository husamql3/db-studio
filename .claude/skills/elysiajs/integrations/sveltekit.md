
# SvelteKit Integration

## What It Is
Run Elysia on SvelteKit server routes.

## Setup
1. Create `src/routes/[...slugs]/+server.ts`
2. Define Elysia server
3. Export fallback handler:
```typescript
// src/routes/[...slugs]/+server.ts
import { Elysia, t } from 'elysia'

const app = new Elysia()
  .get('/', 'hello SvelteKit')
  .post('/', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })

interface WithRequest {
  request: Request
}

export const fallback = ({ request }: WithRequest) => app.handle(request)
```

Treat as normal SvelteKit server route.

## Prefix for Non-Root
If placed in `src/routes/api/[...slugs]/+server.ts`, set prefix:
```typescript
// src/routes/api/[...slugs]/+server.ts
import { Elysia, t } from 'elysia'

const app = new Elysia({ prefix: '/api' })
  .get('/', () => 'hi')
  .post('/', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })

type RequestHandler = (v: { request: Request }) => Response | Promise<Response>

export const fallback: RequestHandler = ({ request }) => app.handle(request)
```

Ensures routing works in any location.

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
