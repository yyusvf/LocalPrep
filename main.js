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
  // Drop backups no history entry points at any more. Anything still
  // referenced stays, so Undo keeps working across restarts.
  try {
    const removed = require('./backend/backups').cleanupOrphans()
    if (removed) console.log(`Backup cleanup: removed ${removed} orphaned backup(s)`)
  } catch (err) {
    console.warn('Orphan backup cleanup failed:', err.message)
  }
}

// ── Auto-updater ───────────────────────────────────────────────────
// Behaviour follows the update spec:
//   store keys  updateBehavior ('auto'|'ask'|'never'), lastUpdateCheck (ISO UTC),
//               skippedVersion, lastRunVersion
//   • 'never' aborts before any network request is made
//   • only background checks stamp lastUpdateCheck — a manual check must not
//     consume the daily window, or the automatic one would never fire again
//   • a declined version is remembered by version number, not by date

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000   // one day

function _updaterDisabledReason() {
  if (!app.isPackaged) return 'dev'
  if (IS_PORTABLE)     return 'portable'   // an installer cannot replace a portable exe
  if (isDarwin)        return 'mac'        // unsigned build — electron-updater needs signing
  return null
}

function _setupAutoUpdater() {
  if (_updaterReady) return
  _updaterReady = true

  const store = require('./backend/store')
  const send  = (ch, data) => { if (mainWindow?.webContents) mainWindow.webContents.send(ch, data) }

  // Always available so the renderer can render the right UI
  ipcMain.handle('updater:isPortable', () => IS_PORTABLE)
  ipcMain.handle('updater:isPackaged', () => app.isPackaged)
  ipcMain.handle('updater:isMac',      () => isDarwin)

  // ── "We just updated" notice ───────────────────────────────────
  // Runs regardless of mode: the version changed either way.
  const current = require('./package.json').version
  const lastRun = store.get('lastRunVersion')
  if (lastRun && lastRun !== current) {
    mainWindow.once('ready-to-show', () => send('updater:updated', { version: current, from: lastRun }))
    store.set('skippedVersion', null)   // a decline is void once the version changed
  }
  store.set('lastRunVersion', current)

  const disabled = _updaterDisabledReason()
  if (disabled) {
    // Stub the action channels so invoke() doesn't throw, and check nothing.
    ipcMain.handle('updater:check',   () => ({ status: 'disabled', reason: disabled }))
    ipcMain.handle('updater:install', () => null)
    ipcMain.handle('updater:accept',  () => null)
    ipcMain.handle('updater:skip',    () => null)
    return
  }

  let autoUpdater
  try {
    ({ autoUpdater } = require('electron-updater'))
  } catch (err) {
    console.warn('Auto-updater unavailable:', err.message)
    ipcMain.handle('updater:check',   () => ({ status: 'disabled', reason: 'unavailable' }))
    ipcMain.handle('updater:install', () => null)
    ipcMain.handle('updater:accept',  () => null)
    ipcMain.handle('updater:skip',    () => null)
    return
  }

  // We drive download and install ourselves so the behaviour setting decides.
  autoUpdater.autoDownload         = false
  autoUpdater.autoInstallOnAppQuit = false

  let pending = null   // the found update, kept until the user answers

  autoUpdater.on('download-progress', prog => send('updater:progress',   prog))
  autoUpdater.on('update-downloaded', info => send('updater:downloaded', info))
  autoUpdater.on('error',             err  => send('updater:error', err?.message || String(err)))

  /**
   * @param {boolean} manual  true when the user pressed "Check now"
   * @returns {Promise<{status:string, version?:string, reason?:string}>}
   */
  async function _check(manual) {
    const behavior = store.get('updateBehavior') || 'ask'

    // "Never" means never — bail out before a single packet leaves the machine.
    // Manual included: the setting promises silence, and the only way to keep
    // that promise is not to ask in the first place.
    if (behavior === 'never') return { status: 'off' }

    if (!manual) {
      const last = Date.parse(store.get('lastUpdateCheck') || '')
      if (!isNaN(last) && Date.now() - last < CHECK_INTERVAL_MS) {
        return { status: 'throttled' }
      }
    }

    let result
    try {
      result = await autoUpdater.checkForUpdates()
    } catch (err) {
      // A failed check is a non-event in the background; only a manual one reports
      if (manual) return { status: 'error', reason: err?.message || String(err) }
      return { status: 'error' }
    } finally {
      // Only the background check consumes the daily window
      if (!manual) store.set('lastUpdateCheck', new Date().toISOString())
    }

    const version = result?.updateInfo?.version
    if (!version || version === current) {
      send('updater:not-available')
      return { status: 'up-to-date' }
    }

    pending = { version, info: result.updateInfo }

    // ── Decision chain ───────────────────────────────────────────
    // 1. auto → install without asking
    if (behavior === 'auto') {
      _startInstall(true)
      return { status: 'installing', version }
    }
    // 2. already declined → stay quiet, unless the user asked just now
    if (!manual && store.get('skippedVersion') === version) {
      return { status: 'skipped', version }
    }
    // 3. window not visible → no unsolicited dialog; the renderer's banner
    //    carries it until the window comes back
    send('updater:available', { ...result.updateInfo, ask: mainWindow?.isVisible() !== false })
    return { status: 'available', version }
  }

  async function _startInstall(silent) {
    try {
      send('updater:downloading', { version: pending?.version })
      await autoUpdater.downloadUpdate()
      // electron-updater spawns the installer detached and waits for this
      // process to exit, which is what keeps the silent install from being
      // cancelled by NSIS's "app is still running" check.
      autoUpdater.quitAndInstall(silent, true)
    } catch (err) {
      send('updater:error', err?.message || String(err))
    }
  }

  ipcMain.handle('updater:check',   (_e, manual = true) => _check(!!manual))
  ipcMain.handle('updater:install', () => _startInstall(false))
  ipcMain.handle('updater:accept',  () => _startInstall(false))
  ipcMain.handle('updater:skip',    (_e, version) => {
    store.set('skippedVersion', version || pending?.version || null)
  })

  // Background check shortly after the window is up — never blocking startup
  mainWindow.once('ready-to-show', () => {
    setTimeout(() => { _check(false).catch(() => {}) }, 5000)
  })
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
  const store = require('./backend/store')
  options.backupFolder   = store.get('backupFolder')
  options.defaultBitrate = store.get('defaultBitrate') || '320k'
  const { convertSampleRate } = require('./backend/converterSR')
  return convertSampleRate(
    files, options,
    (data) => event.sender.send('convert:progress', data),
    (msg)  => event.sender.send('convert:log',      msg)
  )
})

// ── Format conversion ──────────────────────────────────────────────
ipcMain.handle('convert:format', async (event, files, options) => {
  const store = require('./backend/store')
  options.backupFolder   = store.get('backupFolder')
  options.defaultBitrate = store.get('defaultBitrate') || '320k'
  const { convertFormat } = require('./backend/converterFormat')
  return convertFormat(
    files, options,
    (data) => event.sender.send('convert:progress', data),
    (msg)  => event.sender.send('convert:log',      msg)
  )
})

// ── Backup management ──────────────────────────────────────────────
ipcMain.handle('backup:getInfo',   () => require('./backend/backups').getInfo())
ipcMain.handle('backup:deleteAll', () => require('./backend/backups').deleteAll())

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
  // Drop backups older than the configured retention before anything else
  // touches the history — entries then correctly show up as non-undoable.
  try {
    const removed = require('./backend/backups').cleanupExpired()
    if (removed) console.log(`Backup cleanup: removed ${removed} expired backup(s)`)
  } catch (err) {
    console.warn('Backup cleanup failed:', err.message)
  }
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (!isDarwin) app.quit() })
