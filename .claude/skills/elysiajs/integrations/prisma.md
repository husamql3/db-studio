
# Prisma Integration
Elysia + Prisma integration guide

## What It Is
Type-safe ORM. Generate Elysia validation models from Prisma schema via `prismabox`.

## Flow
```
Prisma → prismabox → Elysia validation → OpenAPI + Eden Treaty
```

## Installation
```bash
bun add @prisma/client prismabox && \
bun add -d prisma
```

## Prisma Schema
Add `prismabox` generator:
```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client"
  output   = "../generated/prisma"
}

datasource db {
  provider = "sqlite"
  url      = env("DATABASE_URL")
}

generator prismabox {
  provider = "prismabox"
  typeboxImportDependencyName = "elysia"
  typeboxImportVariableName = "t"
  inputModel = true
  output   = "../generated/prismabox"
}

model User {
  id    String  @id @default(cuid())
  email String  @unique
  name  String?
  posts Post[]
}

model Post {
  id        String  @id @default(cuid())
  title     String
  content   String?
  published Boolean @default(false)
  author    User    @relation(fields: [authorId], references: [id])
  authorId  String
}
```

Generates:
- `User` → `generated/prismabox/User.ts`
- `Post` → `generated/prismabox/Post.ts`

## Using Generated Models
```typescript
// src/index.ts
import { Elysia, t } from 'elysia'
import { PrismaClient } from '../generated/prisma'
import { UserPlain, UserPlainInputCreate } from '../generated/prismabox/User'

const prisma = new PrismaClient()

new Elysia()
  .put('/', async ({ body }) =>
    prisma.user.create({ data: body }), {
      body: UserPlainInputCreate,
      response: UserPlain
    }
  )
  .get('/id/:id', async ({ params: { id }, status }) => {
    const user = await prisma.user.findUnique({ where: { id } })
    
    if (!user) return status(404, 'User not found')
    
    return user
  }, {
    response: {
      200: UserPlain,
      404: t.String()
    }
  })
  .listen(3000)
```

Reuses DB schema in Elysia validation models.
