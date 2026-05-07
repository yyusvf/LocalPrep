const fs   = require('fs')
const path = require('path')
const mm   = require('music-metadata')

const SUPPORTED = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.aiff', '.aif'])

// ── Public API ────────────────────────────────────────────────────

/**
 * Scan a folder for audio files, read basic metadata, and optionally filter.
 * @param {string}  folderPath
 * @param {object}  opts  { recursive, sourceFormat, sourceSampleRate }
 * @returns {Promise<FileInfo[]>}
 */
async function scanFolder(folderPath, opts = {}) {
  const { recursive = false, sourceFormat = null, sourceSampleRate = null } = opts

  const rawPaths = []
  _walk(folderPath, rawPaths, recursive)

  const results = []
  for (const fp of rawPaths) {
    try {
      const info = await _readFile(fp)
      if (sourceFormat && info.ext.toLowerCase() !== sourceFormat.toLowerCase()) continue
      if (sourceSampleRate && info.sampleRate !== Number(sourceSampleRate))       continue
      results.push(info)
    } catch {
      // skip unreadable
    }
  }
  return results
}

/**
 * Read full metadata + technical info for a single file (used by Properties modal).
 */
async function getFileProperties(filePath) {
  const meta = await mm.parseFile(filePath, { duration: true })
  const stat  = fs.statSync(filePath)
  return {
    path:     filePath,
    filename: path.basename(filePath),
    size:     stat.size,
    modified: stat.mtime.toISOString(),
    // Technical
    format:   meta.format.container  || _extLabel(filePath),
    codec:    meta.format.codec      || '—',
    sampleRate: meta.format.sampleRate   || null,
    bitrate:    meta.format.bitrate      || null,
    duration:   meta.format.duration     || null,
    channels:   meta.format.numberOfChannels || null,
    // Tags
    tags: {
      title:       meta.common.title           || '',
      artist:      meta.common.artist          || '',
      album:       meta.common.album           || '',
      year:        meta.common.year            || '',
      track:       meta.common.track?.no       || '',
      genre:       meta.common.genre?.[0]      || '',
      comment:     meta.common.comment?.[0]?.text || '',
      albumartist: meta.common.albumartist     || '',
      composer:    meta.common.composer?.[0]   || '',
      discNumber:  meta.common.disk?.no        || '',
    },
    hasCover: (meta.common.picture?.length ?? 0) > 0,
  }
}

/**
 * Return a cover-art data-URL or null for display in the renderer.
 */
async function getCoverDataUrl(filePath) {
  const meta = await mm.parseFile(filePath, { skipCovers: false })
  const pic  = meta.common.picture?.[0]
  if (!pic) return null
  return `data:${pic.format};base64,${Buffer.from(pic.data).toString('base64')}`
}

/**
 * Read a single audio file — returns the same shape as scanFolder rows.
 * Used when opening a file via CLI args / shell extension.
 */
async function readFile(filePath) {
  return _readFile(filePath)
}

module.exports = { scanFolder, getFileProperties, getCoverDataUrl, readFile }

// ── Private ────────────────────────────────────────────────────────

function _walk(dir, out, recursive) {
  let entries
  try { entries = fs.readdirSync(dir, { withFileTypes: true }) } catch { return }

  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory() && recursive) { _walk(full, out, true); continue }
    if (e.isFile() && SUPPORTED.has(path.extname(e.name).toLowerCase())) out.push(full)
  }
}

async function _readFile(fp) {
  const meta = await mm.parseFile(fp, { duration: false, skipCovers: true })
  const stat  = fs.statSync(fp)
  return {
    path:       fp,
    filename:   path.basename(fp),
    ext:        path.extname(fp).slice(1).toLowerCase(),
    format:     meta.format.container  || _extLabel(fp),
    sampleRate: meta.format.sampleRate || null,
    bitrate:    meta.format.bitrate    || null,
    duration:   meta.format.duration   || null,
    size:       stat.size,
    // Light tags for list display
    title:      meta.common.title        || '',
    artist:     meta.common.artist       || '',
    album:      meta.common.album        || '',
    track:      meta.common.track?.no != null ? String(meta.common.track.no) : '',
    year:       meta.common.year       != null ? String(meta.common.year)   : '',
    genre:      meta.common.genre?.[0]          || '',
    discNumber: meta.common.disk?.no   != null ? String(meta.common.disk.no): '',
  }
}

function _extLabel(fp) {
  return path.extname(fp).slice(1).toUpperCase() || '?'
}
