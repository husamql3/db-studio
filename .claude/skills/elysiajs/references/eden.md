# Eden Treaty
e2e type safe RPC client for share type from backend to frontend.

## What It Is
Type-safe object representation for Elysia server. Auto-completion + error handling.

## Installation
```bash
bun add @elysiajs/eden
bun add -d elysia
```

Export Elysia server type:
```typescript
const app = new Elysia()
    .get('/', () => 'Hi Elysia')
    .get('/id/:id', ({ params: { id } }) => id)
    .post('/mirror', ({ body }) => body, {
        body: t.Object({
            id: t.Number(),
            name: t.String()
        })
    })
    .listen(3000)

export type App = typeof app
```

Consume on client side:
```typescript
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const client = treaty<App>('localhost:3000')

// response: Hi Elysia
const { data: index } = await client.get()

// response: 1895
const { data: id } = await client.id({ id: 1895 }).get()

// response: { id: 1895, name: 'Skadi' }
const { data: nendoroid } = await client.mirror.post({
    id: 1895,
    name: 'Skadi'
})
```

## Common Errors & Fixes
- **Strict mode**: Enable in tsconfig
- **Version mismatch**: `npm why elysia` - must match server/client
- **TypeScript**: Min 5.0
- **Method chaining**: Required on server
- **Bun types**: `bun add -d @types/bun` if using Bun APIs
- **Path alias**: Must resolve same on frontend/backend

### Monorepo Path Alias
Must resolve to same file on frontend/backend

```json
// tsconfig.json at root
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@frontend/*": ["./apps/frontend/src/*"],
      "@backend/*": ["./apps/backend/src/*"]
    }
  }
}
```

## Syntax Mapping
| Path           | Method | Treaty                        |
|----------------|--------|-------------------------------|
| /              | GET    | `.get()`                      |
| /hi            | GET    | `.hi.get()`                   |
| /deep/nested   | POST   | `.deep.nested.post()`         |
| /item/:name    | GET    | `.item({ name: 'x' }).get()`  |

## Parameters

### With body (POST/PUT/PATCH/DELETE):
```typescript
.user.post(
  { name: 'Elysia' },              // body
  { headers: {}, query: {}, fetch: {} } // optional
)
```

### No body (GET/HEAD):
```typescript
.hello.get({ headers: {}, query: {}, fetch: {} })
```

### Empty body with query/headers:
```typescript
.user.post(null, { query: { name: 'Ely' } })
```

### Fetch options:
```typescript
.hello.get({ fetch: { signal: controller.signal } })
```

### File upload:
```typescript
// Accepts: File | File[] | FileList | Blob
.image.post({
  title: 'Title',
  image: fileInput.files!
})
```

## Response
```typescript
const { data, error, response, status, headers } = await api.user.post({ name: 'x' })

if (error) {
  switch (error.status) {
    case 400: throw error.value
    default: throw error.value
  }
}
// data unwrapped after error handling
return data
```

status >= 300 → `data = null`, `error` has value

## Stream/SSE
Interpreted as `AsyncGenerator`:
```typescript
const { data, error } = await treaty(app).ok.get()
if (error) throw error

for await (const chunk of data) console.log(chunk)
```

## Utility Types
```typescript
import { Treaty } from '@elysiajs/eden'

type UserData = Treaty.Data<typeof api.user.post>
type UserError = Treaty.Error<typeof api.user.post>
```

## WebSocket
```typescript
const chat = api.chat.subscribe()

chat.subscribe((message) => console.log('got', message))
chat.on('open', () => chat.send('hello'))

// Native access: chat.raw
```

`.subscribe()` accepts same params as `get`/`head`
