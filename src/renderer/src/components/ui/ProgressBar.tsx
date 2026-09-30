import { cn } from '../../utils/cn'

export function ProgressBar({ value, max = 100, className }: { value: number; max?: number; className?: string }) {
  const pct = max <= 0 ? 0 : Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={cn('h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800', className)}>
      <div
        className="h-full rounded-full bg-indigo-600 transition-[width] duration-200"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
