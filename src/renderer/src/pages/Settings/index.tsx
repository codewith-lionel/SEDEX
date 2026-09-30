import { useEffect, useState } from 'react'
import { api } from '../../services/api'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { Badge } from '../../components/ui/Badge'
import { Checkbox, Input } from '../../components/ui/Field'
import { PageHeader } from '../../components/ui/PageHeader'
import { Icon } from '../../components/ui/Icons'
import { useToast } from '../../components/ui/Toast'
import { useTheme } from '../../hooks/useTheme'
import { DEFAULT_GEMINI_MODEL } from '../../../../shared/constants'
import type { AppSettings, ThemePreference } from '../../../../shared/types'

export default function Settings() {
  const { toast } = useToast()
  const { theme, setTheme } = useTheme()
  const [settings, setSettings] = useState<AppSettings | null>(null)

  // AI card
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState(DEFAULT_GEMINI_MODEL)
  const [aiEnabled, setAiEnabled] = useState(false)
  const [showKey, setShowKey] = useState(false)
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  // Folder card
  const [outputFolder, setOutputFolder] = useState('')
  const [templateFolder, setTemplateFolder] = useState('')

  // Saving state per card
  const [savingAi, setSavingAi] = useState(false)
  const [savingFolders, setSavingFolders] = useState(false)

  useEffect(() => {
    // Load the full local settings (incl. real API key) for the form inputs.
    void api.settings.getRaw().then((s) => {
      setSettings(s)
      setApiKey(s.geminiApiKey)
      setModel(s.geminiModel || DEFAULT_GEMINI_MODEL)
      setAiEnabled(s.aiEnabled)
      setOutputFolder(s.outputFolder)
      setTemplateFolder(s.templateFolder)
    }).catch(() => undefined)
  }, [])

  const saveAi = async (): Promise<void> => {
    setSavingAi(true)
    try {
      await api.settings.set({
        geminiApiKey: apiKey.trim(),
        geminiModel: model.trim() || DEFAULT_GEMINI_MODEL,
        aiEnabled,
      })
      setTestResult(null)
      toast('success', 'AI settings saved.')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSavingAi(false)
    }
  }

  const testConnection = async (): Promise<void> => {
    setTesting(true)
    setTestResult(null)
    try {
      const res = await api.ai.test({ apiKeyOverride: apiKey.trim() || undefined })
      setTestResult(
        res.ok
          ? { ok: true, message: `Gemini connection successful (${res.latencyMs} ms, model ${model || DEFAULT_GEMINI_MODEL}).` }
          : { ok: false, message: res.error ?? 'Connection failed.' },
      )
    } catch (err) {
      setTestResult({ ok: false, message: (err as Error).message })
    } finally {
      setTesting(false)
    }
  }

  const pickOutput = async (): Promise<void> => {
    try {
      const p = await api.dialogs.pickFolder('Choose the output folder for generated forms')
      if (p) setOutputFolder(p)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const pickTemplates = async (): Promise<void> => {
    try {
      const p = await api.dialogs.pickFolder('Choose the template storage folder')
      if (p) setTemplateFolder(p)
    } catch (err) {
      toast('error', (err as Error).message)
    }
  }

  const saveFolders = async (): Promise<void> => {
    setSavingFolders(true)
    try {
      await api.settings.set({ outputFolder, templateFolder })
      toast('success', 'Folders saved.')
    } catch (err) {
      toast('error', (err as Error).message)
    } finally {
      setSavingFolders(false)
    }
  }

  const themeOptions: Array<{ value: ThemePreference; label: string; icon: 'monitor' | 'sun' | 'moon' }> = [
    { value: 'system', label: 'System', icon: 'monitor' },
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
  ]

  return (
    <div>
      <PageHeader title="Settings" subtitle="Application preferences are stored locally on this computer." />

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon name="sparkle" size={16} className="text-indigo-500" />
              <CardTitle>AI Data Extraction (Gemini)</CardTitle>
            </div>
            <Badge tone={aiEnabled ? 'success' : 'neutral'}>{aiEnabled ? 'Enabled' : 'Disabled'}</Badge>
          </CardHeader>
          <CardContent className="space-y-4">
            <Checkbox
              label="Enable AI extraction"
              hint="Adds an 'Extract with Gemini' option on the Generator page."
              checked={aiEnabled}
              onChange={(e) => setAiEnabled(e.target.checked)}
            />
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div>
                <div className="relative">
                  <input
                    type={showKey ? 'text' : 'password'}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your Gemini API key"
                    className="h-9 w-full rounded-lg border border-slate-300 bg-white px-3 pr-9 py-2 text-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                  />
                  <button
                    onClick={() => setShowKey((s) => !s)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                    title={showKey ? 'Hide key' : 'Show key'}
                  >
                    <Icon name={showKey ? 'eye-off' : 'eye'} size={15} />
                  </button>
                </div>
                <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
                  Stored only in the local database and sent directly to Google's API — never anywhere else.
                </p>
              </div>
              <Input label="Model" value={model} onChange={(e) => setModel(e.target.value)} placeholder={DEFAULT_GEMINI_MODEL} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button icon="key" loading={testing} onClick={() => void testConnection()} disabled={!apiKey.trim()}>
                Test Gemini Connection
              </Button>
              <Button icon="save" variant="secondary" loading={savingAi} onClick={() => void saveAi()}>
                Save AI Settings
              </Button>
            </div>
            {testResult ? (
              <p
                className={
                  'flex items-center gap-2 rounded-lg px-3 py-2 text-xs ' +
                  (testResult.ok
                    ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                    : 'bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300')
                }
              >
                <Icon name={testResult.ok ? 'check' : 'error'} size={14} />
                {testResult.ok ? '✓ Gemini connection successful' : '✕ Connection failed'} — {testResult.message}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon name="folder" size={16} className="text-indigo-500" />
              <CardTitle>Files</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Default output folder</p>
                <p className="truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  {outputFolder || '—'}
                </p>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" icon="folder" onClick={() => void pickOutput()} className="w-full">
                  Choose Output Folder
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="md:col-span-2">
                <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Template storage folder</p>
                <p className="truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
                  {templateFolder || '—'}
                </p>
              </div>
              <div className="flex items-end">
                <Button variant="secondary" icon="folder" onClick={() => void pickTemplates()} className="w-full">
                  Choose Template Folder
                </Button>
              </div>
            </div>
            <Button icon="save" variant="secondary" loading={savingFolders} onClick={() => void saveFolders()}>
              Save Folders
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon name="monitor" size={16} className="text-indigo-500" />
              <CardTitle>Appearance</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              {themeOptions.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setTheme(o.value)}
                  className={
                    'flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ' +
                    (theme === o.value
                      ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300'
                      : 'border-slate-200 text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800')
                  }
                >
                  <Icon name={o.icon} size={15} />
                  {o.label}
                </button>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon name="database" size={16} className="text-indigo-500" />
              <CardTitle>Database</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="mb-1.5 text-xs font-medium text-slate-600 dark:text-slate-300">Location</p>
            <p className="truncate rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-500 dark:bg-slate-950 dark:text-slate-400">
              {settings?.databasePath ?? '—'}
            </p>
            <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
              Templates, fields, employees, generated files and settings are stored in this local SQLite database.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Icon name="info" size={16} className="text-indigo-500" />
              <CardTitle>About this tool</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-xs leading-relaxed text-slate-500 dark:text-slate-400">
              HR Audit Form Generator is an assistant for organizing and populating HR / Sedex-SMETA documentation.
              It extracts, organizes, validates and tracks information so that <strong>you</strong> can review it.
              It does not make compliance decisions — final review of all generated documents remains with the
              responsible human user before any audit submission.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
