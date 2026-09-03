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

    // Shell integration — registry entry on Windows, Services entry on macOS.
    // Linux has neither, so the section is hidden there.
    if (window.api.platform === 'win32' || window.api.platform === 'darwin') {
      this._initShellExt()
    } else {
      const g = document.getElementById('shellExtGroup')
      if (g) g.style.display = 'none'
    }

    // Auto-updater section
    this._initUpdater()

    // Backup section
    this._initBackup()
  }

  _initBackup() {
    const folderInput  = document.getElementById('setBackupFolder')
    const browseBtn    = document.getElementById('setBackupFolderBtn')
    const resetBtn     = document.getElementById('setBackupFolderReset')
    const infoEl       = document.getElementById('backupInfo')
    const deleteBtn    = document.getElementById('backupDeleteBtn')
    const retentionSel = document.getElementById('setBackupRetention')

    // Automatic cleanup — applied at the next app start
    window.api.store.get('backupRetention').then(v => {
      // Fallback matches the store default ('7'), so the dropdown never
      // claims a policy that is not the one actually running at startup
      if (retentionSel) retentionSel.value = String(v || '7')
    })
    retentionSel?.addEventListener('change', () => {
      window.api.store.set('backupRetention', retentionSel.value)
      _toast(retentionSel.value === 'never'
        ? i18n.t('set.keepForever', 'Backups are kept indefinitely')
        : i18n.t('set.retentionSet', 'Backups older than {n} days are removed at startup',
                 { n: retentionSel.value }))
    })

    const refreshInfo = async () => {
      if (!infoEl) return
      try {
        const { count, size } = await window.api.backup.getInfo()
        infoEl.textContent = count > 0
          ? `${count} file${count !== 1 ? 's' : ''}, ${_fmtSize(size)}`
          : 'No backups stored'
      } catch { infoEl.textContent = '—' }
    }

    // Load current folder
    window.api.store.get('backupFolder').then(f => {
      if (f && folderInput) folderInput.value = f
    })
    refreshInfo()

    // Save on input change
    folderInput?.addEventListener('change', () => {
      window.api.store.set('backupFolder', folderInput.value)
    })

    // Browse
    browseBtn?.addEventListener('click', async () => {
      const p = await window.api.dialog.openFolder()
      if (p) { folderInput.value = p; window.api.store.set('backupFolder', p) }
    })

    // Reset to default
    resetBtn?.addEventListener('click', async () => {
      await window.api.store.set('backupFolder', null)   // clears → store returns default
      const { folder } = await window.api.backup.getInfo()
      if (folderInput) folderInput.value = folder
    })

    // Delete all
    deleteBtn?.addEventListener('click', async () => {
      const { count } = await window.api.backup.getInfo()
      if (count === 0) { _toast('No backups to delete'); return }
      const ok = await Modal.confirm(
        `Delete ${count} backup file${count !== 1 ? 's' : ''}?<br>Undo in History will stop working for past operations.`,
        { title: 'Delete all backups', confirmLabel: 'Delete', danger: true }
      )
      if (!ok) return
      const deleted = await window.api.backup.deleteAll()
      _toast(`Deleted ${deleted} backup${deleted !== 1 ? 's' : ''} — those operations can no longer be undone`)
      refreshInfo()
      // History rows must immediately show their Undo button as disabled
      window.HistoryTab?.refresh?.()
    })
  }

  _initUpdater() {
    const checkBtn    = document.getElementById('updaterCheckBtn')
    const statusEl    = document.getElementById('updaterStatus')
    const lastCheckEl = document.getElementById('updaterLastCheck')
    const portableEl  = document.getElementById('updaterPortableHint')
    const devEl       = document.getElementById('updaterDevHint')
    const versionEl   = document.getElementById('updaterCurrentVersion')
    const githubLink  = document.getElementById('updaterGithubLink')
    const behaviorSel = document.getElementById('setUpdateBehavior')
    const behaviorRow = document.getElementById('updaterBehaviorRow')

    // Update behaviour — 'ask' is the default: an app that silently replaces
    // itself on first launch surprises people.
    const _applyBehavior = v => {
      // "Never" promises no network request at all, so the manual button goes too
      if (checkBtn && !checkBtn.dataset.forcedOff) checkBtn.disabled = v === 'never'
      if (statusEl && v === 'never') statusEl.textContent = i18n.t('set.checkingOff', 'Checking is turned off')
    }
    window.api.store.get('updateBehavior').then(v => {
      const val = v || 'ask'
      if (behaviorSel) behaviorSel.value = val
      _applyBehavior(val)
    })
    behaviorSel?.addEventListener('change', () => {
      window.api.store.set('updateBehavior', behaviorSel.value)
      if (statusEl) { statusEl.textContent = ''; delete statusEl.dataset.state }
      _applyBehavior(behaviorSel.value)
    })

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

    // Detect portable / dev / unsigned Mac
    Promise.all([
      window.api.updater.isPortable(),
      window.api.updater.isPackaged(),
      window.api.updater.isMac(),
    ]).then(([portable, packaged, mac]) => {
      // In every one of these modes the app cannot replace itself, so hide the
      // behaviour options entirely rather than offering something that can't happen
      const off = (msg, hintEl) => {
        if (hintEl)      hintEl.style.display     = ''
        if (behaviorRow) behaviorRow.style.display = 'none'
        if (checkBtn)  { checkBtn.disabled = true; checkBtn.dataset.forcedOff = '1' }
        if (statusEl)    statusEl.textContent     = msg
      }
      if      (mac)       off('macOS — ' + i18n.t('set.hintPortable', 'download updates from GitHub'), portableEl)
      else if (portable)  off('Portable — manual updates only',       portableEl)
      else if (!packaged) off('Dev mode',                             devEl)
    }).catch(() => {})

    // Only the background check writes lastUpdateCheck. If a manual check
    // stamped it too, it would consume the daily window and the automatic
    // check would never fire again. The UI just reads the stored value back.
    const _refreshLastCheck = () => {
      window.api.store.get('lastUpdateCheck').then(ts => {
        if (lastCheckEl) lastCheckEl.textContent = ts ? new Date(ts).toLocaleString() : 'Never'
      }).catch(() => {})
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
          statusEl.textContent = i18n.t('set.upToDate', 'Up to date ✓')
          statusEl.dataset.state = 'ok'
          _refreshLastCheck()
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
      checkBtn.textContent = i18n.t('set.checking', 'Checking…')
      if (statusEl) { statusEl.textContent = ''; delete statusEl.dataset.state }
      try {
        // manual = true → does not consume the daily background window
        const r = await window.api.updater.check(true)
        const msg = {
          'off':        i18n.t('set.checkingOff', 'Checking is turned off'),
          'up-to-date': i18n.t('set.upToDate', 'Up to date ✓'),
          'available':  r?.version ? `v${r.version} available` : 'Update available',
          'installing': `Installing v${r?.version ?? ''}…`,
          'skipped':    r?.version ? `v${r.version} available` : 'Update available',
          'error':      `Error: ${r?.reason ?? 'could not reach GitHub'}`,
        }[r?.status]
        if (statusEl && msg) {
          statusEl.textContent   = msg
          statusEl.dataset.state = r.status === 'error' ? 'error'
                                 : r.status === 'up-to-date' ? 'ok' : 'available'
        }
        _refreshLastCheck()
      } catch (err) {
        if (statusEl) { statusEl.textContent = `Error: ${err.message}`; statusEl.dataset.state = 'error' }
      } finally {
        checkBtn.disabled    = false
        checkBtn.textContent = i18n.t('set.checkUpdates', 'Check for Updates')
      }
    })
  }

  _initShellExt() {
    const statusEl     = document.getElementById('shellExtStatus')
    const registerBtn  = document.getElementById('shellExtRegister')
    const unregisterBtn= document.getElementById('shellExtUnregister')
    const labelEl      = document.getElementById('shellExtLabel')
    const hintEl       = document.getElementById('shellExtHint')

    // Same three buttons on both platforms, different wording — Windows writes
    // a registry entry, macOS installs a Quick Action into the Services menu.
    const isMac = window.api.platform === 'darwin'
    if (isMac) {
      if (labelEl) {
        labelEl.dataset.i18n    = 'set.servicesMenu'
        labelEl.textContent     = i18n.t('set.servicesMenu', 'macOS Services menu')
      }
      if (hintEl) {
        hintEl.dataset.i18n = 'set.hintServices'
        hintEl.textContent  = i18n.t('set.hintServices',
          'Adds "LocalPrep" to the right-click Services menu for audio files and folders. No admin rights required.')
      }
    }

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
