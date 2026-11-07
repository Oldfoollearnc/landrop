// 仅用于本地视觉验收的截图工具：单独起一个窗口，注入假数据，抓图后退出。
// 不参与打包，也不修改应用代码。
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const os = require('os');

const ROOT = path.join(__dirname, '..');
const OUT = process.env.SHOT_OUT || path.join(ROOT, 'shot.png');
const MODE = process.env.SHOT_MODE || 'compact';
const THEME = process.env.SHOT_THEME || 'dark';
const QR_FILE = path.join(os.tmpdir(), 'landrop-qr-demo.png');
const NOW = Date.now();

const fakeMessages = [
  { id: 'a1', ts: NOW - 900000, from: 'phone', kind: 'text', text: '到公司了，会议室改到 10 点半' },
  { id: 'a2', ts: NOW - 880000, from: 'pc', kind: 'text', text: '收到，我把复盘材料先发你' },
  {
    id: 'a3', ts: NOW - 860000, from: 'pc', kind: 'text', status: 'ok', seen: NOW - 850000,
    text: '季度复盘.pdf 和三季度的原始数据都在压缩包里，你看下有没有漏的',
  },
  {
    id: 'a4', ts: NOW - 840000, from: 'pc', kind: 'file', status: 'ok',
    name: '季度复盘-2026Q3.pdf', size: 4213862, path: path.join(ROOT, 'assets', 'icon.png'), mime: 'application/pdf',
  },
  { id: 'a5', ts: NOW - 820000, from: 'phone', kind: 'text', text: '收到了，数据我下午核对' },
  { id: 'a6', ts: NOW - 300000, from: 'phone', kind: 'file', status: 'ok', name: '现场照片打包.zip', size: 88234521 },
  { id: 'a7', ts: NOW - 120000, from: 'phone', kind: 'text', text: '原始视频有点大，直接传了' },
  { id: 'a8', ts: NOW - 40000, from: 'phone', kind: 'file', status: 'uploading', progress: 0.46, name: '录屏 2026-11-06.mp4', size: 348912033 },
];

ipcMain.handle('state', () => ({
  url: 'http://192.168.5.4:8899/?t=DemoToken123',
  qr: (() => {
    try {
      return 'data:image/png;base64,' + fs.readFileSync(QR_FILE).toString('base64');
    } catch {
      return '';
    }
  })(),
  theme: THEME,
  sound: true,
  notify: true,
  autostart: true,
  dataDir: 'C:\\Users\\Administrator\\AppData\\Roaming\\LanDrop',
  saveDir: 'C:\\Users\\Administrator\\Downloads\\LanDrop',
  port: 8899,
  nics: [{ name: 'WLAN', address: '192.168.5.4' }],
  nic: 'WLAN',
  version: '1.0.0',
  firewall: true,
  pinned: true,
  unread: 0,
  isFull: MODE === 'full',
  messages: process.env.SHOT_EMPTY ? [] : fakeMessages,
  devices: process.env.SHOT_EMPTY ? [] : ['iPhone · Safari'],
}));

app.whenReady().then(async () => {
  const qr = require(path.join(ROOT, 'node_modules', 'qrcode'));
  const dataUrl = await qr.toDataURL('http://192.168.5.4:8899/?t=DemoToken123', { margin: 1, width: 400 });
  fs.writeFileSync(QR_FILE, Buffer.from(dataUrl.split(',')[1], 'base64'));

  const width = MODE === 'full' ? 1024 : 380;
  const height = MODE === 'full' ? 700 : 540;
  const win = new BrowserWindow({
    width,
    height,
    show: true,
    frame: false,
    backgroundColor: THEME === 'light' ? '#ffffff' : '#0a0a0b',
    webPreferences: {
      preload: path.join(ROOT, 'src', 'preload', 'preload.js'),
      contextIsolation: true,
      sandbox: false,
      backgroundThrottling: false,
    },
  });
  await win.loadFile(path.join(ROOT, 'src', 'renderer', 'desktop', 'index.html'));
  await new Promise((r) => setTimeout(r, 1500));

  if (process.env.SHOT_JS) {
    await win.webContents.executeJavaScript(process.env.SHOT_JS);
    await new Promise((r) => setTimeout(r, 600));
  }

  if (process.env.SHOT_HOVER) {
    win.focus();
    const pos = await win.webContents.executeJavaScript(`(() => {
      const rows = document.querySelectorAll('.msg');
      const el = rows[rows.length - 2];
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
    })()`);
    if (pos) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x: pos.x, y: pos.y });
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const img = await win.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('shot ->', OUT, img.getSize());
  app.exit(0);
});
