import type { FieldType, TemplateCategory } from './types'

export const CATEGORIES = [
  'HR',
  'Payroll',
  'Attendance',
  'Overtime',
  'Employee',
  'Training',
  'Audit',
  'Other',
] as const satisfies readonly TemplateCategory[]

export const FIELD_TYPES = [
  'text',
  'number',
  'date',
  'currency',
  'boolean',
  'dropdown',
  'multiline',
] as const satisfies readonly FieldType[]

export const FIELD_TYPE_LABELS: Record<FieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  currency: 'Currency',
  boolean: 'Yes / No',
  dropdown: 'Dropdown',
  multiline: 'Multiline text',
}

export const DEFAULT_GEMINI_MODEL = 'gemini-2.0-flash'

/** How many rows of a data file we send to the renderer for preview. */
export const DATA_FILE_PREVIEW_ROWS = 100

/** Preview grid size used by the template field mapper. */
export const PREVIEW_ROWS = 40
export const PREVIEW_COLS = 12

export const APP_NAME = 'HR Audit Form Generator'

/** IPC channel names — the single source of truth for the bridge. */
export const IPC = {
  templatesList: 'templates:list',
  templatesRecent: 'templates:recent',
  templatesGet: 'templates:get',
  templatesCreate: 'templates:create',
  templatesUpdate: 'templates:update',
  templatesDuplicate: 'templates:duplicate',
  templatesDelete: 'templates:delete',
  templatesSheets: 'templates:sheets',
  templatesPreview: 'templates:preview',
  templatesAutoMap: 'templates:auto-map',
  templatesSeedSamples: 'templates:seed-samples',
  fieldsSave: 'fields:save',
  generatorGenerate: 'generator:generate',
  generatorBulk: 'generator:bulk',
  generatorProgress: 'generator:progress',
  employeesList: 'employees:list',
  employeesAdd: 'employees:add',
  employeesUpdate: 'employees:update',
  employeesDelete: 'employees:delete',
  employeesImport: 'employees:import',
  filesList: 'files:list',
  filesOpen: 'files:open',
  filesReveal: 'files:reveal',
  filesDelete: 'files:delete',
  filesRegenerate: 'files:regenerate',
  dataParseFile: 'data:parse-file',
  aiExtract: 'ai:extract',
  aiTest: 'ai:test',
  settingsGet: 'settings:get',
  settingsGetRaw: 'settings:get-raw',
  settingsSet: 'settings:set',
  dialogsPickExcelFile: 'dialogs:pick-excel-file',
  dialogsPickFolder: 'dialogs:pick-folder',
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
