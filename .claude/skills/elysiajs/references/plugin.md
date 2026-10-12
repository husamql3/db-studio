# Plugins

## Plugin = Decoupled Elysia Instance

```ts
const plugin = new Elysia()
  .decorate('plugin', 'hi')
  .get('/plugin', ({ plugin }) => plugin)

const app = new Elysia()
  .use(plugin)  // inherit properties
  .get('/', ({ plugin }) => plugin)
```

**Inherits**: state, decorate
**Does NOT inherit**: lifecycle (isolated by default)

## Dependency

Each instance runs independently like microservice. **Must explicitly declare dependencies**.

```ts
const auth = new Elysia()
  .decorate('Auth', Auth)

// ❌ Missing dependency
const main = new Elysia()
  .get('/', ({ Auth }) => Auth.getProfile())

// ✅ Declare dependency
const main = new Elysia()
  .use(auth)  // required for Auth
  .get('/', ({ Auth }) => Auth.getProfile())
```

## Deduplication

**Every plugin re-executes by default**. Use `name` + optional `seed` to deduplicate:

```ts
const ip = new Elysia({ name: 'ip' })  // unique identifier
  .derive({ as: 'global' }, ({ server, request }) => ({
    ip: server?.requestIP(request)
  }))

const router1 = new Elysia().use(ip)
const router2 = new Elysia().use(ip)
const server = new Elysia().use(router1).use(router2)
// `ip` only executes once due to deduplication
```

## Global vs Explicit Dependency

**Global plugin** (rare, apply everywhere):
- Doesn't add types - cors, compress, helmet
- Global lifecycle no instance controls - tracing, logging
- Examples: OpenAPI docs, OpenTelemetry, logging

**Explicit dependency** (default, recommended):
- Adds types - macro, state, model
- Business logic instances interact with - Auth, DB
- Examples: state management, ORM, auth, features

## Scope

**Lifecycle isolated by default**. Must specify scope to export.

```ts
// ❌ NOT inherited by app
const profile = new Elysia()
  .onBeforeHandle(({ cookie }) => throwIfNotSignIn(cookie))
  .get('/profile', () => 'Hi')

const app = new Elysia()
  .use(profile)
  .patch('/rename', ({ body }) => updateProfile(body))  // No sign-in check

// ✅ Exported to app
const profile = new Elysia()
  .onBeforeHandle({ as: 'global' }, ({ cookie }) => throwIfNotSignIn(cookie))
  .get('/profile', () => 'Hi')
```

## Scope Levels

1. **local** (default) - current + descendants only
2. **scoped** - parent + current + descendants  
3. **global** - all instances (all parents, current, descendants)

Example with `.onBeforeHandle({ as: 'local' }, ...)`:

| type | child | current | parent | main |
|------|-------|---------|--------|------|
| local | ✅ | ✅ | ❌ | ❌ |
| scoped | ✅ | ✅ | ✅ | ❌ |
| global | ✅ | ✅ | ✅ | ✅ |

## Config

```ts
// Instance factory with config
const version = (v = 1) => new Elysia()
  .get('/version', v)

const app = new Elysia()
  .use(version(1))
```

## Functional Callback (not recommended)

```ts
// Harder to handle scope/encapsulation
const plugin = (app: Elysia) => app
  .state('counter', 0)
  .get('/plugin', () => 'Hi')

// Prefer new instance (better type inference, no perf diff)
```

## Guard (Apply to Multiple Routes)

```ts
.guard(
  { body: t.Object({ username: t.String(), password: t.String() }) },
  (app) =>
    app.post('/sign-up', ({ body }) => signUp(body))
       .post('/sign-in', ({ body }) => signIn(body))
)
```

**Grouped guard** (merge group + guard):

```ts
.group(
  '/v1',
  { body: t.Literal('Rikuhachima Aru') },  // guard here
  (app) => app.post('/student', ({ body }) => body)
)
```

## Scope Casting

**3 methods to apply hook to parent**:

1. **Inline as** (single hook):
```ts
.derive({ as: 'scoped' }, () => ({ hi: 'ok' }))
```

2. **Guard as** (multiple hooks, no derive/resolve):
```ts
.guard({
  as: 'scoped',
  response: t.String(),
  beforeHandle() { console.log('ok') }
})
```

3. **Instance as** (all hooks + schema):
```ts
const plugin = new Elysia()
  .derive(() => ({ hi: 'ok' }))
  .get('/child', ({ hi }) => hi)
  .as('scoped')  // lift scope up
```

`.as()` lifts scope: local → scoped → global

## Lazy Load

**Deferred module** (async plugin, non-blocking startup):

```ts
// plugin.ts
export const loadStatic = async (app: Elysia) => {
  const files = await loadAllFiles()
  files.forEach((asset) => app.get(asset, file(asset)))
  return app
}

// main.ts
const app = new Elysia().use(loadStatic)
```

**Lazy-load module** (dynamic import):

```ts
const app = new Elysia()
  .use(import('./plugin'))  // loaded after startup
```

**Testing** (wait for modules):

```ts
await app.modules  // ensure all deferred/lazy modules loaded
```

## Notes
[Inference] Based on docs patterns:
- Use inline values for static resources (performance optimization)
- Group routes by prefix for organization
- Extend context minimally (separation of concerns)
- Use `status()` over `set.status` for type safety
- Prefer `resolve()` over `derive()` when type integrity matters
- Plugins isolated by default (must declare scope explicitly)
- Use `name` for deduplication when plugin used multiple times
- Prefer explicit dependency over global (better modularity/tracking)
