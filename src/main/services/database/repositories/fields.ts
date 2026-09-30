import { randomUUID } from 'node:crypto'
import { getDb } from '../db'
import { ServiceError } from '../../errors'
import type { TemplateField } from '../../../../shared/types'
import type { FieldInput } from '../../../../shared/schemas'

interface FieldRow {
  id: string
  template_id: string
  field_key: string
  label: string
  cell_address: string
  sheet_name: string | null
  field_type: string
  required: number
  default_value: string | null
  validation_rule: string | null
  ai_description: string | null
  dropdown_options: string
  sort_order: number
}

function parseRow(row: FieldRow): TemplateField {
  let options: string[] = []
  try {
    const parsed = JSON.parse(row.dropdown_options)
    if (Array.isArray(parsed)) options = parsed.filter((o): o is string => typeof o === 'string')
  } catch {
    // Corrupt JSON — fall back to empty options rather than crashing.
  }
  return {
    id: row.id,
    templateId: row.template_id,
    fieldKey: row.field_key,
    label: row.label,
    cellAddress: row.cell_address.toUpperCase(),
    sheetName: row.sheet_name,
    fieldType: row.field_type as TemplateField['fieldType'],
    required: row.required === 1,
    defaultValue: row.default_value,
    validationRule: row.validation_rule,
    aiDescription: row.ai_description,
    dropdownOptions: options,
    sortOrder: row.sort_order,
  }
}

export function listFields(templateId: string): TemplateField[] {
  const rows = getDb()
    .prepare('SELECT * FROM template_fields WHERE template_id = ? ORDER BY sort_order, field_key')
    .all(templateId) as FieldRow[]
  return rows.map(parseRow)
}

/** Replace the full field mapping for a template (atomic). */
export function replaceFields(templateId: string, fields: FieldInput[]): TemplateField[] {
  const db = getDb()
  const exists = db.prepare('SELECT id FROM templates WHERE id = ?').get(templateId)
  if (!exists) throw new ServiceError('TEMPLATE_NOT_FOUND', 'Template not found.')
  const insert = db.prepare(
    `INSERT INTO template_fields
       (id, template_id, field_key, label, cell_address, sheet_name, field_type, required,
        default_value, validation_rule, ai_description, dropdown_options, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const replace = db.transaction(() => {
    db.prepare('DELETE FROM template_fields WHERE template_id = ?').run(templateId)
    fields.forEach((f, i) => {
      insert.run(
        randomUUID(),
        templateId,
        f.fieldKey,
        f.label,
        f.cellAddress.toUpperCase(),
        f.sheetName ?? null,
        f.fieldType,
        f.required ? 1 : 0,
        f.defaultValue ?? null,
        f.validationRule ?? null,
        f.aiDescription ?? null,
        JSON.stringify(f.dropdownOptions ?? []),
        i,
      )
    })
  })
  replace()
  return listFields(templateId)
}
