# Nuxt Integration

## What It Is
Community plugin `nuxt-elysia` for Nuxt API routes with Eden Treaty.

## Installation
```bash
bun add elysia @elysiajs/eden
bun add -d nuxt-elysia
```

## Setup
1. Add to Nuxt config:
```typescript
export default defineNuxtConfig({
  modules: ['nuxt-elysia']
})
```

2. Create `api.ts` at project root:
```typescript
// api.ts
export default () => new Elysia()
  .get('/hello', () => ({ message: 'Hello world!' }))
```

3. Use Eden Treaty:
```vue
<template>
  <div>
    <p>{{ data.message }}</p>
  </div>
</template>
<script setup lang="ts">
const { $api } = useNuxtApp()

const { data } = await useAsyncData(async () => {
  const { data, error } = await $api.hello.get()
  
  if (error) throw new Error('Failed to call API')
  
  return data
})
</script>
```

Auto-setup on Nuxt API route.

## Prefix
Default: `/_api`. Customize:
```typescript
export default defineNuxtConfig({
  nuxtElysia: {
    path: '/api'
  }
})
```

Mounts on `/api` instead of `/_api`.

See [nuxt-elysia](https://github.com/tkesgar/nuxt-elysia) for more config.

## pnpm
Manual install:
```bash
pnpm add @sinclair/typebox openapi-types
```
