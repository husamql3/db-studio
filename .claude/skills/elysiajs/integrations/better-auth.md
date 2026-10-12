# Better Auth Integration
Elysia + Better Auth integration guide

## What It Is
Framework-agnostic TypeScript auth/authz. Comprehensive features + plugin ecosystem.

## Setup
```typescript
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

export const auth = betterAuth({
  database: new Pool()
})
```

## Handler Mounting
```typescript
import { auth } from './auth'

new Elysia()
  .mount(auth.handler)  // http://localhost:3000/api/auth
  .listen(3000)
```

### Custom Endpoint
```typescript
// Mount with prefix
.mount('/auth', auth.handler)  // http://localhost:3000/auth/api/auth

// Customize basePath
export const auth = betterAuth({
  basePath: '/api'  // http://localhost:3000/auth/api
})
```

Cannot set `basePath` to empty or `/`.

## OpenAPI Integration
Extract docs from Better Auth:
```typescript
import { openAPI } from 'better-auth/plugins'

let _schema: ReturnType<typeof auth.api.generateOpenAPISchema>
const getSchema = async () => (_schema ??= auth.api.generateOpenAPISchema())

export const OpenAPI = {
  getPaths: (prefix = '/auth/api') =>
    getSchema().then(({ paths }) => {
      const reference: typeof paths = Object.create(null)
      
      for (const path of Object.keys(paths)) {
        const key = prefix + path
        reference[key] = paths[path]
        
        for (const method of Object.keys(paths[path])) {
          const operation = (reference[key] as any)[method]
          operation.tags = ['Better Auth']
        }
      }
      
      return reference
    }) as Promise<any>,
  components: getSchema().then(({ components }) => components) as Promise<any>
} as const
```

Apply to Elysia:
```typescript
new Elysia().use(openapi({
  documentation: {
    components: await OpenAPI.components,
    paths: await OpenAPI.getPaths()
  }
}))
```

## CORS
```typescript
import { cors } from '@elysiajs/cors'

new Elysia()
  .use(cors({
    origin: 'http://localhost:3001',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization']
  }))
  .mount(auth.handler)
```

## Macro for Auth
Use macro + resolve for session/user:
```typescript
const betterAuth = new Elysia({ name: 'better-auth' })
  .mount(auth.handler)
  .macro({
    auth: {
      async resolve({ status, request: { headers } }) {
        const session = await auth.api.getSession({ headers })
        
        if (!session) return status(401)
        
        return {
          user: session.user,
          session: session.session
        }
      }
    }
  })

new Elysia()
  .use(betterAuth)
  .get('/user', ({ user }) => user, { auth: true })
```

Access `user` and `session` in all routes.
