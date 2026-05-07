/* ── Settings Tab ────────────────────────────────────────────────── */
class SettingsTab {
  init() {
    this.el = {
      language:   document.getElementById('setLanguage'),
      suffix:     document.getElementById('setSuffix'),
      bitrate:    document.getElementById('setBitrate'),
      ffmpegPath: document.getElementById('setFfmpegPath'),
      saveBtn:    document.getElementById('setSaveBtn'),
      resetBtn:   document.getElementById('setResetBtn'),
      savedMsg:   document.getElementById('setSavedMsg'),
    }
    this._load()
    this.el.saveBtn.addEventListener('click',  () => this._save())
    this.el.resetBtn.addEventListener('click', () => this._reset())
    this.el.language.addEventListener('change', () => {
      i18n.setLanguage(this.el.language.value)
    })

    // Credits: populate version + wire GitHub link
    this._initCredits()

    // Shell extension (Windows only)
    if (window.api.platform === 'win32') this._initShellExt()
    else {
      const g = document.getElementById('shellExtGroup')
      if (g) g.style.display = 'none'
    }

    // Auto-updater section
    this._initUpdater()
  }

  _initUpdater() {
    const checkBtn    = document.getElementById('updaterCheckBtn')
    const statusEl    = document.getElementById('updaterStatus')
    const lastCheckEl = document.getElementById('updaterLastCheck')
    const portableEl  = document.getElementById('updaterPortableHint')
    const devEl       = document.getElementById('updaterDevHint')
    const versionEl   = document.getElementById('updaterCurrentVersion')
    const githubLink  = document.getElementById('updaterGithubLink')

    // Show current version
    window.api.getVersion?.().then(v => {
      if (v && versionEl) versionEl.textContent = 'v' + v
    }).catch(() => {})

    // GitHub link
    githubLink?.addEventListener('click', e => {
      e.preventDefault()
      window.api.shell.openExternal('https://github.com/yyusvf/LocalPrep/releases/latest')
    })

    // Restore last check timestamp
    window.api.store.get('lastUpdateCheck').then(ts => {
      if (ts && lastCheckEl) lastCheckEl.textContent = new Date(ts).toLocaleString()
    }).catch(() => {})

    // Detect portable / dev mode
    Promise.all([
      window.api.updater.isPortable(),
      window.api.updater.isPackaged(),
    ]).then(([portable, packaged]) => {
      if (portable) {
        if (portableEl)  portableEl.style.display  = ''
        if (checkBtn)    checkBtn.disabled           = true
        if (statusEl)    statusEl.textContent        = 'Portable — manual updates only'
      } else if (!packaged) {
        if (devEl)       devEl.style.display        = ''
        if (checkBtn)    checkBtn.disabled           = true
        if (statusEl)    statusEl.textContent        = 'Dev mode'
      }
    }).catch(() => {})

    // Helper: persist + show last check time
    const _saveLastCheck = () => {
      const now = new Date()
      window.api.store.set('lastUpdateCheck', now.toISOString())
      if (lastCheckEl) lastCheckEl.textContent = now.toLocaleString()
    }

    // Listen for global updater events dispatched by app.js
    document.addEventListener('updater:status', e => {
      const { type, info, msg } = e.detail
      if (!statusEl) return
      switch (type) {
        case 'available':
          statusEl.textContent = `v${info.version} available`
          statusEl.dataset.state = 'available'
          break
        case 'downloaded':
          statusEl.textContent = `v${info.version} ready to install`
          statusEl.dataset.state = 'available'
          break
        case 'not-available':
          statusEl.textContent = 'Up to date ✓'
          statusEl.dataset.state = 'ok'
          _saveLastCheck()
          break
        case 'error':
          statusEl.textContent = `Error: ${msg}`
          statusEl.dataset.state = 'error'
          break
      }
    })

    // Manual check button
    checkBtn?.addEventListener('click', async () => {
      if (checkBtn.disabled) return
      checkBtn.disabled    = true
      checkBtn.textContent = 'Checking…'
      if (statusEl) { statusEl.textContent = ''; delete statusEl.dataset.state }
      try {
        await window.api.updater.check()
        _saveLastCheck()
      } catch (err) {
        if (statusEl) { statusEl.textContent = `Error: ${err.message}`; statusEl.dataset.state = 'error' }
      } finally {
        checkBtn.disabled    = false
        checkBtn.textContent = 'Check for Updates'
      }
    })
  }

  _initShellExt() {
    const statusEl     = document.getElementById('shellExtStatus')
    const registerBtn  = document.getElementById('shellExtRegister')
    const unregisterBtn= document.getElementById('shellExtUnregister')

    const refresh = async () => {
      if (!statusEl) return
      statusEl.textContent = 'Checking…'
      statusEl.className   = 'shellext-status'
      try {
        const registered = await window.api.shellExt.isRegistered()
        statusEl.textContent = registered ? 'Registered ✓' : 'Not registered'
        statusEl.classList.toggle('shellext-status--ok', registered)
        if (registerBtn)   registerBtn.disabled   = registered
        if (unregisterBtn) unregisterBtn.disabled = !registered
      } catch {
        statusEl.textContent = 'Error'
        statusEl.classList.add('shellext-status--error')
      }
    }

    if (registerBtn) {
      registerBtn.addEventListener('click', async () => {
        registerBtn.disabled = true
        registerBtn.textContent = 'Registering…'
        try {
          await window.api.shellExt.register()
          _toast('Context menu registered')
        } catch (err) {
          _toast(`Registration failed: ${err.message}`, 'error')
        } finally {
          registerBtn.textContent = 'Register'
          await refresh()
        }
      })
    }

    if (unregisterBtn) {
      unregisterBtn.addEventListener('click', async () => {
        unregisterBtn.disabled = true
        unregisterBtn.textContent = 'Removing…'
        try {
          await window.api.shellExt.unregister()
          _toast('Context menu removed')
        } catch (err) {
          _toast(`Removal failed: ${err.message}`, 'error')
        } finally {
          unregisterBtn.textContent = 'Remove'
          await refresh()
        }
      })
    }

    refresh()
  }

  _initCredits() {
    // Version from main process (package.json)
    if (window.api?.getVersion) {
      window.api.getVersion().then(v => {
        const el = document.getElementById('creditsVersion')
        if (el && v) el.textContent = 'v' + v
      }).catch(() => {})
    }

    // GitHub link — open in system browser, not Electron window
    const link = document.getElementById('creditsGithub')
    if (link) {
      link.addEventListener('click', e => {
        e.preventDefault()
        window.api?.shell?.openExternal?.('https://github.com/yyusvf/LocalPrep')
      })
    }
  }

  async _load() {
    const keys = ['language', 'defaultSuffix', 'defaultBitrate', 'ffmpegPath']
    for (const key of keys) {
      const val = await window.api.store.get(key)
      if      (key === 'language')       this.el.language.value   = val || 'en'
      else if (key === 'defaultSuffix')  this.el.suffix.value     = val || '_converted'
      else if (key === 'defaultBitrate') this.el.bitrate.value    = val || '320k'
      else if (key === 'ffmpegPath')     this.el.ffmpegPath.value = val || '(bundled)'
    }
  }

  async _save() {
    await window.api.store.set('language',       this.el.language.value)
    await window.api.store.set('defaultSuffix',  this.el.suffix.value)
    await window.api.store.set('defaultBitrate', this.el.bitrate.value)
    i18n.setLanguage(this.el.language.value)
    this._showSaved()
  }

  async _reset() {
    const ok = await Modal.confirm('Reset all settings to defaults?', { title: 'Reset Settings', confirmLabel: 'Reset', danger: true })
    if (!ok) return
    await window.api.store.set('language',       'en')
    await window.api.store.set('defaultSuffix',  '_converted')
    await window.api.store.set('defaultBitrate', '320k')
    await this._load()
    i18n.setLanguage('en')
    this._showSaved()
  }

  _showSaved() {
    const msg = this.el.savedMsg
    msg.style.opacity   = '1'
    msg.style.transition = ''
    setTimeout(() => { msg.style.transition = 'opacity 0.5s'; msg.style.opacity = '0' }, 1400)
  }
}

window.SettingsTab = new SettingsTab()
