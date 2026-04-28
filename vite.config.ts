import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createLogger, defineConfig } from 'vite'
import { devtools } from '@tanstack/devtools-vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nitro } from 'nitro/vite'

const logFilePath = resolve(process.cwd(), 'tmp/vite-dev.log')
mkdirSync(dirname(logFilePath), { recursive: true })
writeFileSync(logFilePath, '')

const baseLogger = createLogger()
const ansiPattern = new RegExp(`${String.fromCharCode(0x1b)}\\[[0-9;]*m`, 'g')
const stripAnsi = (value: string) => value.replace(ansiPattern, '')
const writeLog = (level: 'info' | 'warn' | 'error', message: string) => {
  appendFileSync(logFilePath, `[${new Date().toISOString()}] [${level}] ${stripAnsi(message)}\n`)
}

const logger = {
  ...baseLogger,
  info(message: string, options?: Parameters<typeof baseLogger.info>[1]) {
    writeLog('info', message)
    baseLogger.info(message, options)
  },
  warn(message: string, options?: Parameters<typeof baseLogger.warn>[1]) {
    writeLog('warn', message)
    baseLogger.warn(message, options)
  },
  error(message: string, options?: Parameters<typeof baseLogger.error>[1]) {
    writeLog('error', message)
    baseLogger.error(message, options)
  },
}

const config = defineConfig({
  customLogger: logger,
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
