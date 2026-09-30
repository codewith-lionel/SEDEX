import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

type Tone = 'neutral' | 'success' | 'warning' | 'danger' | 'info' | 'indigo'

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  success: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
  warning: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300',
  info: 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300',
  indigo: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300',
}

export function Badge({ tone = 'neutral', className, children }: { tone?: Tone; className?: string; children: ReactNode }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', TONES[tone], className)}>
      {children}
    </span>
  )
}

export function statusTone(status: string): Tone {
  switch (status) {
    case 'completed':
    case 'active':
      return 'success'
    case 'failed':
      return 'danger'
    case 'inactive':
      return 'neutral'
    default:
      return 'neutral'
  }
}
