const fs   = require('fs')
const path = require('path')

// Lazy-load to avoid a require cycle with store/history
function store()   { return require('./store') }
function history() { return require('./history') }

/** Absolute path of the folder undo backups live in. */
function folder() {
  return store().get('backupFolder')
}

function _bakFiles() {
  const dir = folder()
  let names = []
  try { names = fs.readdirSync(dir).filter(f => f.endsWith('.bak')) } catch { return [] }
  return names.map(name => {
    const full = path.join(dir, name)
    let stat = null
    try { stat = fs.statSync(full) } catch {}
    return { name, path: full, size: stat?.size ?? 0, mtime: stat?.mtimeMs ?? 0 }
  })
}

/** How many backups exist and how much space they take. */
function getInfo() {
  const files = _bakFiles()
  return {
    count:  files.length,
    size:   files.reduce((acc, f) => acc + f.size, 0),
    folder: folder(),
  }
}

/**
 * Delete backup files and strip them from their history entries, so
 * "Undo" no longer offers to restore something that is gone.
 * @param {{path:string}[]} files
 * @returns {number} how many were deleted
 */
function _deleteFiles(files) {
  const deleted = []
  for (const f of files) {
    try { fs.unlinkSync(f.path); deleted.push(f.path) } catch {}
  }
  if (deleted.length) history().forgetBackups(deleted)
  return deleted.length
}

/** Delete every stored backup. */
function deleteAll() {
  return _deleteFiles(_bakFiles())
}

/**
 * Startup cleanup: drop backups older than the configured retention.
 * Retention is 'never' | '7' | '30' (days). 'never' keeps everything.
 * @returns {number} how many were deleted
 */
function cleanupExpired() {
  const retention = String(store().get('backupRetention') || 'never')
  if (retention === 'never') return 0

  const days = parseInt(retention, 10)
  if (!days || isNaN(days)) return 0

  const cutoff  = Date.now() - days * 24 * 60 * 60 * 1000
  // The history entries stay — they just lose their undo status via forgetBackups
  const expired = _bakFiles().filter(f => f.mtime > 0 && f.mtime < cutoff)
  return _deleteFiles(expired)
}

/**
 * Remove backup files no history entry refers to any more — they can never be
 * restored, so they are pure dead weight. Backups still tied to an entry are
 * left alone, which is the whole point of running this by reference rather
 * than by age.
 * @returns {number} how many were deleted
 */
function cleanupOrphans() {
  const referenced = new Set()
  for (const entry of require('./store').get('history') || []) {
    for (const f of entry.files || []) {
      if (f.backupPath) referenced.add(f.backupPath)
    }
  }
  const orphans = _bakFiles().filter(f => !referenced.has(f.path))
  let deleted = 0
  for (const f of orphans) {
    try { fs.unlinkSync(f.path); deleted++ } catch {}
  }
  return deleted
}

module.exports = { folder, getInfo, deleteAll, cleanupExpired, cleanupOrphans }
