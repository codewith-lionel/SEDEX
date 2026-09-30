import { BrowserRouter, Route, Routes, Navigate } from 'react-router-dom'
import { ThemeProvider } from './hooks/useTheme'
import { ToastProvider } from './components/ui/Toast'
import { AppShell } from './components/layout/AppShell'
import Dashboard from './pages/Dashboard'
import Templates from './pages/Templates'
import TemplateEditor from './pages/TemplateEditor'
import Generator from './pages/Generator'
import Employees from './pages/Employees'
import GeneratedFiles from './pages/GeneratedFiles'
import Settings from './pages/Settings'

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <ToastProvider>
          <Routes>
            <Route element={<AppShell />}>
              <Route index element={<Dashboard />} />
              <Route path="templates" element={<Templates />} />
              <Route path="templates/:templateId" element={<TemplateEditor />} />
              <Route path="generate" element={<Generator />} />
              <Route path="generate/:templateId" element={<Generator />} />
              <Route path="employees" element={<Employees />} />
              <Route path="generated-files" element={<GeneratedFiles />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </ToastProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
