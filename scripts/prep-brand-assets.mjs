// Brand asset prep — trims the transparent Atlas wordmark to its glyph bounding
// box and re-encodes a tight PNG into public/brand/. Zero dependencies (Node's
// built-in zlib only) so it runs anywhere without sharp/ImageMagick/ffmpeg.
//
// Source: Product Branding/LOGO'S/atlas_wordmark_transparent.png (645x296, lots
// of internal padding). Output: public/brand/atlas-wordmark.png (cropped to the
// glyphs). The PNG is consumed as a CSS mask (color comes from `currentColor`),
// so only its alpha channel matters — near-white glyph color is irrelevant.
//
// Run: node scripts/prep-brand-assets.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { inflateSync, deflateSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const SRC = join(root, '..', "Product Branding", "LOGO'S", 'atlas_wordmark_transparent.png')
const OUT_DIR = join(root, 'public', 'brand')
const OUT = join(OUT_DIR, 'atlas-wordmark.png')
const ICON = join(root, 'src', 'app', 'icon.png') // favicon traced from the real "A" glyph
const ALPHA_THRESHOLD = 16 // ignore near-transparent anti-alias fringe when trimming

// ── PNG decode (8-bit RGBA, non-interlaced — verified for this asset) ──────────
function decodePng(buf) {
  if (buf.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG')
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  const bitDepth = buf[24]
  const colorType = buf[25]
  if (bitDepth !== 8 || colorType !== 6 || buf[28] !== 0) {
    throw new Error(`unsupported PNG (bitDepth=${bitDepth} colorType=${colorType} interlace=${buf[28]}); expected 8-bit RGBA non-interlaced`)
  }
  // gather IDAT chunks
  const idat = []
  let off = 8
  while (off < buf.length) {
    const len = buf.readUInt32BE(off)
    const type = buf.toString('ascii', off + 4, off + 8)
    if (type === 'IDAT') idat.push(buf.subarray(off + 8, off + 8 + len))
    if (type === 'IEND') break
    off += 12 + len
  }
  const raw = inflateSync(Buffer.concat(idat))
  const bpp = 4
  const stride = width * bpp
  const px = Buffer.alloc(height * stride)
  let pos = 0
  for (let y = 0; y < height; y++) {
    const filter = raw[pos++]
    for (let x = 0; x < stride; x++) {
      const cur = raw[pos++]
      const a = x >= bpp ? px[y * stride + x - bpp] : 0
      const b = y > 0 ? px[(y - 1) * stride + x] : 0
      const c = y > 0 && x >= bpp ? px[(y - 1) * stride + x - bpp] : 0
      let val
      switch (filter) {
        case 0: val = cur; break
        case 1: val = cur + a; break
        case 2: val = cur + b; break
        case 3: val = cur + ((a + b) >> 1); break
        case 4: {
          const p = a + b - c
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c)
          val = cur + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)
          break
        }
        default: throw new Error('bad filter ' + filter)
      }
      px[y * stride + x] = val & 0xff
    }
  }
  return { width, height, px }
}

function alphaBBox({ width, height, px }) {
  let minX = width, minY = height, maxX = -1, maxY = -1
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (px[(y * width + x) * 4 + 3] > ALPHA_THRESHOLD) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (maxX < 0) throw new Error('image is fully transparent')
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 }
}

// ── PNG encode (8-bit RGBA, filter 0) ─────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0)
  const typeBuf = Buffer.from(type, 'ascii')
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0)
  return Buffer.concat([len, typeBuf, data, crc])
}
function encodePng(width, height, px) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0
  const stride = width * 4
  const rawScan = Buffer.alloc(height * (stride + 1))
  for (let y = 0; y < height; y++) {
    rawScan[y * (stride + 1)] = 0 // filter: None
    px.copy(rawScan, y * (stride + 1) + 1, y * stride, y * stride + stride)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rawScan, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function crop(img, box) {
  const out = Buffer.alloc(box.w * box.h * 4)
  for (let y = 0; y < box.h; y++) {
    const srcStart = ((box.minY + y) * img.width + box.minX) * 4
    img.px.copy(out, y * box.w * 4, srcStart, srcStart + box.w * 4)
  }
  return out
}

// ── run ───────────────────────────────────────────────────────────────────────
const img = decodePng(readFileSync(SRC))
const box = alphaBBox(img)
const cropped = crop(img, box)
mkdirSync(OUT_DIR, { recursive: true })
writeFileSync(OUT, encodePng(box.w, box.h, cropped))
const aspect = (box.w / box.h).toFixed(4)
console.log(`source ${img.width}x${img.height} → trimmed ${box.w}x${box.h}  (aspect ${aspect})`)
console.log(`wrote ${OUT}`)

writeFavicon(cropped, box.w, box.h)

// ── Favicon: trace the real "A" glyph (first letter of the wordmark) and paint it
// in brand ink on a rounded cream tile — the light brand treatment, but using the
// logo's actual letterform instead of a system serif. Bilinear downscale. ──────────
function writeFavicon(px, W, H, S = 128) {
  const T = ALPHA_THRESHOLD
  // column ink profile → the "A" runs from the first inked column to the first gap
  const colMax = (x) => { let m = 0; for (let y = 0; y < H; y++) { const a = px[(y * W + x) * 4 + 3]; if (a > m) m = a } return m }
  let xs = 0; while (xs < W && colMax(xs) <= T) xs++
  let xe = xs; while (xe < W && colMax(xe) > T) xe++
  const ax = xs, aw = xe - xs
  let yTop = H, yBot = -1
  for (let x = ax; x < ax + aw; x++) for (let y = 0; y < H; y++) {
    if (px[(y * W + x) * 4 + 3] > T) { if (y < yTop) yTop = y; if (y > yBot) yBot = y }
  }
  const ay = yTop, ah = yBot - yTop + 1

  const cream = [0xf5, 0xf3, 0xee], ink = [0x1b, 0x1b, 0x1a]
  const R = Math.round(S * 0.22) // rounded-corner radius
  const targetH = Math.round(S * 0.60)
  const scale = targetH / ah
  const targetW = Math.round(aw * scale)
  const tx0 = Math.round((S - targetW) / 2), ty0 = Math.round((S - targetH) / 2)
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v))
  const alphaAt = (fx, fy) => { // bilinear sample of the source alpha channel
    const x0 = Math.floor(fx), y0 = Math.floor(fy), dx = fx - x0, dy = fy - y0
    const A = (xx, yy) => px[(clamp(yy, 0, H - 1) * W + clamp(xx, 0, W - 1)) * 4 + 3]
    const top = A(x0, y0) * (1 - dx) + A(x0 + 1, y0) * dx
    const bot = A(x0, y0 + 1) * (1 - dx) + A(x0 + 1, y0 + 1) * dx
    return (top * (1 - dy) + bot * dy) / 255
  }
  const out = Buffer.alloc(S * S * 4)
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4
    const cx = clamp(x, R, S - 1 - R), cy = clamp(y, R, S - 1 - R)
    const ddx = x - cx, ddy = y - cy
    if (ddx * ddx + ddy * ddy > R * R) { out[o + 3] = 0; continue } // transparent rounded corners
    let r = cream[0], g = cream[1], b = cream[2]
    if (x >= tx0 && x < tx0 + targetW && y >= ty0 && y < ty0 + targetH) {
      const a = alphaAt(ax + (x - tx0) / scale, ay + (y - ty0) / scale)
      r = Math.round(r * (1 - a) + ink[0] * a)
      g = Math.round(g * (1 - a) + ink[1] * a)
      b = Math.round(b * (1 - a) + ink[2] * a)
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b; out[o + 3] = 255
  }
  mkdirSync(dirname(ICON), { recursive: true })
  writeFileSync(ICON, encodePng(S, S, out))
  console.log(`wrote ${ICON} (A glyph ${aw}x${ah} → ${targetW}x${targetH} on ${S}x${S})`)
}
