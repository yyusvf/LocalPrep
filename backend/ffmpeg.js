const ffmpegStatic = require('ffmpeg-static')
const ffmpeg = require('fluent-ffmpeg')

// When packaged with asar, binaries must live in app.asar.unpacked
const ffmpegPath = ffmpegStatic.replace('app.asar', 'app.asar.unpacked')
ffmpeg.setFfmpegPath(ffmpegPath)

function checkFfmpeg() {
  return new Promise((resolve) => {
    ffmpeg.getAvailableFormats((err) => {
      if (err) {
        resolve({ available: false, path: ffmpegPath, error: err.message })
      } else {
        resolve({ available: true, path: ffmpegPath })
      }
    })
  })
}

/**
 * Read back what actually landed in a file.
 *
 * ffmpeg-static ships no ffprobe binary, so this uses music-metadata — the same
 * reader the file list and the properties dialog use, which keeps the verified
 * numbers consistent with what the UI shows.
 *
 * Never throws: returns null when the file cannot be read, so verification stays
 * best-effort and a successful conversion is never turned into a failure.
 * @returns {Promise<{ sampleRate:number|null, bitrate:number|null, codec:string|null, hasCover:boolean }|null>}
 */
async function probe(filePath) {
  try {
    const mm   = require('music-metadata')
    const meta = await mm.parseFile(filePath, { duration: false })
    return {
      sampleRate: meta.format.sampleRate || null,
      bitrate:    meta.format.bitrate    || null,
      codec:      meta.format.codec || meta.format.container || null,
      hasCover:   (meta.common.picture?.length ?? 0) > 0,
    }
  } catch {
    return null
  }
}

module.exports = { checkFfmpeg, ffmpegPath, ffmpeg, probe }
