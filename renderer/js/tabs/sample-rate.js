/* ── Sample Rate Tab ─────────────────────────────────────────────── */
class SampleRateTab {
  constructor() {
    this.files       = []
    this.table       = null
    this.converting  = false
    this.startTime   = null
    this.logLines    = []
  }

  init() {
    this._bindElements()
    this._buildTable()
    this._bindEvents()
    this._listenConvertEvents()
    this._loadSettings()
  }

  // ── DOM refs ──────────────────────────────────────────────────────
  _bindElements() {
    const q = id => document.getElementById(id)
    this.el = {
      folderBtn:      q('srFolderBtn'),
      folderPath:     q('srFolderPath'),
      subfolders:     q('srSubfolders'),
      sourceRate:     q('srSourceRate'),
      sourceCustom:   q('srSourceCustom'),
      targetRate:     q('srTargetRate'),
      targetCustom:   q('srTargetCustom'),
      searchBtn:      q('srSearchBtn'),
      filterInput:    q('srFilter'),
      selectAll:      q('srSelectAll'),
      deselectAll:    q('srDeselectAll'),
      tableWrap:      q('srTableWrap'),
      statusBar:      q('srStatusBar'),
      overwrite:      q('srOverwrite'),
      newFile:        q('srNewFile'),
      suffixCheck:    q('srUseSuffix'),
      suffixInput:    q('srSuffix'),
      suffixRow:      q('srSuffixRow'),
      outFolderPath:  q('srOutFolderPath'),
      outFolderBtn:   q('srOutFolderBtn'),
      outFolderClear: q('srOutFolderClear'),
      convertBtn:     q('srConvertBtn'),
      cancelBtn:      q('srCancelBtn'),
      historyBtn:     q('srHistoryBtn'),
      progressSection:q('srProgressSection'),
      fileLabel:      q('srFileLabel'),
      eta:            q('srEta'),
      fileBar:        q('srFileBar'),
      overallBar:     q('srOverallBar'),
      overallPct:     q('srOverallPct'),
      logSection:     q('srLogSection'),
      logBody:        q('srLogBody'),
      exportLog:      q('srExportLog'),
      clearLog:       q('srClearLog'),
    }
  }

  _buildTable() {
    this.table = new FileTable(this.el.tableWrap, [
      { key: 'filename',   label: 'Filename',    width: '260px', title: true },
      { key: 'format',     label: 'Format',      width: '70px'  },
      { key: 'sampleRate', label: 'Sample Rate', width: '100px',
        format: v => v ? `${(v/1000).toFixed(v % 1000 === 0 ? 0 : 1)} kHz` : '—' },
      { key: 'size',       label: 'Size',        width: '80px',
        format: v => _fmtSize(v) },
    ], {
      onSelectionChange: (sel, total) => {
        this.el.statusBar.textContent = `${sel} of ${total} selected`
        this.el.convertBtn.disabled   = sel === 0 || this.converting
      },
      onContextMenu: (x, y, row, selected) => {
        window.ContextMenu.show(x, y, [
          { label: 'Play Preview',       icon: ICONS.play,    action: () => Player.load(row.path, row.filename) },
          { label: 'Show in Explorer',   icon: ICONS.folder,  action: () => window.api.shell.showInFolder(row.path) },
          'sep',
          { label: 'Properties',         action: () => this._showProps(row) },
          { label: 'Remove from list',   action: () => { this.table.removeSelected() } },
        ])
      },
      onDoubleClick: row => this._showProps(row),
    })
  }

  _bindEvents() {
    const e = this.el

    // Folder picker
    e.folderBtn.addEventListener('click', async () => {
      try {
        const p = await window.api.dialog.openFolder()
        if (p) { e.folderPath.value = p; e.folderPath.title = p }
      } catch (err) {
        _toast(`Could not open folder dialog: ${err.message}`, 'error')
      }
    })

    // Custom sample rate inputs
    e.sourceRate.addEventListener('change', () => {
      e.sourceCustom.style.display = e.sourceRate.value === 'custom' ? '' : 'none'
    })
    e.targetRate.addEventListener('change', () => {
      e.targetCustom.style.display = e.targetRate.value === 'custom' ? '' : 'none'
    })

    // Search
    e.searchBtn.addEventListener('click', () => this._search())
    e.folderPath.addEventListener('keydown', ev => { if (ev.key === 'Enter') this._search() })

    // Filter
    e.filterInput.addEventListener('input', () => this.table.filter(e.filterInput.value))

    // Select all / none
    e.selectAll.addEventListener('click',   () => this.table.selectAll())
    e.deselectAll.addEventListener('click', () => this.table.deselectAll())

    // Output mode
    e.overwrite.addEventListener('change', () => this._updateOutputState())
    e.newFile.addEventListener('change',   () => this._updateOutputState())
    e.suffixCheck.addEventListener('change',() => { e.suffixInput.disabled = !e.suffixCheck.checked })
    e.outFolderBtn.addEventListener('click', async () => {
      try {
        const p = await window.api.dialog.openFolder()
        if (p) { e.outFolderPath.value = p; this._updateOutputState() }
      } catch (err) {
        _toast(`Could not open folder dialog: ${err.message}`, 'error')
      }
    })
    e.outFolderClear.addEventListener('click', () => {
      e.outFolderPath.value = ''
      this._updateOutputState()
    })

    // Convert / Cancel
    e.convertBtn.addEventListener('click', () => this._convert())
    e.cancelBtn.addEventListener('click',  () => window.api.convert.cancel('sample-rate'))

    // History
    e.historyBtn.addEventListener('click', () => Nav.navigate('history'))

    // Log actions
    e.exportLog.addEventListener('click', () => this._exportLog())
    e.clearLog.addEventListener('click',  () => { this.logLines = []; e.logBody.innerHTML = '' })

    // Keyboard: spacebar on focused row → play
    document.addEventListener('keydown', ev => {
      if (Nav.current !== 'sample-rate') return
      if (ev.code === 'Space' && !_inputFocused()) {
        ev.preventDefault()
        const sel = this.table.getSelected()
        if (sel.length) Player.load(sel[0].path, sel[0].filename)
      }
      if (ev.key === 'Delete' && !_inputFocused()) {
        this.table.removeSelected()
      }
    })

    // Folder drag-and-drop onto the file list
    _enableFolderDrop(e.tableWrap, async dirs => {
      const sourceRate = e.sourceRate.value === 'custom'
        ? parseInt(e.sourceCustom.value, 10) : (e.sourceRate.value || null)
      const seen  = new Set(this.files.map(f => f.path))
      let added = 0
      for (const dir of dirs) {
        try {
          const found = await window.api.files.scan(dir, {
            recursive:        e.subfolders.checked,
            sourceSampleRate: sourceRate || null,
          })
          const fresh = found.filter(f => !seen.has(f.path))
          fresh.forEach(f => seen.add(f.path))
          this.files.push(...fresh)
          added += fresh.length
        } catch (err) {
          _toast(`Scan error: ${err.message}`, 'error')
        }
      }
      this.table.setData(this.files)
      e.statusBar.textContent = `${this.files.length} files found`
      _toast(added > 0 ? `Added ${added} file${added !== 1 ? 's' : ''}` : 'No new files found')
    })
  }

  // ── Search ────────────────────────────────────────────────────────
  async _search() {
    const folder = this.el.folderPath.value.trim()
    if (!folder) { _toast('Choose a folder first'); return }

    this.el.searchBtn.disabled = true
    this.el.searchBtn.textContent = 'Scanning…'

    const sourceRate = this.el.sourceRate.value === 'custom'
      ? parseInt(this.el.sourceCustom.value, 10)
      : (this.el.sourceRate.value || null)

    try {
      const files = await window.api.files.scan(folder, {
        recursive:        this.el.subfolders.checked,
        sourceSampleRate: sourceRate || null,
      })
      this.files = files
      this.table.setData(files)
      this.el.statusBar.textContent = `${files.length} files found`
      if (!files.length) _toast('No matching files found')
    } catch (err) {
      _toast(`Scan error: ${err.message}`, 'error')
    } finally {
      this.el.searchBtn.disabled = false
      this.el.searchBtn.textContent = 'Search Files'
    }
  }

  // ── Convert ───────────────────────────────────────────────────────
  async _convert() {
    const selected = this.table.getSelected()
    if (!selected.length) return

    const targetVal  = this.el.targetRate.value
    const targetRate = targetVal === 'custom'
      ? parseInt(this.el.targetCustom.value, 10)
      : parseInt(targetVal, 10)

    if (!targetRate) { _toast('Choose a target sample rate'); return }

    const overwrite = this.el.overwrite.checked
    if (overwrite) {
      const ok = await Modal.confirm(
        `This will overwrite ${selected.length} original file(s).<br>A backup will be created for undo.`,
        { title: 'Overwrite originals?', confirmLabel: 'Overwrite', danger: true }
      )
      if (!ok) return
    }

    const options = {
      targetSampleRate: targetRate,
      overwrite,
      suffix:       overwrite ? '' : (this.el.suffixCheck.checked ? this.el.suffixInput.value : ''),
      outputFolder: this.el.outFolderPath.value.trim() || null,
    }

    this.converting = true
    this.startTime  = Date.now()
    this.logLines   = []

    this.el.convertBtn.disabled = true
    this.el.cancelBtn.style.display = ''
    this.el.progressSection.style.display = ''
    this.el.logSection.style.display      = ''
    this.el.logBody.innerHTML             = ''
    this._setProgress(0, 0, '', '')

    try {
      const result = await window.api.convert.sampleRate(selected, options)

      // Record history
      if (result.historyFiles?.length) {
        await window.api.history.add(
          'sample-rate',
          `Sample Rate → ${targetRate} Hz (${result.successCount} files)`,
          result.historyFiles
        )
      }

      this._appendLog({ level: 'info', text: `Done — ${result.successCount} converted, ${result.errorCount} failed` })
    } catch (err) {
      this._appendLog({ level: 'error', text: `Fatal error: ${err.message}` })
    } finally {
      this.converting = false
      this.el.convertBtn.disabled = this.table.getSelected().length === 0
      this.el.cancelBtn.style.display = 'none'
    }
  }

  // ── Progress / log event listeners ────────────────────────────────
  _listenConvertEvents() {
    document.addEventListener('convert:progress', e => {
      if (e.detail.tab !== 'sample-rate') return
      const d = e.detail
      if (d.type === 'file') {
        this._setProgress(d.percent, null, d.file, this._calcEta())
      } else if (d.type === 'overall') {
        this._setProgress(null, d.percent, null, null)
        this.el.overallPct.textContent = `${d.percent}%`
      }
    })
    document.addEventListener('convert:log', e => {
      if (e.detail.tab !== 'sample-rate') return
      this._appendLog(e.detail)
    })
  }

  _setProgress(filePct, overallPct, label, eta) {
    if (filePct    !== null) this.el.fileBar.style.width    = `${filePct}%`
    if (overallPct !== null) this.el.overallBar.style.width = `${overallPct}%`
    if (label      !== null) this.el.fileLabel.textContent  = label
    if (eta        !== null) this.el.eta.textContent        = eta
  }

  _calcEta() {
    if (!this.startTime) return ''
    const overallPct = parseFloat(this.el.overallBar.style.width) || 0
    if (overallPct <= 0) return ''
    const elapsed = (Date.now() - this.startTime) / 1000
    const total   = elapsed / (overallPct / 100)
    const rem     = Math.round(total - elapsed)
    return rem > 5 ? `~${_fmtTime(rem)} left` : ''
  }

  _appendLog(msg) {
    this.logLines.push(msg)
    const div = document.createElement('div')
    div.className = `log-line ${msg.level}`
    div.textContent = msg.text
    this.el.logBody.appendChild(div)
    this.el.logBody.scrollTop = this.el.logBody.scrollHeight
  }

  // ── Output mode state ─────────────────────────────────────────────
  _updateOutputState() {
    const isOverwrite     = this.el.overwrite.checked
    const hasOutputFolder = !!this.el.outFolderPath.value.trim()

    // Suffix is irrelevant when overwriting or when an output folder is set without suffix intent
    this.el.suffixRow.style.display    = isOverwrite ? 'none' : ''
    this.el.suffixInput.disabled       = !this.el.suffixCheck.checked
    // Can't set output folder when overwriting
    this.el.outFolderPath.disabled     = isOverwrite
    this.el.outFolderBtn.disabled      = isOverwrite
    this.el.outFolderClear.disabled    = isOverwrite
  }

  // ── Properties modal ──────────────────────────────────────────────
  async _showProps(row) {
    const m = Modal.open({ title: 'File Properties', width: 480 })
    m.setContent('<p style="color:var(--text-tertiary);font-size:12px">Loading…</p>')
    try {
      const p = await window.api.files.getProperties(row.path)
      m.setContent(_propsHtml(p))
    } catch (err) {
      m.setContent(`<p style="color:var(--error)">Error: ${err.message}</p>`)
    }
  }

  // ── Log export ────────────────────────────────────────────────────
  async _exportLog() {
    const text     = this.logLines.map(l => l.text).join('\n')
    const savePath = await window.api.dialog.saveFile(
      [{ name: 'Text', extensions: ['txt'] }],
      'localprep-sr-log.txt'
    )
    if (savePath) {
      try {
        await window.api.shell.writeTextFile(savePath, text)
        _toast('Log saved')
      } catch (err) {
        _toast(`Could not save log: ${err.message}`, 'error')
      }
    }
  }

  _loadSettings() {
    window.api.store.get('defaultSuffix').then(s => {
      if (s) this.el.suffixInput.value = s
    })
  }

  async _openFile(filePath) {
    try {
      const info = await window.api.files.readOne(filePath)
      if (!this.files.find(f => f.path === info.path)) {
        this.files.push(info)
        this.table.setData(this.files)
        this.el.statusBar.textContent = `${this.files.length} files found`
      }
      this.table.selectRow(filePath)
    } catch (err) {
      _toast(`Could not open file: ${err.message}`, 'error')
    }
  }

  async _openFolder(folderPath) {
    this.el.folderPath.value = folderPath
    this.el.folderPath.title = folderPath
    await this._search()
  }
}

window.SampleRateTab = new SampleRateTab()
