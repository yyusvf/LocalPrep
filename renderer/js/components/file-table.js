/**
 * Reusable file table with:
 * – Checkbox selection (click row, shift+click range, header all/none)
 * – Sortable columns (click header, asc/desc toggle)
 * – Draggable column reordering (drag header to reorder)
 * – Live text filter
 * – Right-click context menu hook
 * – Double-click hook
 * – Optional persistence key: saves/restores column order + sort state via window.api.store
 */
class FileTable {
  /**
   * @param {HTMLElement} container  Wrapper element (will be cleared)
   * @param {ColDef[]}    columns    [{ key, label, width?, format?(val,row)=>string, title?:bool }]
   * @param {object}      hooks      { onContextMenu, onDoubleClick, onSelectionChange, onPlay }
   * @param {string}      [storeKey] If provided, column order + sort state are persisted under this key
   */
  constructor(container, columns, hooks = {}, storeKey = null) {
    this.container  = container
    this._origCols  = columns        // original definition order
    this.columns    = [...columns]   // current display order (may be reordered)
    this.hooks      = hooks
    this.storeKey   = storeKey

    this._rows      = []
    this._filtered  = []
    this._selected  = new Set()
    this._activeRow = null   // path of the row shown in editor (not a checkbox)
    this._sortCol   = null
    this._sortDir   = 'asc'
    this._lastIdx   = null

    // Column drag-to-reorder state
    this._dragColIdx = null

    // Column resize state
    this._colWidths  = {}   // { colKey: px-string }

    this._build()
    if (storeKey) this._restoreState()
  }

  // ── Public ───────────────────────────────────────────────────────

  setData(rows) {
    this._rows      = rows
    this._filtered  = [...rows]
    this._selected.clear()
    this._activeRow = null
    this._lastIdx   = null
    this._applySort()
    this.render()
  }

  filter(query) {
    const q = query.trim().toLowerCase()
    if (!q) {
      this._filtered = [...this._rows]
    } else {
      this._filtered = this._rows.filter(r =>
        this.columns.some(col => String(r[col.key] ?? '').toLowerCase().includes(q))
      )
    }
    this._selected = new Set([...this._selected].filter(p => this._filtered.some(r => r.path === p)))
    this._lastIdx = null
    this.render()
  }

  selectAll()   { this._filtered.forEach(r => this._selected.add(r.path)); this.render(); this._emitChange() }
  deselectAll() { this._selected.clear(); this.render(); this._emitChange() }

  removeSelected() {
    const rem = new Set(this._selected)
    this._rows     = this._rows.filter(r => !rem.has(r.path))
    this._filtered = this._filtered.filter(r => !rem.has(r.path))
    this._selected.clear()
    this._lastIdx = null
    this.render()
    this._emitChange()
  }

  getSelected() { return this._filtered.filter(r => this._selected.has(r.path)) }
  getAll()      { return [...this._filtered] }
  get count()   { return this._filtered.length }

  /** Select the row with this path and scroll it into view */
  selectRow(filePath) {
    this._selected.clear()
    this._selected.add(filePath)
    this.render()
    this._emitChange()
    // Scroll into view
    requestAnimationFrame(() => {
      const rows = this._tbody.querySelectorAll('tr')
      const idx  = this._filtered.findIndex(r => r.path === filePath)
      if (idx >= 0 && rows[idx]) rows[idx].scrollIntoView({ block: 'nearest' })
    })
  }

  render() {
    const tbody = this._tbody
    tbody.innerHTML = ''

    if (this._filtered.length === 0) {
      const tr = document.createElement('tr')
      tr.innerHTML = `<td colspan="${this.columns.length + 1}" style="padding:40px;text-align:center;color:var(--text-tertiary);font-size:12px">No files</td>`
      tbody.appendChild(tr)
      this._updateAllCheck()
      this._emitChange()
      return
    }

    this._filtered.forEach((row, idx) => {
      const isSelected = this._selected.has(row.path)
      const isActive   = this._activeRow === row.path
      const tr  = document.createElement('tr')
      tr.className = 'ft-row'
        + (isSelected ? ' selected' : '')
        + (isActive   ? ' active'   : '')
      tr.dataset.idx = idx

      // Checkbox cell — toggling only via checkbox, not row click
      const tdCb = document.createElement('td')
      tdCb.className = 'col-check'
      const cb = document.createElement('input')
      cb.type    = 'checkbox'
      cb.checked = isSelected
      cb.addEventListener('change', e => {
        e.stopPropagation()
        this._toggle(row.path, idx, false)
      })
      tdCb.appendChild(cb)
      tr.appendChild(tdCb)

      // Data cells — in current column order
      this.columns.forEach(col => {
        const td = document.createElement('td')
        const val = col.format ? col.format(row[col.key], row) : (row[col.key] ?? '')
        td.textContent = val
        if (col.title) td.title = val
        tr.appendChild(td)
      })

      // Left-click: toggle checkbox + activate
      tr.addEventListener('click', e => {
        if (e.target.type === 'checkbox') return
        this._toggle(row.path, idx, e.shiftKey)
      })

      // Right-click
      tr.addEventListener('contextmenu', e => {
        e.preventDefault()
        if (!this._selected.has(row.path)) {
          this._selected.clear()
          this._selected.add(row.path)
          this.render()
          this._emitChange()
        }
        this.hooks.onContextMenu?.(e.clientX, e.clientY, row, this.getSelected())
      })

      // Double-click
      tr.addEventListener('dblclick', e => {
        e.preventDefault()
        this.hooks.onDoubleClick?.(row)
      })

      tbody.appendChild(tr)
    })

    this._updateAllCheck()
    this._emitChange()
  }

  // ── Private — build ───────────────────────────────────────────────

  _build() {
    this.container.innerHTML = ''

    const table = document.createElement('table')
    table.className = 'file-table'

    // Header
    const thead = document.createElement('thead')
    const hrow  = document.createElement('tr')
    this._hrow  = hrow

    // All-check
    const thCb = document.createElement('th')
    thCb.className = 'col-check'
    this._allCheck = document.createElement('input')
    this._allCheck.type  = 'checkbox'
    this._allCheck.title = 'Select all / none'
    this._allCheck.addEventListener('change', () => {
      this._allCheck.checked ? this.selectAll() : this.deselectAll()
    })
    thCb.appendChild(this._allCheck)
    hrow.appendChild(thCb)

    // Column headers
    this._rebuildHeaders(hrow)

    thead.appendChild(hrow)
    table.appendChild(thead)

    this._tbody = document.createElement('tbody')
    table.appendChild(this._tbody)
    this.container.appendChild(table)
  }

  /** Re-create <th> elements for all columns in current order */
  _rebuildHeaders(hrow) {
    // Remove existing column headers (keep checkbox th at index 0)
    while (hrow.children.length > 1) hrow.removeChild(hrow.lastChild)

    this.columns.forEach((col, colIdx) => {
      const th = document.createElement('th')
      th.dataset.col = col.key
      th.style.position = 'relative'
      th.style.userSelect = 'none'

      // Apply saved width or default
      const savedW = this._colWidths[col.key]
      if (savedW)      th.style.width = savedW
      else if (col.width) th.style.width = col.width

      th.innerHTML = `<span class="col-label">${col.label}</span><span class="sort-icon"></span>`
      th.style.cursor = 'pointer'

      // Sort on click (but not if we just finished a drag/resize)
      th.addEventListener('click', () => {
        if (this._dragMoved || this._resizeMoved) return
        this._sortBy(col.key)
      })

      // ── Column drag-to-reorder ──────────────────────────────────
      th.setAttribute('draggable', 'true')

      th.addEventListener('dragstart', e => {
        // Block drag if resize is active OR if the event originated on the handle
        if (this._resizing || e.target.classList.contains('col-resize-handle')
            || th.getAttribute('draggable') === 'false') {
          e.preventDefault(); return
        }
        this._dragColIdx = colIdx
        this._dragMoved  = false
        e.dataTransfer.effectAllowed = 'move'
        th.style.opacity = '0.5'
      })

      th.addEventListener('dragend', () => {
        th.style.opacity = ''
        this._dragColIdx = null
        setTimeout(() => { this._dragMoved = false }, 50)
      })

      th.addEventListener('dragover', e => {
        e.preventDefault()
        if (this._dragColIdx === null || this._dragColIdx === colIdx) return
        e.dataTransfer.dropEffect = 'move'
        th.style.background = 'var(--accent-dim, rgba(99,102,241,.15))'
      })

      th.addEventListener('dragleave', () => {
        th.style.background = ''
      })

      th.addEventListener('drop', e => {
        e.preventDefault()
        th.style.background = ''
        if (this._dragColIdx === null || this._dragColIdx === colIdx) return

        const moved = this.columns.splice(this._dragColIdx, 1)[0]
        this.columns.splice(colIdx, 0, moved)
        this._dragMoved = true

        this._rebuildHeaders(this._hrow)
        this._updateSortHeaders()
        this.render()
        this._saveState()
      })

      // ── Column resize handle ────────────────────────────────────
      const handle = document.createElement('div')
      handle.className = 'col-resize-handle'

      handle.addEventListener('mousedown', e => {
        if (e.button !== 0) return
        e.preventDefault()
        e.stopPropagation()

        // Disable th drag so the browser can't start a drag-and-drop
        th.setAttribute('draggable', 'false')
        this._resizing    = true
        this._resizeMoved = false

        const startX = e.clientX
        const startW = th.offsetWidth

        // Full-page transparent overlay: captures every mousemove/mouseup
        // regardless of window size, scrollbars, or overflow containers.
        const overlay = document.createElement('div')
        overlay.style.cssText =
          'position:fixed;top:0;left:0;right:0;bottom:0;cursor:col-resize;z-index:9999'
        document.body.appendChild(overlay)

        overlay.addEventListener('mousemove', mv => {
          const dx = mv.clientX - startX
          if (Math.abs(dx) > 2) this._resizeMoved = true
          const newW = Math.max(50, startW + dx)
          th.style.width = newW + 'px'
          this._colWidths[col.key] = newW + 'px'
        })

        overlay.addEventListener('mouseup', () => {
          overlay.remove()
          th.setAttribute('draggable', 'true')
          this._resizing = false
          setTimeout(() => { this._resizeMoved = false }, 50)
          this._saveState()
        })
      })

      th.appendChild(handle)
      hrow.appendChild(th)
    })

    this._updateSortHeaders()
  }

  // ── Private — sort ────────────────────────────────────────────────

  _toggle(filePath, idx, shift) {
    if (shift && this._lastIdx !== null) {
      const start = Math.min(idx, this._lastIdx)
      const end   = Math.max(idx, this._lastIdx)
      for (let i = start; i <= end; i++) {
        this._selected.add(this._filtered[i].path)
      }
    } else {
      if (this._selected.has(filePath)) this._selected.delete(filePath)
      else                              this._selected.add(filePath)
    }
    this._lastIdx = idx
    this.render()
    this._emitChange()
  }

  _sortBy(col) {
    if (this._sortCol === col) {
      this._sortDir = this._sortDir === 'asc' ? 'desc' : 'asc'
    } else {
      this._sortCol = col
      this._sortDir = 'asc'
    }
    this._applySort()
    this._updateSortHeaders()
    this.render()
    this._saveState()
  }

  _applySort() {
    if (!this._sortCol) return
    const col = this._sortCol
    this._filtered.sort((a, b) => {
      const av = a[col] ?? '', bv = b[col] ?? ''
      const cmp = typeof av === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric: true })
      return this._sortDir === 'asc' ? cmp : -cmp
    })
  }

  _updateSortHeaders() {
    this.container.querySelectorAll('thead th[data-col]').forEach(th => {
      const icon = th.querySelector('.sort-icon')
      const isSorted = th.dataset.col === this._sortCol
      th.classList.toggle('sorted', isSorted)
      if (icon) icon.textContent = isSorted ? (this._sortDir === 'asc' ? ' ↑' : ' ↓') : ''
    })
  }

  _updateAllCheck() {
    const vis = this._filtered.length
    const sel = [...this._selected].filter(p => this._filtered.some(r => r.path === p)).length
    this._allCheck.checked       = vis > 0 && sel === vis
    this._allCheck.indeterminate = sel > 0  && sel < vis
  }

  _emitChange() {
    const sel   = [...this._selected].filter(p => this._filtered.some(r => r.path === p)).length
    const total = this._filtered.length
    this.hooks.onSelectionChange?.(sel, total)
  }

  _setActive(row) {
    this._activeRow = row ? row.path : null
    this.render()
    if (row) this.hooks.onActivate?.(row)
  }

  // ── Persistence ───────────────────────────────────────────────────

  _saveState() {
    if (!this.storeKey || !window.api?.store) return
    const state = {
      colOrder:  this.columns.map(c => c.key),
      colWidths: { ...this._colWidths },
      sortCol:   this._sortCol,
      sortDir:   this._sortDir,
    }
    window.api.store.set(this.storeKey, state)
  }

  async _restoreState() {
    if (!this.storeKey || !window.api?.store) return
    try {
      const state = await window.api.store.get(this.storeKey)
      if (!state) return

      // Restore column widths
      if (state.colWidths && typeof state.colWidths === 'object') {
        this._colWidths = { ...state.colWidths }
      }

      // Restore column order
      if (Array.isArray(state.colOrder)) {
        const ordered = []
        state.colOrder.forEach(key => {
          const col = this._origCols.find(c => c.key === key)
          if (col) ordered.push(col)
        })
        // Append any new columns not in saved state
        this._origCols.forEach(c => {
          if (!ordered.find(o => o.key === c.key)) ordered.push(c)
        })
        this.columns = ordered
        this._rebuildHeaders(this._hrow)
      }

      // Restore sort
      if (state.sortCol) {
        this._sortCol = state.sortCol
        this._sortDir = state.sortDir || 'asc'
        this._updateSortHeaders()
      }
    } catch {}
  }
}

window.FileTable = FileTable
