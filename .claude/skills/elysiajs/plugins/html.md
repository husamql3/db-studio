# HTML

Allows you to use JSX and HTML with proper headers and support.

## Installation

```bash
bun add @elysiajs/html
```

## Basic Usage
```tsx twoslash
import React from 'react'
import { Elysia } from 'elysia'
import { html, Html } from '@elysiajs/html'

new Elysia()
	.use(html())
	.get(
		'/html',
		() => `
            <html lang='en'>
                <head>
                    <title>Hello World</title>
                </head>
                <body>
                    <h1>Hello World</h1>
                </body>
            </html>`
	)
	.get('/jsx', () => (
		<html lang="en">
			<head>
				<title>Hello World</title>
			</head>
			<body>
				<h1>Hello World</h1>
			</body>
		</html>
	))
	.listen(3000)
```

This plugin will automatically add `Content-Type: text/html; charset=utf8` header to the response, add `<!doctype html>`, and convert it into a Response object.

## JSX
Elysia can use JSX 

1. Replace your file that needs to use JSX to end with affix **"x"**:
- .js -> .jsx
- .ts -> .tsx

2. Register the TypeScript type by append the following to **tsconfig.json**:
```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"jsx": "react",
		"jsxFactory": "Html.createElement",
		"jsxFragmentFactory": "Html.Fragment"
	}
}
```

3. Starts using JSX in your file
```tsx twoslash
import React from 'react'
import { Elysia } from 'elysia'
import { html, Html } from '@elysiajs/html'

new Elysia()
	.use(html())
	.get('/', () => (
		<html lang="en">
			<head>
				<title>Hello World</title>
			</head>
			<body>
				<h1>Hello World</h1>
			</body>
		</html>
	))
	.listen(3000)
```

If the error `Cannot find name 'Html'. Did you mean 'html'?` occurs, this import must be added to the JSX template:

```tsx
import { Html } from '@elysiajs/html'
```

It is important that it is written in uppercase.

## XSS

Elysia HTML is based use of the Kita HTML plugin to detect possible XSS attacks in compile time.

You can use a dedicated `safe` attribute to sanitize user value to prevent XSS vulnerability.

```tsx
import { Elysia, t } from 'elysia'
import { html, Html } from '@elysiajs/html'

new Elysia()
	.use(html())
	.post(
		'/',
		({ body }) => (
			<html lang="en">
				<head>
					<title>Hello World</title>
				</head>
				<body>
					<h1 safe>{body}</h1>
				</body>
			</html>
		),
		{
			body: t.String()
		}
	)
	.listen(3000)
```

However, when are building a large-scale app, it's best to have a type reminder to detect possible XSS vulnerabilities in your codebase.

To add a type-safe reminder, please install:

```sh
bun add @kitajs/ts-html-plugin
```

Then appends the following **tsconfig.json**

```jsonc
// tsconfig.json
{
	"compilerOptions": {
		"jsx": "react",
		"jsxFactory": "Html.createElement",
		"jsxFragmentFactory": "Html.Fragment",
		"plugins": [{ "name": "@kitajs/ts-html-plugin" }]
	}
}
```

## Config
Below is a config which is accepted by the plugin

### contentType

- Type: `string`
- Default: `'text/html; charset=utf8'`

The content-type of the response.

### autoDetect

- Type: `boolean`
- Default: `true`

Whether to automatically detect HTML content and set the content-type.

### autoDoctype

- Type: `boolean | 'full'`
- Default: `true`

Whether to automatically add `<!doctype html>` to a response starting with `<html>`, if not found.

Use `full` to also automatically add doctypes on responses returned without this plugin

```ts
// without the plugin
app.get('/', () => '<html></html>')

// With the plugin
app.get('/', ({ html }) => html('<html></html>'))
```

### isHtml

- Type: `(value: string) => boolean`
- Default: `isHtml` (exported function)

The function is used to detect if a string is a html or not. Default implementation if length is greater than 7, starts with `<` and ends with `>`.

Keep in mind there's no real way to validate HTML, so the default implementation is a best guess.
