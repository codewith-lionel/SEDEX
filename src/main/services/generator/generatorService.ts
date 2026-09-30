import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type {
  BulkFailure,
  BulkProgress,
  BulkResult,
  Employee,
  FieldValueEntry,
  GeneratedFile,
  GenerationSource,
  SingleGenerateResult,
  Template,
  TemplateField,
} from '../../../shared/types'
import { buildWarnings, hasBlockingErrors, sanitizeFileName } from '../../../shared/validation'
import { generateExcel } from '../excel/excelService'
import { parseDataFile } from '../excel/dataFile'
import { createFile } from '../database/repositories/generatedFiles'
import { getTemplate } from '../database/repositories/templates'
import { listFields } from '../database/repositories/fields'
import { getEmployeeByCode } from '../database/repositories/employees'
import { ServiceError } from '../errors'

interface TemplateContext {
  template: Template
  fields: TemplateField[]
}

function loadTemplateContext(templateId: string): TemplateContext {
  const template = getTemplate(templateId)
  if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
  return { template, fields: listFields(templateId) }
}

export interface SingleGenerateParams {
  templateId: string
  data: Record<string, unknown>
  provenance?: Record<string, Partial<FieldValueEntry>> | null
  employeeId?: string | null
  employeeName?: string | null
  fileName?: string
  source: GenerationSource
  outputFolder: string
}

/**
 * Generate one form after full validation. Validation errors are returned
 * as ServiceError so the UI can show the exact problem; a failed record is
 * only created for errors that occur while writing the file.
 */
export async function generateSingle(params: SingleGenerateParams): Promise<SingleGenerateResult> {
  const { template, fields } = loadTemplateContext(params.templateId)

  const warnings = buildWarnings(fields, params.data, params.provenance)
  if (hasBlockingErrors(warnings)) {
    const first = warnings.find((w) => w.level === 'error')!
    const label = fields.find((f) => f.fieldKey === first.fieldKey)?.label ?? first.fieldKey
    throw new ServiceError('VALIDATION_FAILED', `Required field missing or invalid: ${label} — ${first.message}`)
  }

  const fileName = params.fileName
    ? sanitizeFileName(params.fileName, template.name) + '.xlsx'
    : defaultFileName(template, params.data, params.employeeName)

  const outputPath = path.join(params.outputFolder, fileName)
  const snapshot = buildSnapshot(fields, params.data, params.provenance)

  try {
    await generateExcel({
      templatePath: template.filePath,
      outputPath,
      data: params.data,
      fields,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    createFile({
      templateId: template.id,
      templateName: template.name,
      employeeId: params.employeeId ?? null,
      employeeName: params.employeeName ?? null,
      fileName,
      filePath: outputPath,
      status: 'failed',
      error: message,
      source: params.source,
      dataSnapshot: snapshot,
    })
    throw new ServiceError('GENERATION_FAILED', message)
  }

  const record = createFile({
    templateId: template.id,
    templateName: template.name,
    employeeId: params.employeeId ?? null,
    employeeName: params.employeeName ?? null,
    fileName,
    filePath: outputPath,
    status: 'completed',
    source: params.source,
    dataSnapshot: snapshot,
  })

  return {
    id: record.id,
    fileName,
    filePath: outputPath,
    status: 'completed',
    error: null,
  }
}

export interface BulkGenerateParams {
  templateId: string
  outputFolder: string
  source: GenerationSource
  /** From an Excel/CSV data file. */
  dataFile?: {
    filePath: string
    columnMapping: Record<string, string>
    fileNameBase: string
    namingField?: string | null
  }
  /** From the employee database (full records mapped onto field keys). */
  employees?: {
    records: Employee[]
    fileNameBase: string
    namingField?: string | null
  }
  onProgress: (progress: BulkProgress) => void
}

/**
 * Generate one form per row/employee. Individual failures never stop the
 * batch; progress is streamed through `onProgress`.
 */
export async function generateBulk(params: BulkGenerateParams): Promise<BulkResult> {
  const { template, fields } = loadTemplateContext(params.templateId)
  const jobId = randomUUID()

  interface JobRow {
    index: number
    data: Record<string, unknown>
    employeeName: string | null
    employeeId: string | null
    namingValue: string | null
  }

  let rows: JobRow[] = []
  if (params.dataFile) {
    const parsed = await parseDataFile(params.dataFile.filePath)
    const mapping = params.dataFile.columnMapping
    for (let i = 0; i < parsed.rows.length; i++) {
      const row = parsed.rows[i]
      const data: Record<string, unknown> = {}
      for (const [header, fieldKey] of Object.entries(mapping)) {
        const v = row[header]
        if (v !== undefined && v !== '') data[fieldKey] = v
      }
      const code = pick(row, mapping, ['employee_id', 'code'])
      // The stored FK must reference a real employee record; if the CSV's
      // employee code matches one, link it — otherwise leave the link null.
      const matched = code ? getEmployeeByCode(code) : null
      rows.push({
        index: i,
        data,
        employeeName: pick(row, mapping, ['employee_name', 'name']) ?? matched?.name ?? null,
        employeeId: matched?.id ?? null,
        namingValue: params.dataFile.namingField ? rowValueForField(row, mapping, params.dataFile.namingField) : null,
      })
    }
  } else if (params.employees) {
    for (let i = 0; i < params.employees.records.length; i++) {
      const e = params.employees.records[i]
      const data: Record<string, unknown> = {
        employee_name: e.name,
        employee_id: e.code,
        department: e.department,
        designation: e.designation,
      }
      rows.push({
        index: i,
        data,
        employeeName: e.name,
        employeeId: e.id,
        namingValue: params.employees.namingField === 'employee_id' ? e.code : e.name,
      })
    }
  }

  if (rows.length === 0) {
    throw new ServiceError('NO_DATA', 'No rows to generate. Check the data file or mapping.')
  }

  const base = sanitizeFileName(params.dataFile?.fileNameBase ?? params.employees?.fileNameBase ?? template.name, 'form')
  const total = rows.length
  let done = 0
  let failed = 0
  const failures: BulkFailure[] = []
  const usedNames = new Set<string>()

  params.onProgress({ jobId, done: 0, total, failed: 0, currentFile: null })

  for (const row of rows) {
    const displayName = row.namingValue?.trim() || `Row ${row.index + 1}`
    let fileName = `${base}_${sanitizeFileName(displayName, `row${row.index + 1}`)}.xlsx`
    fileName = ensureUnique(fileName, usedNames)

    try {
      const warnings = buildWarnings(fields, row.data)
      if (hasBlockingErrors(warnings)) {
        const first = warnings.find((w) => w.level === 'error')!
        const label = fields.find((f) => f.fieldKey === first.fieldKey)?.label ?? first.fieldKey
        throw new ServiceError('VALIDATION_FAILED', `${label}: ${first.message}`)
      }
      const outputPath = path.join(params.outputFolder, fileName)
      await generateExcel({
        templatePath: template.filePath,
        outputPath,
        data: row.data,
        fields,
      })
      createFile({
        templateId: template.id,
        templateName: template.name,
        employeeId: row.employeeId,
        employeeName: row.employeeName,
        fileName,
        filePath: outputPath,
        status: 'completed',
        source: params.source,
        dataSnapshot: buildSnapshot(fields, row.data, null),
      })
    } catch (err) {
      failed++
      const message = err instanceof Error ? err.message : String(err)
      failures.push({ row: row.index + 1, fileName, error: message })
    }
    done++
    params.onProgress({ jobId, done, total, failed, currentFile: fileName })
  }

  return {
    total,
    completed: total - failed,
    failed,
    failures,
    outputFolder: params.outputFolder,
  }
}

function rowValueForField(
  row: Record<string, string>,
  mapping: Record<string, string>,
  fieldKey: string,
): string | null {
  for (const [header, key] of Object.entries(mapping)) {
    if (key === fieldKey) return (row[header] ?? '').trim() || null
  }
  return null
}

function pick(row: Record<string, string>, mapping: Record<string, string>, keys: string[]): string | null {
  for (const k of keys) {
    const header = Object.keys(mapping).find((h) => mapping[h] === k)
    if (header && (row[header] ?? '').trim()) return row[header].trim()
  }
  return null
}

function ensureUnique(name: string, used: Set<string>): string {
  if (!used.has(name)) {
    used.add(name)
    return name
  }
  const ext = path.extname(name)
  const stem = name.slice(0, -ext.length)
  for (let i = 2; ; i++) {
    const candidate = `${stem} (${i})${ext}`
    if (!used.has(candidate)) {
      used.add(candidate)
      return candidate
    }
  }
}

function defaultFileName(template: Template, data: Record<string, unknown>, employeeName?: string | null): string {
  const candidates = ['employee_id', 'employee_name', 'name', 'employee_code']
  for (const key of candidates) {
    const v = data[key]
    if (v !== undefined && v !== null && String(v).trim() !== '') {
      return `${sanitizeFileName(template.name, 'form')}_${sanitizeFileName(String(v), 'record')}.xlsx`
    }
  }
  const name = (employeeName ?? '').trim()
  if (name) return `${sanitizeFileName(template.name, 'form')}_${sanitizeFileName(name, 'record')}.xlsx`
  const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
  return `${sanitizeFileName(template.name, 'form')}_${stamp}.xlsx`
}

function buildSnapshot(
  fields: TemplateField[],
  data: Record<string, unknown>,
  provenance?: Record<string, Partial<FieldValueEntry>> | null,
): Record<string, FieldValueEntry> {
  const snapshot: Record<string, FieldValueEntry> = {}
  for (const field of fields) {
    const raw = data[field.fieldKey]
    const prov = provenance?.[field.fieldKey]
    snapshot[field.fieldKey] = {
      value: raw === undefined ? null : raw,
      source: prov?.source ?? null,
      page: prov?.page ?? null,
      status: prov?.status ?? (raw === undefined || raw === null || String(raw).trim() === '' ? 'not_found' : 'found'),
      confidence: prov?.confidence ?? null,
      method: prov?.method ?? 'manual',
      note: prov?.note ?? null,
    }
  }
  return snapshot
}

/** Regenerate a previously generated file from its stored data snapshot. */
export async function regenerateFile(
  file: GeneratedFile,
  outputFolder: string,
): Promise<{ fileName: string; filePath: string }> {
  if (!file.templateId || !file.dataSnapshot) {
    throw new ServiceError('REGENERATE_FAILED', 'This file has no stored data snapshot and cannot be regenerated.')
  }
  const template = getTemplate(file.templateId)
  if (!template) {
    throw new ServiceError('TEMPLATE_NOT_FOUND', 'The template for this file no longer exists.')
  }
  const fields = listFields(template.id)
  const data: Record<string, unknown> = {}
  for (const [key, entry] of Object.entries(file.dataSnapshot)) {
    if (entry?.value !== undefined && entry.value !== null) data[key] = entry.value
  }
  const fileName = file.fileName
  const outputPath = path.join(outputFolder, fileName)
  if (fs.existsSync(outputPath)) fs.rmSync(outputPath)
  await generateExcel({
    templatePath: template.filePath,
    outputPath,
    data,
    fields,
  })
  return { fileName, filePath: outputPath }
}
