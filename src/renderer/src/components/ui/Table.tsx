import type { ReactNode } from 'react'
import { cn } from '../../utils/cn'

export interface Column<T> {
  key: string
  header: ReactNode
  className?: string
  render: (row: T) => ReactNode
}

export interface TableProps<T> {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T, index: number) => string
  onRowClick?: (row: T) => void
  emptyMessage?: string
  loading?: boolean
}

export function Table<T>({ columns, rows, rowKey, onRowClick, emptyMessage, loading }: TableProps<T>) {
  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center">
        <span className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-500 border-t-transparent" />
      </div>
    )
  }
  if (rows.length === 0) {
    return <div className="py-12 text-center text-sm text-slate-400 dark:text-slate-500">{emptyMessage ?? 'Nothing here yet.'}</div>
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700">
            {columns.map((col) => (
              <th
                key={col.key}
                className={cn('px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500', col.className)}
              >
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={rowKey(row, i)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={cn(
                'border-b border-slate-100 last:border-0 dark:border-slate-800',
                onRowClick && 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/60',
              )}
            >
              {columns.map((col) => (
                <td key={col.key} className={cn('px-4 py-3 align-middle', col.className)}>
                  {col.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
