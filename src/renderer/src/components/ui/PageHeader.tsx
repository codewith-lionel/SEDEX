import type { ReactNode } from 'react'
import { Icon } from './Icons'

export function PageHeader({
  title,
  subtitle,
  back,
  children,
}: {
  title: string
  subtitle?: string
  back?: { label: string; onClick: () => void }
  children?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        {back ? (
          <button
            onClick={back.onClick}
            className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label={back.label}
          >
            <Icon name="chevron-left" size={16} />
          </button>
        ) : null}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">{title}</h1>
          {subtitle ? <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p> : null}
        </div>
      </div>
      {children ? <div className="flex flex-wrap items-center gap-2">{children}</div> : null}
    </div>
  )
}
