/**
 * End-to-end verification of the Excel generation service:
 *  - values land in the mapped cells (with type conversion)
 *  - fonts, fills, borders, merges, widths, heights, formulas, number
 *    formats, images and additional worksheets survive untouched
 *  - the original template file is never modified
 *  - error paths produce clean ServiceError messages
 *
 * Run with: npm run verify
 */
import { build } from 'esbuild'
import ExcelJS from 'exceljs'
import crypto from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(root, '.verify-xlsx-'))

// Bundle the excel service exactly like the app does (pure JS deps external).
const out = path.join(tmp, 'excel-service.cjs')
await build({
  entryPoints: [path.join(root, 'src/main/services/excel/excelService.ts')],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  external: ['electron', 'exceljs', 'better-sqlite3', 'zod'],
  logLevel: 'silent',
})
// import() needs a file URL (Windows paths are not valid module specifiers).
const { generateExcel } = await import(pathToFileURL(out).href)

let failures = 0
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}`)
  }
}

// 1x1 transparent PNG — just needs to be a valid embedded image.
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
)

const INDIGO = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
const THIN = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
}

async function makeTemplate(file) {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Employee Details')
  ws.columns = [{ width: 30 }, { width: 42 }, { width: 18 }, { width: 18 }]
  ws.mergeCells('A1:D1')
  const title = ws.getCell('A1')
  title.value = 'HR REQUIREMENT FORM'
  title.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } }
  title.fill = INDIGO
  ws.getRow(1).height = 30
  ws.getCell('A5').value = 'Employee Name:'
  ws.getCell('A5').font = { bold: true }
  ws.getCell('B5').border = THIN
  ws.getRow(5).height = 20
  ws.getCell('A7').value = 'Department:'
  ws.getCell('B9').numFmt = 'dd/mm/yyyy'
  // B11 intentionally has NO explicit number format — writing a date must
  // give it a readable dd/mm/yyyy format (not raw serial / General).
  ws.getCell('B10').numFmt = '"Rs " #,##0.00'
  ws.getCell('A18').value = { formula: 'IF(B9="","INCOMPLETE","OK")', result: 'OK' }
  const imgId = wb.addImage({ buffer: TINY_PNG, extension: 'png' })
  ws.addImage(imgId, { tl: { col: 4.2, row: 0.1 }, ext: { width: 16, height: 16 } })
  const notes = wb.addWorksheet('Notes')
  notes.getCell('A1').value = 'internal notes sheet'
  notes.getCell('A1').font = { italic: true }
  await wb.xlsx.writeFile(file)
}

const templateFile = path.join(tmp, 'template.xlsx')
const outputDir = path.join(tmp, 'out')
const outputFile = path.join(outputDir, 'HR_Form_EMP1042.xlsx')
await makeTemplate(templateFile)
const before = crypto.createHash('sha256').update(fs.readFileSync(templateFile)).digest('hex')

const fields = [
  { id: '1', templateId: 't', fieldKey: 'employee_name', label: 'Employee Name', cellAddress: 'B5', sheetName: null, fieldType: 'text', required: true, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: [], sortOrder: 0 },
  { id: '2', templateId: 't', fieldKey: 'department', label: 'Department', cellAddress: 'B7', sheetName: null, fieldType: 'dropdown', required: false, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: ['Production', 'Admin'], sortOrder: 1 },
  { id: '3', templateId: 't', fieldKey: 'joining_date', label: 'Joining Date', cellAddress: 'B9', sheetName: null, fieldType: 'date', required: true, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: [], sortOrder: 2 },
  { id: '4', templateId: 't', fieldKey: 'salary', label: 'Salary', cellAddress: 'B10', sheetName: null, fieldType: 'currency', required: false, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: [], sortOrder: 3 },
  { id: '5', templateId: 't', fieldKey: 'contract_start', label: 'Contract Start', cellAddress: 'B11', sheetName: null, fieldType: 'date', required: false, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: [], sortOrder: 4 },
]

console.log('Generation:')
const result = await generateExcel({
  templatePath: templateFile,
  outputPath: outputFile,
  data: { employee_name: 'Arun Kumar', department: 'Production', joining_date: '2024-06-15', salary: '28,000', contract_start: '2023-01-31' },
  fields,
})
check('output file written', fs.existsSync(outputFile))
check('template file untouched', crypto.createHash('sha256').update(fs.readFileSync(templateFile)).digest('hex') === before)
check('5 cells reported as written', result.written.length === 5)

console.log('Values:')
const wb = new ExcelJS.Workbook()
await wb.xlsx.readFile(outputFile)
const ws = wb.getWorksheet('Employee Details')
check('B5 = Arun Kumar', ws.getCell('B5').value === 'Arun Kumar')
check('B7 = Production', ws.getCell('B7').value === 'Production')
const dateCell = ws.getCell('B9')
const dateVal = dateCell.value instanceof Date ? dateCell.value : null
check(
  'B9 is a date 2024-06-15',
  dateVal !== null && dateVal.getUTCFullYear() === 2024 && dateVal.getUTCMonth() === 5 && dateVal.getUTCDate() === 15,
)
check('B10 = 28000 (normalized from "28,000")', ws.getCell('B10').value === 28000)
const plainDate = ws.getCell('B11').value
check(
  'B11 (no template format) written as date 2023-01-31',
  plainDate instanceof Date && plainDate.getUTCFullYear() === 2023 && plainDate.getUTCMonth() === 0 && plainDate.getUTCDate() === 31,
)
check('B11 gets readable dd/mm/yyyy format', ws.getCell('B11').numFmt === 'dd/mm/yyyy')

console.log('Formatting preservation:')
const t2 = ws.getCell('A1')
check('title font size 15 + bold', t2.font?.size === 15 && t2.font?.bold === true)
check('title font color white', t2.font?.color?.argb === 'FFFFFFFF')
check('title fill indigo', t2.fill?.fgColor?.argb === 'FF4F46E5')
check(
  'A1:D1 still merged',
  t2.isMerged === true && t2.master === t2 && ws.model.merges.includes('A1:D1'),
)
check('label A5 still bold', ws.getCell('A5').font?.bold === true)
check('B5 border preserved', ws.getCell('B5').border?.top?.style === 'thin')
check('column A width 30', Math.round(ws.getColumn(1).width) === 30)
check('column B width 42', Math.round(ws.getColumn(2).width) === 42)
check('row 1 height 30', ws.getRow(1).height === 30)
check('row 5 height 20', ws.getRow(5).height === 20)
check('B9 date numFmt preserved', ws.getCell('B9').numFmt === 'dd/mm/yyyy')
check('B10 currency numFmt preserved', ws.getCell('B10').numFmt === '"Rs " #,##0.00')
const formulaCell = ws.getCell('A18').value
check('unmapped formula preserved', formulaCell && typeof formulaCell === 'object' && formulaCell.formula === 'IF(B9="","INCOMPLETE","OK")')
check('image preserved', ws.getImages().length >= 1)
const notes = wb.getWorksheet('Notes')
check('second worksheet preserved', notes !== undefined && notes.getCell('A1').value === 'internal notes sheet')

console.log('Error paths:')
let err1 = null
try {
  await generateExcel({ templatePath: path.join(tmp, 'missing.xlsx'), outputPath: outputFile, data: {}, fields })
} catch (e) {
  err1 = e
}
check('missing template -> clean error', err1?.code === 'TEMPLATE_NOT_FOUND' && /Template not found/.test(err1.message))

let err2 = null
try {
  await generateExcel({
    templatePath: templateFile,
    outputPath: outputFile,
    data: { joining_date: 'not-a-date' },
    fields,
  })
} catch (e) {
  err2 = e
}
check('invalid date -> clean error', err2?.code === 'INVALID_VALUE' && /Invalid date/.test(err2.message))

let err3 = null
try {
  await generateExcel({
    templatePath: templateFile,
    outputPath: outputFile,
    data: { department: 'Warehouse' },
    fields,
  })
} catch (e) {
  err3 = e
}
check('bad dropdown value -> clean error', err3?.code === 'INVALID_VALUE' && /not one of the allowed options/.test(err3.message))

// Multi-sheet mapping: target the Notes sheet explicitly.
let err4 = null
try {
  await generateExcel({
    templatePath: templateFile,
    outputPath: path.join(outputDir, 'multi.xlsx'),
    data: { note: 'hello' },
    fields: [
      { id: 'x', templateId: 't', fieldKey: 'note', label: 'Note', cellAddress: 'B1', sheetName: 'Notes', fieldType: 'text', required: false, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: [], sortOrder: 0 },
    ],
  })
} catch (e) {
  err4 = e
}
const multi = new ExcelJS.Workbook()
await multi.xlsx.readFile(path.join(outputDir, 'multi.xlsx'))
check('per-field sheet targeting works', err4 === null && multi.getWorksheet('Notes')?.getCell('B1').value === 'hello')

let err5 = null
try {
  await generateExcel({
    templatePath: templateFile,
    outputPath: path.join(outputDir, 'badsheet.xlsx'),
    data: { employee_name: 'x' },
    fields: [
      { id: 'y', templateId: 't', fieldKey: 'employee_name', label: 'Name', cellAddress: 'B5', sheetName: 'Ghost Sheet', fieldType: 'text', required: false, defaultValue: null, validationRule: null, aiDescription: null, dropdownOptions: [], sortOrder: 0 },
    ],
  })
} catch (e) {
  err5 = e
}
check('unknown sheet -> clean error', err5?.code === 'SHEET_NOT_FOUND')

fs.rmSync(tmp, { recursive: true, force: true })

if (failures > 0) {
  console.error(`\nExcel verification FAILED (${failures} failures)`)
  process.exit(1)
}
console.log('\nExcel preservation verification passed ✓')
