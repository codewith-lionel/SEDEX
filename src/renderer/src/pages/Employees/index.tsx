import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Input, Select } from '../../components/ui/Field'
import { Dialog, ConfirmDialog } from '../../components/ui/Dialog'
import { Table, type Column } from '../../components/ui/Table'
import { PageHeader } from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import { autoMapEmployeeColumns, formatDateDDMMYYYY } from '../../../../shared/validation'
import type { Employee, ParsedDataFile } from '../../../../shared/types'

type EmployeeColumn = 'name' | 'code' | 'department' | 'designation' | 'notes'

const COLUMN_LABELS: Record<EmployeeColumn, string> = {
  name: 'Name',
  code: 'Employee ID / Code',
  department: 'Department',
  designation: 'Designation',
  notes: 'Notes',
}

export default function Employees() {
  const { toast } = useToast()
  const [employees, setEmployees] = useState<Employee[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Employee | 'new' | null>(null)
  const [toDelete, setToDelete] = useState<Employee | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const result = await api.employees.list({ search: search || undefined })
      setEmployees(result.employees)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), search ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [refresh, search])

  const onDelete = async (): Promise<void> => {
    if (!toDelete) return
    setBusy(true)
    try {
      await api.employees.remove(toDelete.id)
      toast('success', `Employee "${toDelete.name}" deleted.`)
      setToDelete(null)
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  const columns = useMemo<Column<Employee>[]>(
    () => [
      {
        key: 'name',
        header: 'Name',
        render: (e) => (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-50 text-xs font-semibold text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
              {e.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </span>
            <span className="font-medium text-slate-800 dark:text-slate-100">{e.name}</span>
          </div>
        ),
      },
      { key: 'code', header: 'Employee ID', render: (e) => <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{e.code ?? '—'}</span> },
      { key: 'department', header: 'Department', render: (e) => e.department ?? <span className="text-slate-300 dark:text-slate-600">—</span> },
      { key: 'designation', header: 'Designation', render: (e) => e.designation ?? <span className="text-slate-300 dark:text-slate-600">—</span> },
      {
        key: 'updated',
        header: 'Updated',
        render: (e) => <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateDDMMYYYY(e.updatedAt)}</span>,
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        className: 'text-right',
        render: (e) => (
          <div className="flex justify-end gap-1">
            <button title="Edit" onClick={() => setEditing(e)} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200">
              <Icon name="edit" size={15} />
            </button>
            <button title="Delete" onClick={() => setToDelete(e)} className="rounded-md p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400">
              <Icon name="trash" size={15} />
            </button>
          </div>
        ),
      },
    ],
    [],
  )

  return (
    <div>
      <PageHeader title="Employees" subtitle="Keep employee records handy for form generation.">
        <Button variant="secondary" icon="upload" onClick={() => setImportOpen(true)}>
          Import Excel / CSV
        </Button>
        <Button icon="plus" onClick={() => setEditing('new')}>
          Add Employee
        </Button>
      </PageHeader>

      <div className="mb-4 flex items-center gap-2">
        <div className="relative w-72">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search employees…"
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">{employees.length} employees</span>
      </div>

      <Card>
        <Table
          columns={columns}
          rows={employees}
          rowKey={(e) => e.id}
          loading={loading}
          emptyMessage="No employees yet. Add one manually or import an Excel/CSV file."
        />
      </Card>

      {editing ? (
        <EmployeeDialog
          employee={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            void refresh()
          }}
        />
      ) : null}

      {importOpen ? (
        <ImportDialog
          onClose={() => setImportOpen(false)}
          onImported={() => {
            setImportOpen(false)
            void refresh()
          }}
        />
      ) : null}

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete employee?"
        message={`"${toDelete?.name}" will be removed from the employee list. Generated files are not affected.`}
        confirmLabel="Delete"
        danger
        loading={busy}
        onConfirm={() => void onDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}

function EmployeeDialog({
  employee,
  onClose,
  onSaved,
}: {
  employee: Employee | null
  onClose: () => void
  onSaved: () => void
}) {
  const { toast } = useToast()
  const [name, setName] = useState(employee?.name ?? '')
  const [code, setCode] = useState(employee?.code ?? '')
  const [department, setDepartment] = useState(employee?.department ?? '')
  const [designation, setDesignation] = useState(employee?.designation ?? '')
  const [notes, setNotes] = useState(employee?.notes ?? '')
  const [saving, setSaving] = useState(false)

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast('error', 'Employee name is required.')
      return
    }
    setSaving(true)
    try {
      const input = {
        name: name.trim(),
        code: code.trim() || null,
        department: department.trim() || null,
        designation: designation.trim() || null,
        notes: notes.trim() || null,
      }
      if (employee) await api.employees.update({ id: employee.id, ...input })
      else await api.employees.add(input)
      toast('success', employee ? 'Employee updated.' : 'Employee added.')
      onSaved()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      title={employee ? `Edit — ${employee.name}` : 'Add Employee'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="save" loading={saving} onClick={() => void submit()}>
            {employee ? 'Save Changes' : 'Add Employee'}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-4">
        <Input label="Full name" required value={name} onChange={(e) => setName(e.target.value)} className="col-span-2" />
        <Input label="Employee ID / Code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="e.g. EMP1042" />
        <Input label="Department" value={department} onChange={(e) => setDepartment(e.target.value)} />
        <Input label="Designation" value={designation} onChange={(e) => setDesignation(e.target.value)} />
        <Input label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Dialog>
  )
}

function ImportDialog({ onClose, onImported }: { onClose: () => void; onImported: () => void }) {
  const { toast } = useToast()
  const [parsed, setParsed] = useState<ParsedDataFile | null>(null)
  const [path, setPath] = useState<string | null>(null)
  const [mapping, setMapping] = useState<Record<string, EmployeeColumn | ''>>({})
  const [importing, setImporting] = useState(false)

  const pick = async (): Promise<void> => {
    try {
      const p = await api.dialogs.pickExcelFile()
      if (!p) return
      const file = await api.data.parseFile(p)
      setPath(p)
      setParsed(file)
      const auto = autoMapEmployeeColumns(file.headers)
      const initial: Record<string, EmployeeColumn | ''> = {}
      for (const h of file.headers) initial[h] = (auto[h] as EmployeeColumn | undefined) ?? ''
      setMapping(initial)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const submit = async (): Promise<void> => {
    if (!parsed) return
    const columnMapping: Record<string, EmployeeColumn> = {}
    for (const [h, target] of Object.entries(mapping)) {
      if (target) columnMapping[h] = target
    }
    if (!Object.values(columnMapping).includes('name')) {
      toast('error', 'Map at least one column to "Name".')
      return
    }
    setImporting(true)
    try {
      const result = await api.employees.import({ columnMapping, rows: parsed.rows })
      toast('success', `Imported ${result.inserted} employees (${result.updated} updated).`)
      onImported()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <Dialog
      open
      onClose={onClose}
      width="lg"
      title="Import Employees"
      description="Pick an Excel/CSV file (one employee per row) and map its columns."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={importing}>
            Cancel
          </Button>
          <Button icon="download" loading={importing} disabled={!parsed} onClick={() => void submit()}>
            Import {parsed ? `${parsed.rows.length} rows` : ''}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Button variant="secondary" icon="folder" onClick={() => void pick()} className="w-full justify-center border-dashed">
          {path ? `Selected: ${parsed?.fileName}` : 'Choose file…'}
        </Button>
        {parsed ? (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {parsed.headers.map((h) => (
                <Select
                  key={h}
                  label={h}
                  value={mapping[h] ?? ''}
                  onChange={(e) => setMapping((prev) => ({ ...prev, [h]: e.target.value as EmployeeColumn | '' }))}
                  options={[
                    { value: '', label: '— ignore —' },
                    ...Object.entries(COLUMN_LABELS).map(([value, label]) => ({ value, label })),
                  ]}
                />
              ))}
            </div>
            <div className="max-h-48 overflow-auto rounded-lg border border-slate-200 dark:border-slate-700">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-50 dark:bg-slate-800">
                  <tr>
                    {parsed.headers.map((h) => (
                      <th key={h} className="px-3 py-2 font-semibold text-slate-500 dark:text-slate-300">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {parsed.rows.slice(0, 20).map((row, i) => (
                    <tr key={i} className="border-t border-slate-100 dark:border-slate-800">
                      {parsed.headers.map((h) => (
                        <td key={h} className="max-w-40 truncate px-3 py-1.5 text-slate-600 dark:text-slate-300">
                          {row[h] ?? ''}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Dialog>
  )
}
