import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron/simple'

const projectRoot = path.dirname(fileURLToPath(import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  root: path.join(projectRoot, 'src/renderer'),
  base: './',
  plugins: [
    react(),
    electron({
      main: {
        entry: path.join(projectRoot, 'src/main/main.ts'),
        vite: {
          build: {
            outDir: path.join(projectRoot, 'dist-electron'),
            emptyOutDir: false,
            minify: false,
            sourcemap: false,
            // Runtime dependencies are resolved from node_modules at runtime
            // (they are shipped inside the app package by electron-builder).
            rolldownOptions: {
              external: ['better-sqlite3', 'exceljs', 'zod'],
            },
          },
        },
      },
      preload: {
        input: path.join(projectRoot, 'src/preload/preload.ts'),
        vite: {
          build: {
            outDir: path.join(projectRoot, 'dist-electron'),
            emptyOutDir: false,
            minify: false,
            sourcemap: false,
          },
        },
      },
    }),
  ],
  build: {
    outDir: path.join(projectRoot, 'dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
})
