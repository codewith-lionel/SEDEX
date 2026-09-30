import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import type { ThemePreference } from '../../../shared/types'
import { api } from '../services/api'

interface ThemeContextValue {
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
}

const ThemeContext = createContext<ThemeContextValue>({ theme: 'system', setTheme: () => undefined })

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePreference>('system')

  useEffect(() => {
    void api.settings.get().then((s) => setThemeState(s.theme)).catch(() => undefined)
  }, [])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = (): void => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (next: ThemePreference): void => {
    setThemeState(next)
    void api.settings.set({ theme: next }).catch(() => undefined)
  }

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}
