/**
 * Generate build/icon.ico from the LocalPrep logo.
 *
 * The logo lives as inline SVG in renderer/js/icons.js. There is no SVG
 * rasteriser in the dependency tree and adding one just for a build asset is
 * not worth it, so the shape is drawn directly here: a rounded square plus the
 * waveform, 4x supersampled, encoded as PNG (zlib is in Node) and wrapped in an
 * ICO container.
 *
 * Run with:  node build/make-icon.js
 * Only needs re-running when the logo itself changes.
 */

const fs   = require('fs')
const zlib = require('zlib')
const path = require('path')

// ── Logo geometry, in the SVG's 28x28 coordinate space ────────────
const VB     = 28
const RADIUS = 7
const BG     = [0xc8, 0xf5, 0x42]
const FG     = [0x0a, 0x0a, 0x0a]
const STROKE = 2.2

// "M4 14 Q6 8 8 14 Q10 20 12 14 Q14 8 16 14 Q18 20 20 14 Q22 8 24 14"
const WAVE = [
  { p0: [4, 14],  c: [6, 8],   p1: [8, 14]  },
  { p0: [8, 14],  c: [10, 20], p1: [12, 14] },
  { p0: [12, 14], c: [14, 8],  p1: [16, 14] },
  { p0: [16, 14], c: [18, 20], p1: [20, 14] },
  { p0: [20, 14], c: [22, 8],  p1: [24, 14] },
]

const SIZES = [16, 24, 32, 48, 64, 128, 256]
const SS    = 4    // supersampling factor

// ── Rasteriser ────────────────────────────────────────────────────

function quadAt(seg, t) {
  const u = 1 - t
  return [
    u * u * seg.p0[0] + 2 * u * t * seg.c[0] + t * t * seg.p1[0],
    u * u * seg.p0[1] + 2 * u * t * seg.c[1] + t * t * seg.p1[1],
  ]
}

/** Dense sample of the whole stroke centre line, in SVG units. */
function wavePoints() {
  const pts = []
  for (const seg of WAVE) {
    for (let i = 0; i <= 200; i++) pts.push(quadAt(seg, i / 200))
  }
  return pts
}

function insideRoundedRect(x, y, size, r) {
  if (x < 0 || y < 0 || x > size || y > size) return false
  // Only the four corner squares need the circle test
  const cx = x < r ? r : x > size - r ? size - r : x
  const cy = y < r ? r : y > size - r ? size - r : y
  if (cx === x || cy === y) return true
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
}

/** Render one size to a raw RGBA buffer. */
function render(size) {
  const S    = size * SS
  const k    = S / VB              // SVG units → supersampled pixels
  const r    = RADIUS * k
  const half = (STROKE / 2) * k
  const pts  = wavePoints().map(([x, y]) => [x * k, y * k])

  // Accumulate at supersampled resolution as 0/1 masks, then box-filter down
  const bgMask = new Uint8Array(S * S)
  const fgMask = new Uint8Array(S * S)

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      if (insideRoundedRect(x + 0.5, y + 0.5, S, r)) bgMask[y * S + x] = 1
    }
  }

  // Stamp a round brush along the centre line
  const rad  = Math.ceil(half)
  const half2 = half * half
  for (const [px, py] of pts) {
    const x0 = Math.max(0, Math.floor(px - rad)), x1 = Math.min(S - 1, Math.ceil(px + rad))
    const y0 = Math.max(0, Math.floor(py - rad)), y1 = Math.min(S - 1, Math.ceil(py + rad))
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x + 0.5 - px, dy = y + 0.5 - py
        if (dx * dx + dy * dy <= half2) fgMask[y * S + x] = 1
      }
    }
  }

  // Downsample SSxSS blocks into coverage, compose fg over bg over transparent
  const out = Buffer.alloc(size * size * 4)
  const n   = SS * SS
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let bg = 0, fg = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const i = (y * SS + sy) * S + (x * SS + sx)
          bg += bgMask[i]
          fg += fgMask[i]
        }
      }
      const aBg = bg / n
      const aFg = (fg / n) * aBg          // the wave never spills past the tile
      const a   = aBg
      const o   = (y * size + x) * 4
      if (a === 0) continue
      // Premultiplied blend of fg over bg, then un-premultiply against alpha
      for (let c = 0; c < 3; c++) {
        out[o + c] = Math.round((FG[c] * aFg + BG[c] * (aBg - aFg)) / a)
      }
      out[o + 3] = Math.round(a * 255)
    }
  }
  return out
}

// ── PNG encoding ──────────────────────────────────────────────────

function crc32(buf) {
  let c, crc = 0xffffffff
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = c ^ (crc >>> 8)
  }
  return (crc ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td  = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

function toPng(rgba, size) {
  // One filter byte (0 = None) per scanline
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8      // bit depth
  ihdr[9] = 6      // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── ICO container ─────────────────────────────────────────────────

function toIco(entries) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)              // reserved
  header.writeUInt16LE(1, 2)              // type: icon
  header.writeUInt16LE(entries.length, 4)

  const dir = Buffer.alloc(16 * entries.length)
  let offset = header.length + dir.length

  entries.forEach((e, i) => {
    const o = i * 16
    dir[o]     = e.size >= 256 ? 0 : e.size   // 0 means 256
    dir[o + 1] = e.size >= 256 ? 0 : e.size
    dir[o + 2] = 0                            // palette colours
    dir[o + 3] = 0                            // reserved
    dir.writeUInt16LE(1,  o + 4)              // colour planes
    dir.writeUInt16LE(32, o + 6)              // bits per pixel
    dir.writeUInt32LE(e.png.length, o + 8)
    dir.writeUInt32LE(offset, o + 12)
    offset += e.png.length
  })

  return Buffer.concat([header, dir, ...entries.map(e => e.png)])
}

// ── Main ──────────────────────────────────────────────────────────

const entries = SIZES.map(size => ({ size, png: toPng(render(size), size) }))
const outDir  = __dirname

fs.writeFileSync(path.join(outDir, 'icon.ico'), toIco(entries))
// electron-builder wants a 512px PNG for the Linux/mac side
fs.writeFileSync(path.join(outDir, 'icon.png'), toPng(render(512), 512))

console.log('icon.ico  ', SIZES.join(', '), 'px')
console.log('icon.png   512 px')
