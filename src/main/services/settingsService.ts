import { getDbPath } from './database/db'
import { getSettings as loadSettings } from './database/repositories/settings'
import { getDefaultOutputFolder, getDefaultTemplateFolder } from './files/fileService'
import type { AppSettings } from '../../shared/types'

/** Settings with the machine-specific defaults applied. */
export function getSettings(): AppSettings {
  return loadSettings({
    outputFolder: getDefaultOutputFolder(),
    templateFolder: getDefaultTemplateFolder(),
    databasePath: getDbPath(),
  })
}
