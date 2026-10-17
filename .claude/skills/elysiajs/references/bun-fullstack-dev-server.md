# Fullstack Dev Server

## What It Is
Bun 1.3 Fullstack Dev Server with HMR. React without bundler (no Vite/Webpack).

Example: [elysia-fullstack-example](https://github.com/saltyaom/elysia-fullstack-example)

## Setup
1. Install + use Elysia Static:
```typescript
import { Elysia } from 'elysia'
import { staticPlugin } from '@elysiajs/static'

new Elysia()
  .use(await staticPlugin())  // await required for HMR hooks
  .listen(3000)
```

2. Create `public/index.html` + `public/index.tsx`:
```html
<!-- public/index.html -->
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>Elysia React App</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./index.tsx"></script>
  </body>
</html>
```

```tsx
// public/index.tsx
import { useState } from 'react'
import { createRoot } from 'react-dom/client'

function App() {
  const [count, setCount] = useState(0)
  const increase = () => setCount((c) => c + 1)
  
  return (
    <main>
      <h2>{count}</h2>
      <button onClick={increase}>Increase</button>
    </main>
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(<App />)
```

3. Enable JSX in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

4. Navigate to `http://localhost:3000/public`.

Frontend + backend in single project. No bundler. Works with HMR, Tailwind, Tanstack Query, Eden Treaty, path alias.

## Custom Prefix
```typescript
.use(await staticPlugin({ prefix: '/' }))
```

Serves at `/` instead of `/public`.

## Tailwind CSS
1. Install:
```bash
bun add tailwindcss@4
bun add -d bun-plugin-tailwind
```

2. Create `bunfig.toml`:
```toml
[serve.static]
plugins = ["bun-plugin-tailwind"]
```

3. Create `public/global.css`:
```css
@tailwind base;
```

4. Add to HTML or TS:
```html
<link rel="stylesheet" href="tailwindcss">
```
Or:
```tsx
import './global.css'
```

## Path Alias
1. Add to `tsconfig.json`:
```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@public/*": ["public/*"]
    }
  }
}
```

2. Use:
```tsx
import '@public/global.css'
```

Works out of box.

## Production Build
```bash
bun build --compile --target bun --outfile server src/index.ts
```

Creates single executable `server`. Include `public` folder when running.
