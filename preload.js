const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  platform: process.platform,

  // ── Window ────────────────────────────────────────────────────
  window: {
    minimize:    ()    => ipcRenderer.invoke('window:minimize'),
    maximize:    ()    => ipcRenderer.invoke('window:maximize'),
    close:       ()    => ipcRenderer.invoke('window:close'),
    isMaximized: ()    => ipcRenderer.invoke('window:isMaximized'),
    onMaximized: (cb)  => ipcRenderer.on('window:maximized', (_, v) => cb(v)),
  },

  // ── Store ─────────────────────────────────────────────────────
  store: {
    get: (key)         => ipcRenderer.invoke('store:get', key),
    set: (key, value)  => ipcRenderer.invoke('store:set', key, value),
  },

  // ── FFmpeg ────────────────────────────────────────────────────
  ffmpeg: {
    check: () => ipcRenderer.invoke('ffmpeg:check'),
  },

  // ── Dialogs ───────────────────────────────────────────────────
  dialog: {
    openFolder:  ()                       => ipcRenderer.invoke('dialog:openFolder'),
    openFile:    (filters)                => ipcRenderer.invoke('dialog:openFile', filters),
    saveFile:    (filters, defaultName)   => ipcRenderer.invoke('dialog:saveFile', filters, defaultName),
  },

  // ── Shell ─────────────────────────────────────────────────────
  shell: {
    openPath:      (p)         => ipcRenderer.invoke('shell:openPath', p),
    showInFolder:  (p)         => ipcRenderer.invoke('shell:showInFolder', p),
    writeTextFile: (p, text)   => ipcRenderer.invoke('shell:writeTextFile', p, text),
    openExternal:  (url)       => ipcRenderer.invoke('shell:openExternal', url),
  },

  // ── App ────────────────────────────────────────────────────────
  getVersion: () => ipcRenderer.invoke('app:getVersion'),

  // ── File scanner ──────────────────────────────────────────────
  files: {
    scan:          (folder, opts) => ipcRenderer.invoke('files:scan', folder, opts),
    getProperties: (filePath)     => ipcRenderer.invoke('files:getProperties', filePath),
    getCover:      (filePath)     => ipcRenderer.invoke('files:getCover', filePath),
    readOne:       (filePath)     => ipcRenderer.invoke('files:readOne', filePath),
  },

  // ── Shell Extension ───────────────────────────────────────────
  shellExt: {
    isRegistered: ()  => ipcRenderer.invoke('shellext:isRegistered'),
    register:     ()  => ipcRenderer.invoke('shellext:register'),
    unregister:   ()  => ipcRenderer.invoke('shellext:unregister'),
  },

  // ── CLI open event ────────────────────────────────────────────
  onCliOpen: (cb) => ipcRenderer.on('cli:open', (_, data) => cb(data)),

  // ── Backup management ─────────────────────────────────────────
  backup: {
    getInfo:   () => ipcRenderer.invoke('backup:getInfo'),
    deleteAll: () => ipcRenderer.invoke('backup:deleteAll'),
  },

  // ── Auto-updater ──────────────────────────────────────────────
  updater: {
    // manual=true means the user pressed the button — it must not consume
    // the daily background-check window
    check:          (manual = true) => ipcRenderer.invoke('updater:check', manual),
    install:        ()    => ipcRenderer.invoke('updater:install'),
    accept:         ()    => ipcRenderer.invoke('updater:accept'),
    skip:           (v)   => ipcRenderer.invoke('updater:skip', v),
    onUpdated:      (cb)  => ipcRenderer.on('updater:updated',       (_, d) => cb(d)),
    onDownloading:  (cb)  => ipcRenderer.on('updater:downloading',   (_, d) => cb(d)),
    isPortable:     ()    => ipcRenderer.invoke('updater:isPortable'),
    isPackaged:     ()    => ipcRenderer.invoke('updater:isPackaged'),
    isMac:          ()    => ipcRenderer.invoke('updater:isMac'),
    onAvailable:    (cb)  => ipcRenderer.on('updater:available',     (_, d) => cb(d)),
    onNotAvailable: (cb)  => ipcRenderer.on('updater:not-available', ()    => cb()),
    onDownloaded:   (cb)  => ipcRenderer.on('updater:downloaded',    (_, d) => cb(d)),
    onProgress:     (cb)  => ipcRenderer.on('updater:progress',      (_, d) => cb(d)),
    onError:        (cb)  => ipcRenderer.on('updater:error',         (_, m) => cb(m)),
  },

  // ── Conversion ────────────────────────────────────────────────
  convert: {
    sampleRate: (files, options) => ipcRenderer.invoke('convert:sampleRate', files, options),
    format:     (files, options) => ipcRenderer.invoke('convert:format',     files, options),
    cancel:     (tab)            => ipcRenderer.invoke('convert:cancel', tab),
    // Streaming events (register once in app.js, fan out via DOM events)
    onProgress: (cb) => ipcRenderer.on('convert:progress', (_, d) => cb(d)),
    onLog:      (cb) => ipcRenderer.on('convert:log',      (_, m) => cb(m)),
  },

  // ── Metadata ──────────────────────────────────────────────────
  metadata: {
    write:             (filePath, tags, coverPath)  => ipcRenderer.invoke('metadata:write', filePath, tags, coverPath),
    batchRename:       (files, pattern)             => ipcRenderer.invoke('metadata:batchRename', files, pattern),
    applyTrackNumbers: (assignments)                => ipcRenderer.invoke('metadata:applyTrackNumbers', assignments),
  },

  // ── History ───────────────────────────────────────────────────
  history: {
    get:   (type)             => ipcRenderer.invoke('history:get',   type),
    add:   (type, desc, files)=> ipcRenderer.invoke('history:add',   type, desc, files),
    undo:  (id)               => ipcRenderer.invoke('history:undo',  id),
    clear: (type)             => ipcRenderer.invoke('history:clear', type),
  },
})
