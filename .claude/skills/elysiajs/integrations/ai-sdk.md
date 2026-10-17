# AI SDK Integration

## What It Is
Seamless integration with Vercel AI SDK via response streaming.

## Response Streaming
Return `ReadableStream` or `Response` directly:
```typescript
import { streamText } from 'ai'
import { openai } from '@ai-sdk/openai'

new Elysia().get('/', () => {
  const stream = streamText({
    model: openai('gpt-5'),
    system: 'You are Yae Miko from Genshin Impact',
    prompt: 'Hi! How are you doing?'
  })
  
  return stream.textStream  // ReadableStream
  // or
  return stream.toUIMessageStream()  // UI Message Stream
})
```

Elysia auto-handles stream.

## Server-Sent Events
Wrap `ReadableStream` with `sse`:
```typescript
import { sse } from 'elysia'

.get('/', () => {
  const stream = streamText({ /* ... */ })
  
  return sse(stream.textStream)
  // or
  return sse(stream.toUIMessageStream())
})
```

Each chunk → SSE.

## As Response
Return stream directly (no Eden type safety):
```typescript
.get('/', () => {
  const stream = streamText({ /* ... */ })
  
  return stream.toTextStreamResponse()
  // or
  return stream.toUIMessageStreamResponse()  // Uses SSE
})
```

## Manual Streaming
Generator function for control:
```typescript
import { sse } from 'elysia'

.get('/', async function* () {
  const stream = streamText({ /* ... */ })
  
  for await (const data of stream.textStream)
    yield sse({ data, event: 'message' })
  
  yield sse({ event: 'done' })
})
```

## Fetch for Unsupported Models
Direct fetch with streaming proxy:
```typescript
.get('/', () => {
  return fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-5',
      stream: true,
      messages: [
        { role: 'system', content: 'You are Yae Miko' },
        { role: 'user', content: 'Hi! How are you doing?' }
      ]
    })
  })
})
```

Elysia auto-proxies fetch response with streaming.
