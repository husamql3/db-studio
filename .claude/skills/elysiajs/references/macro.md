# Macro

Composable Elysia function for controlling lifecycle/schema/context with full type safety. Available in hook after definition control by key-value label.

## Basic Pattern
```typescript
.macro({
  hi: (word: string) => ({
    beforeHandle() { console.log(word) }
  })
})
.get('/', () => 'hi', { hi: 'Elysia' })
```

## Property Shorthand
Object → function accepting boolean:
```typescript
.macro({
	// These equivalent:
	isAuth: { resolve: () => ({ user: 'saltyaom' }) },
	isAuth(enabled: boolean) { if(enabled) return { resolve() {...} } }
})
```

## Error Handling
Return `status`, don't throw:
```typescript
.macro({
  auth: {
    resolve({ headers }) {
      if(!headers.authorization) return status(401, 'Unauthorized')
      return { user: 'SaltyAom' }
    }
  }
})
```

## Resolve - Add Context Props
```typescript
.macro({
  user: (enabled: true) => ({
    resolve: () => ({ user: 'Pardofelis' })
  })
})
.get('/', ({ user }) => user, { user: true })
```

### Named Macro for Type Inference
TypeScript limitation workaround:
```typescript
.macro('user', { resolve: () => ({ user: 'lilith' }) })
.macro('user2', { user: true, resolve: ({ user }) => {} })
```

## Schema
Auto-validates, infers types, stacks with other schemas:
```typescript
.macro({
  withFriends: {
    body: t.Object({ friends: t.Tuple([...]) })
  }
})
```

Use named single macro for lifecycle type inference within same macro.

## Extension
Stack macros:
```typescript
.macro({
  sartre: { body: t.Object({...}) },
  fouco: { body: t.Object({...}) },
  lilith: { fouco: true, sartre: true, body: t.Object({...}) }
})
```

## Deduplication
Auto-dedupes by property value. Custom seed:
```typescript
.macro({ sartre: (role: string) => ({ seed: role, ... }) })
```

Max stack: 16 (prevents infinite loops)
