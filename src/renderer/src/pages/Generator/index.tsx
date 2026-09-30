import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../../services/api'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Checkbox, Input, Select, Textarea } from '../../components/ui/Field'
import { ProgressBar } from '../../components/ui/ProgressBar'
import { Tabs } from '../../components/ui/Tabs'
import { PageHeader } from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import {
  autoMapColumns,
  buildWarnings,
  displayValue,
  hasBlockingErrors,
  sanitizeFileName,
  validateFieldValue,
} from '../../../../shared/validation'
import type {
  BulkProgress,
  BulkResult,
  Employee,
  FieldValueEntry,
  FieldWarning,
  ParsedDataFile,
  SingleGenerateResult,
  Template,
  TemplateField,
} from '../../../../shared/types'

type Source = 'manual' | 'text' | 'excel'

export default function Generator() {
  const { templateId } = useParams<{ templateId: string }>()
  const navigate = useNavigate()
  const { toast } = useToast()

  const [templates, setTemplates] = useState<Template[]>([])
  const [selectedId, setSelectedId] = useState<string>(templateId ?? '')
  const [template, setTemplate] = useState<Template | null>(null)
  const [fields, setFields] = useState<TemplateField[]>([])
  const [loadingTemplate, setLoadingTemplate] = useState(false)

  const [mode, setMode] = useState<'single' | 'bulk'>('single')
  const [source, setSource] = useState<Source>('manual')

  // Data state (single form)
  const [values, setValues] = useState<Record<string, string>>({})
  const [provenance, setProvenance] = useState<Record<string, FieldValueEntry> | null>(null)
  const [pastedText, setPastedText] = useState('')
  const [extracting, setExtracting] = useState(false)
  const [extractError, setExtractError] = useState<string | null>(null)
  const [aiEnabled, setAiEnabled] = useState(false)

  const [parsed, setParsed] = useState<ParsedDataFile | null>(null)
  const [columnMapping, setColumnMapping] = useState<Record<string, string>>({})
  const [selectedRow, setSelectedRow] = useState<number | null>(null)

  const [fileName, setFileName] = useState('')
  const [generating, setGenerating] = useState(false)
  const [result, setResult] = useState<SingleGenerateResult | null>(null)

  // Bulk state
  const [bulkSource, setBulkSource] = useState<'file' | 'employees'>('file')
  const [bulkBaseName, setBulkBaseName] = useState('')
  const [bulkNamingField, setBulkNamingField] = useState('')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())
  const [progress, setProgress] = useState<BulkProgress | null>(null)
  const [bulkResult, setBulkResult] = useState<BulkResult | null>(null)

  // Unsubscribe from progress events on unmount.
  const unsubRef = useRef<(() => void) | null>(null)
  // Absolute path of the currently parsed data file (path lives in the main
  // process; the renderer keeps the path for bulk re-parsing).
  const parsedPathRef = useRef<string | null>(null)
  useEffect(() => {
    unsubRef.current?.()
    return () => unsubRef.current?.()
  }, [])

  // Load template list + settings.
  useEffect(() => {
    void api.templates.list({ status: 'active' }).then((r) => setTemplates(r.templates)).catch(() => undefined)
    void api.settings.get().then((s) => setAiEnabled(s.aiEnabled)).catch(() => undefined)
  }, [])

  // Load selected template details.
  useEffect(() => {
    if (!selectedId) return
    let cancelled = false
    setLoadingTemplate(true)
    setResult(null)
    setValues({})
    setProvenance(null)
    setParsed(null)
    setColumnMapping({})
    setSelectedRow(null)
    setExtractError(null)
    api.templates
      .get(selectedId)
      .then((r) => {
        if (cancelled) return
        setTemplate(r.template)
        setFields(r.fields)
        setBulkBaseName(sanitizeFileName(r.template.name, 'form'))
      })
      .catch((err) => toast('error', (err as Error).message))
      .finally(() => {
        if (!cancelled) setLoadingTemplate(false)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId])

  useEffect(() => {
    if (bulkSource === 'employees') {
      void api.employees.list().then((r) => {
        setEmployees(r.employees)
        setSelectedEmployees(new Set(r.employees.map((e) => e.id)))
      }).catch(() => undefined)
    }
  }, [bulkSource])

  const warnings: FieldWarning[] = useMemo(() => {
    if (!template) return []
    const raw: Record<string, unknown> = { ...values }
    for (const f of fields) {
      if (raw[f.fieldKey] === '' || raw[f.fieldKey] === undefined) delete raw[f.fieldKey]
    }
    return buildWarnings(fields, raw, provenance)
  }, [template, fields, values, provenance])

  const blocking = hasBlockingErrors(warnings)

  const setValue = (key: string, value: string): void => {
    setValues((prev) => ({ ...prev, [key]: value }))
    if (provenance) {
      const next = { ...provenance }
      delete next[key]
      setProvenance(Object.keys(next).length > 0 ? next : null)
    }
  }

  const onExtract = async (): Promise<void> => {
    if (!selectedId) return
    setExtracting(true)
    setExtractError(null)
    try {
      const result = await api.ai.extract({
        templateId: selectedId,
        text: pastedText,
        sourceLabel: 'Pasted text',
      })
      const next: Record<string, string> = {}
      for (const [key, entry] of Object.entries(result.fields)) {
        if (entry.value !== null && entry.value !== undefined) {
          next[key] = typeof entry.value === 'boolean' ? (entry.value ? 'true' : 'false') : String(entry.value)
        }
      }
      setValues((prev) => ({ ...prev, ...next }))
      setProvenance(result.fields)
      const notFound = Object.values(result.fields).filter((e) => e.status === 'not_found').length
      toast('info', `AI extraction complete — ${Object.keys(next).length} values found, ${notFound} not found.`)
    } catch (err) {
      setExtractError((err as Error).message)
    } finally {
      setExtracting(false)
    }
  }

  const onParseFile = async (): Promise<void> => {
    try {
      const path = await api.dialogs.pickExcelFile()
      if (!path) return
      parsedPathRef.current = path
      const file = await api.data.parseFile(path)
      setParsed(file)
      setColumnMapping(autoMapColumns(file.headers, fields))
      setSelectedRow(file.rows.length > 0 ? 0 : null)
      setSource('excel')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const loadSelectedRow = (): void => {
    if (!parsed || selectedRow === null) return
    const row = parsed.rows[selectedRow]
    const next: Record<string, string> = {}
    for (const [header, fieldKey] of Object.entries(columnMapping)) {
      const v = row[header]
      if (v !== undefined && v !== '') next[fieldKey] = v
    }
    setValues(next)
    setProvenance(null)
    if (next.employee_name) setFileName(`${sanitizeFileName(template?.name ?? 'form', 'form')}_${sanitizeFileName(next.employee_name)}`)
    toast('success', `Loaded row ${selectedRow + 1} for review.`)
  }

  const onGenerate = async (): Promise<void> => {
    if (!selectedId) return
    setGenerating(true)
    try {
      const data: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(values)) {
        if (v !== '' && v !== undefined) data[k] = v
      }
      const prov = provenance
        ? Object.fromEntries(
            Object.entries(provenance).map(([k, v]) => [
              k,
              {
                source: v.source,
                page: v.page == null ? null : String(v.page),
                status: v.status,
                confidence: v.confidence,
                note: v.note,
              },
            ]),
          )
        : undefined
      const employeeName = values.employee_name || values.employee_id ? values.employee_name || undefined : undefined
      const res = await api.generator.generate({
        templateId: selectedId,
        data,
        provenance: prov,
        employeeName,
        fileName: fileName || undefined,
        source: source === 'text' && provenance ? 'ai' : source === 'excel' ? 'excel' : 'manual',
      })
      setResult(res)
      toast('success', `Generated ${res.fileName}`)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setGenerating(false)
    }
  }

  const onBulk = async (): Promise<void> => {
    if (!selectedId) return
    setBulkResult(null)
    setProgress(null)
    unsubRef.current?.()
    unsubRef.current = api.generator.onProgress((p) => setProgress(p))
    try {
      const filePath = bulkSource === 'file' ? parsedPathRef.current : null
      if (bulkSource === 'file' && !filePath) {
        throw new Error('Choose a data file first.')
      }
      const input =
        bulkSource === 'file'
          ? {
              templateId: selectedId,
              dataFile: {
                filePath: filePath as string,
                columnMapping,
                fileNameBase: bulkBaseName || template?.name || 'form',
                namingField: bulkNamingField || null,
              },
            }
          : {
              templateId: selectedId,
              employees: {
                employeeIds: [...selectedEmployees],
                fileNameBase: bulkBaseName || template?.name || 'form',
                namingField: bulkNamingField || null,
              },
            }
      const res = await api.generator.bulk(input)
      setBulkResult(res)
      if (res.failed === 0) toast('success', `Bulk generation complete: ${res.completed} files generated.`)
      else toast('info', `Bulk finished: ${res.completed} completed, ${res.failed} failed.`)
    } catch (err) {
      toast('error', (err as Error).message)
      setProgress(null)
    }
  }

  return (
    <div>
      <PageHeader title="Form Generator" subtitle="Fill a template with employee data — manually, from text (AI), or from an Excel/CSV file." />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Tabs
          active={mode}
          onChange={(m) => setMode(m as 'single' | 'bulk')}
          tabs={[
            { id: 'single', label: 'Single Form' },
            { id: 'bulk', label: 'Bulk Generate' },
          ]}
        />
        <div className="ml-auto flex items-center gap-2">
          <label className="text-xs font-medium text-slate-500 dark:text-slate-400">Template</label>
          <Select
            value={selectedId}
            onChange={(e) => {
              setSelectedId(e.target.value)
              navigate(`/generate/${e.target.value}`)
            }}
            placeholder="Select a template…"
            options={templates.map((t) => ({ value: t.id, label: t.name }))}
            className="w-72"
          />
        </div>
      </div>

      {!selectedId ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-sm text-slate-400">Select a template above to start generating forms.</p>
          </CardContent>
        </Card>
      ) : loadingTemplate ? (
        <div className="flex h-40 items-center justify-center">
          <span className="h-7 w-7 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
        </div>
      ) : fields.length === 0 ? (
        <Card>
          <CardContent className="py-14 text-center">
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">This template has no mapped fields yet.</p>
            <p className="mt-1 text-xs text-slate-400">Map the Excel cells to data fields first, then generate.</p>
            <Button className="mt-4" icon="edit" onClick={() => navigate(`/templates/${selectedId}`)}>
              Open Field Mapper
            </Button>
          </CardContent>
        </Card>
      ) : mode === 'single' ? (
        <div className="space-y-4">
          {result ? (
            <SuccessCard result={result} onReset={() => setResult(null)} />
          ) : (
            <>
              <Card>
                <CardContent className="py-3">
                  <Tabs
                    active={source}
                    onChange={(s) => setSource(s as Source)}
                    tabs={[
                      { id: 'manual', label: 'Manual Entry' },
                      { id: 'text', label: aiEnabled ? 'Paste Text + AI' : 'Paste Text' },
                      { id: 'excel', label: 'Excel / CSV' },
                    ]}
                  />
                </CardContent>
              </Card>

              {source === 'manual' ? (
                <Card>
                  <div className="grid grid-cols-1 gap-4 px-5 py-4 md:grid-cols-2">
                    {fields.map((f) => (
                      <DynamicField key={f.id} field={f} value={values[f.fieldKey] ?? ''} onChange={(v) => setValue(f.fieldKey, v)} />
                    ))}
                  </div>
                </Card>
              ) : null}

              {source === 'text' ? (
                <Card>
                  <CardContent className="space-y-3">
                    <Textarea
                      label="Unstructured information"
                      placeholder={'e.g. "Arun Kumar joined the production department on 15 June 2024. He is working as a production supervisor. His employee ID is EMP1042 and his monthly salary is 28000."'}
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      className="min-h-32"
                    />
                    {aiEnabled ? (
                      <div className="flex items-center gap-3">
                        <Button icon="sparkle" loading={extracting} disabled={!pastedText.trim()} onClick={() => void onExtract()}>
                          Extract with Gemini
                        </Button>
                        <p className="text-xs text-slate-400 dark:text-slate-500">
                          Only values explicitly present in the text are used. Missing values stay empty for manual entry.
                        </p>
                      </div>
                    ) : (
                      <p className="flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                        <Icon name="warning" size={14} />
                        AI extraction is disabled. Enable it in Settings (a Gemini API key is required). You can still
                        paste text and fill the form manually below.
                      </p>
                    )}
                    {extractError ? (
                      <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                        {extractError}
                      </p>
                    ) : null}
                    {Object.keys(values).length > 0 ? (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Extracted values are pre-filled in the review below — correct anything that looks wrong.
                      </p>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {source === 'excel' ? (
                <Card>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Button variant="secondary" icon="upload" onClick={() => void onParseFile()}>
                        {parsed ? `Change file (${parsed.fileName})` : 'Choose Excel / CSV file…'}
                      </Button>
                      {parsed ? (
                        <Badge tone="info">
                          {parsed.totalRows} rows · {parsed.kind.toUpperCase()}
                        </Badge>
                      ) : null}
                    </div>
                    {parsed ? (
                      <ColumnMapping
                        parsed={parsed}
                        fields={fields}
                        mapping={columnMapping}
                        onMappingChange={setColumnMapping}
                        selectedRow={selectedRow}
                        onSelectRow={setSelectedRow}
                        onLoadRow={loadSelectedRow}
                      />
                    ) : (
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        Pick a file with one employee per row. The first row is used as headers.
                      </p>
                    )}
                  </CardContent>
                </Card>
              ) : null}

              <ReviewPanel
                fields={fields}
                values={values}
                provenance={provenance}
                warnings={warnings}
                blocking={blocking}
                fileName={fileName}
                onFileNameChange={setFileName}
                onEdit={() => setSource('manual')}
                onGenerate={() => void onGenerate()}
                generating={generating}
              />
            </>
          )}
        </div>
      ) : (
        <BulkPanel
          bulkSource={bulkSource}
          onBulkSource={setBulkSource}
          parsed={parsed}
          onParseFile={() => void onParseFile()}
          fields={fields}
          mapping={columnMapping}
          onMappingChange={setColumnMapping}
          employees={employees}
          selectedEmployees={selectedEmployees}
          onSelectedEmployees={setSelectedEmployees}
          baseName={bulkBaseName}
          onBaseName={setBulkBaseName}
          namingField={bulkNamingField}
          onNamingField={setBulkNamingField}
          onGenerateAll={() => void onBulk()}
          progress={progress}
          result={bulkResult}
        />
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function DynamicField({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  const check = value !== '' ? validateFieldValue(field, value) : { ok: true, value: null, error: null }
  const error = !check.ok ? check.error : null
  const base = { value, onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => onChange(e.target.value), error }
  switch (field.fieldType) {
    case 'multiline':
      return <Textarea label={fieldLabel(field)} hint={fieldHint(field)} {...base} className="min-h-20" />
    case 'date':
      return <Input label={fieldLabel(field)} hint={fieldHint(field)} placeholder="DD/MM/YYYY" {...base} />
    case 'number':
    case 'currency':
      return <Input label={fieldLabel(field)} hint={fieldHint(field)} type="text" inputMode="decimal" placeholder={field.fieldType === 'currency' ? 'e.g. 28000' : 'e.g. 42'} {...base} />
    case 'boolean':
      return (
        <Select
          label={fieldLabel(field)}
          hint={fieldHint(field)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          placeholder="(empty)"
          options={[
            { value: 'true', label: 'Yes' },
            { value: 'false', label: 'No' },
          ]}
        />
      )
    case 'dropdown':
      return (
        <Select
          label={fieldLabel(field)}
          hint={fieldHint(field)}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          error={error}
          placeholder="(empty)"
          options={field.dropdownOptions.map((o) => ({ value: o, label: o }))}
        />
      )
    default:
      return <Input label={fieldLabel(field)} hint={fieldHint(field)} placeholder={field.defaultValue ?? ''} {...base} />
  }
}

function fieldLabel(f: TemplateField): string {
  return f.required ? `${f.label} *` : f.label
}

function fieldHint(f: TemplateField): string | undefined {
  return f.aiDescription && f.aiDescription !== f.label ? f.aiDescription : undefined
}

function ReviewPanel({
  fields,
  values,
  provenance,
  warnings,
  blocking,
  fileName,
  onFileNameChange,
  onEdit,
  onGenerate,
  generating,
}: {
  fields: TemplateField[]
  values: Record<string, string>
  provenance: Record<string, FieldValueEntry> | null
  warnings: FieldWarning[]
  blocking: boolean
  fileName: string
  onFileNameChange: (v: string) => void
  onEdit: () => void
  onGenerate: () => void
  generating: boolean
}) {
  const errorByField = new Map(warnings.filter((w) => w.level === 'error').map((w) => [w.fieldKey, w.message]))
  const warningByField = new Map(warnings.filter((w) => w.level === 'warning').map((w) => [w.fieldKey, w.message]))
  const hasAnyValue = fields.some((f) => (values[f.fieldKey] ?? '') !== '')

  return (
    <Card>
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3.5 dark:border-slate-800">
        <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Review before generating</h3>
        <Button size="sm" variant="secondary" icon="edit" onClick={onEdit}>
          Edit Data
        </Button>
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {fields.map((f) => {
          const raw = values[f.fieldKey] ?? ''
          const prov = provenance?.[f.fieldKey]
          const error = errorByField.get(f.fieldKey)
          const warn = warningByField.get(f.fieldKey)
          return (
            <div key={f.id} className="flex items-center gap-3 px-5 py-2.5">
              <div className="w-52 shrink-0">
                <span className="text-sm text-slate-700 dark:text-slate-200">{f.label}</span>
                {f.required ? <span className="ml-1 text-rose-500">*</span> : null}
              </div>
              <div className="min-w-0 flex-1">
                {raw !== '' ? (
                  <span className={error ? 'text-sm text-rose-600 dark:text-rose-400' : 'text-sm font-medium text-slate-800 dark:text-slate-100'}>
                    {displayValue(f, raw)}
                  </span>
                ) : prov && prov.status === 'not_found' ? (
                  <span className="flex items-center gap-1.5 text-sm text-amber-600 dark:text-amber-400">
                    <Icon name="warning" size={14} /> Information not found
                  </span>
                ) : (
                  <span className="text-sm text-slate-400 dark:text-slate-500">—</span>
                )}
                {(error || warn) ? <div className="mt-0.5 text-xs text-rose-500">{error ?? warn}</div> : null}
              </div>
              {prov && prov.source ? (
                <span className="hidden text-xs text-slate-400 lg:inline dark:text-slate-500" title={prov.note ?? undefined}>
                  src: {prov.source}
                  {prov.page ? ` · p.${prov.page}` : ''}
                </span>
              ) : null}
              {prov && prov.confidence !== null ? (
                <Badge tone={prov.confidence >= 0.8 ? 'success' : 'warning'}>{Math.round(prov.confidence * 100)}%</Badge>
              ) : null}
              {raw !== '' && !error ? (
                <Icon name="check" size={15} className="text-emerald-500" />
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 px-5 py-4 dark:border-slate-800">
        <div className="min-w-64 flex-1">
          <Input
            label="Output file name"
            hint=".xlsx is added automatically"
            value={fileName}
            onChange={(e) => onFileNameChange(e.target.value)}
            placeholder="Auto-named from template + employee"
          />
        </div>
        <Button icon="generate" size="lg" loading={generating} disabled={!hasAnyValue || blocking} onClick={onGenerate}>
          Generate Excel
        </Button>
      </div>
      {blocking ? (
        <p className="mx-5 mb-4 flex items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
          <Icon name="error" size={14} /> Fix the highlighted required/invalid fields before generating.
        </p>
      ) : null}
    </Card>
  )
}

function ColumnMapping({
  parsed,
  fields,
  mapping,
  onMappingChange,
  selectedRow,
  onSelectRow,
  onLoadRow,
}: {
  parsed: ParsedDataFile
  fields: TemplateField[]
  mapping: Record<string, string>
  onMappingChange: (m: Record<string, string>) => void
  selectedRow: number | null
  onSelectRow: (i: number | null) => void
  onLoadRow: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
        {parsed.headers.map((h) => (
          <Select
            key={h}
            label={h}
            value={mapping[h] ?? ''}
            placeholder="— ignore —"
            onChange={(e) => onMappingChange({ ...mapping, [h]: e.target.value })}
            options={fields.map((f) => ({ value: f.fieldKey, label: `${f.label} (${f.fieldKey})` }))}
          />
        ))}
      </div>
      <div>
        <p className="mb-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          Rows ({parsed.totalRows} total, first {parsed.rows.length} shown) — select one to review:
        </p>
        <div className="max-h-64 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
              <tr>
                <th className="w-10 px-3 py-2" />
                {parsed.headers.map((h) => (
                  <th key={h} className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-300">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {parsed.rows.map((row, i) => (
                <tr
                  key={i}
                  onClick={() => onSelectRow(i)}
                  className={
                    'cursor-pointer border-t border-slate-100 dark:border-slate-800 ' +
                    (selectedRow === i ? 'bg-indigo-50 dark:bg-indigo-950/50' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50')
                  }
                >
                  <td className="px-3 py-1.5 text-center">
                    <input
                      type="radio"
                      name="data-row"
                      checked={selectedRow === i}
                      onChange={() => onSelectRow(i)}
                      className="accent-indigo-600"
                    />
                  </td>
                  {parsed.headers.map((h) => (
                    <td key={h} className="max-w-44 truncate px-3 py-1.5 text-slate-600 dark:text-slate-300">
                      {row[h] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <Button icon="download" disabled={selectedRow === null} onClick={onLoadRow}>
        Load selected row into review
      </Button>
    </div>
  )
}

function SuccessCard({ result, onReset }: { result: SingleGenerateResult; onReset: () => void }) {
  const { toast } = useToast()
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950/60 dark:text-emerald-400">
          <Icon name="check" size={26} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-white">Excel generated</h3>
          <p className="mt-1 font-mono text-xs text-slate-400 dark:text-slate-500">{result.filePath}</p>
        </div>
        <div className="flex flex-wrap justify-center gap-2">
          <Button
            icon="open"
            onClick={() => void api.files.open(result.id).catch((e) => toast('error', (e as Error).message))}
            disabled={!result.id}
          >
            Open File
          </Button>
          <Button
            icon="reveal"
            variant="secondary"
            onClick={() => void api.files.reveal(result.id).catch((e) => toast('error', (e as Error).message))}
            disabled={!result.id}
          >
            Show in Folder
          </Button>
          <Button icon="plus" variant="secondary" onClick={onReset}>
            Generate Another
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function BulkPanel(props: {
  bulkSource: 'file' | 'employees'
  onBulkSource: (s: 'file' | 'employees') => void
  parsed: ParsedDataFile | null
  onParseFile: () => void
  fields: TemplateField[]
  mapping: Record<string, string>
  onMappingChange: (m: Record<string, string>) => void
  employees: Employee[]
  selectedEmployees: Set<string>
  onSelectedEmployees: (s: Set<string>) => void
  baseName: string
  onBaseName: (v: string) => void
  namingField: string
  onNamingField: (v: string) => void
  onGenerateAll: () => void
  progress: BulkProgress | null
  result: BulkResult | null
}) {
  const navigate = useNavigate()
  const busy = props.progress !== null

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4">
          <Tabs
            active={props.bulkSource}
            onChange={(s) => props.onBulkSource(s as 'file' | 'employees')}
            tabs={[
              { id: 'file', label: 'From Excel / CSV file' },
              { id: 'employees', label: `From employee list${props.employees.length ? ` (${props.employees.length})` : ''}` },
            ]}
          />
          {props.bulkSource === 'file' ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <Button variant="secondary" icon="upload" onClick={props.onParseFile}>
                  {props.parsed ? `Change file (${props.parsed.fileName})` : 'Choose data file (one employee per row)…'}
                </Button>
                {props.parsed ? <Badge tone="info">{props.parsed.totalRows} rows</Badge> : null}
              </div>
              {props.parsed ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
                  {props.parsed.headers.map((h) => (
                    <Select
                      key={h}
                      label={h}
                      value={props.mapping[h] ?? ''}
                      placeholder="— ignore —"
                      onChange={(e) => props.onMappingChange({ ...props.mapping, [h]: e.target.value })}
                      options={props.fields.map((f) => ({ value: f.fieldKey, label: f.label }))}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {props.selectedEmployees.size} of {props.employees.length} employees selected
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => props.onSelectedEmployees(new Set(props.employees.map((e) => e.id)))}
                  >
                    Select all
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => props.onSelectedEmployees(new Set())}>
                    Clear
                  </Button>
                </div>
              </div>
              <div className="max-h-56 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                    <tr>
                      <th className="w-10 px-3 py-2" />
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-300">Name</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-300">Code</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-300">Department</th>
                      <th className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-300">Designation</th>
                    </tr>
                  </thead>
                  <tbody>
                    {props.employees.map((e) => (
                      <tr key={e.id} className="border-t border-slate-100 dark:border-slate-800">
                        <td className="px-3 py-1.5">
                          <Checkbox
                            checked={props.selectedEmployees.has(e.id)}
                            onChange={(ev) => {
                              const next = new Set(props.selectedEmployees)
                              if (ev.target.checked) next.add(e.id)
                              else next.delete(e.id)
                              props.onSelectedEmployees(next)
                            }}
                          />
                        </td>
                        <td className="px-3 py-1.5 font-medium text-slate-700 dark:text-slate-200">{e.name}</td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{e.code ?? '—'}</td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{e.department ?? '—'}</td>
                        <td className="px-3 py-1.5 text-slate-500 dark:text-slate-400">{e.designation ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Input
              label="File name base"
              hint="Output files: {base}_{employee}.xlsx"
              value={props.baseName}
              onChange={(e) => props.onBaseName(e.target.value)}
            />
            <Select
              label="Name files by"
              value={props.namingField}
              onChange={(e) => props.onNamingField(e.target.value)}
              options={[
                { value: '', label: 'Auto (employee id, then name)' },
                ...props.fields.map((f) => ({ value: f.fieldKey, label: f.label })),
              ]}
            />
          </div>

          <div className="flex items-center gap-3">
            <Button icon="play" size="lg" loading={busy} onClick={props.onGenerateAll} disabled={!canBulk(props)}>
              Generate All
            </Button>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              No artificial limit — files are written to the output folder in Settings.
            </p>
          </div>
        </CardContent>
      </Card>

      {props.progress ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">
                Generating forms… {props.progress.done} / {props.progress.total}
              </span>
              <span className="text-xs text-slate-400">
                Completed: {props.progress.done - props.progress.failed} · Failed: {props.progress.failed}
              </span>
            </div>
            <ProgressBar value={props.progress.done} max={props.progress.total} />
            {props.progress.currentFile ? (
              <p className="truncate font-mono text-xs text-slate-400 dark:text-slate-500">{props.progress.currentFile}</p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      {props.result ? (
        <Card>
          <CardContent className="space-y-3 py-4">
            <div className="flex items-center gap-2">
              <Icon name={props.result.failed === 0 ? 'check' : 'warning'} size={18} className={props.result.failed === 0 ? 'text-emerald-500' : 'text-amber-500'} />
              <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {props.result.failed === 0
                  ? `All ${props.result.total} forms generated.`
                  : `${props.result.completed} of ${props.result.total} forms generated (${props.result.failed} failed).`}
              </span>
            </div>
            {props.result.failures.length > 0 ? (
              <div className="max-h-48 overflow-auto rounded-lg border border-rose-200 bg-rose-50/60 dark:border-rose-900 dark:bg-rose-950/30">
                <table className="w-full text-left text-xs">
                  <tbody>
                    {props.result.failures.map((f) => (
                      <tr key={`${f.row}-${f.fileName}`} className="border-b border-rose-100 last:border-0 dark:border-rose-900/50">
                        <td className="px-3 py-2 text-slate-500 dark:text-slate-400">Row {f.row}</td>
                        <td className="px-3 py-2 font-mono text-slate-500 dark:text-slate-400">{f.fileName}</td>
                        <td className="px-3 py-2 text-rose-600 dark:text-rose-400">{f.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
            <Button variant="secondary" icon="files" onClick={() => navigate('/generated-files')}>
              View in Generated Files
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}

function canBulk(props: {
  bulkSource: 'file' | 'employees'
  parsed: ParsedDataFile | null
  mapping: Record<string, string>
  selectedEmployees: Set<string>
  fields: TemplateField[]
}): boolean {
  const mapped = Object.values(props.mapping).filter(Boolean)
  if (props.bulkSource === 'file') {
    return props.parsed !== null && props.parsed.totalRows > 0 && mapped.length > 0
  }
  return props.selectedEmployees.size > 0 && props.fields.length > 0
}
