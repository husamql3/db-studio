# Drizzle Integration
Elysia + Drizzle integration guide

## What It Is
Headless TypeScript ORM. Convert Drizzle schema → Elysia validation models via `drizzle-typebox`.

## Flow
```
Drizzle → drizzle-typebox → Elysia validation → OpenAPI + Eden Treaty
```

## Installation
```bash
bun add drizzle-orm drizzle-typebox
```

### Pin TypeBox Version
Prevent Symbol conflicts:
```bash
grep "@sinclair/typebox" node_modules/elysia/package.json
```

Add to `package.json`:
```json
{
  "overrides": {
    "@sinclair/typebox": "0.32.4"
  }
}
```

## Drizzle Schema
```typescript
// src/database/schema.ts
import { pgTable, varchar, timestamp } from 'drizzle-orm/pg-core'
import { createId } from '@paralleldrive/cuid2'

export const user = pgTable('user', {
  id: varchar('id').$defaultFn(() => createId()).primaryKey(),
  username: varchar('username').notNull().unique(),
  password: varchar('password').notNull(),
  email: varchar('email').notNull().unique(),
  salt: varchar('salt', { length: 64 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull()
})

export const table = { user } as const
export type Table = typeof table
```

## drizzle-typebox
```typescript
import { t } from 'elysia'
import { createInsertSchema } from 'drizzle-typebox'
import { table } from './database/schema'

const _createUser = createInsertSchema(table.user, {
  email: t.String({ format: 'email' })  // Replace with Elysia type
})

new Elysia()
  .post('/sign-up', ({ body }) => {}, {
    body: t.Omit(_createUser, ['id', 'salt', 'createdAt'])
  })
```

## Type Instantiation Error
**Error**: "Type instantiation is possibly infinite"

**Cause**: Circular reference when nesting drizzle-typebox into Elysia schema.

**Fix**: Explicitly define type between them:
```typescript
// ✅ Works
const _createUser = createInsertSchema(table.user, {
  email: t.String({ format: 'email' })
})
const createUser = t.Omit(_createUser, ['id', 'salt', 'createdAt'])

// ❌ Infinite loop
const createUser = t.Omit(
  createInsertSchema(table.user, { email: t.String({ format: 'email' }) }),
  ['id', 'salt', 'createdAt']
)
```

Always declare variable for drizzle-typebox then reference it.

## Utility Functions
Copy as-is for simplified usage:
```typescript
// src/database/utils.ts
/**
 * @lastModified 2025-02-04
 * @see https://elysiajs.com/recipe/drizzle.html#utility
 */

import { Kind, type TObject } from '@sinclair/typebox'
import {
    createInsertSchema,
    createSelectSchema,
    BuildSchema,
} from 'drizzle-typebox'

import { table } from './schema'
import type { Table } from 'drizzle-orm'

type Spread<
    T extends TObject | Table,
    Mode extends 'select' | 'insert' | undefined,
> =
    T extends TObject<infer Fields>
        ? {
              [K in keyof Fields]: Fields[K]
          }
        : T extends Table
          ? Mode extends 'select'
              ? BuildSchema<
                    'select',
                    T['_']['columns'],
                    undefined
                >['properties']
              : Mode extends 'insert'
                ? BuildSchema<
                      'insert',
                      T['_']['columns'],
                      undefined
                  >['properties']
                : {}
          : {}

/**
 * Spread a Drizzle schema into a plain object
 */
export const spread = <
    T extends TObject | Table,
    Mode extends 'select' | 'insert' | undefined,
>(
    schema: T,
    mode?: Mode,
): Spread<T, Mode> => {
    const newSchema: Record<string, unknown> = {}
    let table

    switch (mode) {
        case 'insert':
        case 'select':
            if (Kind in schema) {
                table = schema
                break
            }

            table =
                mode === 'insert'
                    ? createInsertSchema(schema)
                    : createSelectSchema(schema)

            break

        default:
            if (!(Kind in schema)) throw new Error('Expect a schema')
            table = schema
    }

    for (const key of Object.keys(table.properties))
        newSchema[key] = table.properties[key]

    return newSchema as any
}

/**
 * Spread a Drizzle Table into a plain object
 *
 * If `mode` is 'insert', the schema will be refined for insert
 * If `mode` is 'select', the schema will be refined for select
 * If `mode` is undefined, the schema will be spread as is, models will need to be refined manually
 */
export const spreads = <
    T extends Record<string, TObject | Table>,
    Mode extends 'select' | 'insert' | undefined,
>(
    models: T,
    mode?: Mode,
): {
    [K in keyof T]: Spread<T[K], Mode>
} => {
    const newSchema: Record<string, unknown> = {}
    const keys = Object.keys(models)

    for (const key of keys) newSchema[key] = spread(models[key], mode)

    return newSchema as any
}
```

Usage:
```typescript
// ✅ Using spread
const user = spread(table.user, 'insert')
const createUser = t.Object({
  id: user.id,
  username: user.username,
  password: user.password
})

// ⚠️ Using t.Pick
const _createUser = createInsertSchema(table.user)
const createUser = t.Pick(_createUser, ['id', 'username', 'password'])
```

## Table Singleton Pattern
```typescript
// src/database/model.ts
import { table } from './schema'
import { spreads } from './utils'

export const db = {
  insert: spreads({ user: table.user }, 'insert'),
  select: spreads({ user: table.user }, 'select')
} as const
```

Usage:
```typescript
// src/index.ts
import { db } from './database/model'
const { user } = db.insert

new Elysia()
  .post('/sign-up', ({ body }) => {}, {
    body: t.Object({
      id: user.username,
      username: user.username,
      password: user.password
    })
  })
```

## Refinement
```typescript
// src/database/model.ts
import { createInsertSchema, createSelectSchema } from 'drizzle-typebox'

export const db = {
  insert: spreads({
    user: createInsertSchema(table.user, {
      email: t.String({ format: 'email' })
    })
  }, 'insert'),
  select: spreads({
    user: createSelectSchema(table.user, {
      email: t.String({ format: 'email' })
    })
  }, 'select')
} as const
```

`spread` skips refined schemas.
