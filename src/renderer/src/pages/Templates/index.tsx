import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Input, Select } from '../../components/ui/Field'
import { Dialog, ConfirmDialog } from '../../components/ui/Dialog'
import { Table, type Column } from '../../components/ui/Table'
import { EmptyState } from '../../components/ui/EmptyState'
import { PageHeader } from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import { CATEGORIES } from '../../../../shared/constants'
import { formatDateDDMMYYYY } from '../../../../shared/validation'
import type { Template, TemplateCategory } from '../../../../shared/types'

export default function Templates() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { toast } = useToast()

  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('')
  const [status, setStatus] = useState('')

  const [addOpen, setAddOpen] = useState(searchParams.get('add') === '1')
  const [confirmDelete, setConfirmDelete] = useState<Template | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [seeding, setSeeding] = useState(false)

  const loadSamples = async (): Promise<void> => {
    setSeeding(true)
    try {
      const res = await api.templates.seedSamples()
      if (res.count > 0) toast('success', `Added ${res.count} sample template${res.count > 1 ? 's' : ''}.`)
      else toast('info', res.skipped.length > 0 ? 'Sample templates are already added.' : 'No sample templates available.')
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSeeding(false)
    }
  }

  const refresh = useCallback(async () => {
    try {
      const result = await api.templates.list({
        search: search || undefined,
        category: (category || undefined) as TemplateCategory | undefined,
        status: (status || undefined) as 'active' | 'inactive' | undefined,
      })
      setTemplates(result.templates)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, category, status])

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), search ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [refresh, search])

  const openAdd = (): void => {
    setAddOpen(true)
    setSearchParams({}, { replace: true })
  }

  const onDuplicate = async (t: Template): Promise<void> => {
    setBusyAction(t.id)
    try {
      const copy = await api.templates.duplicate(t.id)
      toast('success', `Duplicated as "${copy.name}".`)
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBusyAction(null)
    }
  }

  const onToggleStatus = async (t: Template): Promise<void> => {
    try {
      await api.templates.update({ id: t.id, status: t.status === 'active' ? 'inactive' : 'active' })
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const onGenerate = (t: Template): void => {
    navigate(`/generate/${t.id}`)
  }

  const onDelete = async (): Promise<void> => {
    if (!confirmDelete) return
    setBusyAction(confirmDelete.id)
    try {
      await api.templates.remove(confirmDelete.id)
      toast('success', `Template "${confirmDelete.name}" deleted.`)
      setConfirmDelete(null)
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBusyAction(null)
    }
  }

  const columns = useMemo<Column<Template>[]>(
    () => [
      {
        key: 'name',
        header: 'Template',
        render: (t) => (
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Icon name="templates" size={15} className="shrink-0 text-slate-400" />
              <span className="truncate font-medium text-slate-800 dark:text-slate-100">{t.name}</span>
            </div>
            <div className="ml-[23px] truncate text-xs text-slate-400 dark:text-slate-500">
              {t.fileName}
              {t.description ? ` · ${t.description}` : ''}
            </div>
          </div>
        ),
      },
      { key: 'category', header: 'Category', render: (t) => <Badge tone="indigo">{t.category}</Badge> },
      { key: 'fields', header: 'Fields', render: (t) => <span className="tabular-nums">{t.fieldCount}</span> },
      {
        key: 'status',
        header: 'Status',
        render: (t) => (
          <Badge tone={statusTone(t.status)}>{t.status === 'active' ? 'Active' : 'Disabled'}</Badge>
        ),
      },
      {
        key: 'updated',
        header: 'Updated',
        render: (t) => <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateDDMMYYYY(t.updatedAt)}</span>,
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        className: 'text-right',
        render: (t) => (
          <div className="flex items-center justify-end gap-1">
            <ActionButton title="Edit fields" icon="edit" onClick={() => navigate(`/templates/${t.id}`)} />
            <ActionButton title="Generate form" icon="generate" onClick={() => onGenerate(t)} />
            <ActionButton title="Duplicate" icon="copy" loading={busyAction === t.id} onClick={() => void onDuplicate(t)} />
            <ActionButton title={t.status === 'active' ? 'Disable' : 'Enable'} icon={t.status === 'active' ? 'close' : 'play'} onClick={() => void onToggleStatus(t)} />
            <ActionButton title="Delete" icon="trash" danger onClick={() => setConfirmDelete(t)} />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busyAction, navigate],
  )

  return (
    <div>
      <PageHeader title="Templates" subtitle="Upload Excel templates and manage their field mappings.">
        <Button variant="secondary" icon="download" loading={seeding} onClick={() => void loadSamples()}>
          Load Sample Templates
        </Button>
        <Button icon="plus" onClick={openAdd}>
          Add Template
        </Button>
      </PageHeader>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search templates…"
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <Select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          options={[{ value: '', label: 'All categories' }, ...CATEGORIES.map((c) => ({ value: c, label: c }))]}
          className="w-44"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          options={[
            { value: '', label: 'All statuses' },
            { value: 'active', label: 'Active' },
            { value: 'inactive', label: 'Disabled' },
          ]}
          className="w-36"
        />
      </div>

      <Card>
        <Table
          columns={columns}
          rows={templates}
          rowKey={(t) => t.id}
          loading={loading}
          emptyMessage="No templates match. Upload an .xlsx template to get started."
        />
      </Card>

      {templates.length === 0 && !loading ? (
        <EmptyState
          icon="upload"
          title="No templates yet"
          message="Upload an Excel file (.xlsx) you use for HR/audit documentation, then map its cells to data fields. Or start with the bundled samples."
        >
          <Button icon="download" loading={seeding} onClick={() => void loadSamples()}>
            Load Sample Templates
          </Button>
          <Button variant="secondary" icon="plus" onClick={openAdd}>
            Upload Your Own
          </Button>
        </EmptyState>
      ) : null}

      <AddTemplateDialog open={addOpen} onClose={() => setAddOpen(false)} onCreated={() => void refresh()} />
      <ConfirmDialog
        open={confirmDelete !== null}
        title="Delete template?"
        message={`"${confirmDelete?.name}" and its field mapping will be permanently deleted. The template file will also be removed. Generated forms are kept.`}
        confirmLabel="Delete"
        danger
        loading={busyAction !== null && confirmDelete !== null && busyAction === confirmDelete.id}
        onConfirm={() => void onDelete()}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  )
}

function ActionButton({
  title,
  icon,
  onClick,
  danger,
  loading,
}: {
  title: string
  icon: Parameters<typeof Icon>[0]['name']
  onClick: () => void
  danger?: boolean
  loading?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={
        'rounded-md p-1.5 transition-colors ' +
        (danger
          ? 'text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/50 dark:hover:text-rose-400'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200')
      }
    >
      {loading ? (
        <span className="block h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        <Icon name={icon} size={15} />
      )}
    </button>
  )
}

function AddTemplateDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<TemplateCategory>('HR')
  const [filePath, setFilePath] = useState<string | null>(null)
  const [fileName, setFileName] = useState('')
  const [saving, setSaving] = useState(false)

  const pickFile = async (): Promise<void> => {
    try {
      const p = await api.dialogs.pickExcelFile()
      if (!p) return
      setFilePath(p)
      setFileName(p.split(/[\\/]/).pop() ?? p)
      if (!name) setName(p.split(/[\\/]/).pop()?.replace(/\.(xlsx|xlsm)$/i, '') ?? '')
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const submit = async (): Promise<void> => {
    if (!name.trim()) {
      toast('error', 'Please enter a template name.')
      return
    }
    if (!filePath) {
      toast('error', 'Please select an .xlsx template file.')
      return
    }
    setSaving(true)
    try {
      const t = await api.templates.create({
        name: name.trim(),
        description: description.trim(),
        category,
        sourcePath: filePath,
        status: 'active',
      })
      toast('success', `Template "${t.name}" added. Now map its fields.`)
      onCreated()
      onClose()
      setName('')
      setDescription('')
      setFilePath(null)
      setFileName('')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Add Template"
      description="The Excel file is copied into the application's template folder — your original file is never modified."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button icon="upload" loading={saving} onClick={() => void submit()}>
            Add Template
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Button variant="secondary" icon="folder" onClick={() => void pickFile()} className="w-full justify-center border-dashed">
          {filePath ? `Selected: ${fileName}` : 'Choose .xlsx file…'}
        </Button>
        <Input label="Template name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. HR Requirement Form" />
        <Input label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this template used for?" />
        <Select
          label="Category"
          value={category}
          onChange={(e) => setCategory(e.target.value as TemplateCategory)}
          options={CATEGORIES.map((c) => ({ value: c, label: c }))}
        />
      </div>
    </Dialog>
  )
}
