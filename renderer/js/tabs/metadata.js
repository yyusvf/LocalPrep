/* ── Metadata Tab ────────────────────────────────────────────────── */
class MetadataTab {
  constructor() {
    this.table       = null
    this.files       = []
    this.currentFile = null    // single selection
    this.multiSelect = []      // multi-edit paths
    this.pendingCover = null   // '' = remove | path = new | null = keep
    this.coverDataUrl = null
    this._mbRateLimit = 0      // MusicBrainz last request timestamp
  }

  init() {
    this._bindElements()
    this._buildTable()
    this._bindEvents()
  }

  // ── DOM refs ──────────────────────────────────────────────────────
  _bindElements() {
    const q = id => document.getElementById(id)
    this.el = {
      folderBtn:    q('metaFolderBtn'),
      folderPath:   q('metaFolderPath'),
      subfolders:   q('metaSubfolders'),
      searchBtn:    q('metaSearchBtn'),
      filterInput:  q('metaFilter'),
      selectAll:    q('metaSelectAll'),
      deselectAll:  q('metaDeselectAll'),
      tableWrap:    q('metaTableWrap'),
      statusBar:    q('metaStatusBar'),
      // Editor
      coverImg:     q('metaCoverImg'),
      coverStatus:  q('metaCoverStatus'),
      coverFile:    q('metaCoverFile'),
      coverRemove:  q('metaCoverRemove'),
      coverSearch:  q('metaCoverSearch'),
      fields: {
        title:       q('mTitle'),
        artist:      q('mArtist'),
        album:       q('mAlbum'),
        year:        q('mYear'),
        track:       q('mTrack'),
        genre:       q('mGenre'),
        comment:     q('mComment'),
        albumartist: q('mAlbumArtist'),
        composer:    q('mComposer'),
        discNumber:  q('mDiscNumber'),
      },
      saveBtn:       q('metaSaveBtn'),
      resetBtn:      q('metaResetBtn'),
      batchRename:   q('metaBatchRename'),
      tracklist:     q('metaTracklist'),
      logSection:    q('metaLogSection'),
      logBody:       q('metaLogBody'),
    }
  }

  _buildTable() {
    this.table = new FileTable(this.el.tableWrap, [
      { key: 'filename',   label: 'Filename',  width: '200px', title: true },
      { key: 'title',      label: 'Title',     width: '150px', title: true },
      { key: 'artist',     label: 'Artist',    width: '120px' },
      { key: 'album',      label: 'Album',     width: '120px' },
      { key: 'track',      label: 'Track Nr.', width: '80px'  },
    ], {
      onSelectionChange: (sel, total) => {
        this.el.statusBar.textContent = `${sel} of ${total} selected`
        this.el.saveBtn.disabled      = sel === 0
        if (sel === 0) { this._clearEditor(); return }
        const selected = this.table.getSelected()
        if (sel === 1) {
          this._loadIntoEditor(selected[0])
        } else {
          this._loadMultiEdit(selected)
        }
        this.multiSelect = selected.map(f => f.path)
      },
      onContextMenu: (x, y, row, selected) => {
        window.ContextMenu.show(x, y, [
          { label: 'Play Preview',     icon: ICONS.play,   action: () => Player.load(row.path, row.filename) },
          { label: 'Load in editor',   action: () => this._loadIntoEditor(row) },
          { label: 'Show in Explorer', icon: ICONS.folder, action: () => window.api.shell.showInFolder(row.path) },
          'sep',
          { label: 'Properties',   action: () => this._showProps(row) },
          { label: 'Remove from list', action: () => this.table.removeSelected() },
        ])
      },
      onDoubleClick: row => this._showProps(row),
    }, 'metaTableState')
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
    e.searchBtn.addEventListener('click', () => this._search())
    e.filterInput.addEventListener('input', () => this.table.filter(e.filterInput.value))
    e.selectAll.addEventListener('click',   () => this.table.selectAll())
    e.deselectAll.addEventListener('click', () => this.table.deselectAll())

    // Cover art
    e.coverFile.addEventListener('click',   () => this._chooseCover())
    e.coverRemove.addEventListener('click', () => this._removeCover())
    e.coverSearch.addEventListener('click', () => this._openMBSearch())

    // Save / Reset
    e.saveBtn.addEventListener('click',  () => this._save())
    e.resetBtn.addEventListener('click', () => {
      if (this.currentFile) this._loadIntoEditor(this.currentFile)
    })

    // Batch Rename / Tracklist
    e.batchRename.addEventListener('click', () => this._openBatchRename())
    e.tracklist.addEventListener('click',   () => this._openTracklist())

    // Keyboard
    document.addEventListener('keydown', ev => {
      if (Nav.current !== 'metadata') return
      if (ev.code === 'Space' && !_inputFocused()) {
        ev.preventDefault()
        const sel = this.table.getSelected()
        if (sel.length) Player.load(sel[0].path, sel[0].filename)
      }
    })

    // Folder drag-and-drop onto the file list
    _enableFolderDrop(e.tableWrap, async dirs => {
      const seen  = new Set(this.files.map(f => f.path))
      let added = 0
      for (const dir of dirs) {
        try {
          const found = await window.api.files.scan(dir, { recursive: e.subfolders.checked })
          const fresh = found.filter(f => !seen.has(f.path))
          fresh.forEach(f => seen.add(f.path))
          this.files.push(...fresh)
          added += fresh.length
        } catch (err) {
          _toast(`Scan error: ${err.message}`, 'error')
        }
      }
      this.table.setData(this.files)
      this.el.statusBar.textContent = `${this.files.length} files`
      _toast(added > 0 ? `Added ${added} file${added !== 1 ? 's' : ''}` : 'No new files found')
    })
  }

  // ── Search ────────────────────────────────────────────────────────
  async _search() {
    const folder = this.el.folderPath.value.trim()
    if (!folder) { _toast('Choose a folder first'); return }

    this.el.searchBtn.disabled    = true
    this.el.searchBtn.textContent = 'Scanning…'
    try {
      const files = await window.api.files.scan(folder, { recursive: this.el.subfolders.checked })
      this.files = files
      this.table.setData(files)
      this.el.statusBar.textContent = `${files.length} files found`
      this._clearEditor()
    } catch (err) {
      _toast(`Scan error: ${err.message}`, 'error')
    } finally {
      this.el.searchBtn.disabled    = false
      this.el.searchBtn.textContent = 'Search Files'
    }
  }

  // ── Editor load ───────────────────────────────────────────────────
  async _loadIntoEditor(file) {
    this.currentFile  = file
    this.pendingCover = null
    const f = this.el.fields

    // Fill text fields
    f.title.value       = file.title       || ''
    f.artist.value      = file.artist      || ''
    f.album.value       = file.album       || ''
    f.year.value        = file.year        || ''
    f.track.value       = file.track       || ''
    f.genre.value       = file.genre       || ''
    f.comment.value     = file.comment     || ''
    f.albumartist.value = file.albumartist || ''
    f.composer.value    = file.composer    || ''
    f.discNumber.value  = file.discNumber  || ''

    // Cover (load async, non-blocking)
    this._setCover(null)
    this.el.coverStatus.textContent = 'Loading…'
    try {
      const dataUrl = await window.api.files.getCover(file.path)
      if (dataUrl) {
        this._setCover(dataUrl)
        this.el.coverStatus.textContent = 'Cover art'
        this.coverDataUrl = dataUrl
      } else {
        this.el.coverStatus.textContent = 'No cover art'
        this.coverDataUrl = null
      }
    } catch {
      this.el.coverStatus.textContent = 'Error loading cover'
    }
  }

  _loadMultiEdit(selected) {
    this.currentFile = null
    const f = this.el.fields
    // Show shared values, blank where different
    const first = selected[0]
    Object.keys(f).forEach(key => {
      const allSame = selected.every(s => (s[key] || '') === (first[key] || ''))
      f[key].value       = allSame ? (first[key] || '') : ''
      f[key].placeholder = allSame ? '' : '[multiple values]'
    })
    this._setCover(null)
    this.el.coverStatus.textContent = `${selected.length} files selected`
    this.coverDataUrl = null
    this.pendingCover = null
  }

  _clearEditor() {
    this.currentFile = null
    Object.values(this.el.fields).forEach(f => { f.value = ''; f.placeholder = '' })
    this._setCover(null)
    this.el.coverStatus.textContent = ''
    this.pendingCover = null
  }

  /** Show or hide the cover image. Pass a data-URL/object-URL/file-URL, or null/'' to show placeholder. */
  _setCover(src) {
    const img = this.el.coverImg
    if (src) {
      img.src = src
      img.classList.add('has-cover')
    } else {
      img.removeAttribute('src')
      img.classList.remove('has-cover')
    }
  }

  // ── Save ──────────────────────────────────────────────────────────
  async _save() {
    const targets = this.multiSelect.length ? this.multiSelect : (this.currentFile ? [this.currentFile.path] : [])
    if (!targets.length) return

    const f = this.el.fields
    const tags = {}
    Object.keys(f).forEach(key => {
      const val = f[key].value.trim()
      // In multi-edit: only include fields that were actually changed (non-placeholder)
      if (f[key].placeholder === '[multiple values]' && !val) return
      tags[key] = val
    })

    const historyFiles = []
    let ok = 0, fail = 0

    for (const fp of targets) {
      try {
        const result = await window.api.metadata.write(fp, tags, this.pendingCover)
        historyFiles.push({ original: fp, backupPath: result.backupPath })
        ok++
      } catch (err) {
        this._log('error', `✗ ${fp.split(/[\\/]/).pop()}: ${err.message}`)
        fail++
      }
    }

    if (historyFiles.length) {
      await window.api.history.add(
        'metadata',
        `Metadata saved (${ok} file${ok !== 1 ? 's' : ''})`,
        historyFiles
      )
    }

    this.pendingCover = null  // reset after save
    this._log('success', `✓ Saved ${ok} file${ok !== 1 ? 's' : ''}${fail ? `, ${fail} failed` : ''}`)
    _toast(`Saved ${ok} file${ok !== 1 ? 's' : ''}`)

    // Refresh displayed data for saved files
    await this._refreshFiles(targets)
  }

  async _refreshFiles(paths) {
    for (const fp of paths) {
      const idx = this.files.findIndex(f => f.path === fp)
      if (idx === -1) continue
      try {
        const props = await window.api.files.getProperties(fp)
        Object.assign(this.files[idx], {
          title:      props.tags.title,
          artist:     props.tags.artist,
          album:      props.tags.album,
          track:      props.tags.track      != null ? String(props.tags.track)      : '',
          discNumber: props.tags.discNumber != null ? String(props.tags.discNumber) : '',
          year:       props.tags.year       != null ? String(props.tags.year)       : '',
          genre:      props.tags.genre      || '',
        })
      } catch {}
    }
    this.table.setData(this.files)
  }

  // ── Cover art ─────────────────────────────────────────────────────
  async _chooseCover() {
    let p
    try {
      p = await window.api.dialog.openFile([
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png'] }
      ])
    } catch (err) {
      _toast(`Could not open file dialog: ${err.message}`, 'error')
      return
    }
    if (!p) return
    this.pendingCover = p
    // Show preview
    const reader = new FileReader()
    // Construct file URL for renderer display
    const fileUrl = p.startsWith('/') ? `file://${p}` : `file:///${p.replace(/\\/g, '/')}`
    this._setCover(fileUrl)
    this.el.coverStatus.textContent = 'New cover (unsaved)'
  }

  _removeCover() {
    this.pendingCover = ''   // '' = signal to remove
    this._setCover(null)
    this.el.coverStatus.textContent = 'Cover will be removed on save'
  }

  // ── MusicBrainz search ────────────────────────────────────────────
  async _openMBSearch() {
    const artist = this.el.fields.artist.value.trim()
    const album  = this.el.fields.album.value.trim()
    const title  = this.el.fields.title.value.trim()

    if (!artist && !album && !title) { _toast('Fill in artist, album, or title first'); return }

    const { modalBody, close } = Modal.open({ title: 'Search Cover Art', width: 560 })
    modalBody.innerHTML = '<p style="color:var(--text-tertiary);font-size:12px">Searching MusicBrainz…</p>'

    try {
      // Rate limit: 1 req/s
      const now = Date.now()
      const wait = 1000 - (now - this._mbRateLimit)
      if (wait > 0) await new Promise(r => setTimeout(r, wait))
      this._mbRateLimit = Date.now()

      const q   = [artist && `artist:"${artist}"`, album && `release:"${album}"`].filter(Boolean).join(' AND ')
      const url = `https://musicbrainz.org/ws/2/release?query=${encodeURIComponent(q)}&limit=12&fmt=json`
      const res = await fetch(url, { headers: { 'User-Agent': 'LocalPrep/0.1.0 ( localprep@example.com )' } })
      const data = await res.json()
      const releases = data.releases || []

      if (!releases.length) { modalBody.innerHTML = '<p style="color:var(--text-tertiary)">No results found</p>'; return }

      const grid = document.createElement('div')
      grid.style.cssText = 'display:grid;grid-template-columns:repeat(3,1fr);gap:10px'

      releases.forEach(rel => {
        const card = document.createElement('div')
        card.style.cssText = 'cursor:pointer;border:2px solid transparent;border-radius:8px;overflow:hidden;transition:border-color .15s'
        card.innerHTML = `
          <img src="https://coverartarchive.org/release/${rel.id}/front-150" style="width:100%;aspect-ratio:1;object-fit:cover;background:var(--bg-card)" onerror="this.style.display='none'">
          <p style="font-size:10px;padding:4px 6px;color:var(--text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${rel.title || '—'}</p>
          <p style="font-size:10px;padding:0 6px 6px;color:var(--text-tertiary)">${rel.date || ''}</p>`
        card.addEventListener('click', async () => {
          grid.querySelectorAll('div').forEach(c => c.style.borderColor = 'transparent')
          card.style.borderColor = 'var(--accent)'
          // Fetch full-res cover
          const imgUrl = `https://coverartarchive.org/release/${rel.id}/front`
          try {
            const r = await fetch(imgUrl)
            if (r.ok) {
              const blob = await r.blob()
              const ou   = URL.createObjectURL(blob)
              this._setCover(ou)
              this.el.coverStatus.textContent = `MusicBrainz: ${rel.title} (unsaved)`
              // Save blob to temp via IPC not feasible — store URL for now
              // On save, we'll download and write the image via main process
              this.pendingCover = imgUrl   // URL marker
            }
          } catch {}
          setTimeout(close, 600)
        })
        grid.appendChild(card)
      })

      modalBody.innerHTML = ''
      modalBody.appendChild(grid)

    } catch (err) {
      modalBody.innerHTML = `<p style="color:var(--error)">Error: ${err.message}</p>`
    }
  }

  // ── Batch Rename modal ────────────────────────────────────────────
  _openBatchRename() {
    const checked = this.table.getSelected()
    const files   = checked.length > 0 ? checked : this.table.getAll()
    if (!files.length) { _toast('No files loaded'); return }

    const DEFAULT_PATTERN = '{track} - {title}'
    let saveTimer = null

    const bodyEl = document.createElement('div')
    bodyEl.innerHTML = `
      <div style="margin-bottom:10px">
        <label class="toolbar-label" style="margin-bottom:4px;display:block">Pattern</label>
        <input class="input input-mono" id="rnPattern" style="margin-bottom:8px" placeholder="${DEFAULT_PATTERN}">
        <div style="display:flex;flex-wrap:wrap;gap:4px;margin-bottom:10px">
          ${['{track}','{disc}','{title}','{artist}','{album}','{year}','{genre}'].map(t =>
            `<button class="btn btn-secondary btn-xs" data-token="${t}">${t}</button>`
          ).join('')}
        </div>
        <div id="rnPreview" style="max-height:260px;overflow-y:auto;font-size:11px;font-family:var(--font-mono)"></div>
      </div>
    `

    const { close, overlay } = Modal.open({
      title: 'Batch Rename',
      body: bodyEl,
      width: 560,
      footer: `
        <button class="btn btn-ghost btn-sm" id="rnReset">Reset</button>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" id="rnCancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="rnApply">Rename</button>`,
    })

    const patInput = overlay.querySelector('#rnPattern')
    const preview  = overlay.querySelector('#rnPreview')

    const updatePreview = () => {
      const pat = patInput.value || DEFAULT_PATTERN
      preview.innerHTML = files.slice(0, 20).map(f => {
        const newName = _applyRenamePattern(pat, f)
        const ext = f.filename.substring(f.filename.lastIndexOf('.'))
        return `<div style="display:grid;grid-template-columns:1fr auto 1fr;gap:6px;padding:3px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-tertiary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${f.filename}">${f.filename}</span>
          <span style="color:var(--accent);padding:0 2px">→</span>
          <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${newName}${ext}">${newName}<span style="color:var(--text-tertiary)">${ext}</span></span>
        </div>`
      }).join('')
    }

    // Load saved pattern from store
    window.api.store.get('batchRenamePattern').then(saved => {
      patInput.value = saved || DEFAULT_PATTERN
      updatePreview()
    })

    patInput.addEventListener('input', () => {
      updatePreview()
      clearTimeout(saveTimer)
      saveTimer = setTimeout(() => window.api.store.set('batchRenamePattern', patInput.value), 600)
    })

    overlay.querySelectorAll('[data-token]').forEach(btn => {
      btn.addEventListener('click', () => {
        const pos = patInput.selectionStart
        const val = patInput.value
        patInput.value = val.slice(0, pos) + btn.dataset.token + val.slice(pos)
        patInput.focus()
        updatePreview()
      })
    })

    overlay.querySelector('#rnReset').addEventListener('click', () => {
      patInput.value = DEFAULT_PATTERN
      window.api.store.set('batchRenamePattern', DEFAULT_PATTERN)
      updatePreview()
    })

    overlay.querySelector('#rnCancel').addEventListener('click', close)
    overlay.querySelector('#rnApply').addEventListener('click', async () => {
      const pat = patInput.value || DEFAULT_PATTERN
      window.api.store.set('batchRenamePattern', pat)
      const results = await window.api.metadata.batchRename([...files], pat)
      const ok   = results.filter(r => r.success).length
      const skip = results.filter(r => r.skipped).length
      const fail = results.filter(r => !r.success && !r.skipped).length
      _toast(`Renamed ${ok} file${ok !== 1 ? 's' : ''}${skip ? `, ${skip} skipped` : ''}${fail ? `, ${fail} failed` : ''}`)
      close()
      await this._search()
    })
  }

  // ── Tracklist Sequencer modal ─────────────────────────────────────
  async _openTracklist() {
    const checked = this.table.getSelected()
    const files   = checked.length > 0 ? checked : this.table.getAll()
    if (!files.length) { _toast('No files loaded'); return }

    // Group by disc
    const discs = {}
    files.forEach(f => {
      const disc = String(f.discNumber || '1')
      if (!discs[disc]) discs[disc] = []
      discs[disc].push({ ...f })
    })
    const discKeys = Object.keys(discs).sort((a, b) => +a - +b)

    // ── Build a single track row (programmatic — safe for all paths) ─
    const makeRow = song => {
      const row = document.createElement('div')
      row.className = 'track-row'
      row.draggable = true
      row.dataset.path = song.path   // safe: no innerHTML encoding issue

      const numEl = document.createElement('span')
      numEl.className = 'track-num'
      numEl.style.cssText = 'font-size:11px;color:var(--accent);font-family:var(--font-mono);width:22px;text-align:right;flex-shrink:0;pointer-events:none'

      const titleEl = document.createElement('span')
      titleEl.style.cssText = 'flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;pointer-events:none'
      titleEl.title = song.filename
      titleEl.textContent = song.title || song.filename

      const artistEl = document.createElement('span')
      artistEl.style.cssText = 'font-size:11px;color:var(--text-tertiary);flex-shrink:0;pointer-events:none'
      artistEl.textContent = song.artist || ''

      row.style.cssText = 'display:flex;align-items:center;gap:8px;padding:7px 10px;background:var(--bg-card);border-radius:6px;margin-bottom:3px;cursor:grab;border:1px solid var(--border);user-select:none'
      row.append(numEl, titleEl, artistEl)
      return row
    }

    // ── Refresh position numbers after any drag ──────────────────────
    const updateNumbers = () => {
      bodyEl.querySelectorAll('.disc-tracks').forEach(dt => {
        dt.querySelectorAll('.track-row').forEach((row, i) => {
          const n = row.querySelector('.track-num')
          if (n) n.textContent = i + 1
        })
      })
    }

    // ── Build a disc group element ───────────────────────────────────
    const makeDiscGroup = dk => {
      const group = document.createElement('div')
      group.className = 'disc-group'
      group.dataset.disc = dk
      group.style.marginBottom = '16px'

      const header = document.createElement('div')
      header.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px'

      const label = document.createElement('span')
      label.style.cssText = 'font-size:12px;font-weight:600;color:var(--text-tertiary);text-transform:uppercase;letter-spacing:.05em'
      label.textContent = `Disc ${dk}`
      header.appendChild(label)

      if (discKeys.length > 1) {
        const rmBtn = document.createElement('button')
        rmBtn.className = 'btn btn-ghost btn-xs remove-disc'
        rmBtn.dataset.disc = dk
        rmBtn.textContent = 'Remove Disc'
        header.appendChild(rmBtn)
      }

      const tracksEl = document.createElement('div')
      tracksEl.className = 'disc-tracks'
      tracksEl.dataset.disc = dk
      ;(discs[dk] || []).forEach(s => tracksEl.appendChild(makeRow(s)))

      group.append(header, tracksEl)
      return group
    }

    // ── Drag-sort: rows stay in DOM order, numbers refresh on drop ───
    let dragSrc = null

    const bindDrag = row => {
      row.addEventListener('dragstart', e => {
        dragSrc = row
        e.dataTransfer.effectAllowed = 'move'
        setTimeout(() => { if (dragSrc) dragSrc.style.opacity = '0.4' }, 0)
      })
      row.addEventListener('dragend', () => {
        if (dragSrc) dragSrc.style.opacity = ''
        dragSrc = null
        updateNumbers()
      })
      row.addEventListener('dragover', e => {
        e.preventDefault()
        e.stopPropagation()
        if (!dragSrc || dragSrc === row) return
        const mid = row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2
        row.parentNode.insertBefore(dragSrc, e.clientY < mid ? row : row.nextSibling)
      })
    }

    const bindContainer = container => {
      container.addEventListener('dragover', e => {
        e.preventDefault()
        if (!dragSrc || e.target !== container) return
        container.appendChild(dragSrc)  // dropped onto empty area at bottom
      })
    }

    // ── Build body ───────────────────────────────────────────────────
    const bodyEl = document.createElement('div')
    bodyEl.style.cssText = 'max-height:420px;overflow-y:auto'

    const buildBody = () => {
      bodyEl.innerHTML = ''
      discKeys.forEach(dk => {
        const group = makeDiscGroup(dk)
        bodyEl.appendChild(group)
        group.querySelectorAll('.track-row').forEach(bindDrag)
        bindContainer(group.querySelector('.disc-tracks'))
      })
      updateNumbers()
    }
    buildBody()

    // Remove-disc via event delegation
    bodyEl.addEventListener('click', e => {
      const btn = e.target.closest('.remove-disc')
      if (!btn) return
      const dk = btn.dataset.disc
      // Move all songs in this disc to disc 1
      const disc1 = bodyEl.querySelector('.disc-tracks[data-disc="1"]')
      bodyEl.querySelectorAll(`.disc-tracks[data-disc="${dk}"] .track-row`).forEach(r => disc1?.appendChild(r))
      const group = bodyEl.querySelector(`.disc-group[data-disc="${dk}"]`)
      if (group) group.remove()
      discKeys.splice(discKeys.indexOf(dk), 1)
      updateNumbers()
    })

    const { close, overlay } = Modal.open({
      title: 'Tracklist Sequencer',
      body: bodyEl,
      width: 580,
      footer: `
        <button class="btn btn-ghost btn-sm" id="tlAddDisc">+ Add Disc</button>
        <label style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--text-secondary);cursor:pointer;margin-left:12px">
          <input type="checkbox" id="tlUpdateFilenames" style="cursor:pointer">
          Dateinamen aktualisieren
        </label>
        <div style="flex:1"></div>
        <button class="btn btn-ghost btn-sm" id="tlCancel">Cancel</button>
        <button class="btn btn-primary btn-sm" id="tlApply">Apply Track Numbers</button>
      `,
    })

    overlay.querySelector('#tlAddDisc').addEventListener('click', () => {
      const newKey = String(discKeys.length ? Math.max(...discKeys.map(Number)) + 1 : 2)
      discKeys.push(newKey)
      discs[newKey] = []
      const group = makeDiscGroup(newKey)
      bodyEl.appendChild(group)
      group.querySelectorAll('.track-row').forEach(bindDrag)
      bindContainer(group.querySelector('.disc-tracks'))
      updateNumbers()
    })

    overlay.querySelector('#tlCancel').addEventListener('click', close)

    overlay.querySelector('#tlApply').addEventListener('click', async () => {
      const updateFilenames = overlay.querySelector('#tlUpdateFilenames').checked
      const assignments = []
      discKeys.forEach(dk => {
        const rows = bodyEl.querySelectorAll(`.disc-tracks[data-disc="${dk}"] .track-row`)
        const total = rows.length
        rows.forEach((row, i) => {
          assignments.push({ path: row.dataset.path, track: i + 1, total, disc: parseInt(dk, 10), updateFilenames })
        })
      })
      if (!assignments.length) { _toast('No files to process', 'error'); return }
      try {
        const hf = await window.api.metadata.applyTrackNumbers(assignments)
        if (hf.length) {
          await window.api.history.add('metadata', `Tracklist applied (${hf.length} files)`, hf)
        }
        const failed = assignments.length - hf.length
        _toast(`Applied to ${hf.length} file${hf.length !== 1 ? 's' : ''}${failed ? ` — ${failed} failed` : ''}`,
          failed ? 'error' : 'success')
        close()

        // Build lookup maps so we can update in-memory data directly — no rescan needed
        const assignMap = new Map(assignments.map(a => [a.path, a]))
        const renameMap = new Map(hf.filter(f => f.renamedTo).map(f => [f.original, f.renamedTo]))

        // Update this.files in-place
        this.files = this.files.map(f => {
          const a = assignMap.get(f.path)
          if (!a) return f
          const newPath     = renameMap.get(f.path) || f.path
          const newFilename = newPath !== f.path ? newPath.split(/[\\/]/).pop() : f.filename
          return { ...f, track: String(a.track), discNumber: String(a.disc), path: newPath, filename: newFilename }
        })
        this.table.setData(this.files)

        // If the editor is showing one of the updated files, patch it live
        if (this.currentFile) {
          const a = assignMap.get(this.currentFile.path)
          if (a) {
            this.el.fields.track.value      = String(a.track)
            this.el.fields.discNumber.value = String(a.disc)
            // Sync currentFile reference to the updated object
            const newPath = renameMap.get(this.currentFile.path) || this.currentFile.path
            this.currentFile = this.files.find(f => f.path === newPath) || this.currentFile
          }
        }
      } catch (err) {
        _toast(`Error: ${err.message}`, 'error')
      }
    })
  }

  // ── Helpers ───────────────────────────────────────────────────────
  _log(level, text) {
    const div = document.createElement('div')
    div.className   = `log-line ${level}`
    div.textContent = text
    this.el.logBody.appendChild(div)
    this.el.logSection.style.display = ''
    this.el.logBody.scrollTop        = this.el.logBody.scrollHeight
  }

  async _showProps(row) {
    const m = Modal.open({ title: 'File Properties', width: 480 })
    m.setContent('<p style="color:var(--text-tertiary);font-size:12px">Loading…</p>')
    try {
      const p = await window.api.files.getProperties(row.path)
      m.setContent(_propsHtml(p))
      // Load cover art into the thumbnail asynchronously
      if (p.hasCover) {
        const thumb = document.getElementById('propsThumb')
        if (thumb) {
          window.api.files.getCover(row.path).then(dataUrl => {
            if (dataUrl && thumb.isConnected) {
              thumb.src = dataUrl
              thumb.style.display = 'block'
            }
          }).catch(() => {})
        }
      }
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
        this.el.statusBar.textContent = `${this.files.length} files`
      }
      this.table.selectRow(filePath)
      // Load the file into the editor
      const file = this.files.find(f => f.path === filePath)
      if (file) this._loadFile(file)
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

// ── Rename pattern helper ─────────────────────────────────────────
function _applyRenamePattern(pattern, file) {
  // safe() must handle numbers too (music-metadata returns year/disc as numbers)
  const safe = v => String(v ?? '').replace(/[\\/:*?"<>|]/g, '_').trim()
  const trackStr = file.track != null && file.track !== ''
    ? String(file.track).padStart(2, '0')
    : ''
  return pattern
    .replace(/{title}/g,  safe(file.title))
    .replace(/{artist}/g, safe(file.artist))
    .replace(/{album}/g,  safe(file.album))
    .replace(/{year}/g,   safe(file.year))
    .replace(/{track}/g,  trackStr)
    .replace(/{genre}/g,  safe(file.genre))
    .replace(/{disc}/g,   safe(file.discNumber))
    .trim() || file.filename.replace(/\.[^.]+$/, '')
}

window.MetadataTab     = new MetadataTab()
window._applyRenamePattern = _applyRenamePattern
