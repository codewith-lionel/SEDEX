import { contextBridge, ipcRenderer } from 'electron'
import type { IpcChannel } from '../shared/constants'
import { IPC } from '../shared/constants'
import type {
  AiExtractInput,
  EmployeesImportInput,
  FieldInput,
  GeneratorBulkInput,
  GeneratorGenerateInput,
  TemplatesCreateInput,
  TemplatesUpdateInput,
} from '../shared/schemas'
import type {
  ApiResult,
  BulkResult,
  ParsedDataFile,
  SingleGenerateResult,
  Template,
  TemplateField,
  GeneratedFile,
  Employee,
  AppSettings,
  SettingsPatch,
  SheetPreview,
  BulkProgress,
  ExtractionResult,
} from '../shared/types'

/**
 * The only surface the renderer can touch. Every method maps 1:1 to a
 * validated IPC handler in the main process. No Node.js primitives are
 * exposed — only promise-returning, payload-based calls.
 */

function invoke<T>(channel: IpcChannel, payload: Record<string, unknown> = {}): Promise<ApiResult<T>> {
  return ipcRenderer.invoke(channel, payload)
}

function subscribe<T>(channel: IpcChannel, callback: (data: T) => void): () => void {
  const listener = (_event: Electron.IpcRendererEvent, data: T): void => callback(data)
  ipcRenderer.on(channel, listener)
  return () => {
    ipcRenderer.removeListener(channel, listener)
  }
}

const api = {
  templates: {
    list: (query: { search?: string; category?: string; status?: string } = {}) =>
      invoke<{ templates: Template[]; count: number }>(IPC.templatesList, query),
    get: (id: string) =>
      invoke<{ template: Template; fields: TemplateField[]; sheets: string[] }>(IPC.templatesGet, { id }),
    recent: () => invoke<Template[]>(IPC.templatesRecent, {}),
    create: (input: TemplatesCreateInput) => invoke<Template>(IPC.templatesCreate, { ...input }),
    update: (input: TemplatesUpdateInput) => invoke<Template>(IPC.templatesUpdate, { ...input }),
    duplicate: (id: string) => invoke<Template>(IPC.templatesDuplicate, { id }),
    remove: (id: string) => invoke<{ deleted: boolean }>(IPC.templatesDelete, { id }),
    sheets: (id: string) => invoke<string[]>(IPC.templatesSheets, { id }),
    preview: (id: string, sheetName: string) =>
      invoke<SheetPreview>(IPC.templatesPreview, { id, sheetName }),
    autoMap: (id: string, sheetName?: string) =>
      invoke<{ sheet: string; suggestions: Array<{ fieldKey: string; label: string; cellAddress: string; fieldType: string }> }>(
        IPC.templatesAutoMap,
        { id, sheetName },
      ),
    seedSamples: () => invoke<{ created: string[]; skipped: string[]; count: number }>(IPC.templatesSeedSamples, {}),
    saveFields: (templateId: string, fields: FieldInput[]) =>
      invoke<TemplateField[]>(IPC.fieldsSave, { templateId, fields }),
  },
  generator: {
    generate: (input: GeneratorGenerateInput) => invoke<SingleGenerateResult>(IPC.generatorGenerate, { ...input }),
    bulk: (input: GeneratorBulkInput) => invoke<BulkResult>(IPC.generatorBulk, { ...input }),
    onProgress: (callback: (progress: BulkProgress) => void) => subscribe<BulkProgress>(IPC.generatorProgress, callback),
  },
  employees: {
    list: (query: { search?: string } = {}) =>
      invoke<{ employees: Employee[]; count: number }>(IPC.employeesList, query),
    add: (input: { name: string; code?: string | null; department?: string | null; designation?: string | null; notes?: string | null }) =>
      invoke<Employee>(IPC.employeesAdd, { ...input }),
    update: (input: { id: string } & { name: string; code?: string | null; department?: string | null; designation?: string | null; notes?: string | null }) =>
      invoke<Employee>(IPC.employeesUpdate, { ...input }),
    remove: (id: string) => invoke<{ deleted: boolean }>(IPC.employeesDelete, { id }),
    import: (input: EmployeesImportInput) => invoke<{ inserted: number; updated: number }>(IPC.employeesImport, { ...input }),
  },
  files: {
    list: (query: { search?: string; templateId?: string; limit?: number } = {}) =>
      invoke<{ files: GeneratedFile[]; count: number; failed: number }>(IPC.filesList, query),
    open: (id: string) => invoke<{ opened: boolean }>(IPC.filesOpen, { id }),
    reveal: (id: string) => invoke<{ revealed: boolean }>(IPC.filesReveal, { id }),
    remove: (id: string) => invoke<{ deleted: boolean }>(IPC.filesDelete, { id }),
    regenerate: (id: string) => invoke<{ regenerated: boolean }>(IPC.filesRegenerate, { id }),
  },
  data: {
    parseFile: (filePath: string) => invoke<ParsedDataFile>(IPC.dataParseFile, { filePath }),
  },
  ai: {
    extract: (input: AiExtractInput) => invoke<ExtractionResult>(IPC.aiExtract, { ...input }),
    test: (input: { apiKeyOverride?: string } = {}) =>
      invoke<{ ok: boolean; latencyMs: number; error?: string }>(IPC.aiTest, { ...input }),
  },
  settings: {
    /** Masked key by default — safe for general UI use. */
    get: () => invoke<AppSettings>(IPC.settingsGet, {}),
    /** Full local settings incl. the real API key (Settings page only). */
    getRaw: () => invoke<AppSettings>(IPC.settingsGetRaw, {}),
    set: (patch: SettingsPatch) => invoke<AppSettings>(IPC.settingsSet, { ...patch }),
  },
  dialogs: {
    pickExcelFile: () => invoke<string | null>(IPC.dialogsPickExcelFile, {}),
    pickFolder: (title?: string) => invoke<string | null>(IPC.dialogsPickFolder, { title }),
  },
}

export type ElectronApi = typeof api

contextBridge.exposeInMainWorld('api', api)
