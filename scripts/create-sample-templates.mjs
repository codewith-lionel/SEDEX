/**
 * Creates the bundled sample Excel templates in /templates.
 * Run with: npm run sample:templates
 *
 * The templates are intentionally rich (fonts, fills, borders, merged cells,
 * column widths, row heights, formulas, number formats, multiple sheets and
 * an embedded image) so that formatting preservation can be verified.
 */
import ExcelJS from 'exceljs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(__dirname, '..', 'templates')
fs.mkdirSync(OUT_DIR, { recursive: true })

// ---------------------------------------------------------------------------
// Tiny PNG encoder (no dependencies) — draws a 120x36 "logo" chip.
// ---------------------------------------------------------------------------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(width, height, rgba) {
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // color type RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

function drawLogo() {
  const w = 120
  const h = 36
  const px = Buffer.alloc(w * h * 4) // transparent
  const INDIGO = [79, 70, 229, 255]
  const WHITE = [255, 255, 255, 255]
  const set = (x, y, c) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return
    const i = (y * w + x) * 4
    px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]
  }
  // Rounded rectangle background
  const r = 8
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const inX = x >= r && x < w - r
      const inY = y >= r && y < h - r
      const inCorner =
        (x < r && y < r && dist(x, y, r, r) <= r) ||
        (x >= w - r && y < r && dist(x, y, w - r - 1, r) <= r) ||
        (x < r && y >= h - r && dist(x, y, r, h - r - 1) <= r) ||
        (x >= w - r && y >= h - r && dist(x, y, w - r - 1, h - r - 1) <= r)
      if (inX || inY || inCorner) set(x, y, INDIGO)
    }
  }
  // White check mark (thick line)
  const thickLine = (x0, y0, x1, y1, thickness) => {
    const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2
    for (let s = 0; s <= steps; s++) {
      const x = Math.round(x0 + ((x1 - x0) * s) / steps)
      const y = Math.round(y0 + ((y1 - y0) * s) / steps)
      for (let dy = -thickness; dy <= thickness; dy++)
        for (let dx = -thickness; dx <= thickness; dx++)
          if (dx * dx + dy * dy <= thickness * thickness) set(x + dx, y + dy, WHITE)
    }
  }
  thickLine(38, 19, 50, 28, 3)
  thickLine(50, 28, 74, 10, 3)
  // "HR"-like bars
  for (let y = 11; y <= 25; y++) {
    for (const x of [8, 9, 10, 11, 12]) set(x, y, WHITE)
    for (const x of [16, 17, 18]) set(x, y, WHITE)
    for (const x of [12, 13, 14, 15, 16]) set(x, 18, WHITE)
  }
  return encodePng(w, h, px)
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2)
}

// ---------------------------------------------------------------------------
// Style helpers
// ---------------------------------------------------------------------------
const INDIGO_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4F46E5' } }
const LIGHT_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } }
const AMBER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF7ED' } }
const GREEN_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEAF7EC' } }
const THIN_BORDER = {
  top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
  right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
}
const CURRENCY_FMT = '"Rs " #,##0.00'
const DATE_FMT = 'dd/mm/yyyy'

function titleRow(ws, text, span, fillColor = INDIGO_FILL) {
  const row = ws.getRow(1)
  row.height = 30
  ws.mergeCells(`A1:${span}1`)
  const cell = ws.getCell('A1')
  cell.value = text
  cell.font = { name: 'Calibri', size: 15, bold: true, color: { argb: 'FFFFFFFF' } }
  cell.fill = fillColor
  cell.alignment = { horizontal: 'center', vertical: 'middle' }
}

function labelValue(ws, row, label, target, opts = {}) {
  const l = ws.getCell(`A${row}`)
  l.value = label
  l.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF334155' } }
  l.alignment = { vertical: 'middle' }
  const v = ws.getCell(target)
  v.border = THIN_BORDER
  v.alignment = { vertical: 'middle' }
  if (opts.fmt) v.numFmt = opts.fmt
  if (opts.fill) v.fill = opts.fill
  ws.getRow(row).height = 20
}

function section(ws, row, text, span) {
  ws.mergeCells(`A${row}:${span}${row}`)
  const c = ws.getCell(`A${row}`)
  c.value = text
  c.font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FF1E3A8A' } }
  c.fill = LIGHT_FILL
  ws.getRow(row).height = 20
}

function headerCell(ws, cell, text) {
  ws.getCell(cell).value = text
  ws.getCell(cell).font = { name: 'Calibri', size: 11, bold: true, color: { argb: 'FFFFFFFF' } }
  ws.getCell(cell).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } }
  ws.getCell(cell).alignment = { horizontal: 'center', vertical: 'middle' }
  ws.getCell(cell).border = THIN_BORDER
}

const logoBuffer = drawLogo()

// ---------------------------------------------------------------------------
// 1) HR Requirement Form
// ---------------------------------------------------------------------------
async function createHrRequirementForm() {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'HR Audit Form Generator'
  wb.created = new Date()
  const ws = wb.addWorksheet('Employee Details', {
    pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true },
  })
  ws.columns = [
    { width: 30 },
    { width: 42 },
    { width: 18 },
    { width: 18 },
    { width: 6 },
    { width: 18 },
  ]

  titleRow(ws, 'HR REQUIREMENT FORM', 'D')
  const sub = ws.getRow(2)
  ws.mergeCells('A2:D2')
  ws.getCell('A2').value = 'Confidential — for internal HR & audit use only'
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } }
  ws.getCell('A2').alignment = { horizontal: 'center' }

  const logoId = wb.addImage({ buffer: logoBuffer, extension: 'png' })
  ws.addImage(logoId, {
    tl: { col: 4.2, row: 0.1 },
    ext: { width: 120, height: 36 },
  })

  section(ws, 4, 'EMPLOYEE INFORMATION', 'D')
  labelValue(ws, 5, 'Employee Name:', 'B5')
  labelValue(ws, 6, 'Employee ID:', 'B6')
  labelValue(ws, 7, 'Department:', 'B7')
  labelValue(ws, 8, 'Designation:', 'B8')
  labelValue(ws, 9, 'Joining Date:', 'B9', { fmt: DATE_FMT })
  labelValue(ws, 10, 'Monthly Salary:', 'B10', { fmt: CURRENCY_FMT })
  labelValue(ws, 11, 'Permanent Contract:', 'B11')

  section(ws, 13, 'REVIEW', 'D')
  labelValue(ws, 14, 'Reviewed By:', 'B14')
  labelValue(ws, 15, 'Review Date:', 'B15', { fmt: DATE_FMT })
  labelValue(ws, 16, 'Remarks:', 'B16')

  const note = ws.getRow(18)
  ws.mergeCells('A18:D18')
  ws.getCell('A18').value = { formula: '"Status: " & IF(B9="","INCOMPLETE — joining date missing","Ready for review")', result: 'Status: Ready for review' }
  ws.getCell('A18').font = { size: 9, italic: true, color: { argb: 'FF64748B' } }

  const notes = wb.addWorksheet('Notes')
  notes.columns = [{ width: 100 }]
  notes.getCell('A1').value = 'How to use this form'
  notes.getCell('A1').font = { size: 14, bold: true }
  ;[
    '1. This template is filled automatically by HR Audit Form Generator.',
    '2. Only the mapped cells (column B) are modified — all formatting is preserved.',
    '3. Salary and dates keep their original number formats.',
    '4. Keep one copy per employee for audit files.',
  ].forEach((line, i) => {
    const c = notes.getCell(`A${i + 3}`)
    c.value = line
    c.font = { size: 11 }
  })

  const file = path.join(OUT_DIR, 'HR Requirement Form.xlsx')
  await wb.xlsx.writeFile(file)
  console.log('created', file)
}

// ---------------------------------------------------------------------------
// 2) Payroll Form
// ---------------------------------------------------------------------------
async function createPayrollForm() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Payroll')
  ws.columns = [{ width: 26 }, { width: 18 }, { width: 18 }, { width: 18 }]

  titleRow(ws, 'MONTHLY PAYROLL STATEMENT')
  section(ws, 4, 'EMPLOYEE', 'D')
  labelValue(ws, 5, 'Employee Name:', 'B5')
  labelValue(ws, 6, 'Employee ID:', 'B6')
  labelValue(ws, 7, 'Department:', 'B7')
  labelValue(ws, 8, 'Joining Date:', 'B8', { fmt: DATE_FMT })

  section(ws, 10, 'EARNINGS', 'D')
  const heads = ['Component', 'Basic', 'HRA', 'Allowance']
  heads.forEach((h, i) => headerCell(ws, String.fromCharCode(65 + i) + '11', h))
  ws.getRow(11).height = 22
  const earnings = [
    ['Monthly', 'B12', 'C12', 'D12'],
    ['Overtime', 'B13', 'C13', 'D13'],
  ]
  for (const [label, ...cells] of earnings) {
    ws.getCell(`A${label === 'Monthly' ? 12 : 13}`).value = label
    ws.getCell(`A${label === 'Monthly' ? 12 : 13}`).font = { bold: true }
    for (const c of cells) {
      ws.getCell(c).numFmt = CURRENCY_FMT
      ws.getCell(c).border = THIN_BORDER
    }
  }
  ws.getCell('A14').value = 'Total Earnings'
  ws.getCell('A14').font = { bold: true }
  ws.getCell('B14').value = { formula: 'SUM(B12:B13)', result: 0 }
  ws.getCell('B14').numFmt = CURRENCY_FMT
  ws.getCell('B14').font = { bold: true }
  ws.getCell('B14').fill = GREEN_FILL

  section(ws, 16, 'DEDUCTIONS', 'D')
  ws.getCell('A17').value = 'Statutory deductions'
  ws.getCell('A17').font = { bold: true }
  ws.getCell('B17').numFmt = CURRENCY_FMT
  ws.getCell('B17').border = THIN_BORDER

  ws.getCell('A19').value = 'Net Pay'
  ws.getCell('A19').font = { bold: true, size: 12, color: { argb: 'FF047857' } }
  ws.getCell('B19').value = { formula: 'B14-B17', result: 0 }
  ws.getCell('B19').numFmt = CURRENCY_FMT
  ws.getCell('B19').font = { bold: true, size: 12, color: { argb: 'FF047857' } }
  ws.getCell('B19').fill = GREEN_FILL

  const sign = ws.getRow(22)
  ws.mergeCells('A22:D22')
  ws.getCell('A22').value = 'Authorised Signatory'
  ws.getCell('A22').font = { italic: true, size: 10, color: { argb: 'FF64748B' } }
  ws.getCell('A22').alignment = { horizontal: 'right' }

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'Payroll Form.xlsx'))
  console.log('created', path.join(OUT_DIR, 'Payroll Form.xlsx'))
}

// ---------------------------------------------------------------------------
// 3) Attendance Form
// ---------------------------------------------------------------------------
async function createAttendanceForm() {
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Attendance')
  ws.columns = [{ width: 28 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 10 }, { width: 12 }]

  titleRow(ws, 'WEEKLY ATTENDANCE REGISTER')
  const sub = ws.getRow(2)
  ws.mergeCells('A2:H2')
  ws.getCell('A2').value = 'Mark P = present, A = absent, L = leave'
  ws.getCell('A2').font = { italic: true, size: 9, color: { argb: 'FF64748B' } }

  const headers = ['Employee Name', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Days Present']
  headers.forEach((h, i) => headerCell(ws, String.fromCharCode(65 + i) + '4', h))
  ws.getRow(4).height = 22

  const nameCell = ws.getCell('A5')
  nameCell.border = THIN_BORDER
  for (let c = 2; c <= 8; c++) {
    const cell = ws.getRow(5).getCell(c)
    cell.border = THIN_BORDER
    cell.alignment = { horizontal: 'center' }
  }
  ws.getCell('H5').value = { formula: 'COUNTIF(B5:G5,"P")', result: 0 }
  ws.getCell('H5').font = { bold: true }

  ws.getCell('A7').value = 'Remarks'
  ws.getCell('A7').font = { bold: true }
  ws.mergeCells('B7:H7')
  ws.getCell('B7').border = THIN_BORDER

  const ot = wb.addWorksheet('Overtime')
  ot.columns = [{ width: 26 }, { width: 16 }]
  titleRow(ot, 'OVERTIME SUMMARY', 'B')
  labelValue(ot, 4, 'Employee Name:', 'B4')
  labelValue(ot, 5, 'Week Start Date:', 'B5', { fmt: DATE_FMT })
  labelValue(ot, 6, 'Total OT Hours:', 'B6', { fmt: '#,##0.0' })
  ot.getCell('A8').value = 'Approval (Supervisor)'
  ot.getCell('A8').font = { bold: true }
  ot.getCell('B8').value = { formula: 'IF(B6>0,"Pending approval","None")', result: 'None' }
  ot.getCell('B8').fill = AMBER_FILL
  ot.getCell('B8').border = THIN_BORDER

  await wb.xlsx.writeFile(path.join(OUT_DIR, 'Attendance Form.xlsx'))
  console.log('created', path.join(OUT_DIR, 'Attendance Form.xlsx'))
}

await createHrRequirementForm()
await createPayrollForm()
await createAttendanceForm()
console.log('\nSample templates ready in /templates')
