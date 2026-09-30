import { buildExtractionSchema, buildGeminiResponseSchema, type ExtractionEntry } from '../../../shared/schemas'
import type {
  FieldValueEntry,
  ExtractionResult,
  TemplateField,
} from '../../../shared/types'
import { ServiceError } from '../errors'

/**
 * Gemini integration (Google Generative Language REST API v1beta).
 *
 * Safety model:
 *  - The model is constrained with a structured-output responseSchema so it
 *    can only emit the exact per-field JSON shape we expect.
 *  - The response is parsed as JSON and validated with Zod. Anything that
 *    fails validation is rejected — raw AI text never reaches the Excel
 *    layer.
 *  - Missing information must come back as `value: null` +
 *    `status: "not_found"`. Inventing data is explicitly forbidden in the
 *    prompt, and the UI shows "Information not found" for such fields.
 */

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta'
const REQUEST_TIMEOUT_MS = 90_000

export class GeminiError extends ServiceError {
  constructor(
    code: 'GEMINI_AUTH' | 'GEMINI_QUOTA' | 'GEMINI_SERVER' | 'GEMINI_NETWORK' | 'GEMINI_EMPTY' | 'GEMINI_INVALID_RESPONSE',
    message: string,
  ) {
    super(code, message)
  }
}

function buildSystemInstruction(): string {
  return `You are a precise data-extraction assistant for HR audit documentation.
You receive a list of fields and an unstructured text (or OCR'd document content) and must extract values for those fields.

Rules (strict):
1. Extract ONLY information that is explicitly present in the provided text.
2. NEVER invent, guess, or assume values. If a value is not present, set "value" to null and "status" to "not_found".
3. If the text contains conflicting values for a field, set "status" to "conflict", pick the most specific/recent value for "value", and explain the conflict in "note".
4. If a value is present but ambiguous, set "status" to "unclear" and explain in "note".
5. Dates: convert to ISO format YYYY-MM-DD (e.g. "15 June 2024" -> "2024-06-15").
6. Numbers: plain JSON numbers, no currency symbols, no thousands separators (e.g. 28000).
7. Booleans: true/false only.
8. Dropdown fields: the value must be one of the allowed values; if the text uses a different wording, map to the closest allowed value when the meaning is unambiguous, otherwise use "unclear".
9. "source" is the document the value came from (use the provided source label), "page" the page number when known (string, e.g. "2").
10. "confidence" is a number between 0 and 1 reflecting how directly the text supports the value.
11. "note" is a short human-readable explanation, only when status is conflict/unclear or the value needed interpretation.
12. Respond with valid JSON only, matching the provided schema exactly.`
}

function buildUserPrompt(fields: TemplateField[], text: string, sourceLabel: string): string {
  const fieldLines = fields
    .map((f) => {
      const extra: string[] = []
      if (f.aiDescription) extra.push(f.aiDescription)
      if (f.fieldType === 'dropdown' && f.dropdownOptions.length > 0) extra.push(`options: [${f.dropdownOptions.join(', ')}]`)
      return `${f.fieldKey}: ${f.label} (${f.fieldType}${extra.length ? ' — ' + extra.join('; ') : ''})`
    })
    .join('\n')
  return `Source: ${sourceLabel}

Fields to extract:
${fieldLines}

Content:
"""
${text}
"""

Return the JSON object for all fields listed above.`
}

async function callGemini(apiKey: string, model: string, body: unknown): Promise<{ text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (err) {
    const aborted = (err as Error).name === 'AbortError'
    throw new GeminiError(
      'GEMINI_NETWORK',
      aborted
        ? 'Gemini API request timed out. Please try again.'
        : 'Unable to reach the Gemini API. Check your internet connection.',
    )
  } finally {
    clearTimeout(timer)
  }

  const payload = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const message =
      (payload?.error as { message?: string } | undefined)?.message ??
      `Gemini API error (HTTP ${response.status})`
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new GeminiError('GEMINI_AUTH', `Gemini API error: ${message}`)
    }
    if (response.status === 429) {
      throw new GeminiError('GEMINI_QUOTA', 'Gemini API quota exceeded or rate limited. Try again shortly.')
    }
    if (response.status === 404) {
      throw new GeminiError('GEMINI_AUTH', `Gemini API error: model not found (${message}). Check the model name in Settings.`)
    }
    throw new GeminiError('GEMINI_SERVER', `Gemini API error: ${message}`)
  }

  const candidate = (payload?.candidates as
    | { content?: { parts?: { text?: string }[] } }[]
    | undefined)?.[0]
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
  if (!text.trim()) {
    const blockReason = (payload?.promptFeedback as { blockReason?: string } | undefined)?.blockReason
    throw new GeminiError(
      'GEMINI_EMPTY',
      blockReason
        ? `Gemini returned no content (blocked: ${blockReason}).`
        : 'Gemini returned an empty response.',
    )
  }
  return { text }
}

export async function testGeminiConnection(apiKey: string, model: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const started = Date.now()
  try {
    await callGemini(apiKey, model, {
      contents: [{ parts: [{ text: 'Reply with the single word: OK' }] }],
      generationConfig: { maxOutputTokens: 20 },
    })
    return { ok: true, latencyMs: Date.now() - started }
  } catch (err) {
    if (err instanceof GeminiError) return { ok: false, latencyMs: Date.now() - started, error: err.message }
    return { ok: false, latencyMs: Date.now() - started, error: `Gemini API error: ${(err as Error).message}` }
  }
}

export async function extractWithGemini(opts: {
  apiKey: string
  model: string
  text: string
  fields: TemplateField[]
  sourceLabel: string
}): Promise<ExtractionResult> {
  const { apiKey, model, text, fields, sourceLabel } = opts
  if (!apiKey) {
    throw new GeminiError('GEMINI_AUTH', 'No Gemini API key configured. Add it in Settings.')
  }

  const body = {
    systemInstruction: {
      parts: [{ text: buildSystemInstruction() }],
    },
    contents: [{ parts: [{ text: buildUserPrompt(fields, text, sourceLabel) }] }],
    generationConfig: {
      temperature: 0,
      responseMimeType: 'application/json',
      responseSchema: buildGeminiResponseSchema(fields),
    },
  }

  const { text: raw } = await callGemini(apiKey, model, body)

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new GeminiError('GEMINI_INVALID_RESPONSE', 'Invalid AI response: the model returned malformed JSON.')
  }

  const schema = buildExtractionSchema(fields)
  const result = schema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 5)
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ')
    throw new GeminiError('GEMINI_INVALID_RESPONSE', `Invalid AI response: ${issues}`)
  }

  const data = result.data as Record<string, ExtractionEntry | undefined>
  const fieldsMap: Record<string, FieldValueEntry> = {}
  for (const field of fields) {
    const entry = data[field.fieldKey]
    if (!entry) {
      // Field omitted by the model — treat as "not found".
      fieldsMap[field.fieldKey] = {
        value: null,
        source: null,
        page: null,
        status: 'not_found',
        confidence: null,
        note: null,
        method: 'ai',
      }
      continue
    }
    let value: unknown = entry.value
    // Normalize numeric strings ("28,000") to numbers for numeric fields.
    if (
      (field.fieldType === 'number' || field.fieldType === 'currency') &&
      typeof value === 'string'
    ) {
      const n = Number(value.replace(/[^0-9.-]/g, ''))
      if (Number.isFinite(n)) value = n
    }
    fieldsMap[field.fieldKey] = {
      value,
      source: entry.source ?? null,
      page: entry.page === undefined || entry.page === null ? null : String(entry.page),
      status: entry.status,
      confidence: entry.confidence ?? null,
      note: entry.note ?? null,
      method: 'ai',
    }
  }

  return { fields: fieldsMap, raw }
}
