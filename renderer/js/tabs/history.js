/* ── History Tab ─────────────────────────────────────────────────── */
class HistoryTab {
  constructor() { this.entries = [] }

  init() {
    this.el = {
      filterType: document.getElementById('histFilterType'),
      clearBtn:   document.getElementById('histClearBtn'),
      tableBody:  document.getElementById('histTableBody'),
      emptyState: document.getElementById('histEmpty'),
    }
    this.el.filterType.addEventListener('change', () => this._render())
    this.el.clearBtn.addEventListener('click',   () => this._clearAll())
  }

  async refresh() {
    this.entries = await window.api.history.get(null) || []
    this._render()
  }

  _render() {
    const type     = this.el.filterType.value
    const filtered = type ? this.entries.filter(e => e.type === type) : this.entries
    const tbody    = this.el.tableBody

    tbody.innerHTML = ''

    if (!filtered.length) {
      this.el.emptyState.style.display = ''
      return
    }
    this.el.emptyState.style.display = 'none'

    filtered.forEach(entry => {
      const tr = document.createElement('tr')
      tr.className = 'ft-row'

      const typeLabel = { 'sample-rate': 'Sample Rate', 'format': 'Format', 'metadata': 'Metadata' }[entry.type] || entry.type
      const typeColor = { 'sample-rate': '#60a5fa', 'format': '#c8f542', 'metadata': '#f472b6' }[entry.type] || 'var(--text-secondary)'

      tr.innerHTML = `
        <td style="white-space:nowrap;font-family:var(--font-mono);font-size:11px;color:var(--text-tertiary)">${_fmtDate(entry.timestamp)}</td>
        <td><span style="font-size:11px;font-weight:600;color:${typeColor};padding:2px 6px;background:${typeColor}22;border-radius:4px">${typeLabel}</span></td>
        <td style="color:var(--text-secondary);font-size:12px">${entry.description}</td>
        <td style="color:var(--text-tertiary);font-size:11px;text-align:center">${entry.fileCount}</td>
        <td style="text-align:right">
          <button class="btn btn-secondary btn-xs undo-btn" data-id="${entry.id}">↩ Undo</button>
        </td>
      `

      tr.querySelector('.undo-btn').addEventListener('click', async () => {
        const ok = await Modal.confirm(
          `Undo: <strong>${entry.description}</strong>?<br>This will restore ${entry.fileCount} file(s).`,
          { title: 'Undo Operation', confirmLabel: 'Undo' }
        )
        if (!ok) return
        try {
          const result = await window.api.history.undo(entry.id)
          _toast(`Restored ${result.restored} file(s)${result.failed ? `, ${result.failed} failed` : ''}`)
          await this.refresh()
        } catch (err) {
          _toast(`Undo failed: ${err.message}`, 'error')
        }
      })

      tbody.appendChild(tr)
    })
  }

  async _clearAll() {
    const type = this.el.filterType.value
    const msg  = type
      ? `Clear all ${type} history entries?`
      : 'Clear all history? This cannot be undone.'
    const ok = await Modal.confirm(msg, { title: 'Clear History', confirmLabel: 'Clear', danger: true })
    if (!ok) return
    await window.api.history.clear(type || null)
    await this.refresh()
  }
}

function _fmtDate(ts) {
  const d = new Date(ts)
  return d.toLocaleDateString() + '  ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

window.HistoryTab = new HistoryTab()
