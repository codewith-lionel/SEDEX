import { z } from 'zod'
import { shell } from 'electron'
import fs from 'node:fs'
import { IPC } from '../../shared/constants'
import {
  deleteFile,
  getFile,
  listFiles,
  countFiles,
  countFilesByStatus,
} from '../services/database/repositories/generatedFiles'
import { regenerateFile } from '../services/generator/generatorService'
import { getSettings } from '../services/settingsService'
import { ensureDir } from '../services/files/fileService'
import { ServiceError } from '../services/errors'
import { handle } from './handler'

export function registerFileIpc(): void {
  handle(
    IPC.filesList,
    z.object({
      search: z.string().max(200).optional(),
      templateId: z.string().optional(),
      limit: z.number().int().min(1).max(100000).optional(),
    }),
    (q) => ({
      files: listFiles(q),
      count: countFiles(),
      failed: countFilesByStatus('failed'),
    }),
  )

  handle(IPC.filesOpen, z.object({ id: z.string().min(1) }), async ({ id }) => {
    const file = getFile(id)
    if (!file) throw new ServiceError('FILE_NOT_FOUND', 'Generated file not found.')
    if (!fs.existsSync(file.filePath)) {
      throw new ServiceError('FILE_NOT_FOUND', `File is missing on disk: ${file.fileName}`)
    }
    const error = await shell.openPath(file.filePath)
    if (error) throw new ServiceError('OPEN_FAILED', `Unable to open file: ${error}`)
    return { opened: true }
  })

  handle(IPC.filesReveal, z.object({ id: z.string().min(1) }), async ({ id }) => {
    const file = getFile(id)
    if (!file) throw new ServiceError('FILE_NOT_FOUND', 'Generated file not found.')
    if (!fs.existsSync(file.filePath)) {
      throw new ServiceError('FILE_NOT_FOUND', `File is missing on disk: ${file.fileName}`)
    }
    shell.showItemInFolder(file.filePath)
    return { revealed: true }
  })

  handle(IPC.filesDelete, z.object({ id: z.string().min(1) }), ({ id }) => {
    const file = deleteFile(id)
    if (!file) throw new ServiceError('FILE_NOT_FOUND', 'Generated file not found.')
    try {
      if (fs.existsSync(file.filePath)) fs.rmSync(file.filePath)
    } catch {
      // Keep the record deletion even if the file could not be removed.
    }
    return { deleted: true }
  })

  handle(IPC.filesRegenerate, z.object({ id: z.string().min(1) }), async ({ id }) => {
    const file = getFile(id)
    if (!file) throw new ServiceError('FILE_NOT_FOUND', 'Generated file not found.')
    const settings = getSettings()
    await regenerateFile(file, ensureDir(settings.outputFolder))
    return { regenerated: true }
  })
}
