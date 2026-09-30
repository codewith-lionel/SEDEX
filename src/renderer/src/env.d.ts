import type { ElectronApi } from '../../preload/preload'

declare global {
  interface Window {
    /** Typed IPC bridge exposed by the preload script (contextBridge). */
    api: ElectronApi
  }
}

export {}
