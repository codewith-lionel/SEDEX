
import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/constants'
import { generatorBulkSchema, generatorGenerateSchema } from '../../shared/schemas'
import { getSettings } from '../services/settingsService'
import { ensureDir } from '../services/files/fileService'
import { generateBulk, generateSingle } from '../services/generator/generatorService'
import { listEmployees } from '../services/database/repositories/employees'
import { ServiceError } from '../services/errors'
import { handle } from './handler'

export function registerGeneratorIpc(): void {
  handle(IPC.generatorGenerate, generatorGenerateSchema, async (input) => {
    const settings = getSettings()
    const result = await generateSingle({
      templateId: input.templateId,
      data: input.data,
      provenance: input.provenance ?? null,
      employeeId: input.employeeId ?? null,
      employeeName: input.employeeName ?? null,
      fileName: input.fileName,
      source: input.source,
      outputFolder: ensureDir(settings.outputFolder),
    })
    return result
  })

  handle(IPC.generatorBulk, generatorBulkSchema, async (input) => {
    const settings = getSettings()
    const outputFolder = ensureDir(settings.outputFolder)

    let employees
    if (input.employees) {
      const all = listEmployees()
      employees = {
        records: all.filter((e) => input.employees!.employeeIds.includes(e.id)),
        fileNameBase: input.employees.fileNameBase,
        namingField: input.employees.namingField ?? null,
      }
      if (employees.records.length === 0) {
        throw new ServiceError('NO_DATA', 'None of the selected employees were found.')
      }
    }

    const result = await generateBulk({
      templateId: input.templateId,
      outputFolder,
      source: input.dataFile ? 'excel' : 'employees',
      dataFile: input.dataFile,
      employees,
      onProgress: (progress) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send(IPC.generatorProgress, progress)
        }
      },
    })
    return result
  })
}
