import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface TabItem {
  id: string
  label: string
  badge?: string | number
}

export function Tabs({
  tabs,
  active,
  onChange,
  className,
}: {
  tabs: TabItem[]
  active: string
  onChange: (id: string) => void
  className?: string
}) {
  return (
    <div className={cn('flex gap-1 rounded-lg bg-slate-200/70 p-1 dark:bg-slate-800/70', className)}>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-colors',
            active === tab.id
              ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-950 dark:text-white'
              : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200',
          )}
        >
          {tab.label}
          {tab.badge !== undefined ? (
            <span className="rounded-full bg-indigo-100 px-1.5 text-[10px] font-semibold text-indigo-700 dark:bg-indigo-900/60 dark:text-indigo-300">
              {tab.badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  )
}

export function TabPanel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className}>{children}</div>
}
