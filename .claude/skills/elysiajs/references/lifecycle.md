# Lifecycle

Instead of a sequential process, Elysia's request handling is divided into multiple stages called lifecycle events.

It's designed to separate the process into distinct phases based on their responsibility without interfering with each others.

### List of events in order

1. **request** - early, global
2. **parse** - body parsing
3. **transform** / **derive** - mutate context pre validation
4. **beforeHandle** / **resolve** - auth/guard logic
5. **handler** - your business code
6. **afterHandle** - tweak response, set headers
7. **mapResponse** - turn anything into a proper `Response`
8. **onError** - centralized error handling
9. **onAfterResponse** - post response/cleanup tasks

## Request (`onRequest`)

Runs first for every incoming request.

- Ideal for **caching, rate limiting, CORS, adding global headers**.
- If the hook returns a value, the whole lifecycle stops and that value becomes the response.

```ts
new Elysia().onRequest(({ ip, set }) => {
    if (blocked(ip)) return (set.status = 429)
})
```

---

## Parse (`onParse`)

_Body parsing stage._

- Handles `text/plain`, `application/json`, `multipart/form-data`, `application/x www-form-urlencoded` by default.
- Use to add **custom parsers** or support extra `Content Type`s.

```ts
new Elysia().onParse(({ request, contentType }) => {
    if (contentType === 'application/custom') return request.text()
})
```

---

## Transform (`onTransform`)

_Runs **just before validation**; can mutate the request context._

- Perfect for **type coercion**, trimming strings, or adding temporary fields that validation will use.

```ts
new Elysia().onTransform(({ params }) => {
    params.id = Number(params.id)
})
```

---

## Derive

_Runs along with `onTransform` **but before validation**; adds per request values to the context._

- Useful for extracting info from headers, cookies, query, etc., that you want to reuse in handlers.

```ts
new Elysia().derive(({ headers }) => ({
    bearer: headers.authorization?.replace(/^Bearer /, '')
}))
```

---

## Before Handle (`onBeforeHandle`)

_Executed after validation, right before the route handler._

- Great for **auth checks, permission gating, custom pre validation logic**.
- Returning a value skips the handler.

```ts
new Elysia().get('/', () => 'hi', {
    beforeHandle({ cookie, status }) {
        if (!cookie.session) return status(401)
    }
})
```

---

## Resolve

_Like `derive` but runs **after validation** along "Before Handle" (so you can rely on validated data)._

- Usually placed inside a `guard` because it isn't available as a local hook.

```ts
new Elysia().guard(
    { headers: t.Object({ authorization: t.String() }) },
    (app) =>
        app
            .resolve(({ headers }) => ({
                bearer: headers.authorization.split(' ')[1]
            }))
            .get('/', ({ bearer }) => bearer)
)
```

---

## After Handle (`onAfterHandle`)

_Runs after the handler finishes._

- Can **modify response headers**, wrap the result in a `Response`, or transform the payload.
- Returning a value **replaces** the handlerâ€™s result, but the next `afterHandle` hooks still run.

```ts
new Elysia().get('/', () => '<h1>Hello</h1>', {
    afterHandle({ response, set }) {
        if (isHtml(response)) {
            set.headers['content-type'] = 'text/html; charset=utf-8'
            return new Response(response)
        }
    }
})
```

---

## Map Response (`mapResponse`)

_Runs right after all `afterHandle` hooks; maps **any** value to a Web standard `Response`._

- Ideal for **compression, custom content type mapping, streaming**.

```ts
new Elysia().mapResponse(({ responseValue, set }) => {
    const body =
        typeof responseValue === 'object'
            ? JSON.stringify(responseValue)
            : String(responseValue ?? '')

    set.headers['content-encoding'] = 'gzip'
    return new Response(Bun.gzipSync(new TextEncoder().encode(body)), {
        headers: {
            'Content-Type':
                typeof responseValue === 'object'
                    ? 'application/json'
                    : 'text/plain'
        }
    })
})
```

---

## On Error (`onError`)

_Caught whenever an error bubbles up from any lifecycle stage._

- Use to **customize error messages**, **handle 404**, **log**, or **retry**.
- Must be registered **before** the routes it should protect.

```ts
new Elysia().onError(({ code, status }) => {
    if (code === 'NOT_FOUND') return status(404, 'â“ Not found')
    return new Response('Oops', { status: 500 })
})
```

---

## After Response (`onAfterResponse`)

_Runs **after** the response has been sent to the client._

- Perfect for **logging, metrics, cleanup**.

```ts
new Elysia().onAfterResponse(() =>
    console.log('âœ… response sent at', Date.now())
)
```

---

## Hook Types

| Type                 | Scope                             | How to add                                                |
| -------------------- | --------------------------------- | --------------------------------------------------------- |
| **Local Hook**       | Single route                      | Inside route options (`afterHandle`, `beforeHandle`, â€¦) |
| **Interceptor Hook** | Whole instance (and later routes) | `.onXxx(cb)` or `.use(plugin)`                            |

> **Remember:** Hooks only affect routes **defined after** they are registered, except `onRequest` which is global because it runs before route matching.
