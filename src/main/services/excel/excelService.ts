import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { ServiceError } from '../errors'
import type { TemplateField } from '../../../shared/types'
import { validateFieldValue } from '../../../shared/validation'

/**
 * Excel generation service.
 *
 * Formatting preservation strategy: the original template file is copied to
 * the output location, the COPY is opened with ExcelJS, and only the mapped
 * cells have their values replaced. Everything else — fonts, fills, borders,
 * merges, row heights, column widths, number formats, formulas, images,
 * additional worksheets, print layout — is left untouched because the
 * original XML streams are rewritten by ExcelJS as-is for those parts.
 *
 * The original template file is never modified.
 */

export interface GenerateInput {
  templatePath: string
  outputPath: string
  data: Record<string, unknown>
  fields: TemplateField[]
}

export interface WrittenCell {
  fieldKey: string
  sheet: string
  cell: string
  value: unknown
}

export interface GenerateResult {
  outputPath: string
  written: WrittenCell[]
}

export async function generateExcel(input: GenerateInput): Promise<GenerateResult> {
  if (!fs.existsSync(input.templatePath)) {
    throw new ServiceError('TEMPLATE_NOT_FOUND', `Template not found: ${path.basename(input.templatePath)}`)
  }

  fs.mkdirSync(path.dirname(input.outputPath), { recursive: true })
  try {
    await fs.promises.copyFile(input.templatePath, input.outputPath)
  } catch (err) {
    throw new ServiceError('COPY_FAILED', `Unable to copy the template: ${(err as Error).message}`)
  }

  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(input.outputPath)
  } catch (err) {
    fs.rmSync(input.outputPath, { force: true })
    throw new ServiceError('INVALID_EXCEL', `Unable to read workbook: ${(err as Error).message}`)
  }

  if (workbook.worksheets.length === 0) {
    fs.rmSync(input.outputPath, { force: true })
    throw new ServiceError('INVALID_EXCEL', 'The template contains no worksheets.')
  }

  const defaultSheet = workbook.worksheets[0].name
  const written: WrittenCell[] = []

  for (const field of input.fields) {
    const raw = input.data[field.fieldKey]
    if (raw === undefined || raw === null || String(raw).trim() === '') continue

    const sheetName = field.sheetName || defaultSheet
    const worksheet = workbook.getWorksheet(sheetName)
    if (!worksheet) {
      throw new ServiceError(
        'SHEET_NOT_FOUND',
        `Worksheet "${sheetName}" (for field "${field.fieldKey}") was not found in the template.`,
      )
    }

    const check = validateFieldValue(field, raw)
    if (!check.ok) {
      throw new ServiceError('INVALID_VALUE', `${field.label}: ${check.error}`)
    }
    if (check.value === null) continue

    const cell = worksheet.getCell(field.cellAddress)
    cell.value = check.value as ExcelJS.CellValue
    // Date fields: keep the template's number format when present, otherwise
    // give the cell a readable dd/mm/yyyy format ('General' = no explicit fmt).
    if (field.fieldType === 'date' && (!cell.numFmt || cell.numFmt === 'General')) {
      cell.numFmt = 'dd/mm/yyyy'
    }
    written.push({
      fieldKey: field.fieldKey,
      sheet: worksheet.name,
      cell: cell.address,
      value: check.value,
    })
  }

  try {
    await workbook.xlsx.writeFile(input.outputPath)
  } catch (err) {
    throw new ServiceError('SAVE_FAILED', `Unable to save output file: ${(err as Error).message}`)
  }

  return { outputPath: input.outputPath, written }
}

export interface WorksheetInfo {
  name: string
  rowCount: number
  columnCount: number
}

/** Lightweight workbook inspection (sheet names/size) used by the UI. */
export async function readWorkbookInfo(templatePath: string): Promise<WorksheetInfo[]> {
  if (!fs.existsSync(templatePath)) {
    throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
  }
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(templatePath)
  } catch (err) {
    throw new ServiceError('INVALID_EXCEL', `Unable to read workbook: ${(err as Error).message}`)
  }
  return workbook.worksheets.map((ws) => ({
    name: ws.name,
    rowCount: ws.rowCount,
    columnCount: ws.columnCount,
  }))
}

export interface CellPreview {
  address: string
  text: string
  formula: string | null
  isMerged: boolean
  isMaster: boolean
}

/**
 * Read a bounded grid of a worksheet for the field-mapper preview.
 * `maxRows`/`maxCols` keep large templates cheap to render.
 */
export async function readSheetGrid(
  templatePath: string,
  sheetName: string,
  maxRows: number,
  maxCols: number,
): Promise<CellPreview[][]> {
  if (!fs.existsSync(templatePath)) {
    throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
  }
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.readFile(templatePath)
  } catch (err) {
    throw new ServiceError('INVALID_EXCEL', `Unable to read workbook: ${(err as Error).message}`)
  }
  const worksheet = workbook.getWorksheet(sheetName)
  if (!worksheet) {
    throw new ServiceError('SHEET_NOT_FOUND', `Worksheet "${sheetName}" was not found in the template.`)
  }

  const grid: CellPreview[][] = []
  for (let r = 1; r <= maxRows; r++) {
    const rowPreview: CellPreview[] = []
    for (let c = 1; c <= maxCols; c++) {
      const cell = worksheet.getCell(r, c)
      rowPreview.push({
        address: cell.address,
        text: cellText(cell),
        formula: cellFormula(cell),
        isMerged: cell.isMerged,
        isMaster: cell.isMerged && cell.master === cell,
      })
    }
    grid.push(rowPreview)
  }
  return grid
}

function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    // Excel serial values are timezone-absolute; ExcelJS maps them to a Date
    // at UTC midnight for date-only cells. Use UTC components so the preview
    // shows exactly what Excel shows, in any user timezone.
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`
  }
  // Rich text cells are arrays of { text, font } items.
  if (Array.isArray(v)) {
    return v.map((item) => (item && typeof item === 'object' && 'text' in item ? String(item.text) : '')).join('')
  }
  if (typeof v === 'object') {
    const obj = v as unknown as Record<string, unknown>
    // Formula cell: show the cached result if Excel stored one.
    if (typeof obj.formula === 'string') {
      return obj.result === null || obj.result === undefined ? '' : String(obj.result)
    }
    // Hyperlink cell.
    if (typeof obj.text === 'string') return obj.text
    return ''
  }
  return String(v)
}

function cellFormula(cell: ExcelJS.Cell): string | null {
  const v = cell.value
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const f = (v as { formula?: unknown }).formula
    return typeof f === 'string' && f !== '' ? `=${f}` : null
  }
  return null
}
