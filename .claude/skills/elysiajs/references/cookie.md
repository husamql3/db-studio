# Cookie

## What It Is
Reactive mutable signal for cookie interaction. Auto-encodes/decodes objects.

## Basic Usage
No get/set - direct value access:
```typescript
import { Elysia } from 'elysia'

new Elysia()
  .get('/', ({ cookie: { name } }) => {
    // Get
    name.value
    
    // Set
    name.value = "New Value"
  })
```

Auto-encodes/decodes objects. Just works.

## Reactivity
Signal-like approach. Single source of truth. Auto-sets headers, syncs values.

Cookie jar = Proxy object. Extract value always `Cookie<unknown>`, never `undefined`. Access via `.value`.

Iterate over cookie jar → only existing cookies.

## Cookie Attributes

### Direct Property Assignment
```typescript
.get('/', ({ cookie: { name } }) => {
  // Get
  name.domain
  
  // Set
  name.domain = 'millennium.sh'
  name.httpOnly = true
})
```

### set - Reset All Properties
```typescript
.get('/', ({ cookie: { name } }) => {
  name.set({
    domain: 'millennium.sh',
    httpOnly: true
  })
})
```

Overwrites all properties.

### add - Update Specific Properties
Like `set` but only overwrites defined properties.

## Remove Cookie
```typescript
.get('/', ({ cookie, cookie: { name } }) => {
  name.remove()
  // or
  delete cookie.name
})
```

## Cookie Schema
Strict validation + type inference with `t.Cookie`:
```typescript
import { Elysia, t } from 'elysia'

new Elysia()
  .get('/', ({ cookie: { name } }) => {
    name.value = {
      id: 617,
      name: 'Summoning 101'
    }
  }, {
    cookie: t.Cookie({
      name: t.Object({
        id: t.Numeric(),
        name: t.String()
      })
    })
  })
```

### Nullable Cookie
```typescript
cookie: t.Cookie({
  name: t.Optional(
    t.Object({
      id: t.Numeric(),
      name: t.String()
    })
  )
})
```

## Cookie Signature
Cryptographic hash for verification. Prevents malicious modification.

```typescript
new Elysia()
  .get('/', ({ cookie: { profile } }) => {
    profile.value = { id: 617, name: 'Summoning 101' }
  }, {
    cookie: t.Cookie({
      profile: t.Object({
        id: t.Numeric(),
        name: t.String()
      })
    }, {
      secrets: 'Fischl von Luftschloss Narfidort',
      sign: ['profile']
    })
  })
```

Auto-signs/unsigns.

### Global Config
```typescript
new Elysia({
  cookie: {
    secrets: 'Fischl von Luftschloss Narfidort',
    sign: ['profile']
  }
})
```

## Cookie Rotation
Auto-handles secret rotation. Old signature verification + new signature signing.

```typescript
new Elysia({
  cookie: {
    secrets: ['Vengeance will be mine', 'Fischl von Luftschloss Narfidort']
  }
})
```

Array = key rotation (retire old, replace with new).

## Config

### secrets
Secret key for signing/unsigning. Array = key rotation.

### domain
Domain Set-Cookie attribute. Default: none (current domain only).

### encode
Function to encode value. Default: `encodeURIComponent`.

### expires
Date for Expires attribute. Default: none (non-persistent, deleted on browser exit).

If both `expires` and `maxAge` set, `maxAge` takes precedence (spec-compliant clients).

### httpOnly (false)
HttpOnly attribute. If true, JS can't access via `document.cookie`.

### maxAge (undefined)
Seconds for Max-Age attribute. Rounded down to integer.

If both `expires` and `maxAge` set, `maxAge` takes precedence (spec-compliant clients).

### path
Path attribute. Default: handler path.

### priority
Priority attribute: `low` | `medium` | `high`. Not fully standardized.

### sameSite
SameSite attribute:
- `true` = Strict
- `false` = not set
- `'lax'` = Lax
- `'none'` = None (explicit cross-site)
- `'strict'` = Strict

Not fully standardized.

### secure
Secure attribute. If true, only HTTPS. Clients won't send over HTTP.
