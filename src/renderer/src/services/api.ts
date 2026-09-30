import type { ApiResult } from '../../../shared/types'

/**
 * Renderer-side API layer. The only bridge to the main process is
 * `window.api` (contextBridge). Every call returns a typed `ApiResult`;
 * `unwrap` turns failures into exceptions with the server-side message.
 */

export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.ok) throw new Error(result.error)
  return result.data
}

export const api = {
  templates: {
    list: (query: { search?: string; category?: string; status?: string } = {}) =>
      unwrapPromise(window.api.templates.list(query)),
    get: (id: string) => unwrapPromise(window.api.templates.get(id)),
    recent: () => unwrapPromise(window.api.templates.recent()),
    create: (input: Parameters<typeof window.api.templates.create>[0]) =>
      unwrapPromise(window.api.templates.create(input)),
    update: (input: Parameters<typeof window.api.templates.update>[0]) =>
      unwrapPromise(window.api.templates.update(input)),
    duplicate: (id: string) => unwrapPromise(window.api.templates.duplicate(id)),
    remove: (id: string) => unwrapPromise(window.api.templates.remove(id)),
    sheets: (id: string) => unwrapPromise(window.api.templates.sheets(id)),
    preview: (id: string, sheetName: string) => unwrapPromise(window.api.templates.preview(id, sheetName)),
    autoMap: (id: string, sheetName?: string) => unwrapPromise(window.api.templates.autoMap(id, sheetName)),
    seedSamples: () => unwrapPromise(window.api.templates.seedSamples()),
    saveFields: (templateId: string, fields: Parameters<typeof window.api.templates.saveFields>[1]) =>
      unwrapPromise(window.api.templates.saveFields(templateId, fields)),
  },
  generator: {
    generate: (input: Parameters<typeof window.api.generator.generate>[0]) =>
      unwrapPromise(window.api.generator.generate(input)),
    bulk: (input: Parameters<typeof window.api.generator.bulk>[0]) =>
      unwrapPromise(window.api.generator.bulk(input)),
    onProgress: window.api.generator.onProgress,
  },
  employees: {
    list: (query: { search?: string } = {}) => unwrapPromise(window.api.employees.list(query)),
    add: (input: Parameters<typeof window.api.employees.add>[0]) => unwrapPromise(window.api.employees.add(input)),
    update: (input: Parameters<typeof window.api.employees.update>[0]) => unwrapPromise(window.api.employees.update(input)),
    remove: (id: string) => unwrapPromise(window.api.employees.remove(id)),
    import: (input: Parameters<typeof window.api.employees.import>[0]) =>
      unwrapPromise(window.api.employees.import(input)),
  },
  files: {
    list: (query: { search?: string; templateId?: string; limit?: number } = {}) =>
      unwrapPromise(window.api.files.list(query)),
    open: (id: string) => unwrapPromise(window.api.files.open(id)),
    reveal: (id: string) => unwrapPromise(window.api.files.reveal(id)),
    remove: (id: string) => unwrapPromise(window.api.files.remove(id)),
    regenerate: (id: string) => unwrapPromise(window.api.files.regenerate(id)),
  },
  data: {
    parseFile: (filePath: string) => unwrapPromise(window.api.data.parseFile(filePath)),
  },
  ai: {
    extract: (input: Parameters<typeof window.api.ai.extract>[0]) => unwrapPromise(window.api.ai.extract(input)),
    test: (input: { apiKeyOverride?: string } = {}) => unwrapPromise(window.api.ai.test(input)),
  },
  settings: {
    get: () => unwrapPromise(window.api.settings.get()),
    getRaw: () => unwrapPromise(window.api.settings.getRaw()),
    set: (patch: Parameters<typeof window.api.settings.set>[0]) => unwrapPromise(window.api.settings.set(patch)),
  },
  dialogs: {
    pickExcelFile: () => unwrapPromise(window.api.dialogs.pickExcelFile()),
    pickFolder: (title?: string) => unwrapPromise(window.api.dialogs.pickFolder(title)),
  },
}

async function unwrapPromise<T>(promise: Promise<ApiResult<T>>): Promise<T> {
  return unwrap(await promise)
}
