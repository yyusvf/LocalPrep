const fs     = require('fs')
const path   = require('path')
const os     = require('os')
const NodeID3 = require('node-id3')
const { ffmpegPath } = require('./ffmpeg')
const { spawn }      = require('child_process')

// ── Public API ────────────────────────────────────────────────────

/**
 * Write tags (and optionally cover art) to an audio file.
 * Always backs up the original first.
 *
 * @param {string}  filePath
 * @param {object}  tags  { title, artist, album, year, track, genre, comment, albumartist, composer, discNumber }
 * @param {string|null} coverPath  Absolute path to a JPEG/PNG file, or null to keep existing, or '' to remove.
 * @returns {Promise<{ backupPath: string }>}
 */
async function writeTags(filePath, tags, coverPath = null) {
  const ext        = path.extname(filePath).toLowerCase()
  const backupPath = filePath + '.undo_backup'

  // If coverPath is a URL, download it to a temp file first
  let tempCoverPath = null
  if (coverPath && typeof coverPath === 'string' && coverPath.startsWith('http')) {
    const https   = coverPath.startsWith('https') ? require('https') : require('http')
    const tmpFile = path.join(os.tmpdir(), `localprep_cover_${Date.now()}.jpg`)
    await new Promise((resolve, reject) => {
      const file = fs.createWriteStream(tmpFile)
      https.get(coverPath, res => {
        res.pipe(file)
        file.on('finish', () => { file.close(); resolve() })
      }).on('error', err => { fs.unlink(tmpFile, () => {}); reject(err) })
    })
    tempCoverPath = tmpFile
    coverPath = tmpFile
  }

  fs.copyFileSync(filePath, backupPath)

  try {
    if (ext === '.mp3' || ext === '.wav') {
      await _writeId3(filePath, tags, coverPath, ext)
    } else {
      await _writeFfmpeg(filePath, tags, coverPath, ext)
    }
    if (tempCoverPath) fs.unlink(tempCoverPath, () => {})
    return { backupPath }
  } catch (err) {
    if (tempCoverPath) fs.unlink(tempCoverPath, () => {})
    // Restore on error
    fs.copyFileSync(backupPath, filePath)
    fs.unlinkSync(backupPath)
    throw err
  }
}

/**
 * Batch rename files based on a pattern.
 * Pattern tokens: {title} {artist} {album} {year} {track} {genre} {disc}
 * Returns the list of { original, newPath } pairs.
 */
async function batchRename(files, pattern) {
  const results = []
  for (const file of files) {
    const newName  = _applyPattern(pattern, file) + path.extname(file.path)
    const newPath  = path.join(path.dirname(file.path), newName)
    if (newPath === file.path) { results.push({ original: file.path, newPath, skipped: true }); continue }
    try {
      fs.renameSync(file.path, newPath)
      results.push({ original: file.path, newPath, success: true })
    } catch (err) {
      results.push({ original: file.path, newPath, success: false, error: err.message })
    }
  }
  return results
}

/**
 * Apply track + disc numbers from a sequencer layout.
 * @param {{ path, track, total, disc, updateFilenames? }[]} assignments
 */
async function applyTrackNumbers(assignments) {
  const historyFiles = []
  for (const a of assignments) {
    const ext        = path.extname(a.path).toLowerCase()
    const backupPath = a.path + '.undo_backup'
    try {
      fs.copyFileSync(a.path, backupPath)
      if (ext === '.mp3' || ext === '.wav') {
        // Read all existing tags, merge new track/disc, write everything back.
        // Using read+write instead of update() avoids the internal raw-frame
        // merging issue in node-id3 that silently produces incorrect output.
        const existing = NodeID3.read(a.path) || {}
        delete existing.raw   // remove raw-frame copy to avoid conflicts
        existing.trackNumber = `${a.track}/${a.total}`
        existing.partOfSet   = String(a.disc)
        const ok = NodeID3.write(existing, a.path)
        if (ok !== true) throw new Error(`node-id3 write failed (returned: ${JSON.stringify(ok)})`)
      } else {
        await _writeFfmpegTrackOnly(a.path, a.track, a.total, a.disc, ext)
      }
      // Optional: rename file if it starts with a track/disc number
      let renamedTo = null
      if (a.updateFilenames) {
        const renamed = _renameWithTrackNum(a.path, a.track, a.disc)
        if (renamed !== a.path) renamedTo = renamed
      }
      const entry = { original: a.path, backupPath }
      if (renamedTo) entry.renamedTo = renamedTo
      historyFiles.push(entry)
    } catch (err) {
      if (fs.existsSync(backupPath)) {
        try { fs.copyFileSync(backupPath, a.path); fs.unlinkSync(backupPath) } catch {}
      }
      console.error(`applyTrackNumbers failed for ${a.path}:`, err.message)
    }
  }
  return historyFiles
}

/**
 * If the filename starts with a track (or disc-track) number pattern,
 * rename it to reflect the new numbering.
 * e.g. "03 - Song.mp3" → "05 - Song.mp3"
 *      "1-03 - Song.mp3" → "1-05 - Song.mp3"
 */
function _renameWithTrackNum(filePath, newTrack, newDisc) {
  const dir      = path.dirname(filePath)
  const ext      = path.extname(filePath)
  const base     = path.basename(filePath, ext)
  const trackStr = String(newTrack).padStart(2, '0')
  const discStr  = String(newDisc)

  // Pattern 1: disc-track "1-03 …" or "1-03. …" or "1-03 - …"
  let newBase = base.replace(/^(\d{1,2})(-{1,2})(\d{1,3})([^\w]|$)/, (_, _d, sep, _t, after) =>
    `${discStr}${sep}${trackStr}${after}`)

  // Pattern 2: track only "03 …" or "03. …" or "03 - …"
  if (newBase === base) {
    newBase = base.replace(/^(\d{1,3})([^\w]|$)/, (_, _t, after) => `${trackStr}${after}`)
  }

  if (newBase === base) return filePath   // nothing matched
  const newPath = path.join(dir, newBase + ext)
  if (newPath === filePath) return filePath
  fs.renameSync(filePath, newPath)
  return newPath
}

module.exports = { writeTags, batchRename, applyTrackNumbers }

// ── ID3 (MP3 / WAV) ───────────────────────────────────────────────

async function _writeId3(filePath, tags, coverPath, ext) {
  const id3 = {}

  if (tags.title       != null) id3.title         = tags.title
  if (tags.artist      != null) id3.artist         = tags.artist
  if (tags.album       != null) id3.album          = tags.album
  if (tags.year        != null) id3.year           = String(tags.year)
  if (tags.track       != null) id3.trackNumber    = String(tags.track)
  if (tags.genre       != null) id3.genre          = tags.genre
  if (tags.comment     != null) id3.comment        = { language: 'eng', text: tags.comment }
  if (tags.albumartist != null) id3.performerInfo  = tags.albumartist
  if (tags.composer    != null) id3.composer       = tags.composer
  if (tags.discNumber  != null) id3.partOfSet      = String(tags.discNumber)

  // Cover art
  if (coverPath === '') {
    // Remove cover: write without image field — node-id3 will strip existing
    id3.image = null
  } else if (coverPath) {
    const buf  = fs.readFileSync(coverPath)
    const isJpg = /\.(jpg|jpeg)$/i.test(coverPath)
    id3.image = {
      mime: isJpg ? 'image/jpeg' : 'image/png',
      type: { id: 3, name: 'front cover' },
      description: 'Cover',
      imageBuffer: buf,
    }
  }

  const ok = NodeID3.update(id3, filePath)
  if (!ok) throw new Error('node-id3 write failed')
}

// ── ffmpeg (FLAC / OGG / M4A / AIFF) ─────────────────────────────

async function _writeFfmpeg(filePath, tags, coverPath, ext) {
  const tmpPath = path.join(os.tmpdir(), `lp_meta_${Date.now()}${ext}`)

  // Map our tag keys → ffmpeg metadata keys
  const metaMap = {
    title:       tags.title,
    artist:      tags.artist,
    album:       tags.album,
    date:        tags.year,
    track:       tags.track,
    genre:       tags.genre,
    comment:     tags.comment,
    album_artist: tags.albumartist,
    composer:    tags.composer,
    disc:        tags.discNumber,
  }

  const args = ['-y', '-i', filePath]

  const hasCover = coverPath && coverPath !== ''
  if (hasCover) args.push('-i', coverPath)

  args.push('-map', '0:a')
  if (hasCover) {
    args.push('-map', '1:v', '-c:v', 'copy', '-disposition:v:0', 'attached_pic')
  } else if (coverPath === '') {
    // Remove cover — map only audio
  }

  args.push('-c:a', 'copy')

  // Write metadata
  args.push('-map_metadata', '-1')   // clear existing first
  Object.entries(metaMap).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      args.push('-metadata', `${k}=${v}`)
    }
  })

  args.push(tmpPath)

  await _spawnFfmpeg(args)
  fs.renameSync(tmpPath, filePath)
}

/**
 * Update only track + disc metadata for non-MP3 formats via ffmpeg.
 * Does NOT use -map_metadata -1, so all other existing tags are preserved.
 */
async function _writeFfmpegTrackOnly(filePath, track, total, disc, ext) {
  const tmpPath = path.join(os.tmpdir(), `lp_track_${Date.now()}${ext}`)
  const args = [
    '-y', '-i', filePath,
    '-map', '0',        // keep all streams (audio + embedded cover if any)
    '-c', 'copy',       // copy everything without re-encoding
    '-metadata', `track=${track}/${total}`,
    '-metadata', `disc=${disc}`,
    tmpPath,
  ]
  try {
    await _spawnFfmpeg(args)
  } catch {
    // Fallback: audio-only (some formats have no video stream)
    await _spawnFfmpeg([
      '-y', '-i', filePath,
      '-map', '0:a', '-c:a', 'copy',
      '-metadata', `track=${track}/${total}`,
      '-metadata', `disc=${disc}`,
      tmpPath,
    ])
  }
  fs.renameSync(tmpPath, filePath)
}

function _spawnFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args)
    const errs = []
    proc.stderr.on('data', d => errs.push(d.toString()))
    proc.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(errs.slice(-3).join('')))
    })
    proc.on('error', reject)
  })
}

// ── Pattern rename ────────────────────────────────────────────────

function _applyPattern(pattern, file) {
  return pattern
    .replace(/{title}/g,   _safe(file.title))
    .replace(/{artist}/g,  _safe(file.artist))
    .replace(/{album}/g,   _safe(file.album))
    .replace(/{year}/g,    _safe(file.year || file.tags?.year))
    .replace(/{track}/g,   String(file.track || file.tags?.track || '').padStart(2, '0'))
    .replace(/{genre}/g,   _safe(file.genre || file.tags?.genre))
    .replace(/{disc}/g,    _safe(file.discNumber || file.tags?.discNumber))
    // Sanitize for filesystem
    .replace(/[\\/:*?"<>|]/g, '_')
    .trim() || path.basename(file.path, path.extname(file.path))
}

function _safe(v) { return v ? String(v).replace(/[\\/:*?"<>|]/g, '_').trim() : '' }
