# OpenAPI Plugin

## Installation
```bash
bun add @elysiajs/openapi
```

## Basic Usage
```typescript
import { openapi } from '@elysiajs/openapi'

new Elysia()
  .use(openapi())
  .get('/', () => 'hello')
```

Docs at `/openapi`, spec at `/openapi/json`.

## Detail Object
Extends OpenAPI Operation Object:
```typescript
.get('/', () => 'hello', {
  detail: {
    title: 'Hello',
    description: 'An example route',
    summary: 'Short summary',
    deprecated: false,
    hide: true,  // Hide from docs
    tags: ['App']
  }
})
```

### Documentation Config
```typescript
openapi({
  documentation: {
    info: {
      title: 'API',
      version: '1.0.0'
    },
    tags: [
      { name: 'App', description: 'General' }
    ],
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer' }
      }
    }
  }
})
```

### Standard Schema Mapping
```typescript
mapJsonSchema: {
  zod: z.toJSONSchema,  // Zod 4
  valibot: toJsonSchema,
  effect: JSONSchema.make
}
```

Zod 3: `zodToJsonSchema` from `zod-to-json-schema`

## OpenAPI Type Gen
Generate docs from types:
```typescript
import { fromTypes } from '@elysiajs/openapi'

export const app = new Elysia()
  .use(openapi({
    references: fromTypes()
  }))
```

### Production
Recommended to generate `.d.ts` file for production when using OpenAPI Type Gen
```typescript
references: fromTypes(
  process.env.NODE_ENV === 'production'
    ? 'dist/index.d.ts'
    : 'src/index.ts'
)
```

### Options
```typescript
fromTypes('src/index.ts', {
  projectRoot: path.join('..', import.meta.dir),
  tsconfigPath: 'tsconfig.dts.json'
})
```

### Caveat: Explicit Types
Use `Prettify` helper to inline when type is not showing:
```typescript
type Prettify<T> = { [K in keyof T]: T[K] } & {}

function getUser(): Prettify<User> { }
```

## Schema Description
```typescript
body: t.Object({
  username: t.String(),
  password: t.String({
    minLength: 8,
    description: 'Password (8+ chars)'
  })
}, {
  description: 'Expected username and password'
}),
detail: {
  summary: 'Sign in user',
  tags: ['auth']
}
```

## Response Headers
```typescript
import { withHeader } from '@elysiajs/openapi'

response: withHeader(
  t.Literal('Hi'),
  { 'x-powered-by': t.Literal('Elysia') }
)
```

Annotation only - doesn't enforce. Set headers manually.

## Tags
Define + assign:
```typescript
.use(openapi({
  documentation: {
    tags: [
      { name: 'App', description: 'General' },
      { name: 'Auth', description: 'Auth' }
    ]
  }
}))
.get('/', () => 'hello', {
  detail: { tags: ['App'] }
})
```

### Instance Tags
```typescript
new Elysia({ tags: ['user'] })
  .get('/user', 'user')
```

## Reference Models
Auto-generates schemas:
```typescript
.model({
  User: t.Object({
    id: t.Number(),
    username: t.String()
  })
})
.get('/user', () => ({ id: 1, username: 'x' }), {
  response: { 200: 'User' },
  detail: { tags: ['User'] }
})
```

## Guard
Apply to instance/group:
```typescript
.guard({
  detail: {
    description: 'Requires auth'
  }
})
.get('/user', 'user')
```

## Security
```typescript
.use(openapi({
  documentation: {
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT'
        }
      }
    }
  }
}))

new Elysia({
  prefix: '/address',
  detail: {
    security: [{ bearerAuth: [] }]
  }
})
```

Secures all routes under prefix.

## Config
Below is a config which is accepted by the `openapi({})`

### enabled
@default true
Enable/Disable the plugin

### documentation
OpenAPI documentation information
@see https://spec.openapis.org/oas/v3.0.3.html

### exclude
Configuration to exclude paths or methods from documentation

### exclude.methods
List of methods to exclude from documentation

### exclude.paths
List of paths to exclude from documentation

### exclude.staticFile
@default true

Exclude static file routes from documentation

### exclude.tags
List of tags to exclude from documentation

### mapJsonSchema
A custom mapping function from Standard schema to OpenAPI schema

### path
@default '/openapi'
The endpoint to expose OpenAPI documentation frontend

### provider
@default 'scalar'

OpenAPI documentation frontend between:
- Scalar
- SwaggerUI
- null: disable frontend
