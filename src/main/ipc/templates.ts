import { z } from 'zod'
import { IPC } from '../../shared/constants'
import {
  categorySchema,
  fieldsSaveSchema,
  templateStatusSchema,
  templatesCreateSchema,
  templatesUpdateSchema,
} from '../../shared/schemas'
import { getSettings } from '../services/settingsService'
import {
  countTemplates,
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  getTemplate,
  listTemplates,
  recentTemplates,
  touchTemplate,
  updateTemplate,
} from '../services/database/repositories/templates'
import { listFields, replaceFields } from '../services/database/repositories/fields'
import {
  copyTemplateIntoFolder,
  ensureDir,
  getBundledTemplatesDir,
  listBundledSamples,
} from '../services/files/fileService'
import { readSheetGrid, readWorkbookInfo } from '../services/excel/excelService'
import { ServiceError } from '../services/errors'
import { autoMapHeuristic } from '../../shared/validation'
import { handle } from './handler'
import { PREVIEW_COLS, PREVIEW_ROWS } from '../../shared/constants'
import fs from 'node:fs'
import path from 'node:path'

const idSchema = z.object({ id: z.string().min(1) })
const listSchema = z.object({
  search: z.string().max(200).optional(),
  category: categorySchema.optional(),
  status: templateStatusSchema.optional(),
})
const previewSchema = z.object({ id: z.string().min(1), sheetName: z.string().min(1) })

export function registerTemplateIpc(): void {
  handle(IPC.templatesList, listSchema, (q) => ({
    templates: listTemplates(q),
    count: countTemplates(),
  }))

  handle(IPC.templatesGet, idSchema, async ({ id }) => {
    const template = getTemplate(id)
    if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
    const sheets = (await readWorkbookInfo(template.filePath)).map((s) => s.name)
    return { template, fields: listFields(id), sheets }
  })

  handle(IPC.templatesCreate, templatesCreateSchema, (input) => {
    const filePath = copyTemplateIntoFolder(input.sourcePath, getTemplateFolder(), input.name)
    return createTemplate({
      name: input.name,
      description: input.description,
      category: input.category,
      filePath,
      status: input.status,
    })
  })

  handle(IPC.templatesUpdate, templatesUpdateSchema, (input) => updateTemplate(input.id, input))

  handle(IPC.templatesDuplicate, idSchema, ({ id }) => duplicateTemplate(id))

  handle(IPC.templatesDelete, idSchema, ({ id }) => {
    const template = getTemplate(id)
    if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
    deleteTemplate(id)
    // Best-effort removal of the stored template file (generated outputs are kept).
    try {
      if (fs.existsSync(template.filePath)) fs.rmSync(template.filePath)
    } catch {
      // The file may be in use; the record is already gone.
    }
    return { deleted: true }
  })

  handle(IPC.templatesSheets, idSchema, async ({ id }) => {
    const template = getTemplate(id)
    if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
    return (await readWorkbookInfo(template.filePath)).map((s) => s.name)
  })

  handle(IPC.templatesPreview, previewSchema, async ({ id, sheetName }) => {
    const template = getTemplate(id)
    if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
    const grid = await readSheetGrid(template.filePath, sheetName, PREVIEW_ROWS, PREVIEW_COLS)
    const mapped: Record<string, string> = {}
    for (const field of listFields(id)) {
      if (!field.sheetName || field.sheetName === sheetName) {
        mapped[field.cellAddress] = field.fieldKey
      }
    }
    return {
      name: sheetName,
      rows: grid,
      rowCount: grid.length,
      columnCount: grid[0]?.length ?? 0,
      mapped,
    }
  })

  handle(
    IPC.templatesAutoMap,
    z.object({ id: z.string().min(1), sheetName: z.string().min(1).optional() }),
    async ({ id, sheetName }) => {
      const template = getTemplate(id)
      if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
      const info = await readWorkbookInfo(template.filePath)
      const sheet = sheetName && info.some((s) => s.name === sheetName) ? sheetName : info[0]?.name
      if (!sheet) throw new ServiceError('INVALID_EXCEL', 'The template contains no worksheets.')
      const grid = await readSheetGrid(template.filePath, sheet, 200, 20)
      const existing = new Set(listFields(id).map((f) => f.fieldKey))
      const suggestions = autoMapHeuristic(grid, existing)
      return { sheet, suggestions }
    },
  )

  handle(IPC.fieldsSave, fieldsSaveSchema, async ({ templateId, fields }) => {
    const saved = replaceFields(templateId, fields)
    touchTemplate(templateId)
    return saved
  })

  handle(IPC.templatesSeedSamples, z.object({}), () => {
    const bundledDir = getBundledTemplatesDir()
    const samples = listBundledSamples()
    if (samples.length === 0) {
      throw new ServiceError(
        'NO_SAMPLES',
        `No bundled sample templates were found at ${bundledDir}. Run "npm run sample:templates" to create them.`,
      )
    }
    const folder = getTemplateFolder()
    const existingNames = new Set(listTemplates().map((t) => t.name))
    const created: string[] = []
    const skipped: string[] = []
    for (const sample of samples) {
      const name = path.basename(sample, '.xlsx')
      if (existingNames.has(name)) {
        skipped.push(name)
        continue
      }
      const sourcePath = path.join(bundledDir, sample)
      const destPath = copyTemplateIntoFolder(sourcePath, folder, name)
      createTemplate({
        name,
        description: 'Sample template bundled with the application.',
        category: 'Other',
        filePath: destPath,
        status: 'active',
      })
      existingNames.add(name)
      created.push(name)
    }
    return { created, skipped, count: created.length }
  })

  handle(IPC.templatesRecent, z.object({}), () => recentTemplates(5))
}

function getTemplateFolder(): string {
  return ensureDir(getSettings().templateFolder)
}
