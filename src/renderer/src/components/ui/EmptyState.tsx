import type { ReactNode } from 'react'
import { Icon, type IconName } from './Icons'

export function EmptyState({
  icon = 'file',
  title,
  message,
  children,
}: {
  icon?: IconName
  title: string
  message?: string
  children?: ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
        <Icon name={icon} size={22} />
      </div>
      <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-200">{title}</h3>
      {message ? <p className="max-w-sm text-xs text-slate-400 dark:text-slate-500">{message}</p> : null}
      {children ? <div className="mt-3 flex flex-wrap items-center justify-center gap-2">{children}</div> : null}
    </div>
  )
}
