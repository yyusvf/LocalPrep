/**
 * Shared ffmpeg output-option builders.
 *
 * Both converters need the same two things and got them wrong independently:
 *   • cover art must survive the re-encode (it is a video stream, and ffmpeg
 *     drops it unless it is explicitly mapped and marked as an attached picture)
 *   • MP3 tags must be written as ID3v2.3 — Windows Explorer only shows cover
 *     thumbnails reliably for v2.3, not v2.4 (ffmpeg's default)
 */

// Containers that can carry an embedded cover picture.
// ogg/wav/aiff cannot (not via a copied video stream), so mapping one in fails.
const COVER_CAPABLE = new Set(['mp3', 'flac', 'm4a', 'aac', 'mp4'])

function _normExt(fileOrExt) {
  return String(fileOrExt).split('.').pop().toLowerCase()
}

/**
 * Options that preserve tags and cover art for the given target extension.
 * Must come *after* the codec options in the final option list.
 */
function metadataOpts(targetExtOrPath) {
  const ext  = _normExt(targetExtOrPath)
  const opts = ['-map', '0:a', '-map_metadata', '0']

  if (COVER_CAPABLE.has(ext)) {
    // "0:v?" — map the cover if there is one, don't fail if there isn't.
    // Copy it rather than re-encode so the exact bytes survive.
    opts.push('-map', '0:v?', '-c:v', 'copy', '-disposition:v', 'attached_pic')
  }

  if (ext === 'mp3') {
    // ID3v2.3 + v1 → Explorer thumbnails and legacy players both work
    opts.push('-id3v2_version', '3', '-write_id3v1', '1')
  }

  return opts
}

module.exports = { metadataOpts, COVER_CAPABLE }
