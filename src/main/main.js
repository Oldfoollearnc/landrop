'use strict';
const { app, BrowserWindow, Tray, Menu, ipcMain, screen, clipboard, nativeImage, dialog, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { execFile } = require('child_process');
const QRCode = require('qrcode');

const config = require('./config');
const netinfo = require('./netinfo');
const { Store, kindOf } = require('./store');
const { Vault } = require('./crypto');
const { Uploads } = require('./uploads');
const { LanServer, MIME } = require('./server');
const { Room } = require('./room');
const autostart = require('./autostart');
const { RemoteManager } = require('./remote');

// 提示音要在窗口从未被点击时也能出声
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
if (process.env.NEARSEND_DEBUG) app.commandLine.appendSwitch('remote-debugging-port', '9222');

const COMPACT_W = 380;
const COMPACT_H = 540;
const FULL_W = 1120;
const FULL_H = 780;
const PAD = 48;
const MARGIN = 12;
const RECALL_MS = 2 * 60 * 1000;

const BG_DARK = '#0a0a0b';
const BG_LIGHT = '#ffffff';

let win = null;
let workspaceWin = null;
let remote = null;
let chatHidden = true;
let workspaceTheme = 'light';
let tray = null;
let server = null;
let store = null;
let vault = null;
let uploads = null;
let room = null;
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
  // 默认配置是 null；Number(null) === 0，不能当成「上次在左上角」
  const savedX = config.get('fullX');
  const savedY = config.get('fullY');
  const saved = typeof savedX === 'number' && typeof savedY === 'number';
  let x = saved ? savedX : 0;
  let y = saved ? savedY : 0;
  const inside = saved
    && Number.isFinite(x) && Number.isFinite(y)
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

function sendWorkspace(channel, payload) {
  if (workspaceWin && !workspaceWin.isDestroyed() && workspaceWin.webContents && !workspaceWin.webContents.isDestroyed()) {
    workspaceWin.webContents.send(channel, payload);
  }
}

function windowBg() {
  return config.get('theme') === 'light' ? BG_LIGHT : BG_DARK;
}

// ---------- core：消息真源，桌面 IPC 与手机 WS 共用 ----------

function hostAuthor() {
  return room
    ? { id: 'host', name: room.host.name, color: room.host.color, kind: 'desktop' }
    : { id: 'host', name: '我的电脑', color: 'sky', kind: 'desktop' };
}

const core = {
  version: app.getVersion(),
  history: () => store.messages(),
  get: (id) => store.get(id),
  getTheme: () => config.get('theme'),
  getUrl: () => currentUrl,
  publish(partial) {
    const input = Object.assign({}, partial);
    if (input.from === 'pc' && !input.uid) {
      input.uid = 'host';
      input.author = hostAuthor();
    }
    const msg = store.add(input);
    if (server) server.broadcast({ t: 'msg', msg });
    send('ev', { t: 'msg', msg });
    sendWorkspace('workspace:event', { t: 'chat-summary', chat: chatSummaryPayload() });
    // 上传中的文件只通知一次，等收完（status 变 ok）再提醒，避免传一半就报「收到」
    if (input.from === 'phone' && input.kind !== 'system' && input.status !== 'uploading'
      && win && (!win.isVisible() || !win.isFocused())) {
      setUnread(unread + 1);
      notify(msg);
    }
    return msg;
  },
  patch(id, changes, persist) {
    const before = store.get(id);
    const wasOk = !!(before && before.status === 'ok');
    const msg = store.patch(id, changes, persist);
    if (!msg) return null;
    if (server) server.broadcast({ t: 'msg:update', id, patch: changes });
    send('ev', { t: 'msg:update', id, patch: changes });
    if (!wasOk && changes.status === 'ok' && msg.from === 'phone' && msg.kind !== 'system'
      && win && (!win.isVisible() || !win.isFocused())) {
      setUnread(unread + 1);
      notify(msg);
    }
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
  clear() {
    if (uploads) uploads.abortAll();
    store.clear(false);
    if (server) server.broadcast({ t: 'clear' });
    send('ev', { t: 'clear' });
    setUnread(0);
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
    title: '近传',
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
    if (!hiddenStart && !chatHidden) showWindow();
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

// ---------- 统一工作台 ----------

function workspaceBounds() {
  const wa = displayForCursor().workArea;
  const width = Math.min(1360, wa.width - 32);
  const height = Math.min(860, wa.height - 32);
  return { width, height, x: wa.x + Math.round((wa.width - width) / 2), y: wa.y + Math.round((wa.height - height) / 2) };
}

function createWorkspaceWindow() {
  workspaceWin = new BrowserWindow({
    ...workspaceBounds(),
    frame: false,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#f5f7fa',
    show: false,
    title: '近传 · 远程工位',
    icon: asset('icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'workspace.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      spellcheck: false,
      backgroundThrottling: false,
    },
  });
  workspaceWin.setMenu(null);
  workspaceWin.loadFile(path.join(__dirname, '..', 'renderer', 'workspace', 'index.html'), {
    query: process.env.NEARSEND_PANEL ? { panel: process.env.NEARSEND_PANEL } : {},
  });
  workspaceWin.once('ready-to-show', () => {
    if (!hiddenStart) workspaceWin.show();
  });
  workspaceWin.on('maximize', () => sendWorkspace('workspace:event', { t: 'window', maximized: true }));
  workspaceWin.on('unmaximize', () => sendWorkspace('workspace:event', { t: 'window', maximized: false }));
  workspaceWin.on('close', (e) => {
    if (!quitting) {
      e.preventDefault();
      workspaceWin.hide();
    }
  });
  workspaceWin.on('closed', () => { workspaceWin = null; });
}

function showWorkspace() {
  if (!workspaceWin || workspaceWin.isDestroyed()) createWorkspaceWindow();
  if (!workspaceWin) return;
  if (!workspaceWin.isVisible()) workspaceWin.show();
  if (workspaceWin.isMinimized()) workspaceWin.restore();
  workspaceWin.focus();
}
function hideWorkspace() {
  if (workspaceWin && !workspaceWin.isDestroyed()) workspaceWin.hide();
}
function toggleWorkspace() {
  if (workspaceWin && workspaceWin.isVisible() && !workspaceWin.isMinimized()) hideWorkspace();
  else showWorkspace();
}

function showChat() {
  if (!win || win.isDestroyed()) createWindow();
  chatHidden = false;
  if (!win) return;
  if (workspaceTheme) core.setTheme(workspaceTheme);
  if (!isFull) setMode(true);
  showWindow();
  win.focus();
  if (win && !win.isDestroyed()) {
    win.webContents.executeJavaScript(
      `document.documentElement.dataset.theme=${JSON.stringify(workspaceTheme)};`
    ).catch(() => {});
  }
}

// ---------- 托盘 ----------

function trayTooltip() {
  const base = currentUrl ? `近传 · ${currentUrl.replace(/^https?:\/\//, '').split('/')[0]}` : '近传';
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
  sendWorkspace('workspace:event', { t: 'unread', n: unread });
}

function notify(msg) {
  if (!tray || !config.get('notify')) return;
  const body = msg.kind === 'text'
    ? msg.text || ''
    : `${msg.kind === 'image' ? '[图片]' : '[文件]'} ${msg.name || ''}`;
  const who = msg.author && msg.author.name ? `${msg.author.name}：` : '';
  const at = Array.isArray(msg.mentions) && msg.mentions.includes('host') ? '有人@你 · ' : '';
  try {
    tray.displayBalloon({
      iconType: 'custom',
      icon: nativeImage.createFromPath(asset('icon.png')),
      title: room ? room.data.name : '近传',
      content: `${at}${who}${String(body).replace(/\s+/g, ' ')}`.slice(0, 70) || '收到一条新消息',
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
      { label: '打开控制台', click: showWorkspace },
      { label: '打开团队群聊', click: showChat },
      { type: 'separator' },
      {
        label: '设置',
        click: () => {
          showWorkspace();
          sendWorkspace('workspace:event', { t: 'navigate', view: 'settings' });
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
  tray.on('click', toggleWorkspace);
  tray.on('right-click', () => tray.popUpContextMenu());
  tray.on('balloon-click', () => showChat());
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
  return new Promise((resolve) => {
    execFile(
      'netsh',
      ['advfirewall', 'firewall', 'show', 'rule', 'name=NearSend'],
      { windowsHide: true },
      (err, stdout) => {
        firewallOk = !err && /NearSend/i.test(String(stdout || ''));
        send('ev', { t: 'firewall', ok: firewallOk });
        resolve(firewallOk);
      }
    );
  });
}

function firewallExe() {
  // 便携版每次运行都解压到新的临时目录，必须给外层 exe 放通
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function openFirewall() {
  const exe = firewallExe();
  // PowerShell 单引号字符串里 ' 要写成 ''
  const safeExe = exe.replace(/'/g, "''");
  const script = [
    "Start-Process -FilePath netsh -Verb RunAs -ArgumentList @(",
    "'advfirewall','firewall','add','rule','name=NearSend','dir=in','action=allow',",
    `'program=${safeExe}','enable=yes','profile=any')`,
  ].join('');
  const encoded = Buffer.from(script, 'utf16le').toString('base64');
  return new Promise((resolve) => {
    execFile('powershell', ['-NoProfile', '-EncodedCommand', encoded], { windowsHide: true }, () => {
      // UAC 弹窗可能停留好几秒：轮询几次，等用户点完再给结论
      let tries = 0;
      const poll = () => {
        checkFirewall().then((ok) => {
          tries += 1;
          if (ok || tries >= 8) return resolve(ok);
          return setTimeout(poll, 700);
        });
      };
      setTimeout(poll, 1200);
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
          uid: 'host',
          author: hostAuthor(),
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
    font: config.get('font') || 'm',
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
    encrypted: !!(vault && vault.enabled),
    locked: !!(store && store.locked),
    pinned,
    isFull,
    unread,
    messages: store ? store.messages() : [],
    devices: server ? server.onlineNames() : [],
    room: server ? server.snapshot().room : null,
    members: server ? server.snapshot().members : [],
    blocked: server ? server.snapshot().blocked : [],
    me: room ? { id: 'host', name: room.host.name, color: room.host.color, kind: 'desktop' } : null,
  };
}

function chatSummaryPayload() {
  const snap = server ? server.snapshot() : null;
  const msgs = store ? store.messages() : [];
  const last = msgs.filter((m) => m.kind !== 'system' && !m.recalled).slice(-1)[0] || null;
  return {
    room: snap ? snap.room : null,
    members: snap ? snap.members : [],
    unread,
    last: last ? {
      id: last.id,
      text: last.kind === 'text' ? last.text : (last.kind === 'image' ? '[图片]' : `[文件] ${last.name || ''}`),
      author: last.author ? last.author.name : '',
      ts: last.ts,
    } : null,
  };
}

// ---------- IPC ----------

function registerIpc() {
  ipcMain.handle('state', () => statePayload());

  ipcMain.on('send-text', (_e, payload) => {
    const text = typeof payload === 'string' ? payload : (payload && payload.text);
    const reply = payload && typeof payload === 'object' ? payload.reply : null;
    // 和手机端保持一致，避免一次粘贴把超大文本塞进历史并广播给手机
    const value = String(text || '').trim().slice(0, 20000);
    if (value) {
      core.publish({
        from: 'pc',
        uid: 'host',
        author: hostAuthor(),
        kind: 'text',
        text: value,
        mentions: server ? server.mentionsFor(value, 'host') : [],
        reply: server && reply ? server.cleanReply(reply) : undefined,
      });
    }
  });

  ipcMain.on('typing', (_e, on) => {
    if (server) server.hostTyping(!!on);
  });

  ipcMain.handle('recall-msg', (_e, id) => {
    const msg = core.get(id);
    const mine = msg && (msg.uid === 'host' || (!msg.uid && msg.from === 'pc'));
    if (!mine || msg.status !== 'ok' || msg.recalled
      || Date.now() - Number(msg.ts || 0) > RECALL_MS) {
      return false;
    }
    core.patch(id, { recalled: true }, true);
    return true;
  });

  ipcMain.on('open-releases', () => {
    shell.openExternal('https://github.com/Oldfoollearnc/landrop/releases/latest');
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
      // 不能放 %TEMP%：系统清理临时目录后，聊天记录里的图片就再也打不开了
      const dir = path.join(app.getPath('userData'), 'outbox');
      fs.mkdirSync(dir, { recursive: true });
      const safe = String(name || 'paste.png').replace(/[\\/:*?"<>|\x00-\x1f]/g, '_');
      const file = path.join(dir, `${Date.now()}-${crypto.randomBytes(3).toString('hex')}-${safe}`);
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

  ipcMain.on('delete', (_e, { id, purge }) => {
    // 删掉上传中的气泡时一并结束上传，避免文件继续写进保存目录
    if (uploads) uploads.abort(id);
    core.remove(id, !!purge);
  });

  // 群主读到消息后回执「已读」：作者气泡上会出现已读
  ipcMain.on('seen', (_e, ids) => {
    if (!Array.isArray(ids) || !server) return;
    server.markSeen('host', ids.slice(0, 400));
  });
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
    } else if (key === 'font') {
      config.patch({ font: ['s', 'm', 'l', 'xl'].includes(value) ? value : 'm' });
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
    if (uploads) uploads.abortAll();
    store.clear(!!purgeFiles);
    if (server) server.broadcast({ t: 'clear' });
    send('ev', { t: 'clear' });
    setUnread(0);
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

  // ---------- 群聊管理（只有本机桌面端能调用） ----------

  ipcMain.handle('room:snapshot', () => (server ? server.snapshot() : null));

  ipcMain.handle('room:rename', (_e, name) => {
    if (server) server.setRoomName(name);
    return server ? server.snapshot() : null;
  });

  ipcMain.handle('room:host-name', (_e, name) => {
    if (server) server.setHostName(name);
    return server ? server.snapshot() : null;
  });

  ipcMain.handle('room:lock', (_e, locked) => {
    if (server) server.setLocked(!!locked);
    return server ? server.snapshot() : null;
  });

  ipcMain.handle('room:kick', (_e, id) => {
    if (server) {
      try {
        server.kick(String(id || ''));
      } catch (err) {
        console.error('[room] kick', err.message);
      }
    }
    return server ? server.snapshot() : null;
  });

  ipcMain.handle('room:unblock', (_e, id) => {
    if (server) server.unblock(String(id || ''));
    return server ? server.snapshot() : null;
  });

  ipcMain.handle('room:invite', async () => (server ? server.invite() : null));

  // ---------- 工作台 ----------
  ipcMain.handle('workspace:state', () => ({
    version: app.getVersion(),
    platform: process.platform,
    chat: chatSummaryPayload(),
    remote: remote ? remote.state() : null,
    home: os.hostname(),
  }));
  ipcMain.handle('workspace:chat-summary', () => chatSummaryPayload());
  ipcMain.handle('workspace:open-chat', () => { showChat(); return true; });
  ipcMain.handle('workspace:theme', (_e, theme) => {
    workspaceTheme = theme === 'dark' ? 'dark' : 'light';
    core.setTheme(workspaceTheme);
    return workspaceTheme;
  });
  ipcMain.handle('workspace:save-text', async (_e, name, content) => {
    const safeName = String(name || 'nearsend.txt').replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(workspaceWin, {
      title: '保存文件',
      defaultPath: path.join(app.getPath('downloads'), safeName),
      filters: [{ name: '文本文件', extensions: ['csv', 'txt', 'json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, String(content || ''), 'utf8');
    return r.filePath;
  });
  ipcMain.handle('workspace:save-recording', async (_e, name, data) => {    const safeName = String(name || 'NearSend-session.webm').replace(/[\\/:*?"<>|]/g, '_');
    const r = await dialog.showSaveDialog(workspaceWin, {
      title: '保存会话录制',
      defaultPath: path.join(app.getPath('downloads'), safeName),
      filters: [{ name: 'WebM 视频', extensions: ['webm'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, Buffer.from(data));
    return r.filePath;
  });
  ipcMain.handle('workspace:autostart', async (_e, on) => {
    config.patch({ autostart: !!on });
    const st = await autostart.sync(!!on);
    return !!st.enabled;
  });
  ipcMain.handle('workspace:window', (_e, action) => {
    if (!workspaceWin || workspaceWin.isDestroyed()) return false;
    if (action === 'minimize') workspaceWin.minimize();
    else if (action === 'maximize') {
      if (workspaceWin.isMaximized()) workspaceWin.unmaximize();
      else workspaceWin.maximize();
    } else if (action === 'close') workspaceWin.hide();
    return true;
  });
  ipcMain.handle('workspace:open-help', () => {
    shell.openExternal('https://github.com/Oldfoollearnc/landrop/releases/tag/v3.0.0');
    return true;
  });
  ipcMain.handle('workspace:open-data-dir', () => {
    shell.openPath(app.getPath('userData'));
    return true;
  });
  ipcMain.handle('workspace:open-downloads', () => {
    const dir = path.join(app.getPath('downloads'), 'NearSend');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    shell.openPath(dir);
    return dir;
  });
  ipcMain.handle('workspace:read-clipboard', () => {
    try { return clipboard.readText(); } catch { return ''; }
  });
  ipcMain.handle('workspace:write-clipboard', (_e, text) => {
    try { clipboard.writeText(String(text || '')); return true; } catch { return false; }
  });

  // ---------- 远程工位 ----------
  ipcMain.handle('remote:state', () => (remote ? remote.state() : null));
  ipcMain.handle('remote:discover', () => (remote ? remote.peerList() : []));
  ipcMain.handle('remote:agent', (_e, on) => (remote ? remote.setAgent(!!on) : null));
  ipcMain.handle('remote:refresh-code', () => (remote ? remote.refreshCode() : null));
  ipcMain.handle('remote:revoke-grant', (_e, controllerId) => (remote ? remote.revokeGrant(String(controllerId || '')) : false));
  ipcMain.handle('remote:forget-peer', (_e, peerId) => (remote ? remote.forgetPeer(String(peerId || '')) : false));
  ipcMain.handle('remote:add-manual', (_e, payload) => {
    if (!remote) throw new Error('远程模块未启动');
    return remote.addManualPeer(String(payload?.address || ''), Number(payload?.port) || 0);
  });
  ipcMain.handle('remote:connect', async (_e, payload) => {
    if (!remote) throw new Error('远程模块未启动');
    return remote.connect(String(payload?.peerId || ''), String(payload?.code || ''), String(payload?.role || 'owner'));
  });
  ipcMain.handle('remote:disconnect', () => { if (remote) remote.disconnect(); return true; });
  ipcMain.handle('remote:end-active', () => { if (remote) remote.stopActive('manual'); return remote ? remote.state() : null; });
  ipcMain.handle('remote:dm', (_e, payload) => (remote ? remote.sendDM(String(payload?.peerId || ''), String(payload?.text || '')) : null));
  ipcMain.handle('remote:pick-file', async () => {
    if (!remote) return null;
    const r = await dialog.showOpenDialog(workspaceWin, {
      title: '发送文件到工位电脑',
      properties: ['openFile'],
      buttonLabel: '发送',
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return remote.sendFile(r.filePaths[0]);
  });
  ipcMain.handle('remote:send-file', (_e, filePath) => (remote ? remote.sendFile(String(filePath || '')) : null));
  ipcMain.handle('remote:send-file-to-controller', async (_e, filePath) => {
    if (!remote) return null;
    if (filePath) return remote.sendFileToActive(String(filePath));
    const r = await dialog.showOpenDialog(workspaceWin, {
      title: '发送文件给控制端',
      properties: ['openFile'],
      buttonLabel: '发送',
    });
    if (r.canceled || !r.filePaths[0]) return null;
    return remote.sendFileToActive(r.filePaths[0]);
  });
  ipcMain.handle('remote:history', () => (remote ? remote.getHistory() : []));
  ipcMain.handle('remote:audit', () => (remote ? remote.getAudit() : []));
  ipcMain.handle('remote:diagnostics', () => (remote ? remote.diagnostics() : null));
  ipcMain.handle('remote:export-audit', async () => {
    if (!remote) return null;
    const r = await dialog.showSaveDialog(workspaceWin, {
      title: '导出本机审计',
      defaultPath: path.join(app.getPath('downloads'), `nearsend-audit-${Date.now()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(remote.getAudit(), null, 2));
    return r.filePath;
  });
  ipcMain.handle('remote:export-diag', async () => {
    if (!remote) return null;
    const r = await dialog.showSaveDialog(workspaceWin, {
      title: '导出诊断包',
      defaultPath: path.join(app.getPath('downloads'), `nearsend-diagnostics-${Date.now()}.json`),
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (r.canceled || !r.filePath) return null;
    fs.writeFileSync(r.filePath, JSON.stringify(remote.diagnostics(), null, 2));
    return r.filePath;
  });
  ipcMain.on('remote:input', (_e, evt) => { if (remote) remote.sendInput(evt); });
  ipcMain.on('remote:clipboard', (_e, text) => { if (remote) remote.sendClipboard(text); });
  ipcMain.on('remote:display', (_e, index) => { if (remote) remote.setDisplay(index); });
  ipcMain.on('remote:quality', (_e, quality) => { if (remote) remote.setQuality(quality); });
  ipcMain.on('remote:recording', (_e, on) => { if (remote) remote.setRecording(!!on); });

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

/**
 * 从旧品牌 LanDrop 的数据目录迁移。
 * 关键点：必须在 app ready 之前执行，并且必须带上 Chromium 的 `Local State`——
 * Electron 的 safeStorage 把密钥存在里面，漏掉它就会解不开旧聊天记录。
 * 另外处理一种坏状态：之前迁移过但没带 Local State，记录被 park 成
 * messages.locked-*.jsonl 的情况，自动用旧目录的密钥把记录恢复回来。
 */
function migrateLegacyData() {
  try {
    const oldDir = path.join(app.getPath('appData'), 'LanDrop');
    const newDir = app.getPath('userData');
    if (!fs.existsSync(oldDir)) return;
    if (path.resolve(oldDir) === path.resolve(newDir)) return;

    fs.mkdirSync(newDir, { recursive: true });
    const hasConfig = fs.existsSync(path.join(newDir, 'config.json'));
    const locked = fs.readdirSync(newDir).filter((n) => n.startsWith('messages.locked-'));
    const hasHistory = fs.existsSync(path.join(newDir, 'messages.jsonl'));
    const needsRepair = hasConfig && locked.length > 0 && !hasHistory;
    if (hasConfig && !needsRepair) return;

    // 这几个文件必须覆盖：密钥、聊天记录、配置，以及 safeStorage 依赖的 Local State
    const FORCE = new Set(['config.json', 'messages.jsonl', 'messages.key', 'Local State', 'Preferences']);
    for (const name of fs.readdirSync(oldDir)) {
      const src = path.join(oldDir, name);
      const dst = path.join(newDir, name);
      try {
        if (!fs.statSync(src).isFile()) continue;
        if (fs.existsSync(dst) && !FORCE.has(name)) continue;
        fs.copyFileSync(src, dst);
      } catch {
        /* 单个文件失败不影响整体 */
      }
    }

    if (needsRepair) {
      const rec = path.join(newDir, 'recovered');
      fs.mkdirSync(rec, { recursive: true });
      for (const name of locked) {
        try {
          fs.renameSync(path.join(newDir, name), path.join(rec, name));
        } catch {
          /* 保留在原处也无妨 */
        }
      }
      console.log('[boot] 已用旧密钥恢复被锁的聊天记录');
    }

    // 下载目录跟着改名
    const cfgPath = path.join(newDir, 'config.json');
    if (fs.existsSync(cfgPath)) {
      try {
        const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
        if (cfg.saveDir && /[\\/]LanDrop$/.test(cfg.saveDir)) {
          cfg.saveDir = cfg.saveDir.replace(/[\\/]LanDrop$/, '\\NearSend');
          fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2));
        }
      } catch {
        /* 配置损坏时保持原样 */
      }
    }
    console.log('[boot] 已从 LanDrop 数据目录迁移');
  } catch (err) {
    console.error('[boot] migrate', err.message);
  }
}

// 必须早于 app ready：Chromium 会在启动时读取 Local State
migrateLegacyData();

/**
 * 安装器里勾选的「开机启动」通过一个一次性标记文件传给程序。
 * 覆盖升级时用户的旧配置会被保留，但安装器里的明确选择优先一次，
 * 读完立刻删掉，之后就以程序设置里的开关为准。
 */
function applyInstallerPrefs() {
  const marker = path.join(app.getPath('userData'), 'installer.json');
  try {
    if (!fs.existsSync(marker)) return;
    const prefs = JSON.parse(fs.readFileSync(marker, 'utf8'));
    if (typeof prefs.autostart === 'boolean') config.patch({ autostart: prefs.autostart });
    fs.unlinkSync(marker);
  } catch (err) {
    // 标记文件损坏不该阻止启动，删掉即可
    try {
      fs.unlinkSync(marker);
    } catch {
      /* ignore */
    }
    console.error('[boot] installer prefs', err.message);
  }
}

async function boot() {
  config.load();
  // 3.0 统一工作台以浅色为默认；只迁移一次，之后仍可在设置里切深色。
  if (!config.get('v3ThemeInit')) {
    config.patch({ theme: 'light', v3ThemeInit: true });
  }
  applyInstallerPrefs();

  const saveDir = config.get('saveDir');
  try {
    fs.mkdirSync(saveDir, { recursive: true });
  } catch (err) {
    console.error('[boot] saveDir', err.message);
  }

  vault = new Vault(app.getPath('userData')).init();
  store = new Store(path.join(app.getPath('userData'), 'messages.jsonl'), vault).load();
  room = new Room(path.join(app.getPath('userData'), 'room.json')).load();
  // 上次进程退出时没传完的文件，服务端已没有上传会话可供续传：
  // 启动时统一标成失败，否则气泡会永远停在「上传中 37%」。
  for (const m of store.messages()) {
    if (m.status === 'uploading') store.patch(m.id, { status: 'error' }, true);
  }
  uploads = new Uploads(() => config.get('saveDir'));
  server = new LanServer({ core, uploads, token: config.get('token'), room });

  const port = await server.start(config.get('port'));
  if (port !== config.get('port')) config.patch({ port });

  createWindow();
  createTray();
  registerIpc();

  remote = new RemoteManager({ userDataDir: app.getPath('userData'), version: app.getVersion() });
  remote.on('peers', (peers) => sendWorkspace('workspace:event', { t: 'peers', peers }));
  remote.on('state', (state) => sendWorkspace('workspace:event', { t: 'remote-state', state }));
  remote.on('session', (session) => sendWorkspace('workspace:event', { t: 'session', session }));
  remote.on('frame', (frame) => sendWorkspace('workspace:event', { t: 'frame', frame }));
  remote.on('chat', (chat) => sendWorkspace('workspace:event', { t: 'chat', chat }));
  remote.on('clipboard', (clipboard) => sendWorkspace('workspace:event', { t: 'clipboard', clipboard }));
  remote.on('file-progress', (file) => sendWorkspace('workspace:event', { t: 'file-progress', file }));
  remote.on('stats', (stats) => sendWorkspace('workspace:event', { t: 'stats', stats }));
  remote.on('audit', (audit) => sendWorkspace('workspace:event', { t: 'audit', audit }));
  await remote.init();
  createWorkspaceWindow();

  server.on('room', (p) => send('ev', { t: 'room', room: p.room, members: p.members, blocked: p.blocked }));
  server.on('typing', (p) => send('ev', { t: 'typing', member: p.member, on: !!p.on }));
  // 手机在下载电脑上的文件时，把进度推给界面
  server.on('served', (p) => send('ev', {
    t: 'download', id: p.id, sent: p.sent, total: p.total, done: p.done, aborted: p.aborted,
  }));
  if (room.created) {
    server.publishSystem('群聊已创建，扫码邀请成员', { event: 'created' });
  }
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
  app.on('second-instance', () => showWorkspace());

  app.setAppUserModelId('com.nearsend.app');

  app.whenReady().then(boot).catch((err) => {
    console.error('[boot] failed', err);
    dialog.showErrorBox('启动失败', String(err && err.message ? err.message : err));
    app.quit();
  });

  app.on('before-quit', () => {
    quitting = true;
    if (ipTimer) clearInterval(ipTimer);
    if (remote) remote.stop();
    if (server) server.stop();
    if (workspaceWin && !workspaceWin.isDestroyed()) workspaceWin.destroy();
    if (tray) {
      tray.destroy();
      tray = null;
    }
  });

  app.on('window-all-closed', () => {
    /* 常驻托盘，不退出 */
  });
}
