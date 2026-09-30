import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import type {
  FieldValueEntry,
  GeneratedFile,
  GenerationSource,
} from '../../../../shared/types'

interface GeneratedFileRow {
  id: string
  template_id: string | null
  template_name: string | null
  employee_id: string | null
  employee_name: string | null
  file_name: string
  file_path: string
  status: string
  error: string | null
  source: string
  data_snapshot: string | null
  created_at: string
}

function mapRow(row: GeneratedFileRow): GeneratedFile {
  let snapshot: Record<string, FieldValueEntry> | null = null
  if (row.data_snapshot) {
    try {
      const parsed = JSON.parse(row.data_snapshot)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        snapshot = parsed as Record<string, FieldValueEntry>
      }
    } catch {
      snapshot = null
    }
  }
  return {
    id: row.id,
    templateId: row.template_id,
    templateName: row.template_name,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    fileName: row.file_name,
    filePath: row.file_path,
    status: row.status as GeneratedFile['status'],
    error: row.error,
    source: row.source as GenerationSource,
    dataSnapshot: snapshot,
    createdAt: row.created_at,
  }
}

export interface ListFilesQuery {
  search?: string
  templateId?: string
  limit?: number
}

export function listFiles(query: ListFilesQuery = {}): GeneratedFile[] {
  const db = getDb()
  const where: string[] = []
  const params: unknown[] = []
  if (query.search) {
    where.push('(file_name LIKE ? OR employee_name LIKE ? OR template_name LIKE ?)')
    params.push(`%${query.search}%`, `%${query.search}%`, `%${query.search}%`)
  }
  if (query.templateId) {
    where.push('template_id = ?')
    params.push(query.templateId)
  }
  let sql = `SELECT * FROM generated_files ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC`
  if (query.limit) {
    sql += ' LIMIT ?'
    params.push(query.limit)
  }
  return (db.prepare(sql).all(...params) as GeneratedFileRow[]).map(mapRow)
}

export function getFile(id: string): GeneratedFile | null {
  const row = getDb().prepare('SELECT * FROM generated_files WHERE id = ?').get(id) as GeneratedFileRow | undefined
  return row ? mapRow(row) : null
}

export function countFiles(): number {
  return (getDb().prepare('SELECT COUNT(*) AS c FROM generated_files').get() as { c: number }).c
}

export function countFilesByStatus(status: GeneratedFile['status']): number {
  return (
    getDb().prepare('SELECT COUNT(*) AS c FROM generated_files WHERE status = ?').get(status) as { c: number }
  ).c
}

export function recentFiles(limit = 5): GeneratedFile[] {
  return listFiles({ limit })
}

export interface CreateFileInput {
  templateId: string | null
  templateName: string | null
  employeeId: string | null
  employeeName: string | null
  fileName: string
  filePath: string
  status: GeneratedFile['status']
  error?: string | null
  source: GenerationSource
  dataSnapshot?: Record<string, FieldValueEntry> | null
}

export function createFile(input: CreateFileInput): GeneratedFile {
  const db = getDb()
  const id = randomUUID()
  db.prepare(
    `INSERT INTO generated_files
       (id, template_id, template_name, employee_id, employee_name, file_name, file_path,
        status, error, source, data_snapshot, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    id,
    input.templateId,
    input.templateName,
    input.employeeId,
    input.employeeName,
    input.fileName,
    input.filePath,
    input.status,
    input.error ?? null,
    input.source,
    input.dataSnapshot ? JSON.stringify(input.dataSnapshot) : null,
    new Date().toISOString(),
  )
  return getFile(id)!
}

export function updateFileStatus(
  id: string,
  status: GeneratedFile['status'],
  error: string | null = null,
): void {
  getDb().prepare('UPDATE generated_files SET status = ?, error = ? WHERE id = ?').run(status, error, id)
}

export function deleteFile(id: string): GeneratedFile | null {
  const file = getFile(id)
  if (!file) return null
  getDb().prepare('DELETE FROM generated_files WHERE id = ?').run(id)
  return file
}
