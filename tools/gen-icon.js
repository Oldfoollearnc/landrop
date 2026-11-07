// Generates assets/tray.png, assets/icon.png and assets/icon.ico with zero image dependencies.
// Pure Node PNG encoder (zlib deflate + CRC32). Run: node tools/gen-icon.js
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePNG(w, h, rgba) {
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function inRoundRect(x, y, x0, y0, x1, y1, r) {
  const hw = (x1 - x0) / 2;
  const hh = (y1 - y0) / 2;
  const dx = Math.abs(x - (x0 + x1) / 2) - (hw - r);
  const dy = Math.abs(y - (y0 + y1) / 2) - (hh - r);
  const ax = Math.max(dx, 0);
  const ay = Math.max(dy, 0);
  return Math.sqrt(ax * ax + ay * ay) + Math.min(Math.max(dx, dy), 0) - r <= 0;
}

function inTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const d1 = (px - bx) * (ay - by) - (ax - bx) * (py - by);
  const d2 = (px - cx) * (by - cy) - (bx - cx) * (py - cy);
  const d3 = (px - ax) * (cy - ay) - (cx - ax) * (py - ay);
  const neg = d1 < 0 || d2 < 0 || d3 < 0;
  const pos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(neg && pos);
}

function renderIcon(size, withDot) {
  const SS = 4;
  const big = size * SS;
  const px = Buffer.alloc(size * size * 4);
  const acc = new Float64Array(size * size * 3);
  const alpha = new Float64Array(size * size);

  const bg = [0x17, 0x18, 0x1c];
  const fg = [0xff, 0xff, 0xff];
  const dotColor = [0xff, 0x45, 0x3a];

  for (let by = 0; by < big; by++) {
    for (let bx = 0; bx < big; bx++) {
      const x = (bx + 0.5) / big;
      const y = (by + 0.5) / big;
      let color = null;
      if (inRoundRect(x, y, 0.03, 0.03, 0.97, 0.97, 0.22)) {
        color = bg;
        const shaft = inRoundRect(x, y, 0.455, 0.24, 0.545, 0.545, 0.045);
        const head = inTriangle(x, y, 0.315, 0.515, 0.685, 0.515, 0.5, 0.715);
        const bar = inRoundRect(x, y, 0.27, 0.775, 0.73, 0.845, 0.035);
        if (shaft || head || bar) color = fg;
      }
      if (withDot && (x - 0.79) * (x - 0.79) + (y - 0.21) * (y - 0.21) <= 0.0125) color = dotColor;

      const ox = (bx / SS) | 0;
      const oy = (by / SS) | 0;
      const idx = oy * size + ox;
      alpha[idx] += color ? 1 : 0;
      if (color) {
        acc[idx * 3] += color[0];
        acc[idx * 3 + 1] += color[1];
        acc[idx * 3 + 2] += color[2];
      }
    }
  }

  const total = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = alpha[i];
    if (a === 0) continue;
    px[i * 4] = Math.round(acc[i * 3] / a);
    px[i * 4 + 1] = Math.round(acc[i * 3 + 1] / a);
    px[i * 4 + 2] = Math.round(acc[i * 3 + 2] / a);
    px[i * 4 + 3] = Math.round((a / total) * 255);
  }
  return px;
}

function buildICO(sizes, withDot) {
  const images = sizes.map((s) => encodePNG(s, s, renderIcon(s, withDot)));
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);
  const dir = Buffer.alloc(16 * sizes.length);
  let offset = 6 + dir.length;
  sizes.forEach((s, i) => {
    const b = i * 16;
    dir[b] = s >= 256 ? 0 : s;
    dir[b + 1] = s >= 256 ? 0 : s;
    dir[b + 2] = 0;
    dir[b + 3] = 0;
    dir.writeUInt16LE(1, b + 4);
    dir.writeUInt16LE(32, b + 6);
    dir.writeUInt32LE(images[i].length, b + 8);
    dir.writeUInt32LE(offset, b + 12);
    offset += images[i].length;
  });
  return Buffer.concat([header, dir, ...images]);
}

const outDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });

fs.writeFileSync(path.join(outDir, 'tray.ico'), buildICO([16, 20, 24, 32], false));
fs.writeFileSync(path.join(outDir, 'tray-unread.ico'), buildICO([16, 20, 24, 32], true));
fs.writeFileSync(path.join(outDir, 'tray.png'), encodePNG(32, 32, renderIcon(32, false)));
fs.writeFileSync(path.join(outDir, 'icon.png'), encodePNG(256, 256, renderIcon(256, false)));
fs.writeFileSync(path.join(outDir, 'icon-192.png'), encodePNG(192, 192, renderIcon(192, false)));
fs.writeFileSync(path.join(outDir, 'icon.ico'), buildICO([16, 24, 32, 48, 64, 128, 256], false));

console.log('assets: tray.ico / tray-unread.ico / icon.ico / png');
