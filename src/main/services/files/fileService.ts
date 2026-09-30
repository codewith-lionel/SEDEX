import { app, dialog, BrowserWindow } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ServiceError } from '../errors'
import { sanitizeFileName } from '../../../shared/validation'

export function getDefaultOutputFolder(): string {
  return path.join(os.homedir(), 'Documents', 'HR Audit Forms')
}

export function getDefaultTemplateFolder(): string {
  return path.join(os.homedir(), 'Documents', 'HR Audit Forms', 'Templates')
}

export function ensureDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

/** Copy a user-selected template file into the managed template folder. */
export function copyTemplateIntoFolder(sourcePath: string, templateFolder: string, suggestedName: string): string {
  if (!fs.existsSync(sourcePath)) {
    throw new ServiceError('FILE_NOT_FOUND', 'The selected file no longer exists.')
  }
  const ext = path.extname(sourcePath)
  if (!['.xlsx', '.xlsm'].includes(ext.toLowerCase())) {
    throw new ServiceError('INVALID_EXCEL', 'Please select an .xlsx template file.')
  }
  ensureDir(templateFolder)
  const base = sanitizeFileName(suggestedName || path.basename(sourcePath, ext), 'template')
  const dest = uniquePath(path.join(templateFolder, `${base}.xlsx`))
  fs.copyFileSync(sourcePath, dest)
  return dest
}

export function pickExcelFile(parent: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title: 'Select an Excel template or data file',
    buttonLabel: 'Select',
    properties: ['openFile'],
    filters: [
      { name: 'Excel / CSV', extensions: ['xlsx', 'xlsm', 'csv'] },
      { name: 'All files', extensions: ['*'] },
    ],
  }
  return (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)).then(
    (r) => (r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]),
  )
}

export function pickFolder(parent: BrowserWindow | null, title: string): Promise<string | null> {
  const options: Electron.OpenDialogOptions = {
    title,
    buttonLabel: 'Choose',
    properties: ['openDirectory', 'createDirectory'],
  }
  return (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)).then(
    (r) => (r.canceled || r.filePaths.length === 0 ? null : r.filePaths[0]),
  )
}

/** Folder of bundled sample templates (project root in dev, asar in prod). */
export function getBundledTemplatesDir(): string {
  return path.join(app.getAppPath(), 'templates')
}

export function listBundledSamples(): string[] {
  const dir = getBundledTemplatesDir()
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter((f) => f.toLowerCase().endsWith('.xlsx'))
    .sort()
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
