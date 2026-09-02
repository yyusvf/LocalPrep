const fs   = require('fs')
const path = require('path')
const { ffmpeg, probe } = require('./ffmpeg')
const { metadataOpts, COVER_CAPABLE } = require('./ffmpegOpts')

let _activeCmd = null

// ── Codec / quality maps ──────────────────────────────────────────

const FORMAT_EXT = { mp3: 'mp3', flac: 'flac', wav: 'wav', ogg: 'ogg', m4a: 'm4a', aac: 'm4a', aiff: 'aiff' }

function _buildFfmpegOpts(targetFormat, quality, defaultBitrate) {
  const fmt = targetFormat.toLowerCase()
  // Falls back to the Settings default whenever the tab offered no explicit choice
  const bitrate = quality.bitrate || defaultBitrate || '320k'
  switch (fmt) {
    case 'mp3':
      if (quality.vbr) return ['-c:a', 'libmp3lame', '-q:a', '0']
      return ['-c:a', 'libmp3lame', '-b:a', bitrate]
    case 'flac':
      return ['-c:a', 'flac', '-compression_level', String(quality.compression ?? 5)]
    case 'ogg':
      return ['-c:a', 'libvorbis', '-q:a', String(quality.quality ?? 7)]
    case 'm4a':
    case 'aac':
      return ['-c:a', 'aac', '-b:a', bitrate]
    case 'wav':
      return ['-c:a', _pcmCodec(quality.bitDepth || '24', 'le')]
    case 'aiff':
      // AIFF is big-endian — the little-endian codecs make ffmpeg bail with EINVAL
      return ['-c:a', _pcmCodec(quality.bitDepth || '24', 'be'), '-f', 'aiff']
    default:
      return ['-c:a', 'copy']
  }
}

function _pcmCodec(depth, endian) {
  if (depth === '16') return `pcm_s16${endian}`
  if (depth === '32') return `pcm_f32${endian}`
  return `pcm_s24${endian}`
}

// ── Public API ────────────────────────────────────────────────────

function cancelConversion() {
  if (_activeCmd) { try { _activeCmd.kill('SIGKILL') } catch {} }
  _activeCmd = null
}

/**
 * @param {FileInfo[]} files
 * @param {{
 *   targetFormat: string,
 *   quality: object,
 *   deleteOriginal: boolean,
 *   outputFolder: string|null,
 *   suffix: string
 * }} options
 */
async function convertFormat(files, options, onProgress, onLog) {
  _activeCmd = null
  const historyFiles = []
  const results      = []   // per-file readback so the renderer can refresh the table
  let successCount = 0, errorCount = 0

  const log  = (level, text) => onLog({ tab: 'format', level, text })
  const prog = (data)        => onProgress({ tab: 'format', ...data })

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    log('info', `Processing: ${file.filename}`)

    const targetExt  = FORMAT_EXT[options.targetFormat.toLowerCase()] || options.targetFormat.toLowerCase()
    const outputPath = _buildOutputPath(file.path, targetExt, options)
    // backupPath resolved inside try so backup errors are caught per-file
    let backupPath = null
    // Remember whether the source had a cover, so a loss can be reported
    const hadCover = (await probe(file.path))?.hasCover ?? false

    try {
      // Create backup before any write
      if (options.deleteOriginal) {
        try {
          backupPath = _backupPath(file.path, options.backupFolder)
          fs.copyFileSync(file.path, backupPath)
        } catch (err) {
          throw new Error(`Backup failed — ${err.message}. Check Settings → Backup folder.`)
        }
      }

      await _runConvert(
        file.path, outputPath, options,
        (pct) => prog({ type: 'file', file: file.filename, percent: pct, current: i + 1, total: files.length }),
        (cmdline) => log('info', `  ffmpeg: ${cmdline}`)
      )

      // Delete original only after successful conversion
      if (options.deleteOriginal) {
        fs.unlinkSync(file.path)
      }

      prog({ type: 'file',    file: file.filename, percent: 100, current: i + 1, total: files.length })
      prog({ type: 'overall', percent: Math.round(((i + 1) / files.length) * 100) })

      // ── Verify what actually landed on disk ──────────────────────
      const actual = await probe(outputPath)
      if (actual) {
        const kbps = actual.bitrate ? `${Math.round(actual.bitrate / 1000)} kbps` : 'n/a'
        log('info', `  → ${actual.codec ?? '?'}, ${actual.sampleRate ?? '?'} Hz, ${kbps}${actual.hasCover ? ', cover kept' : ''}`)
        if (hadCover && !actual.hasCover) {
          // wav/ogg/aiff simply cannot carry a picture — that is not a defect
          log(COVER_CAPABLE.has(targetExt) ? 'error' : 'info',
              COVER_CAPABLE.has(targetExt)
                ? `✗  ${file.filename}: cover art was lost during conversion`
                : `  note: ${targetExt.toUpperCase()} cannot store cover art — dropped`)
        }
        const wanted = _wantedBitrate(options)
        if (wanted && actual.bitrate && Math.abs(actual.bitrate - wanted) > wanted * 0.2) {
          log('error', `✗  ${file.filename}: bitrate is ${Math.round(actual.bitrate / 1000)} kbps, expected ~${Math.round(wanted / 1000)} kbps`)
        }
      }

      log('success', `✓  ${file.filename}  →  ${path.basename(outputPath)}`)

      results.push({
        path:       outputPath,
        original:   file.path,
        sampleRate: actual?.sampleRate ?? null,
        bitrate:    actual?.bitrate ?? null,
      })
      historyFiles.push({
        original:   file.path,
        backupPath: backupPath,
        outputPath: outputPath,
      })
      successCount++

    } catch (err) {
      // Restore backup on error (only if backup succeeded)
      if (backupPath && fs.existsSync(backupPath)) {
        try { fs.copyFileSync(backupPath, file.path); fs.unlinkSync(backupPath) } catch {}
      }
      log('error', `✗  ${file.filename}:  ${err.message}`)
      errorCount++
    }
  }

  _activeCmd = null
  return { historyFiles, results, successCount, errorCount }
}

module.exports = { convertFormat, cancelConversion }

// ── Private ────────────────────────────────────────────────────────

/** Expected bitrate in bit/s for the chosen options, or null when not applicable. */
function _wantedBitrate(options) {
  const fmt = String(options.targetFormat).toLowerCase()
  // Only LAME CBR hits the requested number exactly. ffmpeg's native AAC
  // encoder clamps around 256 kbps and varies with the material, so checking
  // it would raise a false alarm on every single file.
  if (fmt !== 'mp3') return null
  if (options.quality?.vbr) return null   // VBR has no target
  const raw = options.quality?.bitrate || options.defaultBitrate || '320k'
  const n   = parseInt(String(raw), 10)
  return isNaN(n) ? null : n * 1000
}

function _backupPath(inputPath, backupFolder) {
  const dir = backupFolder || path.dirname(inputPath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    throw new Error(`Cannot create backup folder "${dir}": ${err.message}`)
  }
  return path.join(dir, path.basename(inputPath) + '_' + Date.now() + '.bak')
}

function _buildOutputPath(inputPath, targetExt, options) {
  const dir    = options.outputFolder || path.dirname(inputPath)
  const ext    = path.extname(inputPath)
  const base   = path.basename(inputPath, ext)
  const suffix = options.suffix || ''
  return path.join(dir, `${base}${suffix}.${targetExt}`)
}

function _runConvert(input, output, options, onProgress, onStart) {
  return new Promise((resolve, reject) => {
    let duration = 0
    const audioOpts = _buildFfmpegOpts(options.targetFormat, options.quality || {}, options.defaultBitrate)
    // Codec options first, then tag/cover mapping — order matters to ffmpeg
    const outOpts   = [...audioOpts, ...metadataOpts(path.extname(output))]

    const cmd = ffmpeg(input)
      .outputOptions(outOpts)
      .on('start', cmdline => { try { onStart?.(cmdline) } catch {} })
      .on('codecData', d => { duration = _parseDuration(d.duration) })
      .on('progress', p => {
        if (duration > 0) {
          const t = _parseDuration(p.timemark)
          onProgress(Math.min(99, Math.round((t / duration) * 100)))
        } else if (p.percent) {
          onProgress(Math.min(99, Math.round(p.percent)))
        }
      })
      .on('end',   resolve)
      .on('error', err => {
        if (err.message.includes('SIGKILL') || err.message.includes('killed')) {
          reject(new Error('Cancelled'))
        } else {
          reject(err)
        }
      })

    _activeCmd = cmd
    cmd.save(output)
  })
}

function _parseDuration(str) {
  if (!str) return 0
  const m = str.match(/(\d+):(\d+):(\d+\.?\d*)/)
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : 0
}
