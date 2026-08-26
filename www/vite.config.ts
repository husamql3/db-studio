import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import { cloudflare } from '@cloudflare/vite-plugin'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import viteTsConfigPaths from 'vite-tsconfig-paths'
import tailwindcss from '@tailwindcss/vite'
import mdx from 'fumadocs-mdx/vite';
import * as MdxConfig from './source.config';

// Exposes the raw text of content/docs/*.mdx as `virtual:raw-docs`
// (a `?raw` glob import doesn't work here — the fumadocs-mdx plugin
// compiles .mdx modules regardless of the query). Used by the markdown
// content negotiation in src/server.ts.
const rawDocs = (): Plugin => {
  const virtualId = 'virtual:raw-docs'
  const resolvedId = `\0${virtualId}`
  return {
    name: 'raw-docs',
    resolveId(id) {
      if (id === virtualId) return resolvedId
    },
    load(id) {
      if (id !== resolvedId) return
      const dir = join(import.meta.dirname, 'content/docs')
      const docs = Object.fromEntries(
        readdirSync(dir)
          .filter((file) => file.endsWith('.mdx'))
          .map((file) => [file.replace(/\.mdx$/, ''), readFileSync(join(dir, file), 'utf8')]),
      )
      return `export default ${JSON.stringify(docs)}`
    },
  }
}

const config = defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    devtools(),
    viteTsConfigPaths({
      projects: ['./tsconfig.json'],
    }),
    tailwindcss(),
    rawDocs(),
    tanstackStart(),
    viteReact(),
    mdx(MdxConfig),
  ],
})

export default config
