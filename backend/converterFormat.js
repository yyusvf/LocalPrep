const fs   = require('fs')
const path = require('path')
const { ffmpeg } = require('./ffmpeg')

let _activeCmd = null

// ── Codec / quality maps ──────────────────────────────────────────

const FORMAT_EXT = { mp3: 'mp3', flac: 'flac', wav: 'wav', ogg: 'ogg', m4a: 'm4a', aac: 'm4a', aiff: 'aiff' }

function _buildFfmpegOpts(targetFormat, quality) {
  const fmt = targetFormat.toLowerCase()
  switch (fmt) {
    case 'mp3':
      if (quality.vbr) return ['-c:a', 'libmp3lame', '-q:a', '0']
      return ['-c:a', 'libmp3lame', '-b:a', quality.bitrate || '320k']
    case 'flac':
      return ['-c:a', 'flac', '-compression_level', String(quality.compression ?? 5)]
    case 'ogg':
      return ['-c:a', 'libvorbis', '-q:a', String(quality.quality ?? 7)]
    case 'm4a':
    case 'aac':
      return ['-c:a', 'aac', '-b:a', quality.bitrate || '320k']
    case 'wav':
      return ['-c:a', _wavCodec(quality.bitDepth || '24')]
    case 'aiff':
      return ['-c:a', _wavCodec(quality.bitDepth || '24'), '-f', 'aiff']
    default:
      return ['-c:a', 'copy']
  }
}

function _wavCodec(depth) {
  return depth === '16' ? 'pcm_s16le' : depth === '32' ? 'pcm_f32le' : 'pcm_s24le'
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
  let successCount = 0, errorCount = 0

  const log  = (level, text) => onLog({ tab: 'format', level, text })
  const prog = (data)        => onProgress({ tab: 'format', ...data })

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    log('info', `Processing: ${file.filename}`)

    const targetExt  = FORMAT_EXT[options.targetFormat.toLowerCase()] || options.targetFormat.toLowerCase()
    const outputPath = _buildOutputPath(file.path, targetExt, options)
    const backupPath = options.deleteOriginal ? file.path + '.undo_backup' : null

    try {
      if (options.deleteOriginal && backupPath) {
        fs.copyFileSync(file.path, backupPath)
      }

      await _runConvert(file.path, outputPath, options, (pct) => {
        prog({ type: 'file', file: file.filename, percent: pct, current: i + 1, total: files.length })
      })

      // Delete original only after successful conversion
      if (options.deleteOriginal) {
        fs.unlinkSync(file.path)
      }

      prog({ type: 'file',    file: file.filename, percent: 100, current: i + 1, total: files.length })
      prog({ type: 'overall', percent: Math.round(((i + 1) / files.length) * 100) })
      log('success', `✓  ${file.filename}  →  ${path.basename(outputPath)}`)

      historyFiles.push({
        original:   file.path,
        backupPath: backupPath,
        outputPath: outputPath,
      })
      successCount++

    } catch (err) {
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

module.exports = { convertFormat, cancelConversion }

// ── Private ────────────────────────────────────────────────────────

function _buildOutputPath(inputPath, targetExt, options) {
  const dir    = options.outputFolder || path.dirname(inputPath)
  const ext    = path.extname(inputPath)
  const base   = path.basename(inputPath, ext)
  const suffix = options.suffix || ''
  return path.join(dir, `${base}${suffix}.${targetExt}`)
}

function _runConvert(input, output, options, onProgress) {
  return new Promise((resolve, reject) => {
    let duration = 0
    const audioOpts = _buildFfmpegOpts(options.targetFormat, options.quality || {})

    const cmd = ffmpeg(input)
      .outputOptions(audioOpts)
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
