// 生成 Android 旧版启动图标（API < 26）与一张 512 商店图。
// 图形与 res/drawable/ic_launcher_fg.xml 保持一致：双箭头 = 双向传输。
// 纯 Node 实现，不依赖任何图形库。用法：node tools/gen-android-icon.js
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
  ihdr[8] = 8;
  ihdr[9] = 6;
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

const A = [0x3b, 0x7d, 0xf5];
const B = [0x12, 0x3a, 0x9e];
const FG = [0xff, 0xff, 0xff];

function background(x, y, round) {
  if (round) {
    const dx = x - 0.5;
    const dy = y - 0.5;
    if (dx * dx + dy * dy > 0.25) return null;
  } else if (!inRoundRect(x, y, 0.04, 0.04, 0.96, 0.96, 0.225)) {
    return null;
  }
  const t = Math.max(0, Math.min(1, (x + y) / 2));
  return [
    Math.round(A[0] + (B[0] - A[0]) * t),
    Math.round(A[1] + (B[1] - A[1]) * t),
    Math.round(A[2] + (B[2] - A[2]) * t),
  ];
}

function foreground(x, y) {
  const upShaft = inRoundRect(x, y, 0.333, 0.37, 0.407, 0.70, 0.0);
  const upHead = inTriangle(x, y, 0.37, 0.28, 0.259, 0.444, 0.481, 0.444);
  const downShaft = inRoundRect(x, y, 0.593, 0.296, 0.667, 0.63, 0.0);
  const downHead = inTriangle(x, y, 0.63, 0.72, 0.519, 0.555, 0.741, 0.555);
  return upShaft || upHead || downShaft || downHead;
}

function render(size, round) {
  const SS = 4;
  const big = size * SS;
  const px = Buffer.alloc(size * size * 4);
  const acc = new Float64Array(size * size * 3);
  const alpha = new Float64Array(size * size);

  for (let by = 0; by < big; by++) {
    for (let bx = 0; bx < big; bx++) {
      const x = (bx + 0.5) / big;
      const y = (by + 0.5) / big;
      let color = background(x, y, round);
      if (!color) continue;
      if (foreground(x, y)) color = FG;
      const ox = (bx / SS) | 0;
      const oy = (by / SS) | 0;
      const idx = oy * size + ox;
      alpha[idx] += 1;
      acc[idx * 3] += color[0];
      acc[idx * 3 + 1] += color[1];
      acc[idx * 3 + 2] += color[2];
    }
  }

  const total = SS * SS;
  for (let i = 0; i < size * size; i++) {
    const a = alpha[i];
    if (!a) continue;
    px[i * 4] = Math.round(acc[i * 3] / a);
    px[i * 4 + 1] = Math.round(acc[i * 3 + 1] / a);
    px[i * 4 + 2] = Math.round(acc[i * 3 + 2] / a);
    px[i * 4 + 3] = Math.round((a / total) * 255);
  }
  return px;
}

const res = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'res');
const sizes = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };

for (const [dir, px] of Object.entries(sizes)) {
  const out = path.join(res, `mipmap-${dir}`);
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'ic_launcher.png'), encodePNG(px, px, render(px, false)));
  fs.writeFileSync(path.join(out, 'ic_launcher_round.png'), encodePNG(px, px, render(px, true)));
}

const storeDir = path.join(__dirname, '..', 'docs');
fs.mkdirSync(storeDir, { recursive: true });
fs.writeFileSync(path.join(storeDir, 'icon-512.png'), encodePNG(512, 512, render(512, false)));
console.log('android icons: mipmap-* (48/72/96/144/192) + docs/icon-512.png');
