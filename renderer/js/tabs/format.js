/* ── Format Tab ──────────────────────────────────────────────────── */
class FormatTab {
  constructor() {
    this.files      = []
    this.table      = null
    this.converting = false
    this.startTime  = null
    this.logLines   = []
  }

  init() {
    this._bindElements()
    this._buildTable()
    this._bindEvents()
    this._listenConvertEvents()
    this._updateQualityOptions()
  }

  _bindElements() {
    const q = id => document.getElementById(id)
    this.el = {
      folderBtn:       q('fmtFolderBtn'),
      folderPath:      q('fmtFolderPath'),
      subfolders:      q('fmtSubfolders'),
      sourceFormat:    q('fmtSource'),
      targetFormat:    q('fmtTarget'),
      searchBtn:       q('fmtSearchBtn'),
      filterInput:     q('fmtFilter'),
      selectAll:       q('fmtSelectAll'),
      deselectAll:     q('fmtDeselectAll'),
      tableWrap:       q('fmtTableWrap'),
      statusBar:       q('fmtStatusBar'),
      deleteOriginal:  q('fmtDeleteOriginal'),
      suffixInput:     q('fmtSuffix'),
      outFolderPath:   q('fmtOutFolderPath'),
      outFolderBtn:    q('fmtOutFolderBtn'),
      outFolderClear:  q('fmtOutFolderClear'),
      qualitySection:  q('fmtQualitySection'),
      qualityWrap:     q('fmtQualityWrap'),
      convertBtn:      q('fmtConvertBtn'),
      cancelBtn:       q('fmtCancelBtn'),
      historyBtn:      q('fmtHistoryBtn'),
      progressSection: q('fmtProgressSection'),
      fileLabel:       q('fmtFileLabel'),
      eta:             q('fmtEta'),
      fileBar:         q('fmtFileBar'),
      overallBar:      q('fmtOverallBar'),
      overallPct:      q('fmtOverallPct'),
      logSection:      q('fmtLogSection'),
      logBody:         q('fmtLogBody'),
      clearLog:        q('fmtClearLog'),
    }
  }

  _buildTable() {
    this.table = new FileTable(this.el.tableWrap, [
      { key: 'filename', label: 'Filename', width: '280px', title: true },
      { key: 'format',   label: 'Format',   width: '80px'  },
      { key: 'size',     label: 'Size',     width: '80px', format: v => _fmtSize(v) },
    ], {
      onSelectionChange: (sel, total) => {
        this.el.statusBar.textContent   = `${sel} of ${total} selected`
        this.el.convertBtn.disabled     = sel === 0 || this.converting
      },
      onContextMenu: (x, y, row, selected) => {
        window.ContextMenu.show(x, y, [
          { label: 'Play Preview',     icon: ICONS.play,   action: () => Player.load(row.path, row.filename) },
          { label: 'Show in Explorer', icon: ICONS.folder, action: () => window.api.shell.showInFolder(row.path) },
          'sep',
          { label: 'Properties',   action: () => this._showProps(row) },
          { label: 'Remove from list', action: () => this.table.removeSelected() },
        ])
      },
      onDoubleClick: row => this._showProps(row),
    })
  }

  _bindEvents() {
    const e = this.el

    e.folderBtn.addEventListener('click', async () => {
      try {
        const p = await window.api.dialog.openFolder()
        if (p) { e.folderPath.value = p; e.folderPath.title = p }
      } catch (err) {
        _toast(`Could not open folder dialog: ${err.message}`, 'error')
      }
    })

    e.targetFormat.addEventListener('change', () => this._updateQualityOptions())
    e.searchBtn.addEventListener('click', () => this._search())
    e.filterInput.addEventListener('input', () => this.table.filter(e.filterInput.value))
    e.selectAll.addEventListener('click',   () => this.table.selectAll())
    e.deselectAll.addEventListener('click', () => this.table.deselectAll())

    e.outFolderBtn.addEventListener('click', async () => {
      try {
        const p = await window.api.dialog.openFolder()
        if (p) e.outFolderPath.value = p
      } catch (err) {
        _toast(`Could not open folder dialog: ${err.message}`, 'error')
      }
    })
    e.outFolderClear.addEventListener('click', () => { e.outFolderPath.value = '' })

    e.convertBtn.addEventListener('click', () => this._convert())
    e.cancelBtn.addEventListener('click',  () => window.api.convert.cancel('format'))
    e.historyBtn.addEventListener('click', () => Nav.navigate('history'))
    e.clearLog.addEventListener('click',   () => { this.logLines = []; e.logBody.innerHTML = '' })

    document.addEventListener('keydown', ev => {
      if (Nav.current !== 'format') return
      if (ev.code === 'Space' && !_inputFocused()) {
        ev.preventDefault()
        const sel = this.table.getSelected()
        if (sel.length) Player.load(sel[0].path, sel[0].filename)
      }
      if (ev.key === 'Delete' && !_inputFocused()) this.table.removeSelected()
    })

    // Folder drag-and-drop onto the file list
    _enableFolderDrop(e.tableWrap, async dirs => {
      const sourceFmt = e.sourceFormat.value
      const targetFmt = e.targetFormat.value.toLowerCase()
      const seen  = new Set(this.files.map(f => f.path))
      let added = 0
      for (const dir of dirs) {
        try {
          const found = await window.api.files.scan(dir, {
            recursive:    e.subfolders.checked,
            sourceFormat: sourceFmt || null,
          })
          const fresh = found.filter(f => {
            if (seen.has(f.path)) return false
            const ext = f.path.split('.').pop().toLowerCase()
            return ext !== targetFmt
          })
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

  _updateQualityOptions() {
    const fmt = this.el.targetFormat.value.toLowerCase()
    const w   = this.el.qualityWrap
    w.innerHTML = ''

    switch (fmt) {
      case 'mp3':
        w.innerHTML = `
          <label class="checkbox-label" style="margin-bottom:6px">
            <input type="checkbox" id="fmtVbr"> <span>VBR (best quality)</span>
          </label>
          <label class="toolbar-label">Bitrate</label>
          <select class="select" id="fmtBitrate">
            <option value="128k">128 kbps</option>
            <option value="192k">192 kbps</option>
            <option value="256k">256 kbps</option>
            <option value="320k" selected>320 kbps</option>
          </select>`
        break
      case 'flac':
        w.innerHTML = `
          <label class="toolbar-label">Compression level</label>
          <select class="select" id="fmtCompression">
            ${[0,1,2,3,4,5,6,7,8].map(n => `<option value="${n}" ${n===5?'selected':''}>${n}${n===0?' (fastest)':n===8?' (smallest)':''}</option>`).join('')}
          </select>`
        break
      case 'ogg':
        w.innerHTML = `
          <label class="toolbar-label">Quality (0–10)</label>
          <input type="range" class="vol-slider" id="fmtOggQ" min="0" max="10" value="7" style="width:100%;margin:4px 0">
          <span id="fmtOggQVal" style="font-size:11px;color:var(--text-secondary)">7</span>`
        const slider = w.querySelector('#fmtOggQ')
        const label  = w.querySelector('#fmtOggQVal')
        if (slider) slider.addEventListener('input', () => { label.textContent = slider.value })
        break
      case 'm4a':
      case 'aac':
        w.innerHTML = `
          <label class="toolbar-label">Bitrate</label>
          <select class="select" id="fmtAacBitrate">
            <option value="128k">128 kbps</option>
            <option value="192k">192 kbps</option>
            <option value="256k">256 kbps</option>
            <option value="320k" selected>320 kbps</option>
          </select>`
        break
      case 'wav':
      case 'aiff':
        w.innerHTML = `
          <label class="toolbar-label">Bit depth</label>
          <select class="select" id="fmtBitDepth">
            <option value="16">16-bit</option>
            <option value="24" selected>24-bit</option>
            <option value="32">32-bit float</option>
          </select>`
        break
      default:
        this.el.qualitySection.style.display = 'none'
        return
    }
    this.el.qualitySection.style.display = ''
  }

  _getQualityOpts() {
    const fmt = this.el.targetFormat.value.toLowerCase()
    switch (fmt) {
      case 'mp3':  return { vbr: document.getElementById('fmtVbr')?.checked, bitrate: document.getElementById('fmtBitrate')?.value || '320k' }
      case 'flac': return { compression: parseInt(document.getElementById('fmtCompression')?.value || '5', 10) }
      case 'ogg':  return { quality: parseInt(document.getElementById('fmtOggQ')?.value || '7', 10) }
      case 'm4a':
      case 'aac':  return { bitrate: document.getElementById('fmtAacBitrate')?.value || '320k' }
      case 'wav':
      case 'aiff': return { bitDepth: document.getElementById('fmtBitDepth')?.value || '24' }
      default:     return {}
    }
  }

  async _search() {
    const folder     = this.el.folderPath.value.trim()
    if (!folder)     { _toast('Choose a folder first'); return }
    const sourceFmt  = this.el.sourceFormat.value

    this.el.searchBtn.disabled   = true
    this.el.searchBtn.textContent = 'Scanning…'

    try {
      const files = await window.api.files.scan(folder, {
        recursive:    this.el.subfolders.checked,
        sourceFormat: sourceFmt || null,
      })
      // Exclude files already in target format (compare by file extension)
      const targetFmt = this.el.targetFormat.value.toLowerCase()
      const filtered  = files.filter(f => {
        const ext = f.path.split('.').pop().toLowerCase()
        return ext !== targetFmt
      })
      this.files = filtered
      this.table.setData(filtered)
      this.el.statusBar.textContent = `${filtered.length} files found`
      if (!filtered.length) _toast('No matching files found')
    } catch (err) {
      _toast(`Scan error: ${err.message}`, 'error')
    } finally {
      this.el.searchBtn.disabled   = false
      this.el.searchBtn.textContent = 'Search Files'
    }
  }

  async _convert() {
    const selected = this.table.getSelected()
    if (!selected.length) return

    const targetFormat = this.el.targetFormat.value
    if (!targetFormat) { _toast('Choose a target format'); return }

    const deleteOriginal = this.el.deleteOriginal.checked
    if (deleteOriginal) {
      const ok = await Modal.confirm(
        `Original files will be deleted after conversion.<br>A backup will be saved for undo.`,
        { title: 'Delete originals?', confirmLabel: 'Delete after convert', danger: true }
      )
      if (!ok) return
    }

    const options = {
      targetFormat,
      quality:        this._getQualityOpts(),
      deleteOriginal,
      suffix:         this.el.suffixInput.value,
      outputFolder:   this.el.outFolderPath.value.trim() || null,
    }

    this.converting = true
    this.startTime  = Date.now()
    this.logLines   = []
    this.el.convertBtn.disabled     = true
    this.el.cancelBtn.style.display = ''
    this.el.progressSection.style.display = ''
    this.el.logSection.style.display      = ''
    this.el.logBody.innerHTML             = ''
    this._setProgress(0, 0, '', '')

    try {
      const result = await window.api.convert.format(selected, options)
      if (result.historyFiles?.length) {
        await window.api.history.add(
          'format',
          `Format → ${targetFormat.toUpperCase()} (${result.successCount} files)`,
          result.historyFiles
        )
      }
      this._appendLog({ level: 'info', text: `Done — ${result.successCount} converted, ${result.errorCount} failed` })
    } catch (err) {
      this._appendLog({ level: 'error', text: `Fatal: ${err.message}` })
    } finally {
      this.converting = false
      this.el.convertBtn.disabled     = this.table.getSelected().length === 0
      this.el.cancelBtn.style.display = 'none'
    }
  }

  _listenConvertEvents() {
    document.addEventListener('convert:progress', e => {
      if (e.detail.tab !== 'format') return
      const d = e.detail
      if (d.type === 'file')    { this.el.fileBar.style.width    = `${d.percent}%`; this.el.fileLabel.textContent = d.file; this.el.eta.textContent = this._calcEta() }
      if (d.type === 'overall') { this.el.overallBar.style.width = `${d.percent}%`; this.el.overallPct.textContent = `${d.percent}%` }
    })
    document.addEventListener('convert:log', e => {
      if (e.detail.tab !== 'format') return
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
    const pct     = parseFloat(this.el.overallBar.style.width) || 0
    if (pct <= 0) return ''
    const elapsed = (Date.now() - this.startTime) / 1000
    const rem     = Math.round((elapsed / (pct / 100)) - elapsed)
    return rem > 5 ? `~${_fmtTime(rem)} left` : ''
  }

  _appendLog(msg) {
    this.logLines.push(msg)
    const div = document.createElement('div')
    div.className   = `log-line ${msg.level}`
    div.textContent = msg.text
    this.el.logBody.appendChild(div)
    this.el.logBody.scrollTop = this.el.logBody.scrollHeight
  }

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

window.FormatTab = new FormatTab()
