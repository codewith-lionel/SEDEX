import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { getDb } from '../db'
import { ServiceError } from '../../errors'
import type { Template, TemplateCategory, TemplateStatus } from '../../../../shared/types'

interface TemplateRow {
  id: string
  name: string
  description: string
  category: string
  file_path: string
  status: string
  created_at: string
  updated_at: string
}

interface FieldRow {
  field_key: string
  label: string
  cell_address: string
  sheet_name: string | null
  field_type: string
  required: number
  default_value: string | null
  validation_rule: string | null
  ai_description: string | null
  dropdown_options: string
  sort_order: number
}

interface ListQuery {
  search?: string
  category?: TemplateCategory
  status?: TemplateStatus
}

function mapRow(row: TemplateRow, fieldCount: number): Template {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    category: row.category as Template['category'],
    filePath: row.file_path,
    fileName: path.basename(row.file_path),
    status: row.status as TemplateStatus,
    fieldCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function fieldCounts(): Map<string, number> {
  const map = new Map<string, number>()
  const rows = getDb()
    .prepare('SELECT template_id, COUNT(*) AS c FROM template_fields GROUP BY template_id')
    .all() as { template_id: string; c: number }[]
  for (const r of rows) map.set(r.template_id, r.c)
  return map
}

export function listTemplates(query: ListQuery = {}): Template[] {
  const db = getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (query.search) {
    where.push('(name LIKE ? OR description LIKE ?)')
    params.push(`%${query.search}%`, `%${query.search}%`)
  }
  if (query.category) {
    where.push('category = ?')
    params.push(query.category)
  }
  if (query.status) {
    where.push('status = ?')
    params.push(query.status)
  }
  const sql = `SELECT * FROM templates ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY updated_at DESC`
  const rows = db.prepare(sql).all(...params) as TemplateRow[]
  const counts = fieldCounts()
  return rows.map((r) => mapRow(r, counts.get(r.id) ?? 0))
}

export function getTemplate(id: string): Template | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM templates WHERE id = ?').get(id) as TemplateRow | undefined
  if (!row) return null
  const fieldCount =
    (db.prepare('SELECT COUNT(*) AS c FROM template_fields WHERE template_id = ?').get(id) as { c: number }).c
  return mapRow(row, fieldCount)
}

export function countTemplates(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM templates').get() as { c: number }).c
}

export function recentTemplates(limit = 5): Template[] {
  return listTemplates().slice(0, limit)
}

export function createTemplate(input: {
  name: string
  description: string
  category: TemplateCategory
  filePath: string
  status: TemplateStatus
}): Template {
  const db = getDb()
  const now = new Date().toISOString()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO templates (id, name, description, category, file_path, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, input.name, input.description, input.category, input.filePath, input.status, now, now)
  return getTemplate(id)!
}

export function updateTemplate(
  id: string,
  patch: { name?: string; description?: string; category?: TemplateCategory; status?: TemplateStatus },
): Template {
  const db = getDb()
  const existing = getTemplate(id)
  if (!existing) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
  const merged = {
    name: patch.name ?? existing.name,
    description: patch.description ?? existing.description,
    category: patch.category ?? existing.category,
    status: patch.status ?? existing.status,
  }
  db.prepare(
    `UPDATE templates SET name = ?, description = ?, category = ?, status = ?, updated_at = ? WHERE id = ?`,
  ).run(merged.name, merged.description, merged.category, merged.status, new Date().toISOString(), id)
  return getTemplate(id)!
}

export function duplicateTemplate(id: string): Template {
  const db = getDb()
  const existing = getTemplate(id)
  if (!existing) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
  const destPath = uniquePath(path.join(path.dirname(existing.filePath), `${path.basename(existing.filePath)}`))
  fs.copyFileSync(existing.filePath, destPath)
  const now = new Date().toISOString()
  const newId = randomUUID()
  db.prepare(
    `INSERT INTO templates (id, name, description, category, file_path, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(newId, `${existing.name} (Copy)`, existing.description, existing.category, destPath, existing.status, now, now)
  const srcFields = db
    .prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order')
    .all(id) as FieldRow[]
  const insertField = db.prepare(
    `INSERT INTO template_fields
       (id, template_id, field_key, label, cell_address, sheet_name, field_type, required,
        default_value, validation_rule, ai_description, dropdown_options, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const copyFields = db.transaction(() => {
    for (const f of srcFields) {
      insertField.run(
        randomUUID(),
        newId,
        f.field_key,
        f.label,
        f.cell_address,
        f.sheet_name,
        f.field_type,
        f.required,
        f.default_value,
        f.validation_rule,
        f.ai_description,
        f.dropdown_options,
        f.sort_order,
      )
    }
  })
  copyFields()
  return getTemplate(newId)!
}

export function deleteTemplate(id: string): void {
  const db = getDb()
  const result = db.prepare('DELETE FROM templates WHERE id = ?').run(id)
  if (result.changes === 0) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
}

export function touchTemplate(id: string): void {
  getDb().prepare('UPDATE templates SET updated_at = ? WHERE id = ?').run(new Date().toISOString(), id)
}

function uniquePath(p: string): string {
  if (!fs.existsSync(p)) return p
  const dir = path.dirname(p)
  const ext = path.extname(p)
  const base = path.basename(p, ext)
  for (let i = 1; ; i++) {
    const candidate = path.join(dir, `${base} (${i})${ext}`)
    if (!fs.existsSync(candidate)) return candidate
  }
}
