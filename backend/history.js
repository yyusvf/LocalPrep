const fs   = require('fs')
const path = require('path')

// Lazy-load store to avoid circular deps
function store() { return require('./store') }

const MAX_ENTRIES = 200

// ── Public API ────────────────────────────────────────────────────

function getHistory(type = null) {
  const all = store().get('history') || []
  return type ? all.filter(h => h.type === type) : all
}

/**
 * Record an operation.
 * @param {'sample-rate'|'format'|'metadata'} type
 * @param {string} description
 * @param {{ original: string, backupPath?: string, outputPath?: string }[]} files
 */
function addEntry(type, description, files) {
  const history = store().get('history') || []
  const entry = {
    id:          `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type,
    timestamp:   Date.now(),
    description,
    fileCount:   files.length,
    files,
  }
  history.unshift(entry)
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES
  store().set('history', history)
  return entry
}

/**
 * Undo an entry by restoring all backup files.
 * Returns { restored, failed } counts.
 */
function undoEntry(id) {
  const history = store().get('history') || []
  const idx     = history.findIndex(h => h.id === id)
  if (idx === -1) throw new Error('Entry not found')

  const entry = history[idx]
  let restored = 0, failed = 0

  for (const f of entry.files) {
    try {
      if (f.backupPath && fs.existsSync(f.backupPath)) {
        fs.copyFileSync(f.backupPath, f.original)
        fs.unlinkSync(f.backupPath)
        // If a new output file was created (format/SR conversion), remove it
        if (f.outputPath && f.outputPath !== f.original && fs.existsSync(f.outputPath)) {
          fs.unlinkSync(f.outputPath)
        }
        // If the file was renamed by the tracklist sequencer, delete the renamed copy
        if (f.renamedTo && f.renamedTo !== f.original && fs.existsSync(f.renamedTo)) {
          try { fs.unlinkSync(f.renamedTo) } catch {}
        }
        restored++
      } else {
        failed++
      }
    } catch {
      failed++
    }
  }

  // Remove from history after undo
  history.splice(idx, 1)
  store().set('history', history)

  return { restored, failed }
}

function clearHistory(type = null) {
  if (!type) { store().set('history', []); return }
  const filtered = (store().get('history') || []).filter(h => h.type !== type)
  store().set('history', filtered)
}

module.exports = { getHistory, addEntry, undoEntry, clearHistory }
