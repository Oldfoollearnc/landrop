'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, clipboard, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');

const config = require('./config');
const netinfo = require('./netinfo');
const { Store, kindOf } = require('./store');
const { Uploads } = require('./uploads');
const { LanServer, MIME } = require('./server');
const autostart = require('./autostart');

// 提示音要在窗口从未被点击时也能出声
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const COMPACT_W = 380;
const COMPACT_H = 540;
const FULL_W = 1120;
const FULL_H = 780;
const PAD = 48;
const MARGIN = 12;

const BG_DARK = '#0a0a0b';
const BG_LIGHT = '#ffffff';

let win = null;
let tray = null;
let server = null;
let store = null;
let uploads = null;
let quitting = false;
let isFull = false;
let pinned = true;
let currentUrl = '';
let currentQr = '';
let firewallOk = false;
let ipTimer = null;
let moveTimer = null;
let opacityTimer = null;
let opacityResolve = null;
let unread = 0;
let hiding = false;
let trayNormal = null;
let trayUnreadImg = null;
let focusTimer = null;

const hiddenStart = process.argv.includes('--hidden');

function asset(name) {
  return path.join(app.getAppPath(), 'assets', name);
}

function displayForCursor() {
  try {
    return screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  } catch {
    return screen.getPrimaryDisplay();
  }
}

function compactBounds() {
  const wa = displayForCursor().workArea;
  const x = Math.max(wa.x, wa.x + wa.width - COMPACT_W - MARGIN);
  const y = Math.max(wa.y, wa.y + wa.height - COMPACT_H - MARGIN);
  return { x: Math.round(x), y: Math.round(y), width: COMPACT_W, height: COMPACT_H };
}

function fullBounds() {
  const wa = displayForCursor().workArea;
  const width = Math.min(FULL_W, wa.width - PAD);
  const height = Math.min(FULL_H, wa.height - PAD);
  let x = Number(config.get('fullX'));
  let y = Number(config.get('fullY'));
  const inside = Number.isFinite(x) && Number.isFinite(y)
    && x > wa.x - 60 && y > wa.y - 60
    && x + width < wa.x + wa.width + 60
    && y + height < wa.y + wa.height + 60;
  if (!inside) {
    x = wa.x + Math.round((wa.width - width) / 2);
    y = wa.y + Math.round((wa.height - height) / 2);
  }
  return { x: Math.round(x), y: Math.round(y), width, height };
}

function send(channel, payload) {
  if (win && !win.isDestroyed() && win.webContents && !win.webContents.isDestroyed()) {
    win.webContents.send(channel, payload);
  }
}

function windowBg() {
  return config.get('theme') === 'light' ? BG_LIGHT : BG_DARK;
}

// ---------- core：消息真源，桌面 IPC 与手机 WS 共用 ----------

const core = {
  history: () => store.messages(),
  get: (id) => store.get(id),
  getTheme: () => config.get('theme'),
  getUrl: () => currentUrl,
  publish(partial) {
    const msg = store.add(partial);
    if (server) server.broadcast({ t: 'msg', msg });
    send('ev', { t: 'msg', msg });
    if (partial.from === 'phone' && win && (!win.isVisible() || !win.isFocused())) {
      setUnread(unread + 1);
      notify(msg);
    }
    return msg;
  },
  patch(id, changes, persist) {
    const msg = store.patch(id, changes, persist);
    if (!msg) return null;
    if (server) server.broadcast({ t: 'msg:update', id, patch: changes });
    send('ev', { t: 'msg:update', id, patch: changes });
    return msg;
  },
  remove(id, purge) {
    const ok = store.remove(id, purge);
    if (ok) {
      if (server) server.broadcast({ t: 'msg:delete', id });
      send('ev', { t: 'msg:delete', id });
    }
    return ok;
  },
  setTheme(theme) {
    config.patch({ theme });
    applyWindowTheme();
    if (server) server.broadcast({ t: 'theme', theme });
    send('ev', { t: 'theme', theme });
  },
};

// ---------- 窗口 ----------

function applyWindowTheme() {
  if (win && !win.isDestroyed()) win.setBackgroundColor(windowBg());
}

function stopOpacity() {
  clearInterval(opacityTimer);
  opacityTimer = null;
  if (opacityResolve) {
    const done = opacityResolve;
    opacityResolve = null;
    done();
  }
}

function animateOpacity(target, ms) {
  return new Promise((resolve) => {
    if (!win || win.isDestroyed()) return resolve();
    stopOpacity();
    const from = win.getOpacity();
    const start = Date.now();
    opacityResolve = resolve;
    opacityTimer = setInterval(() => {
      if (!win || win.isDestroyed()) {
        stopOpacity();
        return;
      }
      const p = Math.min(1, (Date.now() - start) / ms);
      const eased = 1 - Math.pow(1 - p, 3);
      win.setOpacity(from + (target - from) * eased);
      if (p >= 1) stopOpacity();
    }, 16);
  });
}

function applyBounds(mode) {
  if (!win || win.isDestroyed()) return;
  const bounds = mode === 'full' ? fullBounds() : compactBounds();
  // 无边框窗口在 resizable:false 下 setBounds 会被钳制，切换时临时放开
  win.setResizable(true);
  win.setBounds(bounds, false);
  win.setResizable(false);
}

function createWindow() {
  win = new BrowserWindow({
    ...compactBounds(),
    frame: false,
    transparent: false,
    backgroundColor: windowBg(),
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: pinned,
    show: false,
    title: '局域网传信',
    icon: asset('icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      // 隐藏时的连接动画与提示音不能被降频
      backgroundThrottling: false,
    },
  });

  win.setMenu(null);
  win.loadFile(path.join(__dirname, '..', 'renderer', 'desktop', 'index.html'));

  win.once('ready-to-show', () => {
    if (!hiddenStart) showWindow();
  });

  win.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      hideWindow();
    }
  });

  win.on('show', () => {
    setUnread(0);
    send('ev', { t: 'visible', visible: true });
  });
  win.on('hide', () => send('ev', { t: 'visible', visible: false }));
  win.on('focus', () => setUnread(0));

  win.on('moved', () => {
    if (!isFull) return;
    clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      if (!win || win.isDestroyed() || !isFull) return;
      const b = win.getBounds();
      config.patch({ fullX: b.x, fullY: b.y });
    }, 500);
  });
}

function showWindow() {
  if (!win || win.isDestroyed()) return;
  hiding = false;
  stopOpacity();
  applyBounds(isFull ? 'full' : 'compact');
  if (!win.isVisible()) {
    win.setOpacity(0);
    win.show();
    animateOpacity(1, 160);
  } else {
    win.show();
    animateOpacity(1, 120);
  }
  win.focus();
  clearTimeout(focusTimer);
  focusTimer = setTimeout(() => {
    if (win && !win.isDestroyed()) win.focus();
  }, 60);
  setUnread(0);
}

async function hideWindow() {
  if (!win || win.isDestroyed() || hiding) return;
  hiding = true;
  await animateOpacity(0, 110);
  if (!hiding) return; // 期间被 showWindow 取消
  if (win && !win.isDestroyed()) {
    win.hide();
    win.setOpacity(1);
  }
  hiding = false;
}

function toggleWindow() {
  if (!win) return;
  if (!hiding && win.isVisible() && !win.isMinimized()) hideWindow();
  else showWindow();
}

function setMode(full) {
  if (!win) return;
  applyBounds(full ? 'full' : 'compact');
  win.setSkipTaskbar(full);
  isFull = full;
  if (!win.isVisible()) win.show();
  win.focus();
  send('ev', { t: 'mode', mode: full ? 'full' : 'compact' });
  refreshTrayMenu();
}

// ---------- 托盘 ----------

function trayTooltip() {
  const base = currentUrl ? `局域网传信 · ${currentUrl.replace(/^https?:\/\//, '').split('/')[0]}` : '局域网传信';
  return unread > 0 ? `${base} · ${unread} 条新消息` : base;
}

function setUnread(n) {
  const next = Math.max(0, n);
  if (next === unread) return;
  unread = next;
  if (tray) {
    tray.setImage(unread > 0 ? trayUnreadImg : trayNormal);
    tray.setToolTip(trayTooltip());
  }
  send('ev', { t: 'unread', n: unread });
}

function notify(msg) {
  if (!tray || !config.get('notify')) return;
  const body = msg.kind === 'text'
    ? msg.text || ''
    : `${msg.kind === 'image' ? '[图片]' : '[文件]'} ${msg.name || ''}`;
  try {
    tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(asset('icon.png')),
      title: '局域网传信',
      content: String(body).replace(/\s+/g, ' ').slice(0, 60) || '收到一条新消息',
      noSound: true,
    });
  } catch (err) {
    console.error('[balloon]', err.message);
  }
}

function refreshTrayMenu() {
  if (!tray) return;
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: isFull ? '还原小窗' : '最大化', click: () => setMode(!isFull) },
      {
        label: '设置',
        click: () => {
          showWindow();
          if (!isFull) setMode(true);
          send('ev', { t: 'navigate', view: 'settings' });
        },
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          quitting = true;
          app.quit();
        },
      },
    ])
  );
}

function createTray() {
  trayNormal = nativeImage.createFromPath(asset('tray.ico'));
  trayUnreadImg = nativeImage.createFromPath(asset('tray-unread.ico'));
  tray = new Tray(trayNormal);
  tray.setToolTip(trayTooltip());
  tray.on('click', toggleWindow);
  tray.on('right-click', () => tray.popUpContextMenu());
  tray.on('balloon-click', () => showWindow());
  refreshTrayMenu();
}

// ---------- 连接信息 ----------

function refreshUrl(force) {
  if (!server) return;
  const nic = netinfo.pickNic(config.get('nic'));
  if (!nic) return;
  const url = `http://${nic.address}:${server.port}/?t=${config.get('token')}`;
  if (url === currentUrl && !force) return;
  currentUrl = url;
  QRCode.toDataURL(url, {
    margin: 1,
    width: 620,
    errorCorrectionLevel: 'M',
    color: { dark: '#0d0d0f', light: '#ffffff' },
  })
    .then((dataUrl) => {
      currentQr = dataUrl;
      send('ev', { t: 'url', url, qr: currentQr });
      if (server) server.broadcast({ t: 'url', url });
      if (tray) tray.setToolTip(trayTooltip());
    })
    .catch((err) => console.error('[qr]', err.message));
}

function checkFirewall() {
  execFile(
    'netsh',
    ['advfirewall', 'firewall', 'show', 'rule', 'name=LanDrop'],
    { windowsHide: true },
    (err, stdout) => {
      firewallOk = !err && /LanDrop/i.test(String(stdout || ''));
      send('ev', { t: 'firewall', ok: firewallOk });
    }
  );
}

function openFirewall() {
  const exe = process.execPath;
  const script = [
    "Start-Process -FilePath netsh -Verb RunAs -ArgumentList @(",
    "'advfirewall','firewall','add','rule','name=LanDrop','dir=in','action=allow',",
    `'program=${exe}','enable=yes','profile=any')`,
  ].join('');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-EncodedCommand', encoded], { windowsHide: true }, () => {
      setTimeout(() => {
        checkFirewall();
        resolve(true);
      }, 1500);
    });
  });
}

// ---------- 发布 ----------

function publishFiles(paths) {
  const out = [];
  for (const p of paths) {
    try {
      const st = fs.statSync(p);
      if (!st.isFile()) continue;
      const ext = path.extname(p).toLowerCase();
      out.push(
        core.publish({
          from: 'pc',
          kind: kindOf(MIME[ext] || '', p),
          name: path.basename(p),
          size: st.size,
          mime: MIME[ext] || '',
          path: p,
          status: 'ok',
          progress: 1,
        })
      );
    } catch {
      /* 文件被占用或已删除，跳过 */
    }
  }
  return out;
}

function statePayload() {
  return {
    url: currentUrl,
    qr: currentQr,
    theme: config.get('theme'),
    sound: !!config.get('sound'),
    notify: !!config.get('notify'),
    autostart: !!config.get('autostart'),
    saveDir: config.get('saveDir'),
    dataDir: app.getPath('userData'),
    port: server ? server.port : 0,
    nics: netinfo.listNics(),
    nic: config.get('nic'),
    version: app.getVersion(),
    firewall: firewallOk,
    pinned,
    isFull,
    unread,
    messages: store ? store.messages() : [],
    devices: server ? [...server.clients].map((c) => c.device) : [],
  };
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('state', () => statePayload());

  ipcMain.on('send-text', (_e, text) => {
    const value = String(text || '').trim();
    if (value) core.publish({ from: 'pc', kind: 'text', text: value });
  });

  ipcMain.handle('pick-files', async (_e, kind) => {
    const filters = kind === 'image'
      ? [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'avif', 'heic'] }]
      : [];
    const r = await dialog.showOpenDialog(win, {
      title: kind === 'image' ? '选择图片' : '选择要发送的文件',
      properties: ['openFile', 'multiSelections'],
      filters,
      buttonLabel: '发送',
    });
    if (r.canceled || !r.filePaths.length) return [];
    return publishFiles(r.filePaths).map((m) => m.id);
  });

  ipcMain.handle('send-image-buffer', (_e, buffer, name) => {
    try {
      const dir = path.join(app.getPath('temp'), 'LanDrop');
      fs.mkdirSync(dir, { recursive: true });
      const safe = String(name || 'paste.png').replace(/[\\/:*?"<>|]/g, '_');
      const file = path.join(dir, `${Date.now()}-${safe}`);
      fs.writeFileSync(file, Buffer.from(buffer));
      return publishFiles([file]).map((m) => m.id);
    } catch (err) {
      console.error('[paste]', err.message);
      return [];
    }
  });

  ipcMain.handle('send-paths', (_e, paths) => {
    if (!Array.isArray(paths)) return [];
    return publishFiles(paths).map((m) => m.id);
  });

  ipcMain.on('delete', (_e, { id, purge }) => core.remove(id, !!purge));
  ipcMain.on('copy-text', (_e, text) => clipboard.writeText(String(text || '')));
  ipcMain.handle('copy-image', (_e, p) => {
    try {
      clipboard.writeImage(nativeImage.createFromPath(p));
      return true;
    } catch {
      return false;
    }
  });
  ipcMain.on('open-path', (_e, p) => shell.openPath(String(p)));
  ipcMain.on('reveal', (_e, p) => shell.showItemInFolder(String(p)));

  ipcMain.handle('save-as', async (_e, { id }) => {
    const msg = core.get(id);
    if (!msg || !msg.path) return false;
    const r = await dialog.showSaveDialog(win, {
      title: '另存为',
      defaultPath: path.join(app.getPath('downloads'), msg.name || path.basename(msg.path)),
    });
    if (r.canceled || !r.filePath) return false;
    try {
      fs.copyFileSync(msg.path, r.filePath);
      return true;
    } catch {
      return false;
    }
  });

  ipcMain.handle('settings:set', (_e, key, value) => {
    if (key === 'theme') {
      core.setTheme(value);
    } else if (key === 'sound' || key === 'notify') {
      config.patch({ [key]: !!value });
      send('ev', { t: 'setting', key, value: !!value });
    }
    return statePayload();
  });

  ipcMain.handle('settings:autostart', async (_e, on) => {
    config.patch({ autostart: !!on });
    const st = await autostart.sync(!!on);
    return st.enabled;
  });

  ipcMain.handle('settings:save-dir', async () => {
    const r = await dialog.showOpenDialog(win, {
      title: '选择接收文件的保存位置',
      properties: ['openDirectory', 'createDirectory'],
      defaultPath: config.get('saveDir'),
      buttonLabel: '使用此文件夹',
    });
    if (r.canceled || !r.filePaths[0]) return config.get('saveDir');
    fs.mkdirSync(r.filePaths[0], { recursive: true });
    config.patch({ saveDir: r.filePaths[0] });
    return r.filePaths[0];
  });

  ipcMain.handle('settings:nic', (_e, name) => {
    config.patch({ nic: String(name || '') });
    refreshUrl(true);
    return statePayload();
  });

  ipcMain.handle('settings:clear', (_e, purgeFiles) => {
    store.clear(!!purgeFiles);
    if (server) server.broadcast({ t: 'clear' });
    send('ev', { t: 'clear' });
    return true;
  });

  ipcMain.handle('settings:reset-token', () => {
    const token = crypto.randomBytes(12).toString('base64url');
    config.patch({ token });
    if (server) {
      server.setToken(token);
      server.dropClients();
    }
    refreshUrl(true);
    return statePayload();
  });

  ipcMain.handle('settings:open-save-dir', () => shell.openPath(config.get('saveDir')));
  ipcMain.handle('settings:open-data-dir', () => shell.openPath(app.getPath('userData')));

  ipcMain.on('mode', (_e, mode) => setMode(mode === 'full'));
  ipcMain.on('hide', () => hideWindow());

  ipcMain.on('toggle-pin', () => {
    pinned = !pinned;
    if (win) win.setAlwaysOnTop(pinned);
    send('ev', { t: 'pin', pinned });
  });

  ipcMain.handle('open-firewall', () => openFirewall());
}

// ---------- 启动 ----------

async function boot() {
  config.load();

  const saveDir = config.get('saveDir');
  try {
    fs.mkdirSync(saveDir, { recursive: true });
  } catch (err) {
    console.error('[boot] saveDir', err.message);
  }

  store = new Store(path.join(app.getPath('userData'), 'messages.jsonl')).load();
  uploads = new Uploads(() => config.get('saveDir'));
  server = new LanServer({ core, uploads, token: config.get('token') });

  const port = await server.start(config.get('port'));
  if (port !== config.get('port')) config.patch({ port });

  createWindow();
  createTray();
  registerIpc();
  server.on('presence', (devices) => send('ev', { t: 'presence', devices }));
  refreshUrl(true);
  setTimeout(checkFirewall, 800);

  autostart.sync(!!config.get('autostart')).catch(() => {});

  ipTimer = setInterval(() => refreshUrl(false), 5000);

  screen.on('display-metrics-changed', () => {
    if (win && win.isVisible()) applyBounds(isFull ? 'full' : 'compact');
  });
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => showWindow());

  app.setAppUserModelId('com.landrop.app');

  app.whenReady().then(boot).catch((err) => {
    console.error('[boot] failed', err);
    dialog.showErrorBox('启动失败', String(err && err.message ? err.message : err));
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (ipTimer) clearInterval(ipTimer);
    if (server) server.stop();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('window-all-closed', () => {
    /* 常驻托盘，不退出 */
  });
}
