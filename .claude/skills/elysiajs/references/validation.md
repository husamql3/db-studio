# Validation Schema - SKILLS.md

## What It Is
Runtime validation + type inference + OpenAPI schema from single source. TypeBox-based with Standard Schema support.

## Basic Usage
```typescript
import { Elysia, t } from 'elysia'

new Elysia()
  .get('/id/:id', ({ params: { id } }) => id, {
    params: t.Object({ id: t.Number({ minimum: 1 }) }),
    response: {
      200: t.Number(),
      404: t.Literal('Not Found')
    }
  })
```

## Schema Types
Third parameter of HTTP method:
- **body** - HTTP message
- **query** - URL query params
- **params** - Path params
- **headers** - Request headers
- **cookie** - Request cookies
- **response** - Response (per status)

## Standard Schema Support
Use Zod, Valibot, ArkType, Effect, Yup, Joi:
```typescript
import { z } from 'zod'
import * as v from 'valibot'

.get('/', ({ params, query }) => params.id, {
  params: z.object({ id: z.coerce.number() }),
  query: v.object({ name: v.literal('Lilith') })
})
```

Mix validators in same handler.

## Body
```typescript
body: t.Object({ name: t.String() })
```

GET/HEAD: body-parser disabled by default (RFC2616).

### File Upload
```typescript
body: t.Object({
  file: t.File({ format: 'image/*' }),
  multipleFiles: t.Files()
})
// Auto-assumes multipart/form-data
```

### File (Standard Schema)
```typescript
import { fileType } from 'elysia'

body: z.object({
  file: z.file().refine((file) => fileType(file, 'image/jpeg'))
})
```

Use `fileType` for security (validates magic number, not just MIME).

## Query
```typescript
query: t.Object({ name: t.String() })
// /?name=Elysia
```

Auto-coerces to specified type.

### Arrays
```typescript
query: t.Object({ name: t.Array(t.String()) })
```

Formats supported:
- **nuqs**: `?name=a,b,c` (comma delimiter)
- **HTML form**: `?name=a&name=b&name=c` (multiple keys)

## Params
```typescript
params: t.Object({ id: t.Number() })
// /id/1
```

Auto-inferred as string if schema not provided.

## Headers
```typescript
headers: t.Object({ authorization: t.String() })
```

`additionalProperties: true` by default. Always lowercase keys.

## Cookie
```typescript
cookie: t.Cookie({
  name: t.String()
}, {
  secure: true,
  httpOnly: true
})
```

Or use `t.Object`. `additionalProperties: true` by default.

## Response
```typescript
response: t.Object({ name: t.String() })
```

### Per Status
```typescript
response: {
  200: t.Object({ name: t.String() }),
  400: t.Object({ error: t.String() })
}
```

## Error Handling

### Inline Error Property
```typescript
body: t.Object({
  x: t.Number({ error: 'x must be number' })
})
```

Or function:
```typescript
x: t.Number({
  error({ errors, type, validation, value }) {
    return 'Expected x to be number'
  }
})
```

### onError Hook
```typescript
.onError(({ code, error }) => {
  if (code === 'VALIDATION')
    return error.message // or error.all[0].message
})
```

`error.all` - list all error causes. `error.all.find(x => x.path === '/name')` - find specific field.

## Reference Models
Name + reuse models:
```typescript
.model({
  sign: t.Object({
    username: t.String(),
    password: t.String()
  })
})
.post('/sign-in', ({ body }) => body, {
  body: 'sign',
  response: 'sign'
})
```

Extract to plugin:
```typescript
// auth.model.ts
export const authModel = new Elysia().model({ sign: t.Object({...}) })

// main.ts
new Elysia().use(authModel).post('/', ..., { body: 'sign' })
```

### Naming Convention
Prevent duplicates with namespaces:
```typescript
.model({
  'auth.admin': t.Object({...}),
  'auth.user': t.Object({...})
})
```

Or use `prefix` / `suffix` to rename models in current instance
```typescript
.model({ sign: t.Object({...}) })
.prefix('model', 'auth')
.post('/', () => '', {
	body: 'auth.User'
})
```

Models with `prefix` will be capitalized.

## TypeScript Types
```typescript
const MyType = t.Object({ hello: t.Literal('Elysia') })
type MyType = typeof MyType.static
```

Single schema → runtime validation + coercion + TypeScript type + OpenAPI.

## Guard
Apply schema to multiple handlers. Affects all handlers after definition.

### Basic Usage
```typescript
import { Elysia, t } from 'elysia'

new Elysia()
  .get('/none', ({ query }) => 'hi')
  .guard({
    query: t.Object({
      name: t.String()
    })
  })
  .get('/query', ({ query }) => query)
  .listen(3000)
```

Ensures `query.name` string required for all handlers after guard.

### Behavior
| Path          | Response |
|---------------|----------|
| /none         | hi       |
| /none?name=a  | hi       |
| /query        | error    |
| /query?name=a | a        |

### Precedence
- Multiple global schemas: latest wins
- Global vs local: local wins

### Schema Types

1. override (default)
Latest schema overrides collided schema.
```typescript
.guard({ query: t.Object({ name: t.String() }) })
.guard({ query: t.Object({ id: t.Number() }) })
// Only id required, name overridden
```

2. standalone
Both schemas run independently. Both validated.
```typescript
.guard({ query: t.Object({ name: t.String() }) }, { type: 'standalone' })
.guard({ query: t.Object({ id: t.Number() }) }, { type: 'standalone' })
// Both name AND id required
```

# Typebox Validation (Elysia.t)

Elysia.t = TypeBox with server-side pre-configuration + HTTP-specific types

**TypeBox API mirrors TypeScript syntax** but provides runtime validation

## Basic Types

| TypeBox | TypeScript | Example Value |
|---------|------------|---------------|
| `t.String()` | `string` | `"hello"` |
| `t.Number()` | `number` | `42` |
| `t.Boolean()` | `boolean` | `true` |
| `t.Array(t.Number())` | `number[]` | `[1, 2, 3]` |
| `t.Object({ x: t.Number() })` | `{ x: number }` | `{ x: 10 }` |
| `t.Null()` | `null` | `null` |
| `t.Literal(42)` | `42` | `42` |

## Attributes (JSON Schema 7)

```ts
// Email format
t.String({ format: 'email' })

// Number constraints
t.Number({ minimum: 10, maximum: 100 })

// Array constraints
t.Array(t.Number(), {
  minItems: 1,  // min items
  maxItems: 5   // max items
})

// Object - allow extra properties
t.Object(
  { x: t.Number() },
  { additionalProperties: true }  // default: false
)
```

## Common Patterns

### Union (Multiple Types)
```ts
t.Union([t.String(), t.Number()])
// type: string | number
// values: "Hello" or 123
```

### Optional (Field Optional)
```ts
t.Object({
  x: t.Number(),
  y: t.Optional(t.Number())  // can be undefined
})
// type: { x: number, y?: number }
// value: { x: 123 } or { x: 123, y: 456 }
```

### Partial (All Fields Optional)
```ts
t.Partial(t.Object({
  x: t.Number(),
  y: t.Number()
}))
// type: { x?: number, y?: number }
// value: {} or { y: 123 } or { x: 1, y: 2 }
```

## Elysia-Specific Types

### UnionEnum (One of Values)
```ts
t.UnionEnum(['rapi', 'anis', 1, true, false])
```

### File (Single File Upload)
```ts
t.File({
  type: 'image',           // or ['image', 'video']
  minSize: '1k',           // 1024 bytes
  maxSize: '5m'            // 5242880 bytes
})
```

**File unit suffixes**:
- `m` = MegaByte (1048576 bytes)
- `k` = KiloByte (1024 bytes)

### Files (Multiple Files)
```ts
t.Files()  // extends File + array
```

### Cookie (Cookie Jar)
```ts
t.Cookie({
  name: t.String()
}, {
  secrets: 'secret-key'  // or ['key1', 'key2'] for rotation
})
```

### Nullable (Allow null)
```ts
t.Nullable(t.String())
// type: string | null
```

### MaybeEmpty (Allow null + undefined)
```ts
t.MaybeEmpty(t.String())
// type: string | null | undefined
```

### Form (FormData Validation)
```ts
t.Form({
  someValue: t.File()
})
// Syntax sugar for t.Object with FormData support
```

### UInt8Array (Buffer → Uint8Array)
```ts
t.UInt8Array()
// For binary file uploads with arrayBuffer parser
```

### ArrayBuffer (Buffer → ArrayBuffer)
```ts
t.ArrayBuffer()
// For binary file uploads with arrayBuffer parser
```

### ObjectString (String → Object)
```ts
t.ObjectString()
// Accepts: '{"x":1}' → parses to { x: 1 }
// Use in: query string, headers, FormData
```

### BooleanString (String → Boolean)
```ts
t.BooleanString()
// Accepts: 'true'/'false' → parses to boolean
// Use in: query string, headers, FormData
```

### Numeric (String/Number → Number)
```ts
t.Numeric()
// Accepts: '123' or 123 → transforms to 123
// Use in: path params, query string
```

## Elysia Behavior Differences from TypeBox

### 1. Optional Behavior

In Elysia, `t.Optional` makes **entire route parameter** optional (not object field):

```ts
.get('/optional', ({ query }) => query, {
  query: t.Optional(  // makes query itself optional
    t.Object({ name: t.String() })
  )
})
```

**Different from TypeBox**: TypeBox uses Optional for object fields only

### 2. Number → Numeric Auto-Conversion

**Route schema only** (not nested objects):

```ts
.get('/:id', ({ id }) => id, {
  params: t.Object({
    id: t.Number()  // ✅ Auto-converts to t.Numeric()
  }),
  body: t.Object({
    id: t.Number()  // ❌ NOT converted (stays t.Number())
  })
})

// Outside route schema
t.Number()  // ❌ NOT converted
```

**Why**: HTTP headers/query/params always strings. Auto-conversion parses numeric strings.

### 3. Boolean → BooleanString Auto-Conversion

Same as Number → Numeric:

```ts
.get('/:active', ({ active }) => active, {
  params: t.Object({
    active: t.Boolean()  // ✅ Auto-converts to t.BooleanString()
  }),
  body: t.Object({
    active: t.Boolean()  // ❌ NOT converted
  })
})
```

## Usage Pattern

```ts
import { Elysia, t } from 'elysia'

new Elysia()
  .post('/', ({ body }) => `Hello ${body}`, {
    body: t.String()  // validates body is string
  })
  .listen(3000)
```

**Validation flow**:
1. Request arrives
2. Schema validates against HTTP body/params/query/headers
3. If valid → handler executes
4. If invalid → Error Life Cycle

## Notes

[Inference] Based on docs:
- TypeBox mirrors TypeScript but adds runtime validation
- Elysia.t extends TypeBox with HTTP-specific types
- Auto-conversion (Number→Numeric, Boolean→BooleanString) only for route schemas
- Use `t.Optional` for optional route params (different from TypeBox behavior)
- File validation supports unit suffixes ('1k', '5m')
- ObjectString/BooleanString for parsing strings in query/headers
- Cookie supports key rotation with array of secrets
