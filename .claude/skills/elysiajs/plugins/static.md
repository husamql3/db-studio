# Static Plugin
This plugin can serve static files/folders for Elysia Server

## Installation
```bash
bun add @elysiajs/static
```

## Basic Usage
```typescript twoslash
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

new Elysia()
    .use(staticPlugin())
    .listen(3000)
```

By default, the static plugin default folder is `public`, and registered with `/public` prefix.

Suppose your project structure is:
```
| - src
  | - index.ts
| - public
  | - takodachi.png
  | - nested
    | - takodachi.png
```

The available path will become:
- /public/takodachi.png
- /public/nested/takodachi.png

## Config
Below is a config which is accepted by the plugin

### assets
@default `"public"`

Path to the folder to expose as static

### prefix
@default `"/public"`

Path prefix to register public files

### ignorePatterns
@default `[]`

List of files to ignore from serving as static files

### staticLimit
@default `1024`

By default, the static plugin will register paths to the Router with a static name, if the limits are exceeded, paths will be lazily added to the Router to reduce memory usage.
Tradeoff memory with performance.

### alwaysStatic
@default `false`

If set to true, static files path will be registered to Router skipping the `staticLimits`.

### headers
@default `{}`

Set response headers of files

### indexHTML
@default `false`

If set to true, the `index.html` file from the static directory will be served for any request that is matching neither a route nor any existing static file.

## Pattern
Below you can find the common patterns to use the plugin.

## Single file
Suppose you want to return just a single file, you can use `file` instead of using the static plugin
```typescript
import { Elysia, file } from 'elysia'

new Elysia()
    .get('/file', file('public/takodachi.png'))
```
