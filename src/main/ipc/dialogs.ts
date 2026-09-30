import { BrowserWindow } from 'electron'
import { IPC } from '../../shared/constants'
import { pickExcelFile, pickFolder } from '../services/files/fileService'
import { z } from 'zod'
import { handle } from './handler'

export function registerDialogIpc(): void {
  handle(IPC.dialogsPickExcelFile, z.object({}), () => {
    return pickExcelFile(BrowserWindow.getFocusedWindow() ?? null)
  })

  handle(
    IPC.dialogsPickFolder,
    z.object({ title: z.string().max(200).optional() }),
    ({ title }) => {
      return pickFolder(BrowserWindow.getFocusedWindow() ?? null, title ?? 'Choose folder')
    },
  )
}
