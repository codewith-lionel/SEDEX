import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { cn } from '../../utils/cn'
import { Icon } from './Icons'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  type: ToastType
  message: string
}

interface ToastContextValue {
  toast: (type: ToastType, message: string) => void
}

const ToastContext = createContext<ToastContextValue>({ toast: () => undefined })

export function useToast(): ToastContextValue {
  return useContext(ToastContext)
}

const STYLES: Record<ToastType, { classes: string; icon: 'check' | 'error' | 'info' }> = {
  success: { classes: 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200', icon: 'check' },
  error: { classes: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200', icon: 'error' },
  info: { classes: 'border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-200', icon: 'info' },
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const toast = useCallback((type: ToastType, message: string) => {
    const id = nextId.current++
    setItems((prev) => [...prev.slice(-4), { id, type, message }])
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id))
    }, 5000)
  }, [])

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-96 flex-col gap-2">
        {items.map((t) => (
          <div
            key={t.id}
            className={cn(
              'pointer-events-auto flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm shadow-lg',
              STYLES[t.type].classes,
            )}
          >
            <Icon name={STYLES[t.type].icon} size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="opacity-50 hover:opacity-100"
              aria-label="Dismiss"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
