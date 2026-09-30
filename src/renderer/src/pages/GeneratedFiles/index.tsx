import { useCallback, useEffect, useMemo, useState } from 'react'
import { api } from '../../services/api'
import { Card } from '../../components/ui/Card'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Select } from '../../components/ui/Field'
import { ConfirmDialog } from '../../components/ui/Dialog'
import { Table, type Column } from '../../components/ui/Table'
import { PageHeader } from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import { formatDateDDMMYYYY } from '../../../../shared/validation'
import type { GeneratedFile, Template } from '../../../../shared/types'

const SOURCE_LABELS: Record<string, string> = {
  manual: 'Manual',
  text: 'Text',
  excel: 'Excel/CSV',
  ai: 'AI Extracted',
  employees: 'Employee list',
}

export default function GeneratedFiles() {
  const { toast } = useToast()
  const [files, setFiles] = useState<GeneratedFile[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [templateFilter, setTemplateFilter] = useState('')
  const [toDelete, setToDelete] = useState<GeneratedFile | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    void api.templates.list().then((r) => setTemplates(r.templates)).catch(() => undefined)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const result = await api.files.list({
        search: search || undefined,
        templateId: templateFilter || undefined,
      })
      setFiles(result.files)
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, templateFilter])

  useEffect(() => {
    const t = window.setTimeout(() => void refresh(), search ? 250 : 0)
    return () => window.clearTimeout(t)
  }, [refresh, search])

  const open = async (f: GeneratedFile): Promise<void> => {
    try {
      await api.files.open(f.id)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const reveal = async (f: GeneratedFile): Promise<void> => {
    try {
      await api.files.reveal(f.id)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const regenerate = async (f: GeneratedFile): Promise<void> => {
    setBusy(f.id)
    try {
      await api.files.regenerate(f.id)
      toast('success', `Regenerated ${f.fileName}.`)
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const onDelete = async (): Promise<void> => {
    if (!toDelete) return
    setBusy(toDelete.id)
    try {
      await api.files.remove(toDelete.id)
      toast('success', `${toDelete.fileName} deleted.`)
      setToDelete(null)
      await refresh()
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setBusy(null)
    }
  }

  const columns = useMemo<Column<GeneratedFile>[]>(
    () => [
      {
        key: 'file',
        header: 'File',
        render: (f) => (
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
              <Icon name="file" size={15} />
            </span>
            <div className="min-w-0">
              <div className="truncate font-medium text-slate-800 dark:text-slate-100">{f.fileName}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">{SOURCE_LABELS[f.source] ?? f.source}</div>
            </div>
          </div>
        ),
      },
      {
        key: 'template',
        header: 'Template',
        render: (f) => f.templateName ?? <span className="text-slate-300 dark:text-slate-600">—</span>,
      },
      {
        key: 'employee',
        header: 'Employee',
        render: (f) => f.employeeName ?? <span className="text-slate-300 dark:text-slate-600">—</span>,
      },
      {
        key: 'created',
        header: 'Created',
        render: (f) => <span className="text-xs text-slate-400 dark:text-slate-500">{formatDateDDMMYYYY(f.createdAt)}</span>,
      },
      {
        key: 'status',
        header: 'Status',
        render: (f) => (
          <Badge tone={statusTone(f.status)}>{f.status}</Badge>
        ),
      },
      {
        key: 'actions',
        header: <span className="sr-only">Actions</span>,
        className: 'text-right',
        render: (f) => (
          <div className="flex items-center justify-end gap-1">
            <FileAction title="Open" icon="open" onClick={() => void open(f)} />
            <FileAction title="Show in folder" icon="reveal" onClick={() => void reveal(f)} />
            <FileAction
              title="Regenerate (overwrites the file)"
              icon="refresh"
              loading={busy === f.id}
              disabled={!f.dataSnapshot}
              onClick={() => void regenerate(f)}
            />
            <FileAction title="Delete" icon="trash" danger onClick={() => setToDelete(f)} />
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [busy],
  )

  return (
    <div>
      <PageHeader title="Generated Files" subtitle="Every form generated by the application, with full traceability." />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative w-72">
          <Icon name="search" size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search files, employees, templates…"
            className="h-9 w-full rounded-lg border border-slate-300 bg-white pl-9 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
          />
        </div>
        <Select
          value={templateFilter}
          onChange={(e) => setTemplateFilter(e.target.value)}
          options={[{ value: '', label: 'All templates' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
          className="w-60"
        />
        <span className="ml-auto text-xs text-slate-400 dark:text-slate-500">{files.length} files</span>
      </div>

      <Card>
        <Table
          columns={columns}
          rows={files}
          rowKey={(f) => f.id}
          loading={loading}
          emptyMessage="No generated files yet. Head to the Generator page to create your first form."
        />
      </Card>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete generated file?"
        message={`"${toDelete?.fileName}" will be removed from disk and from this list. This cannot be undone.`}
        confirmLabel="Delete"
        danger
        loading={busy !== null && toDelete !== null && busy === toDelete.id}
        onConfirm={() => void onDelete()}
        onClose={() => setToDelete(null)}
      />
    </div>
  )
}

function FileAction({
  title,
  icon,
  onClick,
  danger,
  disabled,
  loading,
}: {
  title: string
  icon: Parameters<typeof Icon>[0]['name']
  onClick: () => void
  danger?: boolean
  disabled?: boolean
  loading?: boolean
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled || loading}
      className={
        'rounded-md p-1.5 disabled:cursor-not-allowed disabled:opacity-30 ' +
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
