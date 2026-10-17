# Node.js Integration
Run Elysia on Node.js

## What It Is
Runtime adapter to run Elysia on Node.js.

## Installation
```bash
bun add elysia @elysiajs/node
```

## Setup
Apply node adapter:
```typescript
import { Elysia } from 'elysia'
import { node } from '@elysiajs/node'

const app = new Elysia({ adapter: node() })
  .get('/', () => 'Hello Elysia')
  .listen(3000)
```

## Additional Setup (Recommended)
Install `tsx` for hot-reload:
```bash
bun add -d tsx @types/node typescript
```

Scripts in `package.json`:
```json
{
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc src/index.ts --outDir dist",
    "start": "NODE_ENV=production node dist/index.js"
  }
}
```

- **dev**: Hot-reload dev mode
- **build**: Production build
- **start**: Production server

Create `tsconfig.json`:
```bash
tsc --init
```

Update strict mode:
```json
{
  "compilerOptions": {
    "strict": true
  }
}
```

Provides hot-reload + JSX support similar to `bun dev`.

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
