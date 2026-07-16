import { drizzle } from 'drizzle-orm/bun-sqlite'
import { Database } from 'bun:sqlite'
import * as schema from './schema.ts'

const sqlite = new Database(process.env.DATABASE_URL!, { create: true })
export const db = drizzle(sqlite, { schema })
