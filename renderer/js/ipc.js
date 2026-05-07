/* Thin wrapper around window.api — keeps tab modules clean */
const IPC = {
  window: {
    minimize:    ()    => window.api.window.minimize(),
    maximize:    ()    => window.api.window.maximize(),
    close:       ()    => window.api.window.close(),
    isMaximized: ()    => window.api.window.isMaximized(),
    onMaximized: (cb)  => window.api.window.onMaximized(cb),
  },
  store: {
    get: (key)         => window.api.store.get(key),
    set: (key, value)  => window.api.store.set(key, value),
  },
  ffmpeg: {
    check: () => window.api.ffmpeg.check(),
  },
  dialog: {
    openFolder: ()         => window.api.dialog.openFolder(),
    openFile:   (filters)  => window.api.dialog.openFile(filters),
  },
}
