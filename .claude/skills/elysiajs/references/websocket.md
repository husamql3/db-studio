# WebSocket

## Basic WebSocket

```typescript
import { Elysia } from 'elysia'

new Elysia()
  .ws('/chat', {
    message(ws, message) {
      ws.send(message)  // Echo back
    }
  })
  .listen(3000)
```

## With Validation

```typescript
import { Elysia, t } from 'elysia'

.ws('/chat', {
  body: t.Object({
    message: t.String(),
    username: t.String()
  }),
  response: t.Object({
    message: t.String(),
    timestamp: t.Number()
  }),
  message(ws, body) {
    ws.send({
      message: body.message,
      timestamp: Date.now()
    })
  }
})
```

## Lifecycle Events

```typescript
.ws('/chat', {
  open(ws) {
    console.log('Client connected')
  },
  message(ws, message) {
    console.log('Received:', message)
    ws.send('Echo: ' + message)
  },
  close(ws) {
    console.log('Client disconnected')
  },
  error(ws, error) {
    console.error('Error:', error)
  }
})
```

## Broadcasting

```typescript
const connections = new Set<any>()

.ws('/chat', {
  open(ws) {
    connections.add(ws)
  },
  message(ws, message) {
    // Broadcast to all connected clients
    for (const client of connections) {
      client.send(message)
    }
  },
  close(ws) {
    connections.delete(ws)
  }
})
```

## With Authentication

```typescript
.ws('/chat', {
  beforeHandle({ headers, status }) {
    const token = headers.authorization?.replace('Bearer ', '')
    if (!verifyToken(token)) {
      return status(401)
    }
  },
  message(ws, message) {
    ws.send(message)
  }
})
```

## Room-Based Chat

```typescript
const rooms = new Map<string, Set<any>>()

.ws('/chat/:room', {
  open(ws) {
    const room = ws.data.params.room
    if (!rooms.has(room)) {
      rooms.set(room, new Set())
    }
    rooms.get(room)!.add(ws)
  },
  message(ws, message) {
    const room = ws.data.params.room
    const clients = rooms.get(room)
    
    if (clients) {
      for (const client of clients) {
        client.send(message)
      }
    }
  },
  close(ws) {
    const room = ws.data.params.room
    const clients = rooms.get(room)
    
    if (clients) {
      clients.delete(ws)
      if (clients.size === 0) {
        rooms.delete(room)
      }
    }
  }
})
```

## With State/Context

```typescript
.ws('/chat', {
  open(ws) {
    ws.data.userId = generateUserId()
    ws.data.joinedAt = Date.now()
  },
  message(ws, message) {
    const response = {
      userId: ws.data.userId,
      message,
      timestamp: Date.now()
    }
    ws.send(response)
  }
})
```

## Client Usage (Browser)

```typescript
const ws = new WebSocket('ws://localhost:3000/chat')

ws.onopen = () => {
  console.log('Connected')
  ws.send('Hello Server!')
}

ws.onmessage = (event) => {
  console.log('Received:', event.data)
}

ws.onerror = (error) => {
  console.error('Error:', error)
}

ws.onclose = () => {
  console.log('Disconnected')
}
```

## Eden Treaty WebSocket

```typescript
// Server
export const app = new Elysia()
  .ws('/chat', {
    message(ws, message) {
      ws.send(message)
    }
  })

export type App = typeof app

// Client
import { treaty } from '@elysiajs/eden'
import type { App } from './server'

const api = treaty<App>('localhost:3000')
const chat = api.chat.subscribe()

chat.subscribe((message) => {
  console.log('Received:', message)
})

chat.send('Hello!')
```

## Headers in WebSocket

```typescript
.ws('/chat', {
  header: t.Object({
    authorization: t.String()
  }),
  beforeHandle({ headers, status }) {
    const token = headers.authorization?.replace('Bearer ', '')
    if (!token) return status(401)
  },
  message(ws, message) {
    ws.send(message)
  }
})
```

## Query Parameters

```typescript
.ws('/chat', {
  query: t.Object({
    username: t.String()
  }),
  message(ws, message) {
    const username = ws.data.query.username
    ws.send(`${username}: ${message}`)
  }
})

// Client
const ws = new WebSocket('ws://localhost:3000/chat?username=john')
```

## Compression

```typescript
new Elysia({
  websocket: {
    perMessageDeflate: true
  }
})
  .ws('/chat', {
    message(ws, message) {
      ws.send(message)
    }
  })
```
