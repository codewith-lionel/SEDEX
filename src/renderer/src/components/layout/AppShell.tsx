import { NavLink, Outlet } from 'react-router-dom'
import { Icon, type IconName } from '../ui/Icons'
import { useTheme } from '../../hooks/useTheme'
import { cn } from '../../utils/cn'
import { APP_NAME } from '../../../../shared/constants'

const NAV: Array<{ to: string; label: string; icon: IconName }> = [
  { to: '/', label: 'Dashboard', icon: 'dashboard' },
  { to: '/templates', label: 'Templates', icon: 'templates' },
  { to: '/generate', label: 'Generate', icon: 'generate' },
  { to: '/employees', label: 'Employees', icon: 'employees' },
  { to: '/generated-files', label: 'Generated Files', icon: 'files' },
  { to: '/settings', label: 'Settings', icon: 'settings' },
]

export function AppShell() {
  const { theme, setTheme } = useTheme()
  const nextTheme: Record<typeof theme, { icon: IconName; label: string; next: typeof theme }> = {
    system: { icon: 'monitor', label: 'Theme: System', next: 'light' },
    light: { icon: 'sun', label: 'Theme: Light', next: 'dark' },
    dark: { icon: 'moon', label: 'Theme: Dark', next: 'system' },
  }

  return (
    <div className="flex h-full">
      <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2.5 border-b border-slate-100 px-4 py-4 dark:border-slate-800">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white">
            <Icon name="check" size={18} />
          </div>
          <div className="leading-tight">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">HR Audit</div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500">Form Generator</div>
          </div>
        </div>

        <nav className="flex-1 space-y-0.5 overflow-y-auto p-3">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100',
                )
              }
            >
              <Icon name={item.icon} size={17} />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="space-y-2 border-t border-slate-100 p-3 dark:border-slate-800">
          <button
            onClick={() => setTheme(nextTheme[theme].next)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            title={nextTheme[theme].label}
          >
            <Icon name={nextTheme[theme].icon} size={17} />
            {nextTheme[theme].label}
          </button>
          <p className="px-3 text-[10px] leading-relaxed text-slate-300 dark:text-slate-600">
            {APP_NAME} v1.0.0
            <br />
            Local desktop app — data never leaves this computer (except optional AI extraction).
          </p>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-6xl px-8 py-7">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
