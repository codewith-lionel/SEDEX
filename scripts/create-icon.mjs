/**
 * Generates buildResources/icon.png (512x512) programmatically — no design
 * assets needed. electron-builder converts it to .ico for Windows.
 *
 * Run with: npm run sample:icon
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import zlib from 'node:zlib'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const outDir = path.join(__dirname, '..', 'buildResources')
fs.mkdirSync(outDir, { recursive: true })

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()
const crc32 = (buf) => {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

const W = 512
const H = 512
const px = Buffer.alloc(W * H * 4) // transparent
const INDIGO = [79, 70, 229, 255]
const WHITE = [255, 255, 255, 255]
const set = (x, y, c) => {
  if (x < 0 || y < 0 || x >= W || y >= H) return
  const i = (y * W + x) * 4
  px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = c[3]
}
const dist = (x1, y1, x2, y2) => Math.hypot(x1 - x2, y1 - y2)

// Rounded-square background
const m = 16
const r = 96
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const inside =
      x >= m && x < W - m && y >= m && y < H - m &&
      !(
        (x < m + r && y < m + r && dist(x, y, m + r, m + r) > r) ||
        (x >= W - m - r && y < m + r && dist(x, y, W - m - r, m + r) > r) ||
        (x < m + r && y >= H - m - r && dist(x, y, m + r, H - m - r) > r) ||
        (x >= W - m - r && y >= H - m - r && dist(x, y, W - m - r, H - m - r) > r)
      )
    if (inside) set(x, y, INDIGO)
  }
}

// Big white check mark
const thickLine = (x0, y0, x1, y1, t) => {
  const steps = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) * 2
  for (let s = 0; s <= steps; s++) {
    const x = Math.round(x0 + ((x1 - x0) * s) / steps)
    const y = Math.round(y0 + ((y1 - y0) * s) / steps)
    for (let dy = -t; dy <= t; dy++)
      for (let dx = -t; dx <= t; dx++)
        if (dx * dx + dy * dy <= t * t) set(x + dx, y + dy, WHITE)
  }
}
thickLine(150, 272, 226, 350, 30)
thickLine(226, 350, 372, 178, 30)

const ihdr = Buffer.alloc(13)
ihdr.writeUInt32BE(W, 0)
ihdr.writeUInt32BE(H, 4)
ihdr[8] = 8
ihdr[9] = 6
const raw = Buffer.alloc((W * 4 + 1) * H)
for (let y = 0; y < H; y++) {
  raw[y * (W * 4 + 1)] = 0
  px.copy(raw, y * (W * 4 + 1) + 1, y * W * 4, (y + 1) * W * 4)
}
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', zlib.deflateSync(raw)),
  chunk('IEND', Buffer.alloc(0)),
])

const out = path.join(outDir, 'icon.png')
fs.writeFileSync(out, png)
console.log('created', out, `(${png.length} bytes)`)
