import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { ServiceError } from '../../errors'
import type { Employee } from '../../../../shared/types'

interface EmployeeRow {
  id: string
  name: string
  code: string | null
  department: string | null
  designation: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function mapRow(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    department: row.department,
    designation: row.designation,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface EmployeeInput {
  name: string
  code?: string | null
  department?: string | null
  designation?: string | null
  notes?: string | null
}

export function listEmployees(search?: string): Employee[] {
  const db = getDb()
  if (search) {
    return (
      db
        .prepare(
          `SELECT * FROM employees
           WHERE name LIKE ? OR code LIKE ? OR department LIKE ? OR designation LIKE ?
           ORDER BY name COLLATE NOCASE`,
        )
        .all(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`) as EmployeeRow[]
    ).map(mapRow)
  }
  return (db.prepare('SELECT * FROM employees ORDER BY name COLLATE NOCASE').all() as EmployeeRow[]).map(mapRow)
}

/** Look up an employee by their business code (Employee ID column). */
export function getEmployeeByCode(code: string): Employee | null {
  const trimmed = (code ?? '').trim()
  if (!trimmed) return null
  const row = getDb().prepare('SELECT * FROM employees WHERE code = ? COLLATE NOCASE LIMIT 1').get(trimmed) as
    | EmployeeRow
    | undefined
  return row ? mapRow(row) : null
}

export function getEmployee(id: string): Employee | null {
  const row = getDb().prepare('SELECT * FROM employees WHERE id = ?').get(id) as EmployeeRow | undefined
  return row ? mapRow(row) : null
}

export function countEmployees(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM employees').get() as { c: number }).c
}

export function addEmployee(input: EmployeeInput): Employee {
  const db = getDb()
  const now = new Date().toISOString()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO employees (id, name, code, department, designation, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.code ?? null, input.department ?? null, input.designation ?? null, input.notes ?? null, now, now)
  return getEmployee(id)!
}

export function updateEmployee(id: string, input: EmployeeInput): Employee {
  const db = getDb()
  const existing = getEmployee(id)
  if (!existing) throw new ServiceError('EMPLOYEE_NOT_FOUND', 'Employee not found.')
  db.prepare(
    `UPDATE employees
     SET name = ?, code = ?, department = ?, designation = ?, notes = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    input.name,
    input.code ?? null,
    input.department ?? null,
    input.designation ?? null,
    input.notes ?? null,
    new Date().toISOString(),
    id,
  )
  return getEmployee(id)!
}

export function deleteEmployee(id: string): void {
  const result = getDb().prepare('DELETE FROM employees WHERE id = ?').run(id)
  if (result.changes === 0) throw new ServiceError('EMPLOYEE_NOT_FOUND', 'Employee not found.')
}

/**
 * Import rows, upserting by employee code when present. Returns how many
 * records were inserted vs updated.
 */
export function importEmployees(rows: Record<string, string>[]): { inserted: number; updated: number } {
  const db = getDb()
  const insert = db.prepare(
    `INSERT INTO employees (id, name, code, department, designation, notes, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const update = db.prepare(
    `UPDATE employees SET name = ?, department = ?, designation = ?, notes = ?, updated_at = ? WHERE id = ?`,
  )
  const findByCode = db.prepare('SELECT id FROM employees WHERE code = ?')
  const now = new Date().toISOString()
  let inserted = 0
  let updated = 0
  const run = db.transaction(() => {
    for (const row of rows) {
      const name = (row.name ?? '').trim()
      if (!name) continue
      const code = (row.code ?? '').trim() || null
      const department = (row.department ?? '').trim() || null
      const designation = (row.designation ?? '').trim() || null
      const notes = (row.notes ?? '').trim() || null
      if (code) {
        const existing = findByCode.get(code) as { id: string } | undefined
        if (existing) {
          update.run(name, department, designation, notes, now, existing.id)
          updated++
          continue
        }
      }
      insert.run(randomUUID(), name, code, department, designation, notes, now, now)
      inserted++
    }
  })
  run()
  return { inserted, updated }
}
