import { registerTemplateIpc } from './templates'
import { registerGeneratorIpc } from './generator'
import { registerEmployeeIpc } from './employees'
import { registerFileIpc } from './files'
import { registerDataIpc } from './data'
import { registerAiIpc } from './ai'
import { registerSettingsIpc } from './settings'
import { registerDialogIpc } from './dialogs'

export function registerAllIpc(): void {
  registerTemplateIpc()
  registerGeneratorIpc()
  registerEmployeeIpc()
  registerFileIpc()
  registerDataIpc()
  registerAiIpc()
  registerSettingsIpc()
  registerDialogIpc()
}
