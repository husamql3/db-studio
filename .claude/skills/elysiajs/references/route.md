# ElysiaJS: Routing, Handlers & Context

## Routing

### Path Types

```ts
new Elysia()
	.get('/static', 'static path')           // exact match
	.get('/id/:id', 'dynamic path')          // captures segment
	.get('/id/*', 'wildcard path')           // captures rest
```

**Path Priority**: static > dynamic > wildcard

### Dynamic Paths

```ts
new Elysia()
	.get('/id/:id', ({ params: { id } }) => id)
	.get('/id/:id/:name', ({ params: { id, name } }) => id + ' ' + name)
```

**Optional params**: `.get('/id/:id?', ...)`

### HTTP Verbs

- `.get()` - retrieve data
- `.post()` - submit/create
- `.put()` - replace
- `.patch()` - partial update
- `.delete()` - remove
- `.all()` - any method
- `.route(method, path, handler)` - custom verb

### Grouping Routes

```ts
new Elysia()
	.group('/user', { body: t.Literal('auth') }, (app) =>
		app.post('/sign-in', ...)
			.post('/sign-up', ...)
)

// Or use prefix in constructor
new Elysia({ prefix: '/user' })
  .post('/sign-in', ...)
```

## Handlers

### Handler = function accepting HTTP request, returning response

```ts
// Inline value (compiled ahead, optimized)
.get('/', 'Hello Elysia')
.get('/video', file('video.mp4'))

// Function handler
.get('/', () => 'hello')
.get('/', ({ params, query, body }) => {...})
```

### Context Properties

- `body` - HTTP message/form/file
- `query` - query string as object
- `params` - path parameters
- `headers` - HTTP headers
- `cookie` - mutable signal for cookies
- `store` - global mutable state
- `request` - Web Standard Request
- `server` - Bun server instance
- `path` - request pathname

### Context Utilities

```ts
import { redirect, form } from 'elysia'

new Elysia().get('/', ({ status, set, form }) => {
    // Status code (type-safe)
    status(418, "I'm a teapot")

    // Set response props
    set.headers['x-custom'] = 'value'
    set.status = 418 // legacy, no type inference

    // Redirect
    return redirect('https://...', 302)

    // Cookies (mutable signal, no get/set)
    cookie.name.value // get
    cookie.name.value = 'new' // set

    // FormData response
    return form({ name: 'Party', images: [file('a.jpg')] })

    // Single file
    return file('document.pdf')
})
```

### Streaming

```ts
new Elysia()
	.get('/stream', function* () {
	  	yield 1
	  	yield 2
	  	yield 3
	})
	// Server-Sent Events
	.get('/sse', function* () {
	  	yield sse('hello')
	  	yield sse({ event: 'msg', data: {...} })
	})
```

**Note**: Headers only settable before first yield

**Conditional stream**: returning without yield converts to normal response

## Context Extension

[Inference] Extend when property is:

- Global mutable (use `state`)
- Request/response related (use `decorate`)
- Derived from existing props (use `derive`/`resolve`)

### state() - Global Mutable

```ts
new Elysia()
	`.state('version', 1)
	.get('/', ({ store: { version } }) => version)
	// Multiple
	.state({ counter: 0, visits: 0 })
	
	// Remap (create new from existing)
	.state(({ version, ...store }) => ({
	  	...store,
	  	apiVersion: version
	}))
````

**Gotcha**: Use reference not value

```ts
new Elysia()
	// ✅ Correct
	.get('/', ({ store }) => store.counter++)
	
	// ❌ Wrong - loses reference
	.get('/', ({ store: { counter } }) => counter++)
```

### decorate() - Additional Context Props

```ts
new Elysia()
	.decorate('logger', new Logger())
	.get('/', ({ logger }) => logger.log('hi'))
	
	// Multiple
	.decorate({ logger: new Logger(), db: connection })
```

**When**: constant/readonly values, classes with internal state, singletons

### derive() - Create from Existing (Transform Lifecycle)

```ts
new Elysia()
	.derive(({ headers }) => ({
	  	bearer: headers.authorization?.startsWith('Bearer ')
	    	? headers.authorization.slice(7)
		    : null
	}))
	.get('/', ({ bearer }) => bearer)
```

**Timing**: runs at transform (before validation)
**Type safety**: request props typed as `unknown`

### resolve() - Type-Safe Derive (beforeHandle Lifecycle)

```ts
new Elysia()
	.guard({
	  	headers: t.Object({
	    	bearer: t.String({ pattern: '^Bearer .+$' })
		})
	})
	.resolve(({ headers }) => ({
	  	bearer: headers.bearer.slice(7)  // typed correctly
	}))
```

**Timing**: runs at beforeHandle (after validation)
**Type safety**: request props fully typed

### Error from derive/resolve

```ts
new Elysia()
	.derive(({ headers, status }) => {
	  	if (!headers.authorization) return status(400)
	  	return { bearer: ... }
	})
```

Returns early if error returned

## Patterns

### Affix (Bulk Remap)

```ts
const plugin = new Elysia({ name: 'setup' }).decorate({
    argon: 'a',
    boron: 'b'
})

new Elysia()
    .use(plugin)
    .prefix('decorator', 'setup') // setupArgon, setupBoron
    .prefix('all', 'setup') // remap everything
```

### Assignment Patterns

1. **key-value**: `.state('key', value)`
2. **object**: `.state({ k1: v1, k2: v2 })`
3. **remap**: `.state(({old}) => ({new}))`

## Testing

```ts
const app = new Elysia().get('/', 'hi')

// Programmatic test
app.handle(new Request('http://localhost/'))
```

## To Throw or Return

Most of an error handling in Elysia can be done by throwing an error and will be handle in `onError`.

But for `status` it can be a little bit confusing, since it can be used both as a return value or throw an error.

It could either be **return** or **throw** based on your specific needs.

- If an `status` is **throw**, it will be caught by `onError` middleware.
- If an `status` is **return**, it will be **NOT** caught by `onError` middleware.

See the following code:

```typescript
import { Elysia, file } from 'elysia'

new Elysia()
    .onError(({ code, error, path }) => {
        if (code === 418) return 'caught'
    })
    .get('/throw', ({ status }) => {
        // This will be caught by onError
        throw status(418)
    })
    .get('/return', ({ status }) => {
        // This will NOT be caught by onError
        return status(418)
    })
```

## To Throw or Return

Elysia provide a `status` function for returning HTTP status code, prefers over `set.status`.

`status` can be import from Elysia but preferably extract from route handler Context for type safety.

```ts
import { Elysia, status } from 'elysia'

function doThing() {
    if (Math.random() > 0.33) return status(418, "I'm a teapot")
}

new Elysia().get('/', ({ status }) => {
    if (Math.random() > 0.33) return status(418)

    return 'ok'
})
```

Error Handling in Elysia can be done by throwing an error and will be handle in `onError`.

Status could either be **return** or **throw** based on your specific needs.

- If an `status` is **throw**, it will be caught by `onError` middleware.
- If an `status` is **return**, it will be **NOT** caught by `onError` middleware.

See the following code:

```typescript
import { Elysia, file } from 'elysia'

new Elysia()
    .onError(({ code, error, path }) => {
        if (code === 418) return 'caught'
    })
    .get('/throw', ({ status }) => {
        // This will be caught by onError
        throw status(418)
    })
    .get('/return', ({ status }) => {
        // This will NOT be caught by onError
        return status(418)
    })
```

## Notes

[Inference] Based on docs patterns:

- Use inline values for static resources (performance optimization)
- Group routes by prefix for organization
- Extend context minimally (separation of concerns)
- Use `status()` over `set.status` for type safety
- Prefer `resolve()` over `derive()` when type integrity matters
