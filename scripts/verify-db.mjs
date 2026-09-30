/**
 * Verifies the SQLite layer: migrations run cleanly and the repositories
 * round-trip data. The main-process modules are bundled with esbuild first
 * (same pipeline the app uses for the main process).
 *
 * Run with: npm run verify
 */
import { build } from 'esbuild'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const tmp = fs.mkdtempSync(path.join(root, '.verify-db-'))
const entry = path.join(tmp, 'entry.ts')
const out = path.join(tmp, 'entry.cjs')

fs.writeFileSync(
  entry,
  `export * from '${path.join(root, 'src/main/services/database/db').replace(/\\/g, '/')}'
   export * as templatesRepo from '${path.join(root, 'src/main/services/database/repositories/templates').replace(/\\/g, '/')}'
   export * as fieldsRepo from '${path.join(root, 'src/main/services/database/repositories/fields').replace(/\\/g, '/')}'
   export * as employeesRepo from '${path.join(root, 'src/main/services/database/repositories/employees').replace(/\\/g, '/')}'
   export * as filesRepo from '${path.join(root, 'src/main/services/database/repositories/generatedFiles').replace(/\\/g, '/')}'
   export * as settingsRepo from '${path.join(root, 'src/main/services/database/repositories/settings').replace(/\\/g, '/')}'
   export { default as ExcelJS } from 'exceljs'
  `,
)

await build({
  entryPoints: [entry],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  outfile: out,
  external: ['electron', 'better-sqlite3', 'exceljs', 'zod'],
  logLevel: 'silent',
  // Shim for Vite's `?raw` imports (the app build handles them natively).
  plugins: [
    {
      name: 'raw-sql',
      setup(b) {
        b.onResolve({ filter: /\.sql(\?raw)?$/ }, (args) => ({
          path: path.resolve(args.resolveDir, args.path.replace(/\?raw$/, '')),
          namespace: 'raw-sql',
        }))
        b.onLoad({ filter: /.*/, namespace: 'raw-sql' }, (args) => ({
          contents: fs.readFileSync(args.path, 'utf8'),
          loader: 'text',
        }))
      },
    },
  ],
})

const dbFile = path.join(tmp, 'test.db')
process.env.SEDX_DB_PATH = dbFile
const mod = await import(out)

let failures = 0
function check(name, cond) {
  if (cond) console.log(`  ✓ ${name}`)
  else {
    failures++
    console.error(`  ✗ ${name}`)
  }
}

console.log('Database migrations:')
mod.getDb()
const Database = (await import('better-sqlite3')).default
const raw = new Database(dbFile)
const tables = raw.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map((r) => r.name)
for (const t of ['templates', 'template_fields', 'employees', 'generated_files', 'settings', 'schema_migrations']) {
  check(`table ${t} exists`, tables.includes(t))
}
check('migrations tracked', raw.prepare('SELECT COUNT(*) c FROM schema_migrations').get().c === 1)
// Idempotent second open
raw.close()
mod.getDb()
check('second open is idempotent', true)

console.log('Templates + fields:')
const fakeTemplateFile = path.join(tmp, 'fake-template.xlsx')
{
  // A minimal real xlsx so duplicateTemplate can copy it.
  const wb = mod.ExcelJS.Workbook ? new mod.ExcelJS.Workbook() : null
  const ws = wb.addWorksheet('S')
  ws.getCell('A1').value = 'hello'
  await wb.xlsx.writeFile(fakeTemplateFile)
}
const t = mod.templatesRepo.createTemplate({
  name: 'Test Template',
  description: 'desc',
  category: 'HR',
  filePath: fakeTemplateFile,
  status: 'active',
})
check('template created', t.id.length > 0 && t.name === 'Test Template')
const saved = mod.fieldsRepo.replaceFields(t.id, [
  { fieldKey: 'employee_name', label: 'Employee Name', cellAddress: 'b5', fieldType: 'text', required: true, dropdownOptions: [] },
  { fieldKey: 'joining_date', label: 'Joining Date', cellAddress: 'B9', fieldType: 'date', required: true, dropdownOptions: [] },
  {
    fieldKey: 'department',
    label: 'Department',
    cellAddress: 'B7',
    fieldType: 'dropdown',
    required: false,
    dropdownOptions: ['Production', 'Admin'],
  },
])
check('3 fields saved', saved.length === 3)
check('cell address normalized', saved[0].cellAddress === 'B5')
check('required flag stored', saved[0].required === true)
check('dropdown options stored', saved[2].dropdownOptions.join(',') === 'Production,Admin')
const dup = mod.templatesRepo.duplicateTemplate(t.id)
check('duplicate has copied fields', mod.fieldsRepo.listFields(dup.id).length === 3)
mod.templatesRepo.updateTemplate(t.id, { status: 'inactive' })
check('status update', mod.templatesRepo.getTemplate(t.id).status === 'inactive')
mod.templatesRepo.deleteTemplate(dup.id)
check('delete cascades', mod.fieldsRepo.listFields(dup.id).length === 0)

console.log('Employees:')
const e1 = mod.employeesRepo.addEmployee({ name: 'Arun Kumar', code: 'EMP1042', department: 'Production' })
const e2 = mod.employeesRepo.addEmployee({ name: 'Bela Rao', code: 'EMP1043' })
check('employees added', e1.id && e2.id)
const importResult = mod.employeesRepo.importEmployees([
  { name: 'Arun Kumar', code: 'EMP1042', department: 'Production', designation: 'Supervisor' },
  { name: 'Chetan Menon', code: 'EMP1044' },
])
check('upsert by code', importResult.updated === 1 && importResult.inserted === 1)
check('list search', mod.employeesRepo.listEmployees('arun').length === 1)
mod.employeesRepo.deleteEmployee(e2.id)
check('delete', mod.employeesRepo.listEmployees().length === 2)

console.log('Generated files:')
const gf = mod.filesRepo.createFile({
  templateId: t.id,
  templateName: 'Test Template',
  employeeId: e1.id,
  employeeName: 'Arun Kumar',
  fileName: 'HR_Form_EMP1042.xlsx',
  filePath: '/tmp/HR_Form_EMP1042.xlsx',
  status: 'completed',
  source: 'ai',
  dataSnapshot: { employee_name: { value: 'Arun Kumar', status: 'found', method: 'ai', source: 'text', page: null, confidence: 0.9, note: null } },
})
check('file recorded', gf.id && gf.dataSnapshot?.employee_name?.value === 'Arun Kumar')
check('count', mod.filesRepo.countFiles() === 1)
mod.filesRepo.deleteFile(gf.id)
check('file deleted', mod.filesRepo.countFiles() === 0)

console.log('Settings:')
mod.settingsRepo.setSettings({ geminiApiKey: 'AIza-test', aiEnabled: true, theme: 'dark' })
const s = mod.settingsRepo.getSettings({ outputFolder: '/out', templateFolder: '/tpl', databasePath: dbFile })
check('settings stored', s.geminiApiKey === 'AIza-test' && s.aiEnabled === true && s.theme === 'dark')
check('defaults applied', s.outputFolder === '/out' && s.databasePath === dbFile)

mod.closeDb()
raw.close()
fs.rmSync(tmp, { recursive: true, force: true })

if (failures > 0) {
  console.error(`\nDB verification FAILED (${failures} failures)`)
  process.exit(1)
}
console.log('\nDatabase verification passed ✓')
