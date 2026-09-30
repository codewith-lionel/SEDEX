import { getDb } from '../db'
import type { AppSettings, SettingsPatch, ThemePreference } from '../../../../shared/types'
import { DEFAULT_GEMINI_MODEL } from '../../../../shared/constants'

export function getSettings(defaults: { outputFolder: string; templateFolder: string; databasePath: string }): AppSettings {
  const rows = getDb().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[]
  const map: Record<string, string> = {}
  for (const r of rows) map[r.key] = r.value
  return {
    geminiApiKey: map['geminiApiKey'] ?? '',
    geminiModel: map['geminiModel'] || DEFAULT_GEMINI_MODEL,
    aiEnabled: map['aiEnabled'] === '1',
    outputFolder: map['outputFolder'] || defaults.outputFolder,
    templateFolder: map['templateFolder'] || defaults.templateFolder,
    theme: (map['theme'] as ThemePreference) || 'system',
    databasePath: defaults.databasePath,
  }
}

export function setSettings(patch: SettingsPatch): void {
  const db = getDb()
  const upsert = db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
  )
  const apply = db.transaction(() => {
    if (patch.geminiApiKey !== undefined) upsert.run('geminiApiKey', patch.geminiApiKey)
    if (patch.geminiModel !== undefined) upsert.run('geminiModel', patch.geminiModel.trim() || DEFAULT_GEMINI_MODEL)
    if (patch.aiEnabled !== undefined) upsert.run('aiEnabled', patch.aiEnabled ? '1' : '0')
    if (patch.outputFolder !== undefined) upsert.run('outputFolder', patch.outputFolder)
    if (patch.templateFolder !== undefined) upsert.run('templateFolder', patch.templateFolder)
    if (patch.theme !== undefined) upsert.run('theme', patch.theme)
  })
  apply()
}
