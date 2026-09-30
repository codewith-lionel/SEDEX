
import { IPC } from '../../shared/constants'
import { aiExtractSchema, aiTestSchema } from '../../shared/schemas'
import { getSettings } from '../services/settingsService'
import { listFields } from '../services/database/repositories/fields'
import { getTemplate } from '../services/database/repositories/templates'
import { extractWithGemini, testGeminiConnection } from '../services/ai/geminiService'
import { ServiceError } from '../services/errors'
import { handle } from './handler'

export function registerAiIpc(): void {
  handle(IPC.aiExtract, aiExtractSchema, async ({ templateId, text, sourceLabel }) => {
    const settings = getSettings()
    if (!settings.aiEnabled) {
      throw new ServiceError('AI_DISABLED', 'AI extraction is disabled. Enable it in Settings.')
    }
    const template = getTemplate(templateId)
    if (!template) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
    const fields = listFields(templateId)
    if (fields.length === 0) {
      throw new ServiceError('NO_FIELDS', 'This template has no mapped fields to extract into.')
    }
    return extractWithGemini({
      apiKey: settings.geminiApiKey,
      model: settings.geminiModel,
      text,
      fields,
      sourceLabel,
    })
  })

  handle(IPC.aiTest, aiTestSchema, async ({ apiKeyOverride }) => {
    const settings = getSettings()
    const key = (apiKeyOverride ?? settings.geminiApiKey).trim()
    if (!key) {
      return { ok: false, latencyMs: 0, error: 'No API key to test. Enter a Gemini API key first.' }
    }
    return testGeminiConnection(key, settings.geminiModel)
  })
}
