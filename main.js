const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron')
const path = require('path')

const isDarwin    = process.platform === 'darwin'
const IS_PORTABLE = !!process.env.PORTABLE_EXECUTABLE_DIR
let mainWindow
let _updaterReady = false   // guard: ipcMain.handle() can only be called once per channel

// ── CLI argument parser ────────────────────────────────────────────
function parseArgs(argv) {
  let tab = null, file = null, folder = null
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--tab'    && argv[i + 1]) tab    = argv[++i]
    if (argv[i] === '--file'   && argv[i + 1]) file   = argv[++i]
    if (argv[i] === '--folder' && argv[i + 1]) folder = argv[++i]
  }
  return { tab, file, folder }
}

// ── Single-instance lock ───────────────────────────────────────────
// Second launch → send args to existing window then quit.
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, argv) => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
    const { tab, file, folder } = parseArgs(argv)
    if (tab || file || folder) mainWindow.webContents.send('cli:open', { tab, file, folder })
  })
}

// ── Window creation ────────────────────────────────────────────────
function createWindow() {
  const Store  = require('./backend/store')
  const bounds = Store.get('windowBounds') || { width: 1280, height: 800 }

  mainWindow = new BrowserWindow({
    width:     bounds.width,
    height:    bounds.height,
    minWidth:  960,
    minHeight: 640,
    backgroundColor: '#0a0a0a',
    show: false,
    ...(isDarwin
      ? { titleBarStyle: 'hidden', trafficLightPosition: { x: 14, y: 14 } }
      : { frame: false }
    ),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      sandbox:          false,
    },
  })

  _setupAutoUpdater()

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
    // Forward any CLI args from the initial launch to the renderer
    const { tab, file, folder } = parseArgs(process.argv)
    if (tab || file || folder) mainWindow.webContents.send('cli:open', { tab, file, folder })
  })

  mainWindow.on('maximize',   () => mainWindow.webContents.send('window:maximized', true))
  mainWindow.on('unmaximize', () => mainWindow.webContents.send('window:maximized', false))
  mainWindow.on('resize', () => {
    const [width, height] = mainWindow.getSize()
    require('./backend/store').set('windowBounds', { width, height })
  })
  mainWindow.on('close', _cleanupBackups)
}

function _cleanupBackups() {
  // Intentionally left as a no-op in dev.
  // In production the build step handles cleanup via the history entries.
}

// ── Auto-updater ───────────────────────────────────────────────────
function _setupAutoUpdater() {
  if (_updaterReady) return
  _updaterReady = true

  // These are always available so the renderer can query the mode
  ipcMain.handle('updater:isPortable', () => IS_PORTABLE)
  ipcMain.handle('updater:isPackaged', () => app.isPackaged)

  const send = (ch, data) => { if (mainWindow?.webContents) mainWindow.webContents.send(ch, data) }

  if (!app.isPackaged || IS_PORTABLE) {
    // Dev mode or portable — stub the action channels so invoke() doesn't throw
    ipcMain.handle('updater:check',   () => null)
    ipcMain.handle('updater:install', () => null)
    return
  }

  try {
    const { autoUpdater } = require('electron-updater')
    autoUpdater.autoDownload         = true   // download silently in background
    autoUpdater.autoInstallOnAppQuit = true   // install when user closes app

    autoUpdater.on('update-available',     info => send('updater:available',    info))
    autoUpdater.on('update-not-available', ()   => send('updater:not-available'))
    autoUpdater.on('update-downloaded',    info => send('updater:downloaded',   info))
    autoUpdater.on('download-progress',    prog => send('updater:progress',     prog))
    autoUpdater.on('error',               err  => send('updater:error',        err.message))

    ipcMain.handle('updater:check',   () => autoUpdater.checkForUpdates().catch(() => {}))
    ipcMain.handle('updater:install', () => autoUpdater.quitAndInstall(false, true))

    // Automatic background check 5 s after window is shown
    mainWindow.once('ready-to-show', () => {
      setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000)
    })
  } catch (err) {
    console.warn('Auto-updater unavailable:', err.message)
    ipcMain.handle('updater:check',   () => null)
    ipcMain.handle('updater:install', () => null)
  }
}

// ── Window controls ────────────────────────────────────────────────
ipcMain.handle('window:minimize',   () => mainWindow.minimize())
ipcMain.handle('window:maximize',   () => mainWindow.isMaximized() ? mainWindow.unmaximize() : mainWindow.maximize())
ipcMain.handle('window:close',      () => mainWindow.close())
ipcMain.handle('window:isMaximized',() => mainWindow.isMaximized())

// ── Store ──────────────────────────────────────────────────────────
ipcMain.handle('store:get', (_, key)        => require('./backend/store').get(key))
ipcMain.handle('store:set', (_, key, value) => require('./backend/store').set(key, value))

// ── FFmpeg ─────────────────────────────────────────────────────────
ipcMain.handle('ffmpeg:check', () => require('./backend/ffmpeg').checkFfmpeg())

// ── Dialogs ────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFolder', async () => {
  if (mainWindow) mainWindow.focus()
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory'] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('dialog:openFile', async (_, filters) => {
  if (mainWindow) mainWindow.focus()
  const r = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: filters || [] })
  return r.canceled ? null : r.filePaths[0]
})
ipcMain.handle('dialog:saveFile', async (_, filters, defaultName) => {
  if (mainWindow) mainWindow.focus()
  const r = await dialog.showSaveDialog(mainWindow, { defaultPath: defaultName, filters: filters || [] })
  return r.canceled ? null : r.filePath
})

// ── Shell ──────────────────────────────────────────────────────────
ipcMain.handle('shell:openPath',     (_, p)   => shell.openPath(p))
ipcMain.handle('shell:showInFolder', (_, p)   => shell.showItemInFolder(p))
ipcMain.handle('shell:openExternal', (_, url) => shell.openExternal(url))
ipcMain.handle('shell:writeTextFile', (_, filePath, text) => {
  require('fs').writeFileSync(filePath, text, 'utf8')
})

// ── App ────────────────────────────────────────────────────────────
ipcMain.handle('app:getVersion', () => require('./package.json').version)

// ── File scanner ───────────────────────────────────────────────────
ipcMain.handle('files:scan', async (_, folderPath, opts) => {
  const { scanFolder } = require('./backend/fileScanner')
  return scanFolder(folderPath, opts)
})
ipcMain.handle('files:getProperties', async (_, filePath) => {
  const { getFileProperties } = require('./backend/fileScanner')
  return getFileProperties(filePath)
})
ipcMain.handle('files:getCover', async (_, filePath) => {
  const { getCoverDataUrl } = require('./backend/fileScanner')
  return getCoverDataUrl(filePath)
})
ipcMain.handle('files:readOne', async (_, filePath) => {
  const { readFile } = require('./backend/fileScanner')
  return readFile(filePath)
})

// ── Shell Extension ────────────────────────────────────────────────
ipcMain.handle('shellext:isRegistered', () => {
  return require('./backend/shellExtension').isRegistered()
})
ipcMain.handle('shellext:register', async () => {
  await require('./backend/shellExtension').register()
})
ipcMain.handle('shellext:unregister', async () => {
  await require('./backend/shellExtension').unregister()
})

// ── Sample Rate conversion ─────────────────────────────────────────
ipcMain.handle('convert:sampleRate', async (event, files, options) => {
  const { convertSampleRate } = require('./backend/converterSR')
  return convertSampleRate(
    files, options,
    (data) => event.sender.send('convert:progress', data),
    (msg)  => event.sender.send('convert:log',      msg)
  )
})

// ── Format conversion ──────────────────────────────────────────────
ipcMain.handle('convert:format', async (event, files, options) => {
  const { convertFormat } = require('./backend/converterFormat')
  return convertFormat(
    files, options,
    (data) => event.sender.send('convert:progress', data),
    (msg)  => event.sender.send('convert:log',      msg)
  )
})

// ── Cancel ─────────────────────────────────────────────────────────
ipcMain.handle('convert:cancel', (_, tab) => {
  if (tab === 'sample-rate') require('./backend/converterSR').cancelConversion()
  else                       require('./backend/converterFormat').cancelConversion()
})

// ── Metadata ───────────────────────────────────────────────────────
ipcMain.handle('metadata:write', async (_, filePath, tags, coverPath) => {
  const { writeTags } = require('./backend/metadataWriter')
  return writeTags(filePath, tags, coverPath)
})
ipcMain.handle('metadata:batchRename', async (_, files, pattern) => {
  const { batchRename } = require('./backend/metadataWriter')
  return batchRename(files, pattern)
})
ipcMain.handle('metadata:applyTrackNumbers', async (_, assignments) => {
  const { applyTrackNumbers } = require('./backend/metadataWriter')
  return applyTrackNumbers(assignments)
})

// ── History ────────────────────────────────────────────────────────
ipcMain.handle('history:get',   (_, type)   => require('./backend/history').getHistory(type))
ipcMain.handle('history:add',   (_, type, desc, files) => require('./backend/history').addEntry(type, desc, files))
ipcMain.handle('history:undo',  (_, id)     => require('./backend/history').undoEntry(id))
ipcMain.handle('history:clear', (_, type)   => require('./backend/history').clearHistory(type))

// ── App lifecycle ──────────────────────────────────────────────────
app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (!isDarwin) app.quit() })
