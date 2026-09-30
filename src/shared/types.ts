/**
 * Shared domain types used across the main process, preload bridge and
 * renderer. Keep this file free of Node.js/Electron-specific imports so it
 * can be compiled in every environment.
 */

export type TemplateCategory =
  | 'HR'
  | 'Payroll'
  | 'Attendance'
  | 'Overtime'
  | 'Employee'
  | 'Training'
  | 'Audit'
  | 'Other'

export type TemplateStatus = 'active' | 'inactive'

export type FieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'currency'
  | 'boolean'
  | 'dropdown'
  | 'multiline'

export type GenerationSource = 'manual' | 'text' | 'excel' | 'ai' | 'employees'

export interface Template {
  id: string
  name: string
  description: string
  category: TemplateCategory
  filePath: string
  fileName: string
  status: TemplateStatus
  fieldCount: number
  createdAt: string
  updatedAt: string
}

export interface TemplateField {
  id: string
  templateId: string
  fieldKey: string
  label: string
  cellAddress: string
  sheetName: string | null
  fieldType: FieldType
  required: boolean
  defaultValue: string | null
  validationRule: string | null
  aiDescription: string | null
  dropdownOptions: string[]
  sortOrder: number
}

export interface GeneratedFile {
  id: string
  templateId: string | null
  templateName: string | null
  employeeId: string | null
  employeeName: string | null
  fileName: string
  filePath: string
  status: 'completed' | 'failed'
  error: string | null
  source: GenerationSource
  dataSnapshot: Record<string, FieldValueEntry> | null
  createdAt: string
}

export interface Employee {
  id: string
  name: string
  code: string | null
  department: string | null
  designation: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export type ThemePreference = 'system' | 'light' | 'dark'

export interface AppSettings {
  geminiApiKey: string
  geminiModel: string
  aiEnabled: boolean
  outputFolder: string
  templateFolder: string
  theme: ThemePreference
  databasePath: string
}

/** Per-field value + provenance (source tracking for audit purposes). */
export interface FieldValueEntry {
  value: unknown
  source: string | null
  page: string | null
  status: ExtractionStatus
  confidence: number | null
  method: 'ai' | 'manual'
  note: string | null
}

export type ExtractionStatus = 'found' | 'not_found' | 'conflict' | 'unclear'

export interface ExtractionResult {
  /** fieldKey -> provenance entry */
  fields: Record<string, FieldValueEntry>
  /** Raw model response, kept for traceability (never used to write Excel). */
  raw: string
}

export interface FieldWarning {
  fieldKey: string
  level: 'error' | 'warning'
  message: string
}

export interface BulkProgress {
  jobId: string
  done: number
  total: number
  failed: number
  currentFile: string | null
}

export interface BulkFailure {
  row: number
  fileName: string
  error: string
}

export interface BulkResult {
  total: number
  completed: number
  failed: number
  failures: BulkFailure[]
  outputFolder: string
}

export interface ParsedDataFile {
  fileName: string
  kind: 'xlsx' | 'csv'
  headers: string[]
  rows: Record<string, string>[]
  totalRows: number
}

/** One cell of a worksheet preview grid. */
export interface SheetCell {
  address: string
  text: string
  formula: string | null
  isMerged: boolean
  /** True when this cell is the anchor (master) of a merged range. */
  isMaster: boolean
}

export interface SheetPreview {
  name: string
  rows: SheetCell[][]
  rowCount: number
  columnCount: number
  /** cellAddress -> fieldKey for mapped cells */
  mapped: Record<string, string>
}

export interface SingleGenerateResult {
  id: string
  fileName: string
  filePath: string
  status: 'completed' | 'failed'
  error: string | null
}

/**
 * Result envelope returned by every IPC call. The main process never throws
 * across the IPC boundary; failures travel as `{ ok: false, error }`.
 */
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string }

export interface SettingsPatch {
  geminiApiKey?: string
  geminiModel?: string
  aiEnabled?: boolean
  outputFolder?: string
  templateFolder?: string
  theme?: ThemePreference
}
