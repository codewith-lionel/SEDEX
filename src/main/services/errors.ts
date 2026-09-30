/**
 * Errors thrown by main-process services. The IPC layer maps these to
 * `{ ok: false, error }` envelopes so the renderer always gets a clean,
 * user-presentable message.
 */
export class ServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message)
    this.name = 'ServiceError'
  }
}
