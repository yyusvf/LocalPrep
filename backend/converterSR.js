const fs   = require('fs')
const path = require('path')
const { ffmpeg, ffmpegPath } = require('./ffmpeg')

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
  let successCount = 0, errorCount = 0

  const log = (level, text) => onLog({ tab: 'sample-rate', level, text })
  const prog = (data)        => onProgress({ tab: 'sample-rate', ...data })

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    log('info', `Processing: ${file.filename}`)

    const outputPath = _buildOutputPath(file.path, options)
    const backupPath = options.overwrite ? file.path + '.undo_backup' : null

    // When overwriting, ffmpeg can't write to the same path as input.
    // Write to a temp file, then swap it in after success.
    const tempPath = options.overwrite
      ? outputPath + '.tmp_convert' + path.extname(file.path)
      : null
    const ffmpegDest = tempPath || outputPath

    try {
      // Backup original before overwrite
      if (options.overwrite && backupPath) {
        fs.copyFileSync(file.path, backupPath)
      }

      await _runFfmpeg(file.path, ffmpegDest, options.targetSampleRate, (pct) => {
        prog({ type: 'file', file: file.filename, percent: pct, current: i + 1, total: files.length })
      })

      // Swap temp → original
      if (tempPath) {
        fs.copyFileSync(tempPath, outputPath)
        fs.unlinkSync(tempPath)
      }

      prog({ type: 'file',    file: file.filename, percent: 100, current: i + 1, total: files.length })
      prog({ type: 'overall', percent: Math.round(((i + 1) / files.length) * 100) })
      log('success', `✓  ${file.filename}  →  ${options.targetSampleRate} Hz`)

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
      // Restore backup on error
      if (backupPath && fs.existsSync(backupPath)) {
        try { fs.copyFileSync(backupPath, file.path); fs.unlinkSync(backupPath) } catch {}
      }
      log('error', `✗  ${file.filename}:  ${err.message}`)
      errorCount++
    }
  }

  _activeCmd = null
  return { historyFiles, successCount, errorCount }
}

module.exports = { convertSampleRate, cancelConversion }

// ── Private ────────────────────────────────────────────────────────

function _buildOutputPath(inputPath, options) {
  if (options.overwrite) return inputPath
  const dir    = options.outputFolder || path.dirname(inputPath)
  const ext    = path.extname(inputPath)
  const base   = path.basename(inputPath, ext)
  const suffix = options.suffix || ''
  return path.join(dir, `${base}${suffix}${ext}`)
}

function _runFfmpeg(input, output, sampleRate, onProgress) {
  return new Promise((resolve, reject) => {
    let duration = 0

    const isMP3 = path.extname(output).toLowerCase() === '.mp3'

    const cmd = ffmpeg(input)
      .audioFrequency(sampleRate)
      .outputOptions(isMP3 ? ['-id3v2_version 3', '-write_id3v1 1'] : [])
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
