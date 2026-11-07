// 用真实浏览器内核按指定宽度抓取在线页面，用于手机端视觉验收。
// 用法: SHOT_URL=... SHOT_OUT=... SHOT_W=390 SHOT_H=780 electron tools/shot-url.js
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');

const URL_ = process.env.SHOT_URL;
const OUT = process.env.SHOT_OUT || path.join(__dirname, '..', 'shot-url.png');
const W = Number(process.env.SHOT_W || 390);
const H = Number(process.env.SHOT_H || 780);

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: W,
    height: H,
    show: true,
    frame: false,
    backgroundColor: '#ffffff',
    webPreferences: { backgroundThrottling: false },
  });
  await win.loadURL(URL_);
  await new Promise((r) => setTimeout(r, 1600));
  if (process.env.SHOT_JS) {
    await win.webContents.executeJavaScript(process.env.SHOT_JS);
    await new Promise((r) => setTimeout(r, 700));
  }
  const img = await win.capturePage();
  fs.writeFileSync(OUT, img.toPNG());
  console.log('shot ->', OUT, img.getSize());
  app.exit(0);
});
