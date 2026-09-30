import { z } from 'zod'
import type { TemplateField } from './types'
import { CATEGORIES, FIELD_TYPES } from './constants'

/** One field's extraction entry after Zod validation. */
export interface ExtractionEntry {
  value: unknown
  status: 'found' | 'not_found' | 'conflict' | 'unclear'
  source: string | null
  page: string | number | null
  confidence: number | null
  note: string | null
}

/**
 * Every payload that crosses the IPC boundary is validated here, in the
 * main process. The renderer is treated as untrusted input.
 */

export const categorySchema = z.enum(CATEGORIES)
export const fieldTypeSchema = z.enum(FIELD_TYPES)
export const templateStatusSchema = z.enum(['active', 'inactive'])
export const sourceSchema = z.enum(['manual', 'text', 'excel', 'ai', 'employees'])

export const FIELD_KEY_REGEX = /^[A-Za-z][A-Za-z0-9_]{0,63}$/
export const CELL_ADDRESS_REGEX = /^[A-Za-z]{1,3}[1-9][0-9]{0,6}$/

export const fieldInputSchema = z.object({
  fieldKey: z.string().regex(FIELD_KEY_REGEX, 'Field key must start with a letter and contain only letters, digits and _'),
  label: z.string().min(1, 'Label is required').max(120),
  cellAddress: z.string().regex(CELL_ADDRESS_REGEX, 'Invalid cell address (e.g. B5)'),
  sheetName: z.string().min(1).max(100).nullable().optional(),
  fieldType: fieldTypeSchema,
  required: z.boolean().default(false),
  defaultValue: z.string().max(2000).nullable().optional(),
  validationRule: z.string().max(500).nullable().optional(),
  aiDescription: z.string().max(500).nullable().optional(),
  dropdownOptions: z.array(z.string().min(1).max(200)).max(100).default([]),
  sortOrder: z.number().int().min(0).default(0),
})

export type FieldInput = z.infer<typeof fieldInputSchema>

export const templatesCreateSchema = z.object({
  name: z.string().min(1, 'Template name is required').max(150),
  description: z.string().max(1000).default(''),
  category: categorySchema.default('Other'),
  /** Absolute path of the user-chosen .xlsx file (picked via native dialog). */
  sourcePath: z.string().min(1),
  status: templateStatusSchema.default('active'),
})

export const templatesUpdateSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1).max(150).optional(),
  description: z.string().max(1000).optional(),
  category: categorySchema.optional(),
  status: templateStatusSchema.optional(),
})

export const fieldsSaveSchema = z.object({
  templateId: z.string().min(1),
  fields: z
    .array(fieldInputSchema)
    .max(500)
    .refine((fields) => new Set(fields.map((f) => f.fieldKey)).size === fields.length, {
      message: 'Field keys must be unique within a template',
    }),
})

export const generatorGenerateSchema = z.object({
  templateId: z.string().min(1),
  /** fieldKey -> raw value entered by the user (or extracted by AI). */
  data: z.record(z.string(), z.unknown()),
  /** fieldKey -> provenance, optional (AI extraction). */
  provenance: z
    .record(
      z.string(),
      z.object({
        source: z.string().max(300).nullable(),
        page: z.string().max(50).nullable(),
        status: z.enum(['found', 'not_found', 'conflict', 'unclear']),
        confidence: z.number().min(0).max(1).nullable(),
        note: z.string().max(500).nullable(),
      }),
    )
    .optional(),
  employeeId: z.string().min(1).nullable().optional(),
  employeeName: z.string().max(200).nullable().optional(),
  fileName: z.string().max(200).optional(),
  source: sourceSchema.default('manual'),
})

export const bulkSourceDataFileSchema = z.object({
  filePath: z.string().min(1),
  /** header -> fieldKey */
  columnMapping: z.record(z.string(), z.string()),
  fileNameBase: z.string().min(1).max(150),
  /** fieldKey used to name output files (e.g. employee_id). */
  namingField: z.string().max(64).nullable().optional(),
})

export const bulkSourceEmployeesSchema = z.object({
  employeeIds: z.array(z.string().min(1)).min(1, 'Select at least one employee').max(100000),
  fileNameBase: z.string().min(1).max(150),
  namingField: z.string().max(64).nullable().optional(),
})

export const generatorBulkSchema = z.object({
  templateId: z.string().min(1),
  dataFile: bulkSourceDataFileSchema.optional(),
  employees: bulkSourceEmployeesSchema.optional(),
}).refine((v) => (v.dataFile ? 1 : 0) + (v.employees ? 1 : 0) === 1, {
  message: 'Provide exactly one data source (dataFile or employees)',
})

export const employeesImportSchema = z.object({
  /** header -> employee column (name | code | department | designation | notes) */
  columnMapping: z.record(z.string(), z.enum(['name', 'code', 'department', 'designation', 'notes'])),
  rows: z
    .array(z.record(z.string(), z.string().max(2000)))
    .max(100000)
    .min(1, 'No rows to import'),
})

export const dataParseFileSchema = z.object({
  filePath: z.string().min(1),
})

export const aiExtractSchema = z.object({
  templateId: z.string().min(1),
  text: z.string().min(1, 'Paste some text to extract from').max(100000),
  sourceLabel: z.string().max(300).default('Pasted text'),
})

export const aiTestSchema = z.object({
  /** Override the stored key (allows testing before saving). */
  apiKeyOverride: z.string().max(200).optional(),
})

export const settingsSetSchema = z
  .object({
    geminiApiKey: z.string().max(200).optional(),
    geminiModel: z.string().min(1).max(100).optional(),
    aiEnabled: z.boolean().optional(),
    outputFolder: z.string().min(1).max(1000).optional(),
    templateFolder: z.string().min(1).max(1000).optional(),
    theme: z.enum(['system', 'light', 'dark']).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' })

export type SettingsSetInput = z.infer<typeof settingsSetSchema>

// ---------------------------------------------------------------------------
// AI extraction response schema (built per template so types match the fields)
// ---------------------------------------------------------------------------

const extractionEntrySchemas = {
  status: z.enum(['found', 'not_found', 'conflict', 'unclear']),
  source: z.string().max(300).nullable().optional().catch(null),
  page: z
    .union([z.string().max(50), z.number()])
    .nullable()
    .optional()
    .catch(null),
  confidence: z.number().min(0).max(1).nullable().optional().catch(null),
  note: z.string().max(500).nullable().optional().catch(null),
} as const

function valueSchemaFor(field: Pick<TemplateField, 'fieldType'>) {
  switch (field.fieldType) {
    case 'number':
    case 'currency':
      return z.union([z.number(), z.string().regex(/^-?[\d,.\s]+$/, 'Number expected'), z.null()])
    case 'boolean':
      return z.union([z.boolean(), z.null()])
    default:
      return z.union([z.string(), z.number(), z.null()])
  }
}

/**
 * Strict schema for the JSON returned by Gemini. Unknown keys are stripped;
 * missing keys are treated as "not found" downstream.
 */
export function buildExtractionSchema(fields: Pick<TemplateField, 'fieldKey' | 'fieldType'>[]): z.ZodTypeAny {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    shape[field.fieldKey] = z.object({
      value: valueSchemaFor(field),
      ...extractionEntrySchemas,
    })
  }
  return z.object(shape)
}

/**
 * Gemini structured-output responseSchema (REST). Built from the same field
 * list so the model can only produce the exact shape we validate with Zod.
 */
export function buildGeminiResponseSchema(fields: Pick<TemplateField, 'fieldKey' | 'fieldType'>[]) {
  const properties: Record<string, unknown> = {}
  for (const field of fields) {
    const valueType =
      field.fieldType === 'number' || field.fieldType === 'currency'
        ? 'NUMBER'
        : field.fieldType === 'boolean'
          ? 'BOOLEAN'
          : 'STRING'
    properties[field.fieldKey] = {
      type: 'OBJECT',
      properties: {
        value: { type: valueType, nullable: true },
        status: { type: 'STRING', enum: ['found', 'not_found', 'conflict', 'unclear'] },
        source: { type: 'STRING', nullable: true },
        page: { type: 'STRING', nullable: true },
        confidence: { type: 'NUMBER', nullable: true },
        note: { type: 'STRING', nullable: true },
      },
      required: ['value', 'status'],
    }
  }
  return {
    type: 'OBJECT',
    properties,
    required: fields.map((f) => f.fieldKey),
  }
}

export type TemplatesCreateInput = z.infer<typeof templatesCreateSchema>
export type TemplatesUpdateInput = z.infer<typeof templatesUpdateSchema>
export type FieldsSaveInput = z.infer<typeof fieldsSaveSchema>
export type GeneratorGenerateInput = z.infer<typeof generatorGenerateSchema>
export type GeneratorBulkInput = z.infer<typeof generatorBulkSchema>
export type EmployeesImportInput = z.infer<typeof employeesImportSchema>
export type AiExtractInput = z.infer<typeof aiExtractSchema>
