# Vercel Integration
Deploy Elysia on Vercel

## What It Is
Zero-config deployment on Vercel (Bun or Node runtime).

## Setup
1. Create/import Elysia server in `src/index.ts`
2. Export as default:
```typescript
import { Elysia, t } from 'elysia'

export default new Elysia()
  .get('/', () => 'Hello Vercel Function')
  .post('/', ({ body }) => body, {
    body: t.Object({ name: t.String() })
  })
```

3. Develop locally:
```bash
vc dev
```

4. Deploy:
```bash
vc deploy
```

## Node.js Runtime
Set in `package.json`:
```json
{
  "name": "elysia-app",
  "type": "module"
}
```

## Bun Runtime
Set in `vercel.json`:
```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "bunVersion": "1.x"
}
```

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```

## Troubleshooting
Vercel has zero config for Elysia. For additional config, see [Vercel docs](https://vercel.com/docs/frameworks/backend/elysia).
