import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { ServiceError } from '../errors'
import { parseCsv } from './csv'
import type { ParsedDataFile } from '../../../shared/types'
import { DATA_FILE_PREVIEW_ROWS } from '../../../shared/constants'

/**
 * Parse an Excel/CSV data file into a header + rows structure the UI can
 * preview and map columns against. Values are normalized to strings
 * (dates as DD/MM/YYYY) for the mapping preview.
 */
export async function parseDataFile(filePath: string): Promise<ParsedDataFile> {
  if (!fs.existsSync(filePath)) {
    throw new ServiceError('FILE_NOT_FOUND', `File not found: ${path.basename(filePath)}`)
  }
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.csv' || ext === '.txt') {
    let text: string
    try {
      text = await fs.promises.readFile(filePath, 'utf8')
    } catch (err) {
      throw new ServiceError('READ_FAILED', `Unable to read file: ${(err as Error).message}`)
    }
    const grid = parseCsv(text)
    return gridToParsedFile(path.basename(filePath), 'csv', grid)
  }
  if (ext === '.xlsx' || ext === '.xlsm') {
    const workbook = new ExcelJS.Workbook()
    try {
      await workbook.xlsx.readFile(filePath)
    } catch (err) {
      throw new ServiceError('INVALID_EXCEL', `Unable to read workbook: ${(err as Error).message}`)
    }
    const ws = workbook.worksheets[0]
    if (!ws) throw new ServiceError('INVALID_EXCEL', 'The file contains no worksheets.')
    const grid: string[][] = []
    ws.eachRow((row, rowNumber) => {
      if (rowNumber > 50000) return // hard safety cap
      const values: string[] = []
      row.eachCell({ includeEmpty: true }, (cell) => {
        values.push(cellToString(cell.value))
      })
      grid.push(values)
    })
    return gridToParsedFile(path.basename(filePath), 'xlsx', grid)
  }
  throw new ServiceError('UNSUPPORTED_FILE', 'Unsupported file type. Use .xlsx, .xlsm or .csv.')
}

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) {
    // Excel serial values are timezone-absolute; use UTC components so
    // imported dates (e.g. DOB) are not shifted by the machine's timezone.
    const p = (n: number) => String(n).padStart(2, '0')
    return `${p(v.getUTCDate())}/${p(v.getUTCMonth() + 1)}/${v.getUTCFullYear()}`
  }
  if (Array.isArray(v)) {
    return v.map((item) => (item && typeof item === 'object' && 'text' in item ? String(item.text) : '')).join('')
  }
  if (typeof v === 'object') {
    const obj = v as Record<string, unknown>
    if (typeof obj.formula === 'string') {
      return obj.result === null || obj.result === undefined ? '' : String(obj.result)
    }
    if (typeof obj.text === 'string') return obj.text
    return ''
  }
  return String(v)
}

function gridToParsedFile(fileName: string, kind: 'xlsx' | 'csv', grid: string[][]): ParsedDataFile {
  if (grid.length === 0) {
    throw new ServiceError('EMPTY_FILE', 'The file is empty — no rows found.')
  }
  const headerRow = grid[0]
  const width = Math.max(...grid.map((r) => r.length))
  const headers: string[] = []
  for (let i = 0; i < width; i++) {
    const h = (headerRow[i] ?? '').trim()
    headers.push(h || `Column ${i + 1}`)
  }
  const dataRows = grid.slice(1).filter((r) => r.some((c) => c.trim() !== ''))
  const rows: Record<string, string>[] = dataRows.slice(0, DATA_FILE_PREVIEW_ROWS).map((r) => {
    const record: Record<string, string> = {}
    for (let i = 0; i < width; i++) record[headers[i]] = (r[i] ?? '').trim()
    return record
  })
  return { fileName, kind, headers, rows, totalRows: dataRows.length }
}
