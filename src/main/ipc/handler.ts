import { ipcMain } from 'electron'
import { z } from 'zod'
import type { ApiResult } from '../../shared/types'
import { ServiceError } from '../services/errors'

/**
 * IPC handler wrapper:
 *  - validates the single payload object with Zod before any business logic
 *    runs (the renderer is treated as untrusted input)
 *  - maps errors to `{ ok: false, error }` envelopes so the renderer never
 *    receives a raw stack trace
 */
export function handle<TArgs extends Record<string, unknown>, TResult>(
  channel: string,
  schema: z.ZodType<TArgs>,
  fn: (args: TArgs, event: Electron.IpcMainInvokeEvent) => Promise<TResult> | TResult,
): void {
  ipcMain.handle(channel, async (event, payload: unknown): Promise<ApiResult<TResult>> => {
    try {
      const result = schema.safeParse(payload ?? {})
      if (!result.success) {
        const first = result.error.issues[0]
        return { ok: false, error: first?.message ?? 'Invalid request.' }
      }
      const data = await fn(result.data, event)
      return { ok: true, data }
    } catch (err) {
      if (err instanceof ServiceError) {
        return { ok: false, error: err.message }
      }
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[ipc:${channel}]`, err)
      return { ok: false, error: message || 'Unexpected error.' }
    }
  })
}
