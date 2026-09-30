import { app, BrowserWindow, session, shell } from 'electron'
import path from 'node:path'
import { registerAllIpc } from './ipc'
import { ensureDir, getDefaultOutputFolder, getDefaultTemplateFolder } from './services/files/fileService'
import { getDb } from './services/database/db'

let mainWindow: BrowserWindow | null = null

// Single instance: focus the existing window instead of opening a second one.
const gotTheLock = app.requestSingleInstanceLock()
if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  app.whenReady().then(onReady)
}

function applyProductionCsp(): void {
  if (!app.isPackaged) return
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'",
        ],
      },
    })
  })
}

function onReady(): void {
  app.setAppUserModelId('com.sedex.hr-audit-form-generator')
  applyProductionCsp()
  // Make sure the default folders exist before any IPC runs.
  ensureDir(getDefaultOutputFolder())
  ensureDir(getDefaultTemplateFolder())
  // Open the database (runs migrations) up front so first IPC is fast.
  getDb()
  registerAllIpc()
  createMainWindow()
}

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'HR Audit Form Generator',
    backgroundColor: '#f1f5f9',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      // Secure architecture: the renderer has zero Node.js access.
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      spellcheck: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // Never let the app navigate away from its own content.
  const devServerUrl = process.env.VITE_DEV_SERVER_URL
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (devServerUrl && url.startsWith(devServerUrl)) return
    event.preventDefault()
  })

  // External links open in the default browser; no new Electron windows.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  if (devServerUrl) {
    void mainWindow.loadURL(devServerUrl)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createMainWindow()
})
