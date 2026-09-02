const fs   = require('fs')
const path = require('path')
const { ffmpeg, ffmpegPath, probe } = require('./ffmpeg')
const { metadataOpts } = require('./ffmpegOpts')

let _activeCmd = null   // fluent-ffmpeg instance for cancel

// ── Public API ────────────────────────────────────────────────────

function cancelConversion() {
  if (_activeCmd) { try { _activeCmd.kill('SIGKILL') } catch {} }
  _activeCmd = null
}

/**
 * Convert sample rates for a list of files.
 *
 * @param {FileInfo[]} files
 * @param {{
 *   targetSampleRate: number,
 *   overwrite: boolean,
 *   suffix: string,
 *   outputFolder: string|null
 * }} options
 * @param {(data: object) => void} onProgress  called with { tab, type, … }
 * @param {(msg:  object) => void} onLog       called with { tab, level, text }
 * @returns {Promise<{ historyFiles: object[], successCount: number, errorCount: number }>}
 */
async function convertSampleRate(files, options, onProgress, onLog) {
  _activeCmd = null
  const historyFiles = []
  const results      = []   // per-file readback so the renderer can refresh the table
  let successCount = 0, errorCount = 0

  const log = (level, text) => onLog({ tab: 'sample-rate', level, text })
  const prog = (data)        => onProgress({ tab: 'sample-rate', ...data })

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    log('info', `Processing: ${file.filename}`)

    const outputPath = _buildOutputPath(file.path, options)
    // When overwriting, ffmpeg can't write to the same path as input —
    // write to a temp file, then swap it in after success.
    const tempPath   = options.overwrite
      ? outputPath + '.tmp_convert' + path.extname(file.path)
      : null
    const ffmpegDest = tempPath || outputPath

    // backupPath is resolved inside the try so backup errors are caught per-file
    let backupPath = null
    // Remember whether the source had a cover, so a loss can be reported
    const hadCover = (await probe(file.path))?.hasCover ?? false

    try {
      // Create backup before any write
      if (options.overwrite) {
        try {
          backupPath = _backupPath(file.path, options.backupFolder)
          fs.copyFileSync(file.path, backupPath)
        } catch (err) {
          throw new Error(`Backup failed — ${err.message}. Check Settings → Backup folder.`)
        }
      }

      await _runFfmpeg(
        file.path, ffmpegDest, options.targetSampleRate, options.defaultBitrate,
        (pct) => prog({ type: 'file', file: file.filename, percent: pct, current: i + 1, total: files.length }),
        (cmdline) => log('info', `  ffmpeg: ${cmdline}`)
      )

      // Swap temp → original
      if (tempPath) {
        fs.copyFileSync(tempPath, outputPath)
        fs.unlinkSync(tempPath)
      }

      prog({ type: 'file',    file: file.filename, percent: 100, current: i + 1, total: files.length })
      prog({ type: 'overall', percent: Math.round(((i + 1) / files.length) * 100) })

      // ── Verify what actually landed on disk ──────────────────────
      const actual = await probe(outputPath)
      if (actual) {
        const kbps = actual.bitrate ? `${Math.round(actual.bitrate / 1000)} kbps` : 'n/a'
        log('info', `  → ${actual.sampleRate ?? '?'} Hz, ${kbps}${actual.hasCover ? ', cover kept' : ''}`)
        if (actual.sampleRate && actual.sampleRate !== options.targetSampleRate) {
          log('error', `✗  ${file.filename}: sample rate is ${actual.sampleRate} Hz, expected ${options.targetSampleRate} Hz`)
        }
        if (hadCover && !actual.hasCover) {
          // Sample-rate conversion keeps the container, so a lost cover is always a defect
          log('error', `✗  ${file.filename}: cover art was lost during conversion`)
        }
      }

      log('success', `✓  ${file.filename}  →  ${options.targetSampleRate} Hz`)

      results.push({
        path:       outputPath,
        original:   file.path,
        sampleRate: actual?.sampleRate ?? options.targetSampleRate,
        bitrate:    actual?.bitrate ?? null,
      })
      historyFiles.push({
        original:   file.path,
        backupPath: backupPath,
        outputPath: options.overwrite ? null : outputPath,
      })
      successCount++

    } catch (err) {
      // Clean up temp file if it exists
      if (tempPath && fs.existsSync(tempPath)) {
        try { fs.unlinkSync(tempPath) } catch {}
      }
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

module.exports = { convertSampleRate, cancelConversion }

// ── Private ────────────────────────────────────────────────────────

function _backupPath(inputPath, backupFolder) {
  const dir = backupFolder || path.dirname(inputPath)
  try {
    fs.mkdirSync(dir, { recursive: true })
  } catch (err) {
    throw new Error(`Cannot create backup folder "${dir}": ${err.message}`)
  }
  return path.join(dir, path.basename(inputPath) + '_' + Date.now() + '.bak')
}

function _buildOutputPath(inputPath, options) {
  if (options.overwrite) return inputPath
  const dir    = options.outputFolder || path.dirname(inputPath)
  const ext    = path.extname(inputPath)
  const base   = path.basename(inputPath, ext)
  const suffix = options.suffix || ''
  return path.join(dir, `${base}${suffix}${ext}`)
}

function _runFfmpeg(input, output, sampleRate, defaultBitrate, onProgress, onStart) {
  return new Promise((resolve, reject) => {
    let duration = 0

    // Temp files carry a ".tmp_convert.<ext>" tail — the real target extension
    // is the last one, which is what _normExt/extname pick up either way.
    const ext     = path.extname(output).toLowerCase().replace('.', '')
    const isMP3   = ext === 'mp3'
    const codecOpts = isMP3
      ? ['-c:a', 'libmp3lame', '-b:a', defaultBitrate || '320k']
      : []

    // Codec first, then the tag/cover mapping — order matters to ffmpeg
    const outOpts = [...codecOpts, ...metadataOpts(ext)]

    const cmd = ffmpeg(input)
      .audioFrequency(sampleRate)
      .outputOptions(outOpts)
      .on('start', cmdline => { try { onStart?.(cmdline) } catch {} })
      .on('codecData', d => {
        duration = _parseDuration(d.duration)
      })
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
        // SIGKILL from cancel = not a real error
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
  if (!m) return 0
  return +m[1] * 3600 + +m[2] * 60 + +m[3]
}
