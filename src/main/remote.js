'use strict';
/**
 * 近传 · 远程工位
 * 局域网设备发现 + WebSocket 会话 + 桌面帧 + Windows 输入注入。
 *
 * V1 传输层是 JPEG 帧（内网可用、依赖少），后续可替换为 WebRTC。
 * 真实安全桌面/锁屏注入需要 Windows 服务，当前用户态进程只覆盖已登录桌面。
 */
const { EventEmitter } = require('events');
const { WebSocketServer, WebSocket } = require('ws');
const { desktopCapturer, screen, clipboard, app } = require('electron');
const dgram = require('dgram');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');

const APP_TAG = 'nearsend-remote';
const UDP_PORT = 47822;
const WS_START = 47820;
const FRAME_MS = 200;

function now() { return Date.now(); }
function rid(prefix) { return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
function safeFileName(name) {
  const base = path.basename(String(name || 'file')).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').slice(0, 160) || 'file';
  return base;
}
function six() { return String(Math.floor(100000 + Math.random() * 900000)); }
function safeName(s, fallback) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback; }
function ipv4List() {
  const out = [];
  const nics = os.networkInterfaces();
  for (const name of Object.keys(nics)) {
    for (const a of nics[name] || []) {
      if (a.family === 'IPv4' && !a.internal) out.push({ name, address: a.address, netmask: a.netmask });
    }
  }
  return out;
}
function displayBounds(index) {
  const displays = screen.getAllDisplays();
  return displays[index] || displays[0] || screen.getPrimaryDisplay();
}

class RemoteManager extends EventEmitter {
  constructor({ userDataDir, version }) {
    super();
    this.userDataDir = userDataDir;
    this.version = version || app.getVersion();
    this.file = path.join(userDataDir, 'remote.json');
    this.cfg = this.load();
    this.deviceId = this.cfg.deviceId || rid('dev');
    this.controllerId = this.cfg.controllerId || rid('ctrl');
    this.deviceName = this.cfg.deviceName || os.hostname();
    this.code = six();
    this.allowed = new Set(Array.isArray(this.cfg.allowedControllers) ? this.cfg.allowedControllers : []);
    this.agentEnabled = this.cfg.agentEnabled !== false;
    this.wsPort = 0;
    this.wss = null;
    this.udp = null;
    this.peers = new Map();
    this.connections = new Set();
    this.active = null; // { ws, controller, display, quality, timer }
    this.frameTimer = null;
    this.captureBusy = false;
    this.helper = null;
    this.helperPath = this.resolveHelper();
    this.audit = [];
    this.history = [];
    this.clipboardText = '';
    this.incomingFiles = new Map();
    this.save();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { return {}; }
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(this.file, JSON.stringify({
        deviceId: this.deviceId,
        controllerId: this.controllerId,
        deviceName: this.deviceName,
        agentEnabled: this.agentEnabled,
        allowedControllers: [...this.allowed].slice(-200),
      }, null, 2));
    } catch (err) { console.error('[remote] save', err.message); }
  }
  resolveHelper() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'remote-input.exe');
    }
    return path.join(app.getAppPath(), 'assets', 'remote-input.exe');
  }
  async init() {
    await this.startWs();
    this.startUdp();
    this.startDm();
    this.addSelfPeer();
    if (this.agentEnabled && process.env.NEARSEND_SELF_PREVIEW !== '0') {
      // 本机预览：不依赖 UDP 回环，直接把 127.0.0.1 作为一台设备显示。
      this.addSelfPeer(true);
    }
    this.emit('peers', this.peerList());
    this.emit('state', this.state());
  }

  async startWs() {
    for (let p = WS_START; p < WS_START + 20; p += 1) {
      try {
        await new Promise((resolve, reject) => {
          const wss = new WebSocketServer({ port: p, host: '0.0.0.0' });
          wss.once('listening', () => { this.wss = wss; this.wsPort = p; resolve(); });
          wss.once('error', (err) => { try { wss.close(); } catch {} reject(err); });
        });
        this.wss.on('connection', (ws, req) => this.onConnection(ws, req));
        console.log('[remote] ws', this.wsPort);
        return;
      } catch { /* try next */ }
    }
    console.error('[remote] no ws port');
  }

  startUdp() {
    try {
      this.udp = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.udp.on('error', (err) => console.error('[remote] udp', err.message));
      this.udp.on('message', (buf, rinfo) => {
        try {
          const msg = JSON.parse(buf.toString('utf8'));
          if (!msg || msg.ns !== APP_TAG) return;
          if (msg.t === 'query' && this.agentEnabled) this.announce(rinfo.address);
          if (msg.t === 'announce' && msg.id && msg.id !== this.deviceId) {
            const peer = {
              id: msg.id, name: safeName(msg.name, msg.id), ip: rinfo.address, port: Number(msg.port) || 0,
              os: msg.os || 'Windows', version: msg.version || '', online: true, lastSeen: now(), self: false,
              displayCount: Math.max(1, Math.min(2, Number(msg.displayCount) || 1)),
            };
            if (!peer.port) return;
            this.peers.set(peer.id, peer);
            this.emit('peers', this.peerList());
          }
        } catch { /* ignore malformed */ }
      });
      this.udp.bind(UDP_PORT, '0.0.0.0', () => {
        try { this.udp.setBroadcast(true); } catch {}
        this.announce();
      });
      this.udpTimer = setInterval(() => this.announce(), 2500);
      this.pruneTimer = setInterval(() => {
        const t = now();
        let changed = false;
        for (const [id, p] of this.peers) {
          if (!p.self && t - p.lastSeen > 9000) { this.peers.delete(id); changed = true; }
        }
        if (changed) this.emit('peers', this.peerList());
      }, 3000);
    } catch (err) { console.error('[remote] udp start', err.message); }
  }

  startDm() {
    try {
      this.dm = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.dm.on('error', (err) => console.error('[remote] dm', err.message));
      this.dm.on('message', (buf) => {
        try {
          const msg = JSON.parse(buf.toString('utf8'));
          if (!msg || msg.ns !== 'nearsend-dm' || msg.to !== this.deviceId) return;
          const text = String(msg.text || '').trim().slice(0, 4000);
          if (!text) return;
          this.pushAudit('chat_in', msg.from || '同事', '成功', text.slice(0, 80));
          this.emit('chat', { from: msg.from || '同事', fromId: msg.fromId || '', text, ts: msg.ts || now(), direction: 'in' });
        } catch { /* ignore */ }
      });
      this.dm.bind(47823, '0.0.0.0');
    } catch (err) { console.error('[remote] dm start', err.message); }
  }

  sendDM(peerId, text) {
    const value = String(text || '').trim().slice(0, 4000);
    const peer = this.peers.get(peerId);
    if (!value || !peer || !this.dm) return null;
    if (peer.self) return null;
    const evt = { from: this.deviceName, fromId: this.deviceId, text: value, ts: now(), direction: 'out' };
    try {
      this.dm.send(Buffer.from(JSON.stringify({
        ns: 'nearsend-dm', fromId: this.deviceId, from: this.deviceName, to: peerId, text: value, ts: evt.ts,
      })), 47823, peer.ip);
    } catch (err) { console.error('[remote] dm send', err.message); return null; }
    this.pushAudit('chat_out', this.deviceName, '成功', value.slice(0, 80));
    return evt;
  }

  addSelfPeer(force) {
    if (!this.agentEnabled && force) return;
    if (!this.agentEnabled) return;
    this.peers.set(this.deviceId, {
      id: this.deviceId, name: `${this.deviceName}（本机）`, ip: '127.0.0.1', port: this.wsPort,
      os: `Windows · ${os.release()}`, version: this.version, online: true, lastSeen: now(), self: true,
      displayCount: screen.getAllDisplays().length,
    });
  }

  announce(to) {
    if (!this.udp || !this.agentEnabled) return;
    const msg = Buffer.from(JSON.stringify({
      ns: APP_TAG, t: 'announce', id: this.deviceId, name: this.deviceName, port: this.wsPort,
      os: `Windows · ${os.release()}`, version: this.version, displayCount: screen.getAllDisplays().length, ts: now(),
    }));
    try {
      if (to) this.udp.send(msg, UDP_PORT, to);
      else {
        for (const a of ipv4List()) {
          const parts = a.address.split('.');
          if (parts.length === 4) this.udp.send(msg, UDP_PORT, `${parts[0]}.${parts[1]}.${parts[2]}.255`);
        }
        this.udp.send(msg, UDP_PORT, '255.255.255.255');
      }
    } catch { /* broadcast may fail on some adapters */ }
  }

  peerList() {
    return [...this.peers.values()].map((p) => ({
      id: p.id, name: p.name, ip: p.ip, port: p.port, os: p.os, version: p.version,
      online: p.online, self: !!p.self, lastSeen: p.lastSeen, displayCount: p.displayCount || 1,
    }));
  }

  state() {
    const active = this.active && this.active.ws && this.active.ws.readyState === WebSocket.OPEN
      ? {
        peerName: this.active.peerName || '控制端',
        controller: this.active.controller?.name || '',
        startedAt: this.active.startedAt,
        quality: this.active.quality,
        display: this.active.display,
      } : null;
    return {
      device: {
        id: this.deviceId, name: this.deviceName, host: os.hostname(),
        os: `Windows · ${os.release()}`, version: this.version, ips: ipv4List(),
        displays: screen.getAllDisplays().map((d, i) => ({
          index: i, label: `屏幕 ${i + 1}`, res: `${d.size.width}×${d.size.height}`, primary: d.id === screen.getPrimaryDisplay().id,
        })),
      },
      agentEnabled: this.agentEnabled,
      code: this.code,
      port: this.wsPort,
      peers: this.peerList(),
      session: this.clientSession ? { ...this.clientSession } : null,
      active,
      helper: { path: this.helperPath, exists: fs.existsSync(this.helperPath) },
    };
  }

  setAgent(on) {
    this.agentEnabled = !!on;
    this.save();
    if (this.agentEnabled) {
      this.addSelfPeer(true);
      this.announce();
    } else {
      for (const [id, p] of this.peers) if (p.self) this.peers.delete(id);
      this.stopActive('agent-off');
    }
    this.emit('peers', this.peerList());
    this.emit('state', this.state());
    return this.state();
  }

  refreshCode() {
    this.code = six();
    this.emit('state', this.state());
    return this.code;
  }

  // ---------- agent side ----------
  onConnection(ws, req) {
    const conn = { ws, ip: req.socket.remoteAddress, controller: null, paired: false, alive: true };
    this.connections.add(conn);
    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'pair') return this.pairController(conn, msg);
      if (msg.t === 'start') return this.startActive(conn, msg);
      if (msg.t === 'input') return this.handleInput(msg);
      if (msg.t === 'clipboard') {
        const text = String(msg.text || '').slice(0, 200000);
        this.clipboardText = text;
        this.lastAgentClipboard = text;
        try { clipboard.writeText(text); } catch {}
        this.emit('clipboard', { text, ts: now() });
        return;
      }
      if (msg.t === 'file-begin') return this.receiveFileBegin(conn, msg);
      if (msg.t === 'file-chunk') return this.receiveFileChunk(conn, msg);
      if (msg.t === 'file-end') return this.receiveFileEnd(conn, msg);
      if (msg.t === 'chat') {
        const text = String(msg.text || '').trim().slice(0, 4000);
        if (!text) return;
        const evt = { from: conn.controller?.name || '同事', fromId: conn.controller?.id || '', text, ts: now(), direction: 'in' };
        this.pushAudit('chat_in', evt.from, '成功', text.slice(0, 80));
        this.emit('chat', evt);
        this.send(conn.ws, { t: 'chat:ack', ts: evt.ts });
        return;
      }
      if (msg.t === 'stop') { this.stopActive('remote-stop'); return; }
      if (msg.t === 'ping') this.send(ws, { t: 'pong', ts: now() });
    });
    ws.on('close', () => {
      this.connections.delete(conn);
      if (this.active && this.active.ws === ws) this.stopActive('peer-closed');
      this.emit('state', this.state());
    });
    ws.on('error', () => {});
    this.send(ws, { t: 'hello', device: this.state().device, needsCode: true });
  }

  pairController(conn, msg) {
    if (!this.agentEnabled) {
      this.send(conn.ws, { t: 'error', code: 'AGENT_OFF', message: '本机已关闭被控' });
      try { conn.ws.close(4004, 'agent off'); } catch {}
      return;
    }
    const controller = msg.controller || {};
    const id = String(controller.id || '').slice(0, 80);
    const name = safeName(controller.name, '同事的控制端');
    const code = String(msg.code || '').replace(/\D/g, '');
    const allowed = id && this.allowed.has(id);
    if (!allowed && code !== this.code) {
      this.pushAudit('pair_failed', name, '失败', '授权码不正确');
      this.send(conn.ws, { t: 'error', code: 'PAIR_DENIED', message: '授权码不正确' });
      try { conn.ws.close(4003, 'pair denied'); } catch {}
      return;
    }
    conn.paired = true;
    conn.controller = { id, name, ip: conn.ip };
    if (id) { this.allowed.add(id); this.save(); }
    this.pushAudit('pair', name, '成功', conn.ip || '');
    this.send(conn.ws, { t: 'paired', device: this.state().device, controller: conn.controller });
    this.emit('state', this.state());
  }

  startActive(conn, msg) {
    if (!conn.paired) { this.send(conn.ws, { t: 'error', code: 'UNAUTHORIZED' }); return; }
    if (!this.agentEnabled) { this.send(conn.ws, { t: 'error', code: 'AGENT_OFF' }); return; }
    const replacing = !!(this.active && this.active.ws !== conn.ws);
    this.stopActive(replacing ? 'takeover' : 'switch', replacing);
    const display = Math.max(0, Math.min(1, Number(msg.display) || 0));
    const quality = ['auto', '2k', '1080', '720'].includes(msg.quality) ? msg.quality : 'auto';
    this.active = {
      ws: conn.ws, conn, controller: conn.controller, peerName: conn.controller?.name,
      display, quality, startedAt: now(), timer: null,
    };
    this.lastAgentWs = conn.ws;
    const d = displayBounds(display);
    this.send(conn.ws, {
      t: 'started',
      device: this.state().device,
      display: { index: display, width: d.size.width, height: d.size.height, x: d.bounds.x, y: d.bounds.y },
      quality,
    });
    this.pushAudit('session_start', conn.controller?.name || '控制端', '成功', `display=${display} quality=${quality}`);
    this.history.unshift({ id: rid('sess'), peer: conn.controller?.name || '控制端', startedAt: this.active.startedAt, display, quality, result: 'active' });
    if (this.history.length > 100) this.history.length = 100;
    this.emit('state', this.state());
    this.startFrames();
  }

  startFrames() {
    clearInterval(this.frameTimer);
    this.frameTimer = setInterval(() => this.captureOnce(), FRAME_MS);
    clearInterval(this.clipboardTimer);
    this.clipboardTimer = setInterval(() => {
      const active = this.active;
      if (!active || !active.ws || active.ws.readyState !== WebSocket.OPEN) return;
      let text = '';
      try { text = clipboard.readText(); } catch {}
      if (text && text !== this.lastAgentClipboard) {
        this.lastAgentClipboard = text;
        this.send(active.ws, { t: 'clipboard', text: text.slice(0, 200000) });
      }
    }, 1200);
    this.captureOnce();
  }

  async captureOnce() {
    const active = this.active;
    if (!active || this.captureBusy) return;
    if (!active.ws || active.ws.readyState !== WebSocket.OPEN) { this.stopActive('ws-closed'); return; }
    this.captureBusy = true;
    try {
      const size = active.quality === '2k'
        ? { width: 2560, height: 1440 }
        : active.quality === '720'
          ? { width: 1280, height: 720 }
          : { width: 1920, height: 1080 };
      const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: size });
      if (!sources.length) throw new Error('no screen source');
      if (this.active !== active) return;
      const src = sources[Math.min(active.display, sources.length - 1)];
      const img = src.thumbnail;
      const sz = img.getSize();
      const jpeg = img.toJPEG(active.quality === '2k' ? 72 : 66);
      const frame = {
        t: 'frame', ts: now(), display: active.display,
        width: sz.width, height: sz.height, data: jpeg.toString('base64'),
      };
      this.send(active.ws, frame);
    } catch (err) {
      this.send(active.ws, { t: 'error', code: 'FRAME_ERROR', message: err.message });
    } finally { this.captureBusy = false; }
  }

  stopActive(reason, notify = true) {
    clearInterval(this.frameTimer);
    clearInterval(this.clipboardTimer);
    this.frameTimer = null;
    this.clipboardTimer = null;
    if (this.active) {
      const name = this.active.controller?.name || '控制端';
      this.pushAudit('session_end', name, '成功', reason || '');
      if (notify) this.send(this.active.ws, { t: 'ended', reason: reason || 'ended' });
      this.lastAgentWs = null;
      this.active = null;
    }
    this.emit('state', this.state());
  }

  handleInput(msg) {
    if (!this.active) return;
    const kind = msg.kind;
    if (kind === 'mouse') {
      const d = displayBounds(this.active.display);
      if (msg.action === 'move' || msg.action === 'down' || msg.action === 'up') {
        const nx = Math.max(0, Math.min(1, Number(msg.x) || 0));
        const ny = Math.max(0, Math.min(1, Number(msg.y) || 0));
        const x = d.bounds.x + Math.round(nx * (d.bounds.width - 1));
        const y = d.bounds.y + Math.round(ny * (d.bounds.height - 1));
        this.writeHelper(`MM ${x} ${y}`);
        if (msg.action === 'down') this.writeHelper(`MD ${this.button(msg.button)}`);
        if (msg.action === 'up') this.writeHelper(`MU ${this.button(msg.button)}`);
        if (msg.action === 'move' && (msg.buttons & 1)) { /* drag handled by down/up */ }
      } else if (msg.action === 'wheel') {
        this.writeHelper(`MW ${Math.round(Number(msg.delta) || 0)}`);
      }
    } else if (kind === 'key') {
      const vk = Number(msg.vk) || 0;
      if (!vk) return;
      this.writeHelper(`${msg.action === 'up' ? 'KU' : 'KD'} ${vk}`);
    } else if (kind === 'text') {
      const text = String(msg.text || '').slice(0, 4000).replace(/\r?\n/g, ' ');
      if (text) this.writeHelper(`TX ${text}`);
    }
  }
  button(b) { return b === 'right' ? 'right' : b === 'middle' ? 'middle' : 'left'; }

  ensureHelper() {
    if (this.helper && !this.helper.killed && this.helper.stdin && !this.helper.stdin.destroyed) return this.helper;
    if (!fs.existsSync(this.helperPath)) {
      console.error('[remote] input helper missing', this.helperPath);
      return null;
    }
    try {
      this.helper = spawn(this.helperPath, [], { windowsHide: true, stdio: ['pipe', 'ignore', 'ignore'] });
      this.helper.on('exit', () => { this.helper = null; });
      this.helper.on('error', () => { this.helper = null; });
      return this.helper;
    } catch (err) { console.error('[remote] helper', err.message); return null; }
  }
  writeHelper(line) {
    const h = this.ensureHelper();
    if (!h) return;
    try { h.stdin.write(`${line}\n`); } catch { this.helper = null; }
  }

  // ---------- controller side ----------
  async connect(peerId, code) {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('设备不在线');
    if (this.client) this.disconnect();
    const url = `ws://${peer.self ? '127.0.0.1' : peer.ip}:${peer.port}`;
    const ws = new WebSocket(url);
    this.client = {
      ws, peer, peerId, state: 'connecting', startedAt: now(),
      controllerId: this.controllerId, display: 0, quality: 'auto',
    };
    this.emit('session', { state: 'connecting', peer });
    return new Promise((resolve, reject) => {
      let settled = false;
      let timer = null;
      const fail = (err) => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        this.emit('session', { state: 'error', message: err.message || String(err), peer });
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      ws.on('open', () => {
        this.send(ws, {
          t: 'pair',
          controller: { id: this.client.controllerId, name: this.deviceName },
          code: String(code || '').replace(/\D/g, ''),
        });
      });
      ws.on('message', (raw) => {
        let msg; try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') { /* wait for paired */ return; }
        if (msg.t === 'paired') {
          settled = true;
          if (timer) clearTimeout(timer);
          this.client.state = 'active';
          this.client.device = msg.device;
          this.client.peerName = peer.name;
          this.send(ws, { t: 'start', display: 0, quality: 'auto' });
          this.emit('session', { state: 'active', peer, device: msg.device });
          resolve(this.state());
          return;
        }
        if (msg.t === 'started') {
          this.client.display = msg.display;
          this.client.quality = msg.quality || 'auto';
          this.emit('session', { state: 'active', peer, display: msg.display, quality: msg.quality });
          return;
        }
        if (msg.t === 'frame') { this.emit('frame', msg); return; }
        if (msg.t === 'clipboard') { this.emit('clipboard', msg); return; }
        if (msg.t === 'chat') { this.emit('chat', { ...msg, direction: 'in', from: peer.name }); return; }
        if (msg.t === 'chat:ack') return;
        if (msg.t === 'error') { fail(new Error(msg.message || msg.code || '远程错误')); try { ws.close(); } catch {} return; }
        if (msg.t === 'ended') {
          this.emit('session', { state: 'ended', reason: msg.reason || 'ended', peer });
          this.client = null;
        }
      });
      timer = setTimeout(() => {
        if (!settled) fail(new Error('连接超时：请确认被控端在线、端口可达，且授权码正确'));
      }, 12000);
      ws.on('close', () => {
        clearTimeout(timer);
        if (!settled) fail(new Error('连接已断开'));
        if (this.client && this.client.ws === ws) {
          this.client = null;
          this.emit('session', { state: 'ended', reason: 'closed', peer });
        }
      });
      ws.on('error', (err) => { clearTimeout(timer); fail(err); });
    });
  }

  disconnect() {
    const c = this.client;
    if (!c) return;
    try { this.send(c.ws, { t: 'stop' }); } catch {}
    try { c.ws.close(); } catch {}
    this.client = null;
    this.emit('session', { state: 'ended', reason: 'local', peer: c.peer });
  }

  sendInput(evt) {
    if (!this.client || this.client.state !== 'active') return;
    this.send(this.client.ws, { t: 'input', ...evt });
  }
  sendClipboard(text) {
    if (!this.client) return;
    this.send(this.client.ws, { t: 'clipboard', text: String(text || '').slice(0, 200000) });
  }

  receiveFileBegin(conn, msg) {
    if (!conn.paired) return;
    const id = String(msg.id || rid('file')).slice(0, 80);
    const name = safeFileName(msg.name);
    const size = Number(msg.size) || 0;
    const dir = path.join(app.getPath('downloads'), 'NearSend');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    const target = path.join(dir, name);
    const stream = fs.createWriteStream(target, { flags: 'w' });
    this.incomingFiles.set(id, { id, name, size, received: 0, target, stream });
    this.send(conn.ws, { t: 'file-accept', id, name });
    this.pushAudit('file_in', conn.controller?.name || '控制端', '开始', name);
    this.emit('file-progress', { id, name, size, received: 0, direction: 'in' });
  }
  receiveFileChunk(conn, msg) {
    const f = this.incomingFiles.get(String(msg.id || ''));
    if (!f) return;
    try {
      const buf = Buffer.from(String(msg.data || ''), 'base64');
      f.stream.write(buf);
      f.received += buf.length;
      const nowTs = now();
      if (!f.lastEmit || nowTs - f.lastEmit > 300) {
        f.lastEmit = nowTs;
        this.emit('file-progress', { id: f.id, name: f.name, size: f.size, received: f.received, direction: 'in' });
      }
    } catch (err) { console.error('[remote] file chunk', err.message); }
  }
  receiveFileEnd(conn, msg) {
    const id = String(msg.id || '');
    const f = this.incomingFiles.get(id);
    if (!f) return;
    try { f.stream.end(); } catch {}
    this.incomingFiles.delete(id);
    this.send(conn.ws, { t: 'file-done', id, name: f.name, size: f.received, path: f.target });
    this.pushAudit('file_in', conn.controller?.name || '控制端', '成功', `${f.name} · ${f.received} B`);
    this.emit('file-progress', { id: f.id, name: f.name, size: f.size, received: f.received, done: true, direction: 'in', path: f.target });
  }

  async sendFile(filePath) {
    if (!this.client || this.client.state !== 'active') return null;
    let st;
    try { st = fs.statSync(filePath); } catch { return null; }
    if (!st.isFile()) return null;
    const id = rid('file');
    const name = safeFileName(path.basename(filePath));
    const size = st.size;
    const ws = this.client.ws;
    this.send(ws, { t: 'file-begin', id, name, size });
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    let sent = 0;
    stream.on('data', (buf) => {
      this.send(ws, { t: 'file-chunk', id, offset: sent, data: buf.toString('base64') });
      sent += buf.length;
      const ts = now();
      if (!stream.lastEmit || ts - stream.lastEmit > 300) {
        stream.lastEmit = ts;
        this.emit('file-progress', { id, name, size, received: sent, done: false, direction: 'out' });
      }
    });
    stream.on('end', () => {
      this.send(ws, { t: 'file-end', id });
      this.emit('file-progress', { id, name, size, received: sent, done: true, direction: 'out' });
    });
    stream.on('error', (err) => this.emit('file-progress', { id, name, size, received: sent, error: err.message, direction: 'out' }));
    this.pushAudit('file_out', this.deviceName, '开始', name);
    return { id, name, size };
  }
  setDisplay(index) {
    if (!this.client || this.client.state !== 'active') return;
    this.client.display = Math.max(0, Math.min(1, Number(index) || 0));
    this.send(this.client.ws, { t: 'start', display: this.client.display, quality: this.client.quality || 'auto' });
  }
  setQuality(quality) {
    if (!this.client || this.client.state !== 'active') return;
    this.client.quality = quality;
    this.send(this.client.ws, { t: 'start', display: this.client.display || 0, quality });
  }
  sendChatToActive(text) {
    const value = String(text || '').trim().slice(0, 4000);
    if (!value || !this.lastAgentWs || this.lastAgentWs.readyState !== WebSocket.OPEN) return null;
    this.send(this.lastAgentWs, { t: 'chat', text: value });
    this.pushAudit('chat_out', this.deviceName, '成功', value.slice(0, 80));
    return { from: this.deviceName, fromId: this.deviceId, text: value, ts: now(), direction: 'out' };
  }
  sendChat(peerId, text) {
    const value = String(text || '').trim().slice(0, 4000);
    if (!value) return null;
    const evt = { from: this.deviceName, fromId: this.deviceId, text: value, ts: now(), direction: 'out' };
    if (this.client && this.client.ws.readyState === WebSocket.OPEN) {
      this.send(this.client.ws, { t: 'chat', text: value });
      this.pushAudit('chat_out', this.deviceName, '成功', value.slice(0, 80));
      return evt;
    }
    return this.sendChatToActive(value);
  }

  send(ws, obj) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    try { ws.send(JSON.stringify(obj)); } catch {}
  }

  pushAudit(type, actor, result, detail) {
    const e = { id: rid('evt'), ts: now(), type, actor, result, detail };
    this.audit.unshift(e);
    if (this.audit.length > 500) this.audit.length = 500;
    this.emit('audit', e);
  }
  getAudit() { return this.audit.slice(0, 200); }
  getHistory() { return this.history.slice(0, 100); }

  diagnostics() {
    return {
      device: this.state().device,
      wsPort: this.wsPort,
      agentEnabled: this.agentEnabled,
      udpPort: UDP_PORT,
      helperExists: fs.existsSync(this.helperPath),
      helperPath: this.helperPath,
      peers: this.peerList().length,
      capture: this.active ? 'active' : 'idle',
      ips: ipv4List(),
      version: this.version,
    };
  }

  stop() {
    clearInterval(this.frameTimer);
    clearInterval(this.clipboardTimer);
    clearInterval(this.udpTimer);
    clearInterval(this.pruneTimer);
    if (this.client) this.disconnect();
    for (const c of this.connections) { try { c.ws.close(); } catch {} }
    if (this.wss) { try { this.wss.close(); } catch {} }
    if (this.udp) { try { this.udp.close(); } catch {} }
    if (this.dm) { try { this.dm.close(); } catch {} }
    if (this.helper) { try { this.helper.kill(); } catch {} }
  }
}

module.exports = { RemoteManager, UDP_PORT };
