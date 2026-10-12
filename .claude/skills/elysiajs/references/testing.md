# Unit Testing

## Basic Test Setup

### Installation
```bash
bun add -d @elysiajs/eden
```

### Basic Test
```typescript
// test/app.test.ts
import { describe, expect, it } from 'bun:test'
import { Elysia } from 'elysia'

describe('Elysia App', () => {
  it('should return hello world', async () => {
    const app = new Elysia()
      .get('/', () => 'Hello World')
    
    const res = await app.handle(
      new Request('http://localhost/')
    )
    
    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Hello World')
  })
})
```

## Testing Routes

### GET Request
```typescript
it('should get user by id', async () => {
  const app = new Elysia()
    .get('/user/:id', ({ params: { id } }) => ({
      id,
      name: 'John Doe'
    }))
  
  const res = await app.handle(
    new Request('http://localhost/user/123')
  )
  
  const data = await res.json()
  
  expect(res.status).toBe(200)
  expect(data).toEqual({
    id: '123',
    name: 'John Doe'
  })
})
```

### POST Request
```typescript
it('should create user', async () => {
  const app = new Elysia()
    .post('/user', ({ body }) => body)
  
  const res = await app.handle(
    new Request('http://localhost/user', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Jane Doe',
        email: 'jane@example.com'
      })
    })
  )
  
  const data = await res.json()
  
  expect(res.status).toBe(200)
  expect(data.name).toBe('Jane Doe')
})
```

## Testing Module/Plugin

### Module Structure
```
src/
├── modules/
│   └── auth/
│       ├── index.ts     # Elysia instance
│       ├── service.ts
│       └── model.ts
└── index.ts
```

### Auth Module
```typescript
// src/modules/auth/index.ts
import { Elysia, t } from 'elysia'

export const authModule = new Elysia({ prefix: '/auth' })
  .post('/login', ({ body, cookie: { session } }) => {
    if (body.username === 'admin' && body.password === 'password') {
      session.value = 'valid-session'
      return { success: true }
    }
    return { success: false }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })
  .get('/profile', ({ cookie: { session }, status }) => {
    if (!session.value) {
      return status(401, { error: 'Unauthorized' })
    }
    return { username: 'admin' }
  })
```

### Auth Module Test
```typescript
// test/auth.test.ts
import { describe, expect, it } from 'bun:test'
import { authModule } from '../src/modules/auth'

describe('Auth Module', () => {
  it('should login successfully', async () => {
    const res = await authModule.handle(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'admin',
          password: 'password'
        })
      })
    )
    
    const data = await res.json()
    expect(res.status).toBe(200)
    expect(data.success).toBe(true)
  })
  
  it('should reject invalid credentials', async () => {
    const res = await authModule.handle(
      new Request('http://localhost/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: 'wrong',
          password: 'wrong'
        })
      })
    )
    
    const data = await res.json()
    expect(data.success).toBe(false)
  })
  
  it('should return 401 for unauthenticated profile request', async () => {
    const res = await authModule.handle(
      new Request('http://localhost/auth/profile')
    )
    
    expect(res.status).toBe(401)
  })
})
```

## Eden Treaty Testing

### Setup
```typescript
import { treaty } from '@elysiajs/eden'
import { app } from '../src/modules/auth'

const api = treaty(app)
```

### Eden Tests
```typescript
describe('Auth Module with Eden', () => {
  it('should login with Eden', async () => {
    const { data, error } = await api.auth.login.post({
      username: 'admin',
      password: 'password'
    })
    
    expect(error).toBeNull()
    expect(data?.success).toBe(true)
  })
  
  it('should get profile with Eden', async () => {
    // First login
    await api.auth.login.post({
      username: 'admin',
      password: 'password'
    })
    
    // Then get profile
    const { data, error } = await api.auth.profile.get()
    
    expect(error).toBeNull()
    expect(data?.username).toBe('admin')
  })
})
```

## Mocking Dependencies

### With Decorators
```typescript
// app.ts
export const app = new Elysia()
  .decorate('db', realDatabase)
  .get('/users', ({ db }) => db.getUsers())

// test
import { app } from '../src/app'

describe('App with mocked DB', () => {
  it('should use mock database', async () => {
    const mockDb = {
      getUsers: () => [{ id: 1, name: 'Test User' }]
    }
    
    const testApp = app.decorate('db', mockDb)
    
    const res = await testApp.handle(
      new Request('http://localhost/users')
    )
    
    const data = await res.json()
    expect(data).toEqual([{ id: 1, name: 'Test User' }])
  })
})
```

## Testing with Headers

```typescript
it('should require authorization', async () => {
  const app = new Elysia()
    .get('/protected', ({ headers, status }) => {
      if (!headers.authorization) {
        return status(401)
      }
      return { data: 'secret' }
    })
  
  const res = await app.handle(
    new Request('http://localhost/protected', {
      headers: {
        'Authorization': 'Bearer token123'
      }
    })
  )
  
  expect(res.status).toBe(200)
})
```

## Testing Validation

```typescript
import { Elysia, t } from 'elysia'

it('should validate request body', async () => {
  const app = new Elysia()
    .post('/user', ({ body }) => body, {
      body: t.Object({
        name: t.String(),
        age: t.Number({ minimum: 0 })
      })
    })
  
  // Valid request
  const validRes = await app.handle(
    new Request('http://localhost/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John',
        age: 25
      })
    })
  )
  expect(validRes.status).toBe(200)
  
  // Invalid request (negative age)
  const invalidRes = await app.handle(
    new Request('http://localhost/user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'John',
        age: -5
      })
    })
  )
  expect(invalidRes.status).toBe(400)
})
```

## Testing WebSocket

```typescript
it('should handle websocket connection', (done) => {
  const app = new Elysia()
    .ws('/chat', {
      message(ws, message) {
        ws.send('Echo: ' + message)
      }
    })
  
  const ws = new WebSocket('ws://localhost:3000/chat')
  
  ws.onopen = () => {
    ws.send('Hello')
  }
  
  ws.onmessage = (event) => {
    expect(event.data).toBe('Echo: Hello')
    ws.close()
    done()
  }
})
```

## Complete Example

```typescript
// src/modules/auth/index.ts
import { Elysia, t } from 'elysia'

export const authModule = new Elysia({ prefix: '/auth' })
  .post('/login', ({ body, cookie: { session } }) => {
    if (body.username === 'admin' && body.password === 'password') {
      session.value = 'valid-session'
      return { success: true }
    }
    return { success: false }
  }, {
    body: t.Object({
      username: t.String(),
      password: t.String()
    })
  })
  .get('/profile', ({ cookie: { session }, status }) => {
    if (!session.value) {
      return status(401)
    }
    return { username: 'admin' }
  })

// test/auth.test.ts
import { describe, expect, it } from 'bun:test'
import { treaty } from '@elysiajs/eden'
import { authModule } from '../src/modules/auth'

const api = treaty(authModule)

describe('Auth Module', () => {
  it('should login successfully', async () => {
    const { data, error } = await api.auth.login.post({
      username: 'admin',
      password: 'password'
    })
    
    expect(error).toBeNull()
    expect(data?.success).toBe(true)
  })
  
  it('should return 401 for unauthorized access', async () => {
    const { error } = await api.auth.profile.get()
    
    expect(error?.status).toBe(401)
  })
})
```
