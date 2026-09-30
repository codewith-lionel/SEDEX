
import { IPC } from '../../shared/constants'
import { dataParseFileSchema } from '../../shared/schemas'
import { parseDataFile } from '../services/excel/dataFile'
import { handle } from './handler'

export function registerDataIpc(): void {
  handle(IPC.dataParseFile, dataParseFileSchema, async ({ filePath }) => parseDataFile(filePath))
}
