import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../services/api'
import { Card, CardContent } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge, statusTone } from '../../components/ui/Badge'
import { Icon, type IconName } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import { formatDateDDMMYYYY } from '../../../../shared/validation'
import type { GeneratedFile, Template } from '../../../../shared/types'

interface Stats {
  templates: number
  generated: number
  employees: number
  activeTemplates: number
}

export default function Dashboard() {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [stats, setStats] = useState<Stats | null>(null)
  const [recentTemplates, setRecentTemplates] = useState<Template[]>([])
  const [recentFiles, setRecentFiles] = useState<GeneratedFile[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [templates, files, employees] = await Promise.all([
          api.templates.list(),
          api.files.list(),
          api.employees.list(),
        ])
        if (cancelled) return
        setStats({
          templates: templates.count,
          generated: files.count,
          employees: employees.count,
          activeTemplates: templates.templates.filter((t) => t.status === 'active').length,
        })
        setRecentTemplates(templates.templates.slice(0, 5))
        setRecentFiles(files.files.slice(0, 5))
      } catch (err) {
        toast('error', (err as Error).message)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const statsCards: Array<{ label: string; value: number; icon: IconName; to: string }> = [
    { label: 'Templates', value: stats?.templates ?? 0, icon: 'templates', to: '/templates' },
    { label: 'Generated Forms', value: stats?.generated ?? 0, icon: 'files', to: '/generated-files' },
    { label: 'Employees', value: stats?.employees ?? 0, icon: 'employees', to: '/employees' },
    { label: 'Active Templates', value: stats?.activeTemplates ?? 0, icon: 'zap', to: '/templates' },
  ]

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">Dashboard</h1>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Overview of your HR audit documentation workspace.
          </p>
        </div>
        <div className="flex gap-2">
          <Link to="/templates?add=1">
            <Button variant="secondary" icon="plus">
              Add Template
            </Button>
          </Link>
          <Link to="/generate">
            <Button icon="generate">Generate Form</Button>
          </Link>
        </div>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statsCards.map((c) => (
          <button
            key={c.label}
            onClick={() => navigate(c.to)}
            className="text-left"
          >
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-center gap-4">
                <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-950/60 dark:text-indigo-300">
                  <Icon name={c.icon} size={20} />
                </div>
                <div>
                  <div className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-white">
                    {loading ? '—' : c.value}
                  </div>
                  <div className="text-xs text-slate-400 dark:text-slate-500">{c.label}</div>
                </div>
              </CardContent>
            </Card>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Templates</h3>
            <Link to="/templates" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentTemplates.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                <p>
                  No templates yet.{' '}
                  <Link to="/templates?add=1" className="text-indigo-600 hover:underline dark:text-indigo-400">
                    Add your first template
                  </Link>{' '}
                  or{' '}
                  <Link to="/templates" className="text-indigo-600 hover:underline dark:text-indigo-400">
                    load the bundled samples
                  </Link>
                  .
                </p>
              </div>
            )}
            {recentTemplates.map((t) => (
              <button
                key={t.id}
                onClick={() => navigate(`/templates/${t.id}`)}
                className="flex w-full items-center gap-3 px-5 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                  <Icon name="templates" size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{t.name}</div>
                  <div className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {t.fileName} · updated {formatDateDDMMYYYY(t.updatedAt)}
                  </div>
                </div>
                <Badge tone="indigo">{t.category}</Badge>
              </button>
            ))}
          </div>
        </Card>

        <Card>
          <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 dark:border-slate-800">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Recent Generated Files</h3>
            <Link to="/generated-files" className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              View all
            </Link>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {recentFiles.length === 0 && (
              <div className="px-5 py-8 text-center text-sm text-slate-400">
                No generated forms yet.{' '}
                <Link to="/generate" className="text-indigo-600 hover:underline dark:text-indigo-400">
                  Generate your first form
                </Link>
                .
              </div>
            )}
            {recentFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400">
                  <Icon name="file" size={15} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{f.fileName}</div>
                  <div className="truncate text-xs text-slate-400 dark:text-slate-500">
                    {f.templateName ?? '—'} · {f.employeeName ?? '—'} · {formatDateDDMMYYYY(f.createdAt)}
                  </div>
                </div>
                <Badge tone={statusTone(f.status)}>{f.status}</Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}
