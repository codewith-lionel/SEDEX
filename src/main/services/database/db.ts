import Database from 'better-sqlite3'
import { app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { MIGRATIONS } from './migrations'

let db: Database.Database | null = null

export function getDbPath(): string {
  // Overridable for tests / portable installs.
  if (process.env.SEDX_DB_PATH) return process.env.SEDX_DB_PATH
  return path.join(app.getPath('userData'), 'hr-audit-forms.db')
}

export function getDb(): Database.Database {
  if (db) return db
  const file = getDbPath()
  fs.mkdirSync(path.dirname(file), { recursive: true })
  db = new Database(file)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

/** Close the database (used in tests / app quit). */
export function closeDb(): void {
  db?.close()
  db = null
}

function runMigrations(database: Database.Database): void {
  database.exec(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       id TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  )
  const applied = new Set(
    (database.prepare('SELECT id FROM schema_migrations').all() as { id: string }[]).map((r) => r.id),
  )
  const insert = database.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)')
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.id)) continue
    const apply = database.transaction(() => {
      database.exec(migration.sql)
      insert.run(migration.id, new Date().toISOString())
    })
    apply()
  }
}
