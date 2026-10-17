# Deno Integration
Run Elysia on Deno

## What It Is
Run Elysia on Deno via Web Standard Request/Response.

## Setup
Wrap `Elysia.fetch` in `Deno.serve`:
```typescript
import { Elysia } from 'elysia'

const app = new Elysia()
  .get('/', () => 'Hello Elysia')
  .listen(3000)

Deno.serve(app.fetch)
```

Run:
```bash
deno serve --watch src/index.ts
```

## Port Config
```typescript
Deno.serve(app.fetch)                  // Default
Deno.serve({ port: 8787 }, app.fetch)  // Custom port
```

## pnpm
[Inference] pnpm doesn't auto-install peer deps. Manual install required:
```bash
pnpm add @sinclair/typebox openapi-types
```
