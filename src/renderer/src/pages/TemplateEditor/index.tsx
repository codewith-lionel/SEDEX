import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Field'
import { Dialog, ConfirmDialog } from '../../components/ui/Dialog'
import { Tabs } from '../../components/ui/Tabs'
import { PageHeader } from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import { CATEGORIES, FIELD_TYPES, FIELD_TYPE_LABELS } from '../../../../shared/constants'
import { FIELD_KEY_REGEX, CELL_ADDRESS_REGEX } from '../../../../shared/schemas'
import type {
  FieldType,
  SheetCell,
  Template,
  TemplateCategory,
  TemplateField,
} from '../../../../shared/types'

interface FieldDraft {
  existing: TemplateField | null
  label: string
  fieldKey: string
  fieldType: FieldType
  sheetName: string
  cellAddress: string
  required: boolean
  defaultValue: string
  validationRule: string
  aiDescription: string
  dropdownOptions: string
  sortOrder: number
}

export default function TemplateEditor() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [template, setTemplate] = useState<Template | null>(null)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [sheets, setSheets] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('fields')

  const [sheet, setSheet] = useState('')
  const [grid, setGrid] = useState<SheetCell[][]>([])
  const [gridLoading, setGridLoading] = useState(false)
  const [gridError, setGridError] = useState<string | null>(null)

  const [draft, setDraft] = useState<FieldDraft | null>(null)
  const [metaOpen, setMetaOpen] = useState(false)
  const [detailCell, setDetailCell] = useState<SheetCell | null>(null)
  const [confirmDeleteField, setConfirmDeleteField] = useState<TemplateField | null>(null)
  const [autoMapping, setAutoMapping] = useState(false)

  const runAutoMap = async (): Promise<void> => {
    if (!templateId) return
    setAutoMapping(true)
    try {
      const { sheet: mappedSheet, suggestions } = await api.templates.autoMap(templateId, sheet || undefined)
      if (suggestions.length === 0) {
        toast('info', 'No "Label:" cells were found on that sheet to auto-map.')
        return
      }
      const next: TemplateField[] = [
        ...fields,
        ...suggestions.map((s, i) => ({
          id: `auto-${i}`,
          templateId: templateId,
          fieldKey: s.fieldKey,
          label: s.label,
          cellAddress: s.cellAddress,
          sheetName: mappedSheet,
          fieldType: s.fieldType as TemplateField['fieldType'],
          required: false,
          defaultValue: null,
          validationRule: null,
          aiDescription: null,
          dropdownOptions: [],
          sortOrder: fields.length + i,
        })),
      ]
      await saveFields(next)
      toast('success', `Auto-mapped ${suggestions.length} fields from "${mappedSheet}". Review and adjust them as needed.`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setAutoMapping(false)
    }
  }

  const load = useCallback(async () => {
    if (!templateId) return
    try {
      const result = await api.templates.get(templateId)
      setTemplate(result.template)
      setFields(result.fields)
      setSheets(result.sheets)
      if (result.sheets.length > 0 && !result.sheets.includes(sheet)) setSheet(result.sheets[0])
    } catch (err) {
      toast('error', (err as Error).message)
      navigate('/templates')
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!templateId || !sheet) return
    let cancelled = false
    setGridLoading(true)
    setGridError(null)
    api.templates
      .preview(templateId, sheet)
      .then((preview) => {
        if (!cancelled) setGrid(preview.rows)
      })
      .catch((err) => {
        if (!cancelled) {
          setGrid([])
          setGridError((err as Error).message)
        }
      })
      .finally(() => {
        if (!cancelled) setGridLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [templateId, sheet])

  const mappedCells = useMemo(() => {
    const map: Record<string, string> = {}
    for (const f of fields) {
      if (!f.sheetName || f.sheetName === sheet) map[f.cellAddress] = f.fieldKey
    }
    return map
  }, [fields, sheet])

  const saveFields = async (next: TemplateField[]): Promise<boolean> => {
    if (!templateId) return false
    try {
      const saved = await api.templates.saveFields(templateId, toInputs(next))
      setFields(saved)
      return true
    } catch (err) {
      toast('error', (err as Error).message)
      return false
    }
  }

  const startAdd = (cellAddress?: string): void => {
    setDraft({
      existing: null,
      label: '',
      fieldKey: '',
      fieldType: 'text',
      sheetName: sheet || sheets[0] || '',
      cellAddress: cellAddress ?? '',
      required: false,
      defaultValue: '',
      validationRule: '',
      aiDescription: '',
      dropdownOptions: '',
      sortOrder: fields.length,
    })
  }

  const startEdit = (f: TemplateField): void => {
    setDraft({
      existing: f,
      label: f.label,
      fieldKey: f.fieldKey,
      fieldType: f.fieldType,
      sheetName: f.sheetName ?? sheet ?? sheets[0] ?? '',
      cellAddress: f.cellAddress,
      required: f.required,
      defaultValue: f.defaultValue ?? '',
      validationRule: f.validationRule ?? '',
      aiDescription: f.aiDescription ?? '',
      dropdownOptions: f.dropdownOptions.join(', '),
      sortOrder: f.sortOrder,
    })
  }

  const submitDraft = async (): Promise<void> => {
    if (!draft) return
    const key = draft.fieldKey.trim()
    if (!draft.label.trim()) return
    if (!FIELD_KEY_REGEX.test(key)) return
    if (!CELL_ADDRESS_REGEX.test(draft.cellAddress.trim().toUpperCase())) return
    const duplicate = fields.some((f) => f.id !== draft.existing?.id && f.fieldKey === key)
    if (duplicate) return

    const input: Omit<TemplateField, 'id' | 'templateId'> = {
      fieldKey: key,
      label: draft.label.trim(),
      cellAddress: draft.cellAddress.trim().toUpperCase(),
      sheetName: draft.sheetName || null,
      fieldType: draft.fieldType,
      required: draft.required,
      defaultValue: draft.defaultValue.trim() || null,
      validationRule: draft.validationRule.trim() || null,
      aiDescription: draft.aiDescription.trim() || null,
      dropdownOptions: draft.fieldType === 'dropdown'
        ? draft.dropdownOptions.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      sortOrder: draft.sortOrder,
    }

    let next: TemplateField[]
    if (draft.existing) {
      next = fields.map((f) =>
        f.id === draft.existing!.id
          ? { ...f, ...input, cellAddress: input.cellAddress!, sheetName: input.sheetName }
          : f,
      )
    } else {
      next = [...fields, { ...input, id: 'new', templateId: templateId ?? '', cellAddress: input.cellAddress! } as TemplateField]
    }
    const ok = await saveFields(next)
    if (ok) {
      setDraft(null)
      setDetailCell(null)
      if (!draft.existing) toast('success', `Field "${input.label}" added.`)
    }
  }

  const deleteField = async (): Promise<void> => {
    if (!confirmDeleteField) return
    const next = fields.filter((f) => f.id !== confirmDeleteField.id)
    const ok = await saveFields(next)
    if (ok) {
      toast('success', `Field "${confirmDeleteField.label}" removed.`)
      setConfirmDeleteField(null)
    }
  }

  const moveField = async (index: number, dir: -1 | 1): Promise<void> => {
    const target = index + dir
    if (target < 0 || target >= fields.length) return
    const next = [...fields]
    const a = next[index]
    next[index] = next[target]
    next[target] = a
    await saveFields(next)
  }

  const remapCell = async (fieldId: string, cellAddress: string): Promise<void> => {
    const next = fields.map((f) =>
      f.id === fieldId ? { ...f, cellAddress: cellAddress.toUpperCase(), sheetName: sheet || f.sheetName } : f,
    )
    const ok = await saveFields(next)
    if (ok) {
      setDetailCell(null)
      toast('success', 'Cell mapping updated.')
    }
  }

  const updateTemplate = async (patch: { name?: string; description?: string; category?: TemplateCategory; status?: 'active' | 'inactive' }): Promise<void> => {
    if (!templateId) return
    try {
      const t = await api.templates.update({ id: templateId, ...patch })
      setTemplate(t)
      toast('success', 'Template updated.')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  if (loading || !template) {
    return (
      <div className="flex h-64 items-center justify-center">
        <span className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }

  return (
    <div>
      <PageHeader
        title={template.name}
        subtitle={`${template.fileName} · ${template.description || 'No description'}`}
        back={{ label: 'Back to templates', onClick: () => navigate('/templates') }}
      >
        <Badge tone="indigo">{template.category}</Badge>
        <Badge tone={statusTone(template.status)}>{template.status === 'active' ? 'Active' : 'Disabled'}</Badge>
        <Button variant="secondary" icon="edit" onClick={() => setMetaOpen(true)}>
          Edit Details
        </Button>
        <Button
          icon="generate"
          onClick={() => navigate(`/generate/${template.id}`)}
        >
          Generate
        </Button>
      </PageHeader>

      <Tabs
        className="mb-4 w-fit"
        active={tab}
        onChange={setTab}
        tabs={[
          { id: 'fields', label: 'Field Mapping', badge: fields.length },
          { id: 'preview', label: 'Sheet Preview' },
        ]}
      />

      {tab === 'fields' ? (
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Map template fields to Excel cells. Each field can target a cell on any worksheet of the template.
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon="zap"
                loading={autoMapping}
                onClick={() => void runAutoMap()}
              >
                Auto-map from labels
              </Button>
              <Button size="sm" icon="plus" onClick={() => startAdd()}>
                Add Field
              </Button>
            </div>
          </div>
          {fields.length === 0 ? (
            <div className="px-5 py-12 text-center">
              <p className="text-sm font-medium text-slate-600 dark:text-slate-300">No fields mapped yet</p>
              <p className="mx-auto mt-1 max-w-md text-xs text-slate-400 dark:text-slate-500">
                Add fields like <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">employee_name</code> →
                cell <code className="rounded bg-slate-100 px-1 dark:bg-slate-800">B5</code>. Only these cells will be
                changed when a form is generated.
              </p>
              <Button className="mt-4" icon="plus" onClick={() => startAdd()}>
                Add the first field
              </Button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {fields.map((f, i) => (
                <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="flex flex-col">
                    <button onClick={() => void moveField(i, -1)} disabled={i === 0} className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 dark:hover:text-slate-200" title="Move up">
                      <Icon name="chevron-down" size={13} className="rotate-180" />
                    </button>
                    <button onClick={() => void moveField(i, 1)} disabled={i === fields.length - 1} className="rounded p-0.5 text-slate-300 hover:text-slate-600 disabled:opacity-30 dark:hover:text-slate-200" title="Move down">
                      <Icon name="chevron-down" size={13} />
                    </button>
                  </div>
                  <div className="w-44 shrink-0">
                    <div className="text-sm font-medium text-slate-800 dark:text-slate-100">{f.label}</div>
                    <div className="font-mono text-xs text-slate-400 dark:text-slate-500">{f.fieldKey}</div>
                  </div>
                  <Badge tone="info" className="w-24 justify-center font-mono">
                    {f.sheetName ? `${f.sheetName}!` : ''}
                    {f.cellAddress}
                  </Badge>
                  <Badge tone="neutral">{FIELD_TYPE_LABELS[f.fieldType]}</Badge>
                  {f.required ? <Badge tone="warning">Required</Badge> : null}
                  {f.defaultValue ? (
                    <span className="truncate text-xs text-slate-400 dark:text-slate-500" title={f.defaultValue}>
                      default: {f.defaultValue}
                    </span>
                  ) : null}
                  {f.dropdownOptions.length > 0 ? (
                    <span className="hidden truncate text-xs text-slate-400 xl:inline dark:text-slate-500" title={f.dropdownOptions.join(', ')}>
                      {f.dropdownOptions.join(', ')}
                    </span>
                  ) : null}
                  <div className="ml-auto flex gap-1">
                    <IconBtn title="Edit field" icon="edit" onClick={() => startEdit(f)} />
                    <IconBtn title="Remove field" icon="trash" danger onClick={() => setConfirmDeleteField(f)} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      ) : (
        <Card>
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Worksheet:</span>
              <Select
                value={sheet}
                onChange={(e) => setSheet(e.target.value)}
                options={sheets.map((s) => ({ value: s, label: s }))}
                className="h-8 w-56"
              />
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Click any cell to create or remap a field. Highlighted cells are mapped.
            </p>
          </div>
          {gridLoading ? (
            <div className="flex h-48 items-center justify-center">
              <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
            </div>
          ) : gridError ? (
            <div className="px-5 py-10 text-center text-sm text-rose-600 dark:text-rose-400">{gridError}</div>
          ) : (
            <div className="overflow-auto p-4">
              <table className="border-collapse text-xs">
                <tbody>
                  {grid.map((row) => (
                    <tr key={row[0]?.address ?? Math.random()}>
                      {row.map((cell) => {
                        const mapped = mappedCells[cell.address]
                        return (
                          <td key={cell.address} className="p-0">
                            <button
                              onClick={() => setDetailCell(cell)}
                              title={mapped ? `${cell.address} → ${mapped}` : `Map ${cell.address}`}
                              className={
                                'flex h-7 min-w-[72px] items-center border border-slate-200 px-2 text-left transition-colors dark:border-slate-700 ' +
                                (mapped
                                  ? 'bg-indigo-100 font-medium text-indigo-800 hover:bg-indigo-200 dark:bg-indigo-950 dark:text-indigo-200 dark:hover:bg-indigo-900'
                                  : cell.formula
                                    ? 'bg-amber-50 text-amber-700 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300'
                                    : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800')
                              }
                            >
                              <span className="truncate">
                                {cell.formula ? cell.formula : cell.text}
                              </span>
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {draft ? (
        <FieldFormDialog
          draft={draft}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSubmit={() => void submitDraft()}
          sheets={sheets}
          grid={grid}
          activeSheet={sheet}
          onActiveSheet={(s) => setSheet(s)}
          keyError={draft.fieldKey ? !FIELD_KEY_REGEX.test(draft.fieldKey) : false}
          cellError={draft.cellAddress ? !CELL_ADDRESS_REGEX.test(draft.cellAddress.toUpperCase()) : false}
          labelError={!draft.label.trim()}
          duplicateKey={fields.some((f) => f.id !== draft.existing?.id && f.fieldKey === draft.fieldKey.trim())}
        />
      ) : null}

      {detailCell ? (
        <CellDetailDialog
          cell={detailCell}
          sheet={sheet}
          fields={fields}
          onClose={() => setDetailCell(null)}
          onNewField={() => {
            const cell = detailCell
            setDetailCell(null)
            startAdd(cell.address)
          }}
          onRemap={(fieldId) => void remapCell(fieldId, detailCell.address)}
        />
      ) : null}

      <MetaDialog template={template} open={metaOpen} onClose={() => setMetaOpen(false)} onSave={(p) => void updateTemplate(p)} />
      <ConfirmDialog
        open={confirmDeleteField !== null}
        title="Remove field mapping?"
        message={`The field "${confirmDeleteField?.label}" will no longer be filled in generated forms. No data is lost from the Excel file.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => void deleteField()}
        onClose={() => setConfirmDeleteField(null)}
      />
    </div>
  )
}

function toInputs(fields: TemplateField[]) {
  return fields.map((f) => ({
    fieldKey: f.fieldKey,
    label: f.label,
    cellAddress: f.cellAddress,
    sheetName: f.sheetName,
    fieldType: f.fieldType,
    required: f.required,
    defaultValue: f.defaultValue,
    validationRule: f.validationRule,
    aiDescription: f.aiDescription,
    dropdownOptions: f.dropdownOptions,
    sortOrder: f.sortOrder,
  }))
}

function IconBtn({ title, icon, onClick, danger }: { title: string; icon: Parameters<typeof Icon>[0]['name']; onClick: () => void; danger?: boolean }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        'rounded-md p-1.5 ' +
        (danger
          ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200')
      }
    >
      <Icon name={icon} size={15} />
    </button>
  )
}

function FieldFormDialog({
  draft,
  onChange,
  onClose,
  onSubmit,
  sheets,
  grid,
  activeSheet,
  onActiveSheet,
  keyError,
  cellError,
  labelError,
  duplicateKey,
}: {
  draft: FieldDraft
  onChange: (d: FieldDraft) => void
  onClose: () => void
  onSubmit: () => void
  sheets: string[]
  grid: SheetCell[][]
  activeSheet: string
  onActiveSheet: (s: string) => void
  keyError: boolean
  cellError: boolean
  labelError: boolean
  duplicateKey: boolean
}) {
  const [picking, setPicking] = useState(false)
  const set = <K extends keyof FieldDraft>(key: K, value: FieldDraft[K]): void => onChange({ ...draft, [key]: value })

  const key = draft.fieldKey.trim()
  const cell = draft.cellAddress.trim().toUpperCase()
  const valid = key.length > 0 && cell.length > 0 && !keyError && !cellError && !labelError && !duplicateKey

  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      title={draft.existing ? 'Edit Field' : 'Add Field'}
      description="Defines one data field and where its value is written in the template."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button icon="save" disabled={!valid} onClick={onSubmit}>
            {draft.existing ? 'Save Field' : 'Add Field'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Input
          label="Label"
          required
          placeholder="e.g. Employee Name"
          value={draft.label}
          onChange={(e) => set('label', e.target.value)}
          error={labelError ? 'Label is required.' : null}
        />
        <Input
          label="Field key"
          required
          placeholder="e.g. employee_name"
          value={draft.fieldKey}
          onChange={(e) => set('fieldKey', e.target.value.replace(/\s+/g, '_'))}
          error={duplicateKey ? 'This key already exists for the template.' : keyError ? 'Start with a letter; use letters, digits, underscores.' : null}
        />
        <Select
          label="Type"
          value={draft.fieldType}
          onChange={(e) => set('fieldType', e.target.value as FieldType)}
          options={FIELD_TYPES.map((t) => ({ value: t, label: FIELD_TYPE_LABELS[t] }))}
        />
        <Select
          label="Worksheet"
          hint="Leave as the current sheet to target the first worksheet."
          value={draft.sheetName}
          onChange={(e) => {
            set('sheetName', e.target.value)
            if (e.target.value) onActiveSheet(e.target.value)
          }}
          options={[{ value: '', label: '(first worksheet)' }, ...sheets.map((s) => ({ value: s, label: s }))]}
        />
        <Input
          label="Excel cell address"
          required
          placeholder="e.g. B5"
          value={draft.cellAddress}
          onChange={(e) => set('cellAddress', e.target.value.toUpperCase())}
          error={cellError ? 'Invalid cell address (e.g. B5).' : null}
          className="font-mono"
        />
        <div className="flex items-end pb-1">
          <Button variant="secondary" size="md" icon="templates" onClick={() => setPicking((p) => !p)} className="w-full">
            {picking ? 'Pick from grid below ✓' : 'Pick from sheet grid'}
          </Button>
        </div>
        {draft.fieldType === 'dropdown' ? (
          <Input
            label="Dropdown options"
            hint="Comma separated, e.g. Production, Quality, Admin"
            value={draft.dropdownOptions}
            onChange={(e) => set('dropdownOptions', e.target.value)}
            className="col-span-2"
          />
        ) : null}
        <Input
          label="Default value"
          hint="Optional — used when the field is left empty."
          value={draft.defaultValue}
          onChange={(e) => set('defaultValue', e.target.value)}
        />
        <Input
          label="Validation rule"
          hint="Regex for text types, or plain substring. Optional."
          value={draft.validationRule}
          onChange={(e) => set('validationRule', e.target.value)}
        />
        <Textarea
          label="AI extraction description"
          hint="Helps Gemini understand what belongs in this field."
          placeholder="e.g. Full legal name of the employee"
          value={draft.aiDescription}
          onChange={(e) => set('aiDescription', e.target.value)}
          className="col-span-2"
        />
        <div className="col-span-2">
          <Checkbox
            label="Required"
            hint="Generation is blocked when this field is empty."
            checked={draft.required}
            onChange={(e) => set('required', e.target.checked)}
          />
        </div>
      </div>

      {picking ? (
        <div className="mt-4 rounded-lg border border-dashed border-indigo-300 bg-indigo-50/50 p-3 dark:border-indigo-800 dark:bg-indigo-950/30">
          <p className="mb-2 text-xs font-medium text-indigo-700 dark:text-indigo-300">
            Click a cell in the "{activeSheet || 'sheet'}" grid to set the address:
          </p>
          {grid.length === 0 ? (
            <p className="text-xs text-slate-400">Loading grid…</p>
          ) : (
            <div className="max-h-56 overflow-auto">
              <table className="border-collapse text-xs">
                <tbody>
                  {grid.map((row) => (
                    <tr key={row[0]?.address ?? Math.random()}>
                      {row.map((c) => (
                        <td key={c.address} className="p-0">
                          <button
                            onClick={() => {
                              set('cellAddress', c.address)
                              setPicking(false)
                            }}
                            className={
                              'flex h-6 min-w-[64px] items-center border border-slate-200 px-1.5 text-left hover:bg-indigo-200 dark:border-slate-700 dark:hover:bg-indigo-900 ' +
                              (cell === c.address ? 'bg-indigo-300 font-semibold dark:bg-indigo-700' : 'text-slate-500')
                            }
                          >
                            <span className="max-w-[80px] truncate">{c.formula ? c.formula : c.text || c.address}</span>
                          </button>
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </Dialog>
  )
}

function CellDetailDialog({
  cell,
  sheet,
  fields,
  onClose,
  onNewField,
  onRemap,
}: {
  cell: SheetCell
  sheet: string
  fields: TemplateField[]
  onClose: () => void
  onNewField: () => void
  onRemap: (fieldId: string) => void
}) {
  const mapped = fields.find((f) => f.cellAddress === cell.address && (!f.sheetName || f.sheetName === sheet))
  const [selected, setSelected] = useState(mapped?.id ?? '')
  return (
    <Dialog
      open
      onClose={onClose}
      width="sm"
      title={`Cell ${cell.address}`}
      description={cell.formula ? `Contains formula ${cell.formula} — writing here will replace the formula.` : cell.text ? `Current value: ${cell.text}` : 'Empty cell'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" icon="plus" onClick={onNewField}>
            New field
          </Button>
          {mapped ? (
            <Button
              icon="save"
              disabled={!selected}
              onClick={() => selected !== mapped.id && onRemap(selected)}
            >
              {selected !== mapped.id ? 'Re-map' : 'Mapped ✓'}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {mapped ? (
            <>
              Currently mapped to{' '}
              <span className="font-mono font-medium text-indigo-600 dark:text-indigo-300">{mapped.fieldKey}</span> ({mapped.label}).
            </>
          ) : (
            'This cell is not mapped to any field yet.'
          )}
        </p>
        <Select
          label="Existing field"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          placeholder="Select a field to map to this cell…"
          options={fields.map((f) => ({ value: f.id, label: `${f.label} (${f.fieldKey})` }))}
        />
      </div>
    </Dialog>
  )
}

function MetaDialog({
  template,
  open,
  onClose,
  onSave,
}: {
  template: Template
  open: boolean
  onClose: () => void
  onSave: (patch: { name?: string; description?: string; category?: TemplateCategory; status?: 'active' | 'inactive' }) => void
}) {
  const [name, setName] = useState(template.name)
  const [description, setDescription] = useState(template.description)
  const [category, setCategory] = useState<TemplateCategory>(template.category)
  const [status, setStatus] = useState<'active' | 'inactive'>(template.status)

  useEffect(() => {
    if (open) {
      setName(template.name)
      setDescription(template.description)
      setCategory(template.category)
      setStatus(template.status)
    }
  }, [open, template])

  if (!open) return null
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Edit Template Details"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            icon="save"
            disabled={!name.trim()}
            onClick={() => {
              onSave({ name: name.trim(), description, category, status })
              onClose()
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input label="Name" required value={name} onChange={(e) => setName(e.target.value)} />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} />
        <div className="grid grid-cols-2 gap-4">
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value as TemplateCategory)} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
          <Select
            label="Status"
            value={status}
            onChange={(e) => setStatus(e.target.value as 'active' | 'inactive')}
            options={[
              { value: 'active', label: 'Active' },
              { value: 'inactive', label: 'Disabled' },
            ]}
          />
        </div>
        <p className="rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-400 dark:bg-slate-950 dark:text-slate-500">
          {template.filePath}
        </p>
      </div>
    </Dialog>
  )
}
