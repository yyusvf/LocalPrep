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

module.exports = { checkFfmpeg, ffmpegPath, ffmpeg }
