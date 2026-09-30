import { z } from 'zod'
import { IPC } from '../../shared/constants'
import { settingsSetSchema } from '../../shared/schemas'
import { getSettings } from '../services/settingsService'
import { setSettings } from '../services/database/repositories/settings'
import { handle } from './handler'

export function registerSettingsIpc(): void {
  handle(IPC.settingsGet, z.object({}), () => {
    const s = getSettings()
    // Show the key masked unless the user explicitly requests the real value
    // (the Settings page re-fetches with `reveal` for its input field).
    return { ...s, geminiApiKey: maskKey(s.geminiApiKey) }
  })

  handle(IPC.settingsGetRaw, z.object({}), () => getSettings())

  handle(IPC.settingsSet, settingsSetSchema, (patch) => {
    setSettings(patch)
    return getSettings()
  })
}

/**
 * The API key is never sent to the renderer in clear text by default — only
 * a masked preview. The full key is only returned by `settings:get-raw` to
 * the Settings page's own input field (the user's own local machine).
 */
function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '•'.repeat(key.length)
  return `${key.slice(0, 4)}${'•'.repeat(Math.min(key.length - 8, 20))}${key.slice(-4)}`
}
