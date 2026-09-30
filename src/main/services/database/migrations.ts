import initSql from '../../../../database/migrations/0001_init.sql?raw'

export interface Migration {
  id: string
  sql: string
}

/**
 * Migrations are inlined from `database/migrations/` at build time (Vite
 * `?raw` import) so the packaged app does not depend on the project layout.
 * Add new migration files here in order.
 */
export const MIGRATIONS: Migration[] = [
  { id: '0001_init', sql: initSql },
]
