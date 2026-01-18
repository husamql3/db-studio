import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import viteReact from '@vitejs/plugin-react'
import { visualizer } from "rollup-plugin-visualizer";
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from "@tailwindcss/vite"

// https://vite.dev/config/
export default defineConfig({
  build: {
    outDir: "dist",
    // Enable minification (esbuild is faster and produces good results)
    minify: 'esbuild',
    // Target modern browsers for smaller output
    target: 'esnext',
    rollupOptions: {
      output: {
        // Smarter chunk splitting strategy
        manualChunks(id) {
          // Monaco editor - large, lazy-loaded anyway
          if (id.includes('monaco-editor')) {
            return 'monaco-editor';
          }
          // Radix UI primitives - group all radix packages together
          if (id.includes('@radix-ui') || id.includes('node_modules/radix-ui')) {
            return 'radix-ui';
          }
          // Icons - lucide-react
          if (id.includes('lucide-react')) {
            return 'icons';
          }
          // TanStack libraries
          if (id.includes('@tanstack')) {
            return 'tanstack';
          }
          // React core
          if (id.includes('react-dom')) {
            return 'react-dom';
          }
        },
      },
    },
    // Generate source maps only for error tracking (smaller than full maps)
    sourcemap: false,
    // Increase chunk size warning limit (monaco is large but lazy-loaded)
    chunkSizeWarningLimit: 1000,
  },
  optimizeDeps: {
    // Include heavy deps that are needed immediately
    include: [
      'monaco-editor',
      'react',
      'react-dom',
      '@tanstack/react-query',
      '@tanstack/react-router',
      '@tanstack/ai-react',
      'lucide-react'
    ],
    // Exclude heavy deps from pre-bundling if not needed immediately
    exclude: [
      '@tanstack/react-query-devtools',
      '@tanstack/react-router-devtools',
      '@tanstack/react-ai-devtools',
    ],
  },
  plugins: [
    tailwindcss(),
    devtools({ removeDevtoolsOnBuild: true }),
    tanstackRouter({
      target: 'react',
      autoCodeSplitting: true,
    }),
    viteReact(),
    visualizer({
      open: false, // Don't auto-open on every build
      gzipSize: true,
      brotliSize: true,
      filename: 'stats.html',
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 3333,
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3333",
        changeOrigin: true,
      },
    },
  },
})
