'use strict';
/**
 * 远程控制会话的授权边界测试。
 *
 * 不启动 Electron：用最小桩替换 electron API，直接驱动 RemoteManager 的 WS 消息入口。
 * 覆盖：
 *   1. 未配对连接不能注入键鼠/剪贴板/结束会话
 *   2. 已配对但不是当前会话的连接也不能操作会话
 *   3. 浏览器 Origin 连接被拒绝
 *
 * 用法：node tools/test-remote.js
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

let failures = 0;
function check(name, ok, extra) {
  if (ok) console.log('  ok   ' + name);
  else {
    failures += 1;
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nearsend-remote-'));
let clipboardWrites = 0;
const fakeDisplay = {
  id: 1,
  size: { width: 1920, height: 1080 },
  bounds: { x: 0, y: 0, width: 1920, height: 1080 },
  scaleFactor: 1,
};
const fakeElectron = {
  app: {
    isPackaged: false,
    getAppPath: () => path.join(__dirname, '..'),
    getVersion: () => '0.0.0-test',
    getPath: (name) => path.join(tmp, name),
  },
  screen: {
    getAllDisplays: () => [fakeDisplay],
    getPrimaryDisplay: () => fakeDisplay,
    dipToScreenPoint: (p) => ({ x: p.x, y: p.y }),
  },
  desktopCapturer: { getSources: async () => [] },
  clipboard: {
    writeText: () => { clipboardWrites += 1; },
    readText: () => '',
  },
};

const originalLoad = Module._load;
Module._load = function load(request, parent, isMain) {
  if (request === 'electron') return fakeElectron;
  return originalLoad.call(this, request, parent, isMain);
};

class FakeSocket {
  constructor() {
    this.readyState = 1;
    this.handlers = new Map();
    this.sent = [];
    this.closed = null;
  }
  on(event, fn) {
    if (!this.handlers.has(event)) this.handlers.set(event, []);
    this.handlers.get(event).push(fn);
    return this;
  }
  emit(event, ...args) {
    for (const fn of this.handlers.get(event) || []) fn(...args);
  }
  send(raw) {
    this.sent.push(JSON.parse(raw));
  }
  close(code, reason) {
    this.readyState = 3;
    this.closed = { code, reason };
    this.emit('close');
  }
  terminate() {
    this.close(1006, 'terminate');
  }
  message(obj) {
    this.emit('message', Buffer.from(JSON.stringify(obj)));
  }
}

const { RemoteManager } = require(path.join(__dirname, '..', 'src', 'main', 'remote'));

(async () => {
  const manager = new RemoteManager({ userDataDir: tmp, version: '0.0.0-test' });
  const inputs = [];
  manager.handleInput = (msg) => inputs.push(msg);

  const activeWs = new FakeSocket();
  const ownerWs = new FakeSocket();
  const strangerWs = new FakeSocket();

  manager.onConnection(activeWs, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
  manager.onConnection(ownerWs, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });
  manager.onConnection(strangerWs, { headers: {}, socket: { remoteAddress: '127.0.0.1' } });

  // activeWs 是“当前会话连接”，ownerWs 是另一个已配对连接，strangerWs 未配对
  manager.active = {
    ws: activeWs,
    controller: { id: 'ctrl-active', name: '当前控制端' },
    permissions: { view: true, control: true, clipboard: true, record: true },
    display: 0,
    quality: 'auto',
    startedAt: Date.now(),
    recording: false,
  };
  for (const ws of [activeWs, ownerWs]) {
    ws.message({
      t: 'pair',
      controller: { id: `ctrl-${ws === activeWs ? 'active' : 'owner'}`, name: '控制端' },
      code: manager.code,
      role: 'owner',
    });
  }

  const before = inputs.length;
  strangerWs.message({ t: 'input', kind: 'mouse', action: 'move', x: 0.5, y: 0.5 });
  check('未配对连接不能注入键鼠', inputs.length === before, 'inputs=' + inputs.length);

  strangerWs.message({ t: 'clipboard', text: 'evil' });
  check('未配对连接不能写剪贴板', clipboardWrites === 0, 'writes=' + clipboardWrites);

  strangerWs.message({ t: 'stop' });
  check('未配对连接不能结束会话', !!manager.active, 'active=' + !!manager.active);

  ownerWs.message({ t: 'input', kind: 'mouse', action: 'move', x: 0.5, y: 0.5 });
  check('非当前会话的已配对连接不能注入键鼠', inputs.length === before, 'inputs=' + inputs.length);

  activeWs.message({ t: 'input', kind: 'mouse', action: 'move', x: 0.5, y: 0.5 });
  check('当前会话连接可以注入键鼠', inputs.length === before + 1, 'inputs=' + inputs.length);

  activeWs.message({ t: 'clipboard', text: 'hello' });
  check('当前会话连接可以写剪贴板', clipboardWrites === 1, 'writes=' + clipboardWrites);

  const dlDir = path.join(tmp, 'downloads', 'NearSend');
  const fileConn = { ws: activeWs, paired: true };
  manager.receiveFileBegin(fileConn, { id: 'file-ok', name: 'file-ok.txt', size: 4 });
  manager.receiveFileChunk(fileConn, { id: 'file-ok', data: Buffer.from('abcd').toString('base64') });
  manager.receiveFileEnd(fileConn, { id: 'file-ok' });
  await new Promise((r) => setTimeout(r, 200));
  check('文件分片能完整落盘',
    fs.existsSync(path.join(dlDir, 'file-ok.txt'))
      && fs.readFileSync(path.join(dlDir, 'file-ok.txt'), 'utf8') === 'abcd');

  manager.receiveFileBegin(fileConn, { id: 'file-bad', name: 'file-bad.txt', size: 8 });
  manager.receiveFileChunk(fileConn, { id: 'file-bad', data: Buffer.from('ab').toString('base64') });
  manager.receiveFileEnd(fileConn, { id: 'file-bad' });
  await new Promise((r) => setTimeout(r, 200));
  check('大小不一致的传输会被拒绝并删除半截文件',
    !fs.existsSync(path.join(dlDir, 'file-bad.txt')));
  check('拒绝时回到发送端 file-error',
    activeWs.sent.some((m) => m.t === 'file-error' && m.id === 'file-bad'));

  const browserWs = new FakeSocket();
  manager.onConnection(browserWs, {
    headers: { origin: 'https://evil.example' },
    socket: { remoteAddress: '127.0.0.1' },
  });
  check('浏览器 Origin 连接被拒绝', !!browserWs.closed && browserWs.closed.code === 4003,
    JSON.stringify(browserWs.closed));

  const autoProfile = manager.captureProfile('auto', 0);
  check('自动画质按屏幕原生分辨率采集、不放大',
    autoProfile.width === 1920 && autoProfile.height === 1080 && autoProfile.quality >= 80,
    JSON.stringify(autoProfile));
  const twoKOn1080 = manager.captureProfile('2k', 0);
  check('2K 档不会把 1080p 屏幕放大成 2K',
    twoKOn1080.width === 1920 && twoKOn1080.height === 1080,
    JSON.stringify(twoKOn1080));

  manager.stop();
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);})().catch((err) => {
  console.error('测试异常:', err);
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  process.exit(1);
});
