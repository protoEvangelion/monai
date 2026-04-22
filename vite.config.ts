import { defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const config = defineConfig({
  server: { port: 3000 },
  resolve: { tsconfigPaths: true },
  optimizeDeps: {
    exclude: ['better-sqlite3'],
  },
  ssr: {
    external: ['better-sqlite3'],
  },
  plugins: [
    devtools(),
    nitro({ preset: 'vercel' }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
})

export default config
