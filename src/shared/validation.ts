import type {
  FieldValueEntry,
  FieldWarning,
  TemplateField,
} from './types'

/**
 * Pure validation/conversion helpers shared by the main process (which writes
 * Excel) and the renderer (which previews values). No Node.js APIs in here.
 */

export interface FieldCheck {
  ok: boolean
  /** Converted value safe for the Excel layer (Date for date fields). */
  value: unknown
  error: string | null
}

function isBlank(v: unknown): boolean {
  return v === undefined || v === null || String(v).trim() === ''
}

export function toNumber(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v === 'string') {
    const cleaned = v.replace(/[^0-9.-]/g, '')
    if (cleaned === '' || cleaned === '-' || cleaned === '.') return null
    const n = Number(cleaned)
    return Number.isFinite(n) ? n : null
  }
  return null
}

/** Accepts ISO (2024-06-15) or common human formats; returns Date or null. */
export function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v
  if (typeof v !== 'string') return null
  const s = v.trim()
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m) return validUtc(Number(m[1]), Number(m[2]), Number(m[3]))
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    const y = Number(m[3])
    // DD/MM/YYYY preferred; fall back to MM/DD/YYYY when the first part is
    // obviously a month.
    if (a > 12) return validUtc(y, b, a)
    if (b > 12) return validUtc(y, a, b)
    return validUtc(y, b, a)
  }
  const d = new Date(s)
  return Number.isNaN(d.getTime()) ? null : d
}

function validUtc(y: number, mo: number, d: number): Date | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  const date = new Date(Date.UTC(y, mo - 1, d))
  if (
    date.getUTCFullYear() !== y ||
    date.getUTCMonth() !== mo - 1 ||
    date.getUTCDate() !== d
  ) {
    return null // e.g. 31 February
  }
  return date
}

export function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v
  if (typeof v === 'number') return v === 1 ? true : v === 0 ? false : null
  const s = String(v).trim().toLowerCase()
  if (['true', 'yes', 'y', '1'].includes(s)) return true
  if (['false', 'no', 'n', '0'].includes(s)) return false
  return null
}

/**
 * Convert + validate a raw field value according to the field definition.
 * Blank values pass as `value: null` (the Excel layer skips them); the
 * required/optional distinction is enforced by `buildWarnings`.
 */
export function validateFieldValue(field: TemplateField, raw: unknown): FieldCheck {
  if (isBlank(raw)) return { ok: true, value: null, error: null }
  switch (field.fieldType) {
    case 'number':
    case 'currency': {
      const n = toNumber(raw)
      if (n === null)
        return { ok: false, value: null, error: `Expected a number, got "${truncate(String(raw))}"` }
      return { ok: true, value: n, error: null }
    }
    case 'date': {
      const d = toDate(raw)
      if (!d)
        return { ok: false, value: null, error: `Invalid date: "${truncate(String(raw))}" (expected DD/MM/YYYY)` }
      return { ok: true, value: d, error: null }
    }
    case 'boolean': {
      const b = toBool(raw)
      if (b === null)
        return { ok: false, value: null, error: `Expected yes/no, got "${truncate(String(raw))}"` }
      return { ok: true, value: b, error: null }
    }
    case 'dropdown': {
      const s = String(raw)
      if (field.dropdownOptions.length > 0 && !field.dropdownOptions.includes(s)) {
        return {
          ok: false,
          value: s,
          error: `"${truncate(s)}" is not one of the allowed options: ${field.dropdownOptions.join(', ')}`,
        }
      }
      return { ok: true, value: s, error: null }
    }
    case 'text':
    case 'multiline': {
      const s = String(raw)
      const rule = field.validationRule?.trim()
      if (rule) {
        try {
          if (!new RegExp(rule).test(s))
            return { ok: false, value: s, error: `Value does not match the validation rule (${rule})` }
        } catch {
          // Invalid regex configured — treat as substring hint.
          if (!s.includes(rule))
            return { ok: false, value: s, error: `Value does not contain "${rule}"` }
        }
      }
      return { ok: true, value: s, error: null }
    }
  }
}

/**
 * Build the list of warnings shown on the review screen and enforced before
 * generation. Errors block generation; warnings do not.
 */
export function buildWarnings(
  fields: TemplateField[],
  values: Record<string, unknown>,
  provenance?: Record<string, Partial<FieldValueEntry>> | null,
): FieldWarning[] {
  const warnings: FieldWarning[] = []
  for (const field of fields) {
    const raw = values[field.fieldKey]
    const blank = isBlank(raw)
    const prov = provenance?.[field.fieldKey]
    let missingReported = false

    if (prov && prov.status === 'conflict') {
      warnings.push({
        fieldKey: field.fieldKey,
        level: 'warning',
        message: prov.note ? `Conflicting information: ${prov.note}` : 'Conflicting information found in the source text.',
      })
    } else if (prov && prov.status === 'unclear') {
      warnings.push({
        fieldKey: field.fieldKey,
        level: 'warning',
        message: prov.note ? `Unclear information: ${prov.note}` : 'The extracted value is uncertain — verify manually.',
      })
    } else if (prov && prov.status === 'not_found' && blank && field.required) {
      // Required value absent from the source — one clear, actionable error.
      warnings.push({
        fieldKey: field.fieldKey,
        level: 'error',
        message: 'Required field not found in the source — enter it manually.',
      })
      missingReported = true
    }
    // prov.status === 'not_found' && !blank → user filled it in afterwards.

    if (blank) {
      if (field.required && !missingReported)
        warnings.push({ fieldKey: field.fieldKey, level: 'error', message: 'Required field is missing.' })
      continue
    }

    const check = validateFieldValue(field, raw)
    if (!check.ok) {
      warnings.push({ fieldKey: field.fieldKey, level: 'error', message: check.error ?? 'Invalid value.' })
    }
  }
  return warnings
}

export function hasBlockingErrors(warnings: FieldWarning[]): boolean {
  return warnings.some((w) => w.level === 'error')
}

/** Normalize a header/field key for fuzzy matching (employees_name -> employeename). */
export function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

const SYNONYMS: Record<string, string[]> = {
  employee_name: ['employeename', 'fulllegalname', 'fullname', 'name'],
  employee_id: ['employeeid', 'employeecode', 'empid', 'id', 'empno', 'employeenumber'],
  department: ['department', 'dept'],
  designation: ['designation', 'jobtitle', 'title', 'position', 'role'],
  joining_date: ['joiningdate', 'joindate', 'dateofjoining', 'doj', 'startdate', 'hiredate'],
  salary: ['salary', 'monthlysalary', 'basicsalary', 'ctcsalary'],
}

/**
 * Guess a column -> fieldKey mapping for data files. Matching order:
 * exact fieldKey, exact label, then synonym list.
 */
export function autoMapColumns(
  headers: string[],
  fields: TemplateField[],
): Record<string, string> {
  const mapping: Record<string, string> = {}
  const used = new Set<string>()
  const normalizedFields = fields.map((f) => ({
    f,
    key: normalizeKey(f.fieldKey),
    label: normalizeKey(f.label),
  }))
  for (const header of headers) {
    const h = normalizeKey(header)
    if (!h) continue
    const candidates = [
      ...normalizedFields.filter((nf) => nf.key === h),
      ...normalizedFields.filter((nf) => nf.label === h),
      ...normalizedFields.filter((nf) => {
        const syn = SYNONYMS[nf.key] ?? []
        return syn.includes(h)
      }),
    ]
    const pick = candidates.find((c) => !used.has(c.f.fieldKey))
    if (pick) {
      mapping[header] = pick.f.fieldKey
      used.add(pick.f.fieldKey)
    }
  }
  return mapping
}

/** Auto-map file headers onto the four employee columns. */
export function autoMapEmployeeColumns(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {}
  const targetSyn: Record<string, string[]> = {
    name: ['employeename', 'fullname', 'name', 'employee'],
    code: ['employeeid', 'employeecode', 'empid', 'id', 'empno'],
    department: ['department', 'dept'],
    designation: ['designation', 'jobtitle', 'title', 'position', 'role'],
    notes: ['notes', 'remark', 'remarks'],
  }
  const used = new Set<string>()
  for (const header of headers) {
    const h = normalizeKey(header)
    if (!h) continue
    for (const [target, syns] of Object.entries(targetSyn)) {
      if (used.has(target)) continue
      if (syns.includes(h)) {
        map[header] = target
        used.add(target)
        break
      }
    }
  }
  return map
}

/**
 * Heuristic auto-mapping for non-technical users: find "Label:" cells in the
 * grid and propose a field for the cell directly to their right.
 * Generic — no template-specific knowledge.
 */
export interface AutoMappedField {
  fieldKey: string
  label: string
  cellAddress: string
  fieldType: 'text' | 'number' | 'date' | 'currency' | 'boolean' | 'dropdown' | 'multiline'
}

export function autoMapHeuristic(
  grid: Array<Array<{ address: string; text: string; formula: string | null }>>,
  existingKeys: Set<string>,
): AutoMappedField[] {
  const results: AutoMappedField[] = []
  const seenCells = new Set<string>()
  for (let r = 0; r < grid.length; r++) {
    const row = grid[r]
    for (let c = 0; c < row.length; c++) {
      const cell = row[c]
      const text = cell.text.trim()
      if (!text || !text.endsWith(':') || cell.formula) continue
      if (text.length > 60) continue
      // Target: first non-formula cell to the right (usually the adjacent one).
      let target = row[c + 1]
      if (!target || target.formula) continue
      if (seenCells.has(target.address)) continue
      seenCells.add(target.address)
      const label = text.replace(/:$/, '').trim()
      const key = slugifyKey(label)
      if (!key || existingKeys.has(key)) continue
      results.push({
        fieldKey: key,
        label: label.replace(/_/g, ' ').replace(/\b\w/g, (ch) => ch.toUpperCase()),
        cellAddress: target.address,
        fieldType: inferFieldType(label),
      })
    }
  }
  return results
}

function slugifyKey(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 48)
    .replace(/_+$/, '')
  if (!slug) return ''
  if (/^[0-9]/.test(slug)) return `field_${slug}`
  return slug
}

function inferFieldType(label: string): AutoMappedField['fieldType'] {
  const l = label.toLowerCase()
  if (/(date|dob|join|expire|contract period)/.test(l)) return 'date'
  if (/(salary|wage|amount|pay|total|rate|deduction)/.test(l)) return 'currency'
  if (/(\d|%|hours|days|count|age|number of)/.test(l)) return 'number'
  if (/(yes|no|permanent|regular|contract|verified|approved)/.test(l)) return 'boolean'
  return 'text'
}

const FILENAME_INVALID = /[\\/:*?"<>|]/g

export function sanitizeFileName(name: string, fallback = 'file'): string {
  const cleaned = name
    .replace(FILENAME_INVALID, '_')
    .replace(/\s+/g, '_')
    .replace(/\.+$/, '')
    .slice(0, 120)
    .trim()
  return cleaned || fallback
}

export function truncate(s: string, max = 60): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s
}

/** ISO date -> dd/mm/yyyy for display. */
export function formatDateDDMMYYYY(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`
}

export function formatDateTime(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Render a field value the way the review screen shows it. */
export function displayValue(field: TemplateField, raw: unknown): string {
  if (isBlank(raw)) return ''
  if (field.fieldType === 'currency') {
    const n = toNumber(raw)
    return n === null ? String(raw) : `₹${n.toLocaleString('en-IN')}`
  }
  if (field.fieldType === 'date') {
    const d = toDate(raw)
    if (!d) return String(raw)
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`
  }
  if (field.fieldType === 'boolean') return raw === true || String(raw).toLowerCase() === 'true' ? 'Yes' : 'No'
  return String(raw)
}
