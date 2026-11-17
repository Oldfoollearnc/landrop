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
const readline = require('readline');
const { spawn } = require('child_process');

const APP_TAG = 'nearsend-remote';
const UDP_PORT = 47822;
const WS_START = 47820;
// 画面帧最多允许 1MB 积压；超过就丢帧，避免 TCP 队列把操作延迟拖到几秒
const FRAME_BUFFER_LIMIT = 1024 * 1024;
const DM_CHUNK = 24 * 1024;
const DM_MAX = 20 * 1024 * 1024;

function now() { return Date.now(); }
function rid(prefix) { return `${prefix}_${crypto.randomBytes(6).toString('hex')}`; }
function safeFileName(name) {
  let base = path.basename(String(name || 'file'))
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/[. ]+$/, '')
    .slice(0, 160) || 'file';
  // Windows 保留设备名：CON.txt、NUL、COM1 等会被当成设备而不是普通文件
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])\s*(\..*)?$/i.test(base)) base = '_' + base;
  return base;
}
function six() { return String(crypto.randomInt(100000, 1000000)); }
function safeName(s, fallback) { return String(s || '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallback; }
function mimeOf(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ({
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
    '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  })[ext] || 'application/octet-stream';
}
/** 文件发送背压：缓冲降到低水位就立刻续读，不按固定时间硬等，尽量跑满局域网带宽 */
function resumeWhenDrained(stream, ws) {
  const check = () => {
    if (stream.destroyed) return;
    if (ws.readyState !== WebSocket.OPEN) { stream.destroy(); return; }
    if (ws.bufferedAmount > 2 * 1024 * 1024) { setTimeout(check, 15); return; }
    stream.resume();
  };
  setTimeout(check, 15);
}
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
function physicalBounds(display) {
  const b = display.bounds;
  try {
    const p1 = screen.dipToScreenPoint({ x: b.x, y: b.y });
    const p2 = screen.dipToScreenPoint({ x: b.x + b.width, y: b.y + b.height });
    return { x: p1.x, y: p1.y, width: Math.max(1, p2.x - p1.x), height: Math.max(1, p2.y - p1.y) };
  } catch {
    return { x: b.x, y: b.y, width: b.width, height: b.height };
  }
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
    this.grants = this.cfg.grants && typeof this.cfg.grants === 'object' ? this.cfg.grants : {};
    this.knownPeers = this.cfg.knownPeers && typeof this.cfg.knownPeers === 'object' ? this.cfg.knownPeers : {};
    this.agentEnabled = this.cfg.agentEnabled !== false;
    this.wsPort = 0;
    this.wss = null;
    this.udp = null;
    this.peers = new Map();
    this.knownSaveTimer = null;
    this.connections = new Set();
    this.active = null; // { ws, controller, display, quality, timer }
    this.frameTimer = null;
    this.captureBusy = false;
    this.helper = null;
    this.helperPath = this.resolveHelper();
    this.captureHelper = null;
    this.captureReader = null;
    this.capturePath = this.resolveCaptureHelper();
    this.captureMode = null;
    this.auditFile = path.join(userDataDir, 'remote-audit.json');
    this.audit = this.loadAudit();
    this.auditTimer = null;
    this.history = [];
    this.clipboardText = '';
    this.incomingFiles = new Map();
    this.incomingPaths = new Set();
    this.outgoingFiles = new Map();
    this.dmIncoming = new Map();
    this.dmPaths = new Set();
    this.dmAcks = new Map();
    this.save();
  }

  load() {
    try { return JSON.parse(fs.readFileSync(this.file, 'utf8')) || {}; } catch { return {}; }
  }
  loadAudit() {
    try {
      const arr = JSON.parse(fs.readFileSync(this.auditFile, 'utf8'));
      return Array.isArray(arr) ? arr.slice(0, 500) : [];
    } catch { return []; }
  }
  saveAudit() {
    try {
      fs.mkdirSync(path.dirname(this.auditFile), { recursive: true });
      const tmp = `${this.auditFile}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.audit.slice(0, 500), null, 2));
      fs.renameSync(tmp, this.auditFile);
    } catch (err) { console.error('[remote] save audit', err.message); }
  }
  saveAuditSoon() {
    if (this.auditTimer) return;
    this.auditTimer = setTimeout(() => {
      this.auditTimer = null;
      this.saveAudit();
    }, 1500);
  }
  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify({
        deviceId: this.deviceId,
        controllerId: this.controllerId,
        deviceName: this.deviceName,
        agentEnabled: this.agentEnabled,
        allowedControllers: [...this.allowed].slice(-200),
        grants: this.grants,
        knownPeers: this.knownPeers,
      }, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) { console.error('[remote] save', err.message); }
  }
  resolveHelper() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'remote-input.exe');
    }
    return path.join(app.getAppPath(), 'assets', 'remote-input.exe');
  }
  resolveCaptureHelper() {
    if (app.isPackaged) {
      return path.join(process.resourcesPath, 'app.asar.unpacked', 'assets', 'remote-capture.exe');
    }
    return path.join(app.getAppPath(), 'assets', 'remote-capture.exe');
  }
  async init() {
    await this.startWs();
    this.startUdp();
    this.startDm();
    this.loadKnownPeers();
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
          const onListening = () => {
            wss.removeListener('error', onError);
            resolve();
          };
          const onError = (err) => {
            wss.removeListener('listening', onListening);
            try { wss.close(); } catch {}
            reject(err);
          };
          wss.once('listening', onListening);
          wss.once('error', onError);
          this.wss = wss;
        });
        this.wss.on('connection', (ws, req) => {
          try {
            this.onConnection(ws, req);
          } catch (err) {
            console.error('[remote] connection failed', err.message);
            try { ws.close(1011, 'internal error'); } catch {}
          }
        });
        // 监听成功后的错误不能没有监听器，否则 EventEmitter 会直接抛出
        this.wss.on('error', (err) => console.error('[remote] ws server', err.message));
        this.wsPort = p;
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
            if (typeof msg.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(msg.id)) return;
            const peer = {
              id: msg.id, name: safeName(msg.name, msg.id), ip: rinfo.address, port: Number(msg.port) || 0,
              os: msg.os || 'Windows', version: msg.version || '', online: true, lastSeen: now(), self: false,
              displayCount: Math.max(1, Math.min(2, Number(msg.displayCount) || 1)),
              displays: Array.isArray(msg.displays) ? msg.displays.slice(0, 2) : undefined,
            };
            if (!peer.port) return;
            const prev = this.peers.get(peer.id);
            const changed = !prev || !prev.online || prev.name !== peer.name
              || prev.ip !== peer.ip || prev.port !== peer.port
              || prev.version !== peer.version
              || prev.displayCount !== peer.displayCount;
            this.peers.set(peer.id, peer);
            this.rememberPeer(peer);
            // announce 每 2.5 秒一次；只在真正变化时通知界面，避免输入框被反复重绘
            if (changed) this.emit('peers', this.peerList());
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
          if (!p.self && !p.manual && p.online && t - p.lastSeen > 9000) {
            p.online = false;
            changed = true;
          }
        }
        if (changed) this.emit('peers', this.peerList());
      }, 3000);
    } catch (err) { console.error('[remote] udp start', err.message); }
  }

  startDm() {
    try {
      this.dm = dgram.createSocket({ type: 'udp4', reuseAddr: true });
      this.dm.on('error', (err) => console.error('[remote] dm', err.message));
      this.dm.on('message', (buf, rinfo) => {
        try {
          const msg = JSON.parse(buf.toString('utf8'));
          if (!msg || msg.ns !== 'nearsend-dm' || msg.to !== this.deviceId) return;
          if (msg.t === 'dm-file-ready') { this.resolveDmAck(`ready:${msg.id}`); return; }
          if (msg.t === 'dm-file-ack') { this.resolveDmAck(`ack:${msg.id}:${msg.seq}`); return; }
          if (msg.t === 'dm-file-error') {
            const f = this.dmIncoming.get(String(msg.id || ''));
            if (f) {
              this.dmIncoming.delete(f.id);
              this.dmPaths.delete(f.target);
              this.emit('chat', { from: f.from || '同事', fromId: f.fromId || '', kind: 'error', text: String(msg.message || '文件传输失败'), ts: now(), direction: 'in' });
            }
            return;
          }
          const ack = (payload) => {
            try { this.dm.send(Buffer.from(JSON.stringify(payload)), rinfo.port, rinfo.address); } catch {}
          };
          if (msg.t === 'dm-file-begin') { this.receiveDMFileBegin(msg, ack); return; }
          if (msg.t === 'dm-file-chunk') { this.receiveDMFileChunk(msg, ack); return; }
          if (msg.t === 'dm-file-end') return;
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
    if (!peer.online) return null;
    const evt = { from: this.deviceName, fromId: this.deviceId, text: value, ts: now(), direction: 'out' };
    try {
      this.dm.send(Buffer.from(JSON.stringify({
        ns: 'nearsend-dm', fromId: this.deviceId, from: this.deviceName, to: peerId, text: value, ts: evt.ts,
      })), 47823, peer.ip);
    } catch (err) { console.error('[remote] dm send', err.message); return null; }
    this.pushAudit('chat_out', this.deviceName, '成功', value.slice(0, 80));
    return evt;
  }

  dmSendWithAck(payload, key, timeout = 1800) {
    return new Promise((resolve, reject) => {
      const peer = this.peers.get(payload.to);
      if (!peer || !peer.ip || !this.dm) { reject(new Error('对方不在线')); return; }
      let tries = 0;
      let timer = null;
      const done = () => {
        if (timer) clearTimeout(timer);
        this.dmAcks.delete(key);
        resolve();
      };
      const send = () => {
        tries += 1;
        if (tries > 3) {
          this.dmAcks.delete(key);
          reject(new Error('对方未确认接收'));
          return;
        }
        try {
          this.dm.send(Buffer.from(JSON.stringify(payload)), 47823, peer.ip);
        } catch (err) {
          this.dmAcks.delete(key);
          reject(err);
          return;
        }
        timer = setTimeout(send, timeout);
      };
      this.dmAcks.set(key, done);
      send();
    });
  }

  resolveDmAck(key) {
    const done = this.dmAcks.get(key);
    if (done) done();
  }

  async sendDMFile(peerId, filePath) {
    const peer = this.peers.get(String(peerId || ''));
    if (!peer || !peer.online || peer.self || !this.dm) return null;
    let st;
    try { st = fs.statSync(filePath); } catch { return null; }
    if (!st.isFile() || st.size > DM_MAX) throw new Error('文件为空或超过 20MB');
    const name = safeFileName(path.basename(filePath));
    const mime = mimeOf(name);
    const kind = mime.startsWith('image/') ? 'image' : 'file';
    const buf = fs.readFileSync(filePath);
    const total = Math.max(1, Math.ceil(buf.length / DM_CHUNK));
    const id = rid('dmfile');
    const fromId = this.deviceId;
    const from = this.deviceName;
    const ts = now();
    await this.dmSendWithAck({
      ns: 'nearsend-dm', t: 'dm-file-begin', fromId, from, to: peerId,
      id, name, size: buf.length, mime, kind, total, ts,
    }, `ready:${id}`, 2500);
    for (let seq = 0; seq < total; seq += 1) {
      const data = buf.subarray(seq * DM_CHUNK, (seq + 1) * DM_CHUNK).toString('base64');
      await this.dmSendWithAck({
        ns: 'nearsend-dm', t: 'dm-file-chunk', fromId, from, to: peerId,
        id, seq, data,
      }, `ack:${id}:${seq}`, 1800);
    }
    try {
      this.dm.send(Buffer.from(JSON.stringify({
        ns: 'nearsend-dm', t: 'dm-file-end', fromId, from, to: peerId, id,
      })), 47823, peer.ip);
    } catch {}
    this.pushAudit('chat_out', this.deviceName, '成功', `${kind} ${name}`);
    return {
      id, name, size: buf.length, mime, kind, text: `[${kind === 'image' ? '图片' : '文件'}] ${name}`,
      path: filePath, ts, direction: 'out',
    };
  }

  receiveDMFileBegin(msg, ack) {
    const id = String(msg.id || '').slice(0, 80);
    const size = Math.max(0, Math.floor(Number(msg.size) || 0));
    const total = Math.max(1, Math.floor(Number(msg.total) || 0));
    const name = safeFileName(msg.name);
    if (!id || size > DM_MAX || total > Math.ceil(DM_MAX / DM_CHUNK) + 1) {
      ack({ ns: 'nearsend-dm', t: 'dm-file-error', id, fromId: this.deviceId, to: msg.fromId, message: '文件过大或声明无效' });
      return;
    }
    if (this.dmIncoming.has(id)) {
      const old = this.dmIncoming.get(id);
      this.dmIncoming.delete(id);
      this.dmPaths.delete(old.target);
    }
    const dir = path.join(app.getPath('downloads'), 'NearSend');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    let saveName = name;
    let target = path.join(dir, saveName);
    try {
      const ext = path.extname(name);
      const stem = path.basename(name, ext);
      let i = 1;
      while ((fs.existsSync(target) || this.dmPaths.has(target)) && i < 500) {
        saveName = `${stem} (${i})${ext}`;
        target = path.join(dir, saveName);
        i += 1;
      }
    } catch {}
    this.dmPaths.add(target);
    this.dmIncoming.set(id, {
      id, name: saveName, size, total, target, kind: msg.kind === 'image' ? 'image' : 'file',
      mime: String(msg.mime || ''), from: String(msg.from || '同事'), fromId: String(msg.fromId || ''),
      chunks: new Map(), received: 0, failed: false,
    });
    ack({ ns: 'nearsend-dm', t: 'dm-file-ready', id, fromId: this.deviceId, to: msg.fromId });
  }

  receiveDMFileChunk(msg, ack) {
    const f = this.dmIncoming.get(String(msg.id || ''));
    if (!f || f.failed) return;
    const seq = Number(msg.seq);
    if (!Number.isInteger(seq) || seq < 0 || seq >= f.total) return;
    if (!f.chunks.has(seq)) {
      let buf;
      try { buf = Buffer.from(String(msg.data || ''), 'base64'); } catch { return; }
      if (buf.length > DM_CHUNK + 1024) return;
      f.chunks.set(seq, buf);
      f.received += buf.length;
    }
    ack({ ns: 'nearsend-dm', t: 'dm-file-ack', id: f.id, seq, fromId: this.deviceId, to: f.fromId });
    if (f.chunks.size < f.total) return;
    const parts = [];
    for (let i = 0; i < f.total; i += 1) {
      const part = f.chunks.get(i);
      if (!part) return;
      parts.push(part);
    }
    try {
      const buf = Buffer.concat(parts);
      if (f.size && buf.length !== f.size) throw new Error('文件大小不一致');
      fs.writeFileSync(f.target, buf);
      this.dmIncoming.delete(f.id);
      this.dmPaths.delete(f.target);
      this.pushAudit('chat_in', f.from || '同事', '成功', `${f.kind} ${f.name}`);
      this.emit('chat', {
        from: f.from || '同事', fromId: f.fromId || '',
        kind: f.kind, text: `[${f.kind === 'image' ? '图片' : '文件'}] ${f.name}`,
        name: f.name, size: buf.length, mime: f.mime, path: f.target, ts: now(), direction: 'in',
      });
    } catch (err) {
      f.failed = true;
      this.dmIncoming.delete(f.id);
      this.dmPaths.delete(f.target);
      ack({ ns: 'nearsend-dm', t: 'dm-file-error', id: f.id, fromId: this.deviceId, to: f.fromId, message: err.message });
    }
  }

  loadKnownPeers() {
    for (const p of Object.values(this.knownPeers || {})) {
      if (!p || !p.id || p.id === this.deviceId) continue;
      if (typeof p.id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(p.id)) continue;
      if (this.peers.has(p.id)) continue;
      this.peers.set(p.id, {
        id: p.id, name: safeName(p.name, p.id), ip: p.ip || '', port: Number(p.port) || 0,
        os: p.os || 'Windows', version: p.version || '', online: p.manual ? true : false,
        lastSeen: Number(p.lastSeen) || 0, self: false,
        manual: !!p.manual,
        displayCount: Math.max(1, Math.min(2, Number(p.displayCount) || 1)),
      });
    }
  }

  saveKnownSoon() {
    if (this.knownSaveTimer) return;
    this.knownSaveTimer = setTimeout(() => {
      this.knownSaveTimer = null;
      this.save();
    }, 4000);
  }

  rememberPeer(peer) {
    const old = this.knownPeers[peer.id];
    this.knownPeers[peer.id] = {
      id: peer.id, name: peer.name, ip: peer.ip, port: peer.port,
      os: peer.os, version: peer.version, lastSeen: peer.lastSeen,
      displayCount: peer.displayCount || 1,
      displays: peer.displays || undefined,
      manual: !!peer.manual,
    };
    // UDP 每 2.5 秒就 announce 一次；只在地址/名称等真正变化时落盘，避免每 4 秒重写 remote.json
    const changed = !old
      || old.name !== peer.name
      || old.ip !== peer.ip
      || old.port !== peer.port
      || old.version !== peer.version
      || old.displayCount !== (peer.displayCount || 1)
      || old.manual !== !!peer.manual;
    // lastSeen 每分钟最多落盘一次，重启后离线时间不会永远停在第一次发现时
    const staleSeen = !old || !old.lastSeen || peer.lastSeen - old.lastSeen > 60000;
    if (changed || staleSeen) this.saveKnownSoon();
  }

  addSelfPeer(force) {
    if (!this.agentEnabled && force) return;
    if (!this.agentEnabled) return;
    let displays = [];
    let primaryId = null;
    try {
      displays = screen.getAllDisplays();
      primaryId = screen.getPrimaryDisplay().id;
    } catch {}
    this.peers.set(this.deviceId, {
      id: this.deviceId, name: `${this.deviceName}（本机）`, ip: '127.0.0.1', port: this.wsPort,
      os: `Windows · ${os.release()}`, version: this.version, online: true, lastSeen: now(), self: true,
      displayCount: displays.length,
      displays: displays.map((d, i) => ({ index: i, res: `${d.size.width}×${d.size.height}`, primary: d.id === primaryId })),
    });
  }

  announce(to) {
    if (!this.udp || !this.agentEnabled) return;
    try {
      const displays = screen.getAllDisplays();
      const primaryId = screen.getPrimaryDisplay().id;
      const msg = Buffer.from(JSON.stringify({
        ns: APP_TAG, t: 'announce', id: this.deviceId, name: this.deviceName, port: this.wsPort,
        os: `Windows · ${os.release()}`, version: this.version, displayCount: displays.length,
        displays: displays.map((d, i) => ({ index: i, res: `${d.size.width}×${d.size.height}`, primary: d.id === primaryId })),
        ts: now(),
      }));
      if (to) this.udp.send(msg, UDP_PORT, to);
      else {
        for (const a of ipv4List()) {
          const parts = a.address.split('.');
          if (parts.length === 4) this.udp.send(msg, UDP_PORT, `${parts[0]}.${parts[1]}.${parts[2]}.255`);
        }
        this.udp.send(msg, UDP_PORT, '255.255.255.255');
      }
    } catch (err) {
      console.error('[remote] announce', err.message);
    }
  }

  peerList() {
    return [...this.peers.values()].map((p) => ({
      id: p.id, name: p.name, ip: p.ip, port: p.port, os: p.os, version: p.version,
      online: p.online, self: !!p.self, lastSeen: p.lastSeen, displayCount: p.displayCount || 1,
      displays: p.displays || undefined,
    }));
  }

  state() {
    let displays = [];
    let primaryId = null;
    try {
      displays = screen.getAllDisplays();
      primaryId = screen.getPrimaryDisplay().id;
    } catch {}
    const active = this.active && this.active.ws && this.active.ws.readyState === WebSocket.OPEN
      ? {
        peerName: this.active.peerName || '控制端',
        controller: this.active.controller?.name || '',
        startedAt: this.active.startedAt,
        quality: this.active.quality,
        display: this.active.display,
        recording: !!this.active.recording,
        capture: this.captureMode || 'electron',
        role: this.active.role,
        permissions: this.active.permissions,
        expiresAt: this.active.expiresAt,
      } : null;
    return {
      device: {
        id: this.deviceId, name: this.deviceName, host: os.hostname(),
        os: `Windows · ${os.release()}`, version: this.version, ips: ipv4List(),
        displays: displays.map((d, i) => ({
          index: i, label: `屏幕 ${i + 1}`, res: `${d.size.width}×${d.size.height}`, primary: d.id === primaryId,
        })),
      },
      agentEnabled: this.agentEnabled,
      code: this.code,
      port: this.wsPort,
      peers: this.peerList(),
      grants: Object.values(this.grants)
        .filter((g) => !g.expiresAt || g.expiresAt > now())
        .map((g) => ({
          controllerId: g.controllerId, name: g.name, role: g.role, permissions: g.permissions,
          createdAt: g.createdAt, expiresAt: g.expiresAt,
        })),
      session: this.client ? {
        state: this.client.state,
        peer: this.client.peer,
        grant: this.client.grant || null,
      } : null,
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

  addManualPeer(address, portArg) {
    let host = String(address || '').trim();
    let port = Number(portArg) || 0;
    if (!host) throw new Error('请输入 IP 地址');
    if (!port && host.includes(':')) {
      const parts = host.split(':');
      host = parts[0];
      port = Number(parts[1]) || 0;
    }
    if (!/^[0-9a-zA-Z.-]+$/.test(host)) throw new Error('地址格式不正确');
    if (!port) port = WS_START;
    if (port < 1 || port > 65535) throw new Error('端口不正确');
    const id = `manual_${crypto.createHash('sha1').update(`${host}:${port}`).digest('hex').slice(0, 12)}`;
    const peer = {
      id, name: `手动 · ${host}`, ip: host, port, os: 'Windows', version: '',
      online: true, lastSeen: now(), self: false, manual: true, displayCount: 1,
    };
    this.peers.set(id, peer);
    this.rememberPeer(peer);
    this.emit('peers', this.peerList());
    this.emit('state', this.state());
    return { id, name: peer.name, ip: host, port, online: true, displayCount: 1 };
  }

  forgetPeer(peerId) {    const id = String(peerId || '');
    if (!id) return false;
    const peer = this.peers.get(id);
    if (peer?.self) return false;
    this.peers.delete(id);
    delete this.knownPeers[id];
    this.save();
    this.emit('peers', this.peerList());
    this.emit('state', this.state());
    return true;
  }

  revokeGrant(controllerId) {
    const id = String(controllerId || '');
    if (!id || !/^[A-Za-z0-9_-]{1,80}$/.test(id)
      || id === '__proto__' || id === 'prototype' || id === 'constructor') return false;
    const revoked = this.grants[id];
    if (!revoked && !this.allowed.has(id)) return false;
    delete this.grants[id];
    this.allowed.delete(id);
    this.save();
    for (const conn of this.connections) {
      if (conn.controller?.id === id) {
        try { conn.ws.close(4005, 'grant revoked'); } catch {}
      }
    }
    if (this.active?.controller?.id === id) this.stopActive('grant-revoked');
    this.pushAudit('grant_revoke', revoked?.name || id, '成功', '控制端授权已撤销');
    this.emit('state', this.state());
    return true;
  }

  // ---------- agent side ----------
  onConnection(ws, req) {
    // 浏览器页面发起的 WebSocket 一定带 Origin；正常控制端由主进程 ws 客户端发起，不带 Origin。
    // 拒绝网页来源，避免任意网站借 localhost 端口做跨站 WebSocket 劫持。
    if (req.headers.origin) {
      try { ws.close(4003, 'origin not allowed'); } catch {}
      return;
    }
    const conn = { ws, ip: req.socket.remoteAddress, controller: null, paired: false, alive: true };
    try { ws._socket?.setNoDelay(true); } catch {}
    this.connections.add(conn);
    ws.on('pong', () => { conn.alive = true; });
    ws.on('message', (raw) => {
      try {
      let msg;
      try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
      if (!msg || typeof msg !== 'object') return;
      if (msg.t === 'pair') return this.pairController(conn, msg);
      if (msg.t === 'ping') { this.send(ws, { t: 'pong', ts: msg.ts || now() }); return; }
      // 未配对连接只能握手和心跳：不能注入键鼠、改剪贴板、结束会话或发文件。
      if (!conn.paired) return;
      // 只有当前会话所属的连接才能操作会话。其他已配对连接只能通过 start 发起接管。
      const active = this.active && this.active.ws === ws ? this.active : null;
      if (msg.t === 'start') return this.startActive(conn, msg);
      if (msg.t === 'input') {
        if (!active) return;
        if (active.permissions && active.permissions.control === false) {
          this.send(conn.ws, { t: 'error', code: 'CONTROL_DENIED', message: '当前授权未开启键鼠控制' });
          return;
        }
        return this.handleInput(msg);
      }
      if (msg.t === 'clipboard') {
        if (!active) return;
        if (conn.permissions && conn.permissions.clipboard === false) {
          this.send(conn.ws, { t: 'error', code: 'CLIPBOARD_DENIED', message: '当前授权未开启剪贴板' });
          return;
        }
        const text = String(msg.text || '').slice(0, 200000);
        this.clipboardText = text;
        this.lastAgentClipboard = text;
        try { clipboard.writeText(text); } catch {}
        this.emit('clipboard', { text, ts: now() });
        return;
      }
      if (msg.t === 'recording') {
        if (!active) return;
        if (conn.permissions && conn.permissions.record === false) {
          this.send(conn.ws, { t: 'error', code: 'RECORDING_DENIED', message: '当前授权未开启录制' });
          return;
        }
        active.recording = !!msg.on;
        this.emit('state', this.state());
        return;
      }
      if (msg.t === 'file-begin') {
        if (!active) {
          this.send(conn.ws, { t: 'file-error', id: String(msg.id || ''), message: '当前没有远程会话' });
          return;
        }
        if (conn.permissions && conn.permissions.file === false) {
          this.send(conn.ws, { t: 'file-error', id: String(msg.id || ''), message: '当前授权未开启文件传输' });
          return;
        }
        return this.receiveFileBegin(conn, msg);
      }
      if (msg.t === 'file-chunk') {
        if (!active) return;
        return this.receiveFileChunk(conn, msg);
      }
      if (msg.t === 'file-end') {
        if (!active) return;
        return this.receiveFileEnd(conn, msg);
      }
      if (msg.t === 'file-error') {
        const incoming = this.incomingFiles.get(String(msg.id || ''));
        if (incoming && incoming.ws === ws) {
          this.abortIncoming(incoming, String(msg.message || '对方取消了传输'), false);
        } else {
          this.cancelOutgoing(String(msg.id || ''), false, ws);
        }
        return;
      }
      if (msg.t === 'fs-get') {
        if (!active) return;
        if (conn.permissions && conn.permissions.file === false) {
          this.send(conn.ws, { t: 'fs-error', message: '当前授权未开启文件传输' });
          return;
        }
        const remotePath = String(msg.path || '');
        try {
          if (!remotePath || !path.isAbsolute(remotePath) || !fs.statSync(remotePath).isFile()) {
            this.send(conn.ws, { t: 'fs-error', message: '远端文件不存在或不是文件' });
            return;
          }
        } catch {
          this.send(conn.ws, { t: 'fs-error', message: '无法读取远端文件' });
          return;
        }
        this.sendFileToActive(remotePath);
        return;
      }
      if (msg.t === 'chat') {
        if (!active) return;
        const text = String(msg.text || '').trim().slice(0, 4000);
        if (!text) return;
        const evt = { from: conn.controller?.name || '同事', fromId: conn.controller?.id || '', text, ts: now(), direction: 'in' };
        this.pushAudit('chat_in', evt.from, '成功', text.slice(0, 80));
        this.emit('chat', evt);
        this.send(conn.ws, { t: 'chat:ack', ts: evt.ts });
        return;
      }
      if (msg.t === 'stop') {
        if (!active) return;
        this.stopActive('remote-stop');
      }
      } catch (err) {
        console.error('[remote] message failed', err.message);
      }
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
    let id = String(controller.id || '').slice(0, 80);
    if (id && (!/^[A-Za-z0-9_-]+$/.test(id) || id === '__proto__' || id === 'prototype' || id === 'constructor')) {
      this.send(conn.ws, { t: 'error', code: 'PAIR_DENIED', message: '控制端身份无效' });
      return;
    }
    const name = safeName(controller.name, '同事的控制端');
    const code = String(msg.code || '').replace(/\D/g, '');
    const role = msg.role === 'admin' ? 'admin' : 'owner';
    let grant = id ? this.grants[id] : null;
    if (grant && grant.expiresAt && grant.expiresAt < now()) {
      delete this.grants[id];
      this.allowed.delete(id);
      grant = null;
    }
    const allowed = !!(id && this.allowed.has(id) && grant);
    if (!allowed && code !== this.code) {
      this.pushAudit('pair_failed', name, '失败', '授权码不正确');
      this.send(conn.ws, { t: 'error', code: 'PAIR_DENIED', message: '授权码不正确' });
      try { conn.ws.close(4003, 'pair denied'); } catch {}
      return;
    }
    if (!grant) {
      const admin = role === 'admin';
      grant = {
        controllerId: id,
        name,
        role: admin ? 'admin' : 'owner',
        permissions: admin
          ? { view: true, control: true, unattended: false, clipboard: false, file: false, manage: false, audit: true, record: false }
          : { view: true, control: true, unattended: true, clipboard: true, file: true, manage: false, audit: true, record: true },
        createdAt: now(),
        expiresAt: admin ? now() + 8 * 60 * 60 * 1000 : null,
      };
      if (id) { this.grants[id] = grant; this.allowed.add(id); this.save(); }
    }
    conn.paired = true;
    conn.controller = { id, name, ip: conn.ip };
    conn.grant = grant;
    conn.permissions = grant.permissions;
    this.pushAudit('pair', name, '成功', `${grant.role}${grant.expiresAt ? ' · 8h' : ' · 长期'}`);
    this.send(conn.ws, { t: 'paired', device: this.state().device, controller: conn.controller, grant });
    this.emit('state', this.state());
  }

  startActive(conn, msg) {
    if (!conn.paired) { this.send(conn.ws, { t: 'error', code: 'UNAUTHORIZED' }); return; }
    if (!this.agentEnabled) { this.send(conn.ws, { t: 'error', code: 'AGENT_OFF' }); return; }
    if (!conn.grant || (conn.grant.expiresAt && conn.grant.expiresAt < now())) {
      this.send(conn.ws, { t: 'error', code: 'GRANT_EXPIRED', message: '授权已到期' });
      return;
    }
    const sameConn = !!(this.active && this.active.ws === conn.ws);
    const replacing = !!(this.active && this.active.ws !== conn.ws);
    const startedAt = sameConn ? this.active.startedAt : now();
    const prevSessionId = sameConn ? this.active.sessionId : null;
    // 同一连接切换画质/屏幕不是新会话：安静地重启采集，不写结束/开始审计，也不弹通知
    this.stopActive(sameConn ? 'switch' : (replacing ? 'takeover' : 'switch'), replacing, sameConn);
    const display = Math.max(0, Math.min(1, Number(msg.display) || 0));
    const quality = ['auto', '4k', '2k', '1080', '720'].includes(msg.quality) ? msg.quality : 'auto';
    this.active = {
      ws: conn.ws, conn, controller: conn.controller, peerName: conn.controller?.name,
      display, quality, startedAt, sessionId: prevSessionId || rid('sess'), timer: null,
      role: conn.grant.role, permissions: conn.grant.permissions, expiresAt: conn.grant.expiresAt,
    };
    this.lastAgentWs = conn.ws;
    const d = displayBounds(display);
    this.send(conn.ws, {
      t: 'started',
      device: this.state().device,
      display: { index: display, width: d.size.width, height: d.size.height, x: d.bounds.x, y: d.bounds.y },
      quality,
      grant: { role: conn.grant.role, permissions: conn.grant.permissions, expiresAt: conn.grant.expiresAt },
    });
    if (!sameConn) {
      this.pushAudit('session_start', conn.controller?.name || '控制端', '成功', `display=${display} quality=${quality}`);
      this.history.unshift({ id: this.active.sessionId, peer: conn.controller?.name || '控制端', startedAt, display, quality, result: 'active' });
      if (this.history.length > 100) this.history.length = 100;
    } else {
      const entry = this.history.find((h) => h.id === this.active.sessionId);
      if (entry) {
        entry.display = display;
        entry.quality = quality;
        entry.result = 'active';
        entry.reason = '';
        entry.endedAt = null;
      }
    }
    clearTimeout(this.grantTimer);
    if (conn.grant.expiresAt) {
      this.grantTimer = setTimeout(() => {
        this.pushAudit('grant_expired', conn.controller?.name || '控制端', '成功', '临时授权到期，会话结束');
        this.stopActive('grant-expired');
      }, Math.max(0, conn.grant.expiresAt - now()));
    }
    this.emit('state', this.state());
    this.lastFrameErrorAt = 0;
    this.lastAgentClipboard = undefined;
    this.startCapture();
  }

  startClipboardSync() {
    clearInterval(this.clipboardTimer);
    this.clipboardTimer = setInterval(() => {
      const active = this.active;
      if (!active || !active.ws || active.ws.readyState !== WebSocket.OPEN) return;
      if (active.permissions && active.permissions.clipboard === false) return;
      let text = '';
      try { text = clipboard.readText(); } catch {}
      if (text && text !== this.lastAgentClipboard) {
        this.lastAgentClipboard = text;
        this.send(active.ws, { t: 'clipboard', text: text.slice(0, 200000) });
      }
    }, 1200);
  }

  /** 文件传输期间把画面压到约 1fps，避免 JPEG 帧把带宽和 TCP 缓冲占满 */
  frameBudgetForFileTransfer() {
    if (!this.incomingFiles.size && !this.outgoingFiles.size) return true;
    const ts = now();
    if (ts - (this.lastTransferFrame || 0) < 800) return false;
    this.lastTransferFrame = ts;
    return true;
  }

  startCapture() {
    const active = this.active;
    if (!active) return;
    this.stopCaptureHelper();
    const profile = this.captureProfile(active.quality, active.display);
    this.startClipboardSync();
    if (fs.existsSync(this.capturePath)) {
      try {
        const physical = physicalBounds(displayBounds(active.display));
        const child = spawn(this.capturePath, [
          String(physical.x), String(physical.y), String(physical.width), String(physical.height),
          String(profile.width), String(profile.height), String(profile.quality), String(profile.fps),
        ], { windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] });
        this.captureHelper = child;
        this.captureMode = 'gdi';
        const reader = readline.createInterface({ input: child.stdout });
        this.captureReader = reader;
        let gotFrame = false;
        reader.on('line', (line) => {
          if (this.active !== active) return;
          // 传输文件时降低画面到约 1fps，把带宽让给文件；传完自动恢复
          if (!this.frameBudgetForFileTransfer()) return;
          if (!active.ws || active.ws.readyState !== WebSocket.OPEN) return;
          if (active.ws.bufferedAmount > FRAME_BUFFER_LIMIT) return;
          const i1 = line.indexOf(' ');
          const i2 = line.indexOf(' ', i1 + 1);
          if (i1 < 0 || i2 < 0) return;
          const width = Number(line.slice(0, i1));
          const height = Number(line.slice(i1 + 1, i2));
          const data = line.slice(i2 + 1);
          if (!width || !height || !data) return;
          gotFrame = true;
          this.send(active.ws, { t: 'frame', ts: now(), display: active.display, width, height, data, capture: 'gdi' });
        });
        child.on('error', () => {
          if (this.captureHelper === child) this.captureHelper = null;
          if (this.active === active && !gotFrame) {
            this.captureMode = 'electron';
            this.startFrames(profile.fps);
          }
        });
        child.on('exit', () => {
          if (this.captureHelper === child) this.captureHelper = null;
          if (this.active === active) {
            this.captureMode = 'electron';
            this.startFrames(profile.fps);
          }
        });
        this.emit('state', this.state());
        return;
      } catch {
        /* fall through to Electron capture */
      }
    }
    this.captureMode = 'electron';
    this.startFrames(profile.fps);
  }

  /**
   * 采集档位：分辨率只降不升（避免把 1080p 放大成 2K 反而更糊），JPEG 质量优先保证文字清晰。
   * auto 会按被控端物理分辨率自动选 1080/1440p 上限。
   */
  captureProfile(quality, displayIndex) {
    const bounds = physicalBounds(displayBounds(displayIndex));
    const preset = quality === '4k'
      ? { width: 3840, height: 2160, quality: 86, fps: 10 }
      : quality === '2k'
        ? { width: 2560, height: 1440, quality: 86, fps: 15 }
        : quality === '1080'
          ? { width: 1920, height: 1080, quality: 86, fps: 20 }
          : quality === '720'
            ? { width: 1280, height: 720, quality: 82, fps: 24 }
            : bounds.width >= 2560
              ? { width: 2560, height: 1440, quality: 86, fps: 15 }
              : { width: 1920, height: 1080, quality: 86, fps: 20 };
    const scale = Math.min(1, preset.width / Math.max(1, bounds.width), preset.height / Math.max(1, bounds.height));
    return {
      width: Math.max(2, Math.round(bounds.width * scale)),
      height: Math.max(2, Math.round(bounds.height * scale)),
      quality: preset.quality,
      fps: preset.fps,
    };
  }

  stopCaptureHelper() {
    if (this.captureReader) {
      try { this.captureReader.close(); } catch {}
      this.captureReader = null;
    }
    if (this.captureHelper) {
      try { this.captureHelper.kill(); } catch {}
      this.captureHelper = null;
    }
  }

  startFrames(fps) {
    this.stopCaptureHelper();
    clearInterval(this.frameTimer);
    const interval = Math.max(50, Math.round(1000 / (Number(fps) || 12)));
    this.frameTimer = setInterval(() => this.captureOnce(), interval);
    if (!this.clipboardTimer) this.startClipboardSync();
    this.captureOnce();
  }

  async captureOnce() {
    const active = this.active;
    if (!active || this.captureBusy) return;
    if (active.expiresAt && now() > active.expiresAt + 5 * 60 * 1000) {
      this.stopActive('grant-expired');
      return;
    }
    if (!active.ws || active.ws.readyState !== WebSocket.OPEN) { this.stopActive('ws-closed'); return; }
    if (!this.frameBudgetForFileTransfer()) return;
    this.captureBusy = true;
    try {
      const profile = this.captureProfile(active.quality, active.display);
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: profile.width, height: profile.height },
      });
      if (!sources.length) throw new Error('no screen source');
      if (this.active !== active) return;
      const targetDisplay = displayBounds(active.display);
      const src = sources.find((s) => String(s.display_id) === String(targetDisplay.id))
        || sources[Math.min(active.display, sources.length - 1)];
      const img = src.thumbnail;
      const sz = img.getSize();
      const jpeg = img.toJPEG(profile.quality);
      const frame = {
        t: 'frame', ts: now(), display: active.display,
        width: sz.width, height: sz.height, data: jpeg.toString('base64'),
        capture: this.captureMode || 'electron',
      };
      // 弱网时 ws 缓冲会无限长；GDI 采集路径已有同样保护
      if (active.ws.bufferedAmount > FRAME_BUFFER_LIMIT) return;
      this.send(active.ws, frame);
      this.lastFrameErrorAt = 0;
    } catch (err) {
      // 安全桌面/UAC 会持续失败；每帧报错会把控制端刷爆，最多 5 秒提示一次
      const ts = now();
      if (!this.lastFrameErrorAt || ts - this.lastFrameErrorAt > 5000) {
        this.lastFrameErrorAt = ts;
        this.send(active.ws, { t: 'error', code: 'FRAME_ERROR', message: err.message });
      }
    } finally { this.captureBusy = false; }
  }

  stopActive(reason, notify = true, quiet = false) {
    clearInterval(this.frameTimer);
    clearInterval(this.clipboardTimer);
    clearTimeout(this.grantTimer);
    this.stopCaptureHelper();
    this.captureMode = null;
    this.frameTimer = null;
    this.clipboardTimer = null;
    this.grantTimer = null;
    if (this.active) {
      const activeWs = this.active.ws;
      // 会话结束后不再有人收后续分片；半截文件和发送流都要收掉
      for (const f of [...this.incomingFiles.values()]) {
        if (f.ws === activeWs) this.abortIncoming(f, '会话已结束', true);
      }
      for (const out of [...this.outgoingFiles.values()]) {
        if (out.ws === activeWs) this.cancelFile(out.id);
      }
      const name = this.active.controller?.name || '控制端';
      const entry = this.history.find((h) => h.id === this.active.sessionId);
      if (entry) {
        entry.result = reason === 'takeover' ? 'takeover' : 'ended';
        entry.reason = reason || '';
        entry.endedAt = now();
      }
      if (!quiet) this.pushAudit('session_end', name, '成功', reason || '');
      if (notify) this.send(this.active.ws, { t: 'ended', reason: reason || 'ended' });
      this.lastAgentWs = null;
      this.active = null;
    }
    if (!quiet) this.emit('state', this.state());
  }

  handleInput(msg) {
    if (!this.active) return;
    const kind = msg.kind;
    if (kind === 'mouse') {
      const d = displayBounds(this.active.display);
      if (msg.action === 'move' || msg.action === 'down' || msg.action === 'up') {
        const nx = Math.max(0, Math.min(1, Number(msg.x) || 0));
        const ny = Math.max(0, Math.min(1, Number(msg.y) || 0));
        const b = physicalBounds(d);
        const x = b.x + Math.round(nx * (b.width - 1));
        const y = b.y + Math.round(ny * (b.height - 1));
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
      if (!this.helperMissingLogged) {
        this.helperMissingLogged = true;
        console.error('[remote] input helper missing', this.helperPath);
      }
      return null;
    }
    this.helperMissingLogged = false;
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
  async connect(peerId, code, role = 'owner') {
    const peer = this.peers.get(peerId);
    if (!peer) throw new Error('设备不在线');
    if (!peer.online) throw new Error('设备离线：开机并打开近传后再试');
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
        // 连接超时/配对失败时残留的 client 会让界面永远停在「连接中」
        if (this.client && this.client.ws === ws) this.client = null;
        this.emit('session', { state: 'error', message: err.message || String(err), peer });
        try { ws.terminate(); } catch {
          try { ws.close(); } catch {}
        }
        reject(err instanceof Error ? err : new Error(String(err)));
      };
      ws.on('open', () => {
        try { ws._socket?.setNoDelay(true); } catch {}
        this.send(ws, {
          t: 'pair',
          controller: { id: this.client.controllerId, name: this.deviceName },
          code: String(code || '').replace(/\D/g, ''),
          role: role === 'admin' ? 'admin' : 'owner',
        });
      });
      ws.on('message', (raw) => {
        try {
        let msg; try { msg = JSON.parse(raw.toString('utf8')); } catch { return; }
        if (!msg || typeof msg !== 'object') return;
        if (msg.t === 'hello') { /* wait for paired */ return; }
        if (msg.t === 'paired') {
          settled = true;
          if (timer) clearTimeout(timer);
          this.client.state = 'active';
          this.client.device = msg.device;
          this.client.grant = msg.grant || null;
          this.client.peerName = peer.name;
          this.startPing(ws);
          this.send(ws, { t: 'start', display: 0, quality: 'auto' });
          this.emit('session', { state: 'active', peer, device: msg.device });
          resolve(this.state());
          return;
        }
        if (msg.t === 'started') {
          this.client.display = msg.display;
          this.client.quality = msg.quality || 'auto';
          if (msg.grant) this.client.grant = msg.grant;
          this.emit('session', { state: 'active', peer, display: msg.display, quality: msg.quality, grant: this.client.grant });
          return;
        }
        if (msg.t === 'frame') { this.emit('frame', msg); return; }
        if (msg.t === 'file-begin') {
          if (this.client?.grant?.permissions?.file === false) {
            this.send(ws, { t: 'file-error', id: String(msg.id || ''), message: '当前授权未开启文件传输' });
            return;
          }
          this.receiveFileBegin({ ws, paired: true }, msg);
          return;
        }
        if (msg.t === 'file-chunk') { this.receiveFileChunk({ ws, paired: true }, msg); return; }
        if (msg.t === 'file-end') { this.receiveFileEnd({ ws, paired: true }, msg); return; }
        if (msg.t === 'file-error') {
          const incoming = this.incomingFiles.get(String(msg.id || ''));
          if (incoming) this.abortIncoming(incoming, String(msg.message || '对方取消了传输'), false);
          else this.cancelOutgoing(String(msg.id || ''), false, ws);
          return;
        }
        if (msg.t === 'fs-error') {
          this.emit('session', { state: 'error', message: msg.message || '无法从远端取回文件', peer });
          return;
        }
        if (msg.t === 'clipboard') { this.emit('clipboard', msg); return; }
        if (msg.t === 'chat') { this.emit('chat', { ...msg, direction: 'in', from: peer.name }); return; }
        if (msg.t === 'chat:ack') return;
        if (msg.t === 'pong') {
          const sent = Number(msg.ts) || 0;
          if (sent) this.emit('stats', { rtt: Math.max(0, now() - sent) });
          return;
        }
        if (msg.t === 'error') {
          // 握手阶段的错误才需要断开；会话中的权限拒绝/单帧采集失败不能把整条会话踢掉
          if (!settled) {
            fail(new Error(msg.message || msg.code || '远程错误'));
            try { ws.close(); } catch {}
          } else {
            this.emit('session', { state: 'error', message: msg.message || msg.code || '远程错误', peer });
          }
          return;
        }
        if (msg.t === 'ended') {
          this.stopPing();
          this.client = null;
          this.emit('session', { state: 'ended', reason: msg.reason || 'ended', peer });
          // client 置空后 disconnect() 就找不到这条连接了；这里主动关掉，避免会话结束后泄漏 socket
          try { ws.close(); } catch {}
        }
        } catch (err) {
          console.error('[remote] controller message failed', err.message);
        }
      });
      timer = setTimeout(() => {
        if (!settled) fail(new Error('连接超时：请确认被控端在线、端口可达，且授权码正确'));
      }, 12000);
      ws.on('close', () => {
        clearTimeout(timer);
        this.stopPing();
        for (const f of [...this.incomingFiles.values()]) {
          if (f.ws === ws) this.abortIncoming(f, '连接已断开', false);
        }
        for (const out of [...this.outgoingFiles.values()]) {
          if (out.ws === ws) this.cancelFile(out.id);
        }
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
    // 清理本次连接上的传输，避免残留条目一直触发「传文件时降帧」逻辑
    for (const out of [...this.outgoingFiles.values()]) {
      if (out.ws !== c.ws) continue;
      out.canceled = true;
      this.outgoingFiles.delete(out.id);
      try { out.stream.destroy(); } catch {}
    }
    for (const f of [...this.incomingFiles.values()]) {
      if (f.ws !== c.ws) continue;
      this.incomingFiles.delete(f.id);
      this.incomingPaths.delete(f.target);
      try { f.stream.destroy(); } catch {}
      try { fs.unlink(f.target, () => {}); } catch {}
    }
    this.stopPing();
    try { this.send(c.ws, { t: 'stop' }); } catch {}
    try {
      if (c.ws.readyState === WebSocket.CONNECTING) c.ws.terminate();
      else c.ws.close();
    } catch {}
    this.client = null;
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
    if (this.incomingFiles.has(id)) {
      this.send(conn.ws, { t: 'file-error', id, message: '重复的文件传输' });
      return;
    }
    const name = safeFileName(msg.name);
    const size = Math.max(0, Math.floor(Number(msg.size) || 0));
    const dir = path.join(app.getPath('downloads'), 'NearSend');
    try { fs.mkdirSync(dir, { recursive: true }); } catch {}
    let saveName = name;
    let target = path.join(dir, saveName);
    try {
      const ext = path.extname(name);
      const stem = path.basename(name, ext);
      let i = 1;
      while ((fs.existsSync(target) || this.incomingPaths.has(target)) && i < 500) {
        saveName = `${stem} (${i})${ext}`;
        target = path.join(dir, saveName);
        i += 1;
      }
    } catch {}
    this.incomingPaths.add(target);
    const f = { id, name: saveName, size, received: 0, target, stream: null, ws: conn.ws, failed: false, actor: conn.controller?.name || '控制端' };
    let stream;
    try {
      stream = fs.createWriteStream(target, { flags: 'w' });
    } catch (err) {
      this.incomingPaths.delete(target);
      this.send(conn.ws, { t: 'file-error', id, message: '无法创建文件：' + err.message });
      return;
    }
    f.stream = stream;
    // 磁盘满、目录被删、权限不足都会让写入流抛 error；没有监听器会直接崩掉主进程
    stream.on('error', (err) => {
      console.error('[remote] file write', err.message);
      this.abortIncoming(f, '文件写入失败：' + err.message, true);
    });
    this.incomingFiles.set(id, f);
    this.send(conn.ws, { t: 'file-accept', id, name: saveName });
    this.pushAudit('file_in', conn.controller?.name || '控制端', '开始', name);
    this.emit('file-progress', { id, name, size, received: 0, direction: 'in' });
  }
  /** 中止接收：停止写入、删除半截文件；notify=true 时告知发送端 */
  abortIncoming(f, reason, notify) {
    if (!f || f.failed) return;
    f.failed = true;
    this.incomingFiles.delete(f.id);
    this.incomingPaths.delete(f.target);
    const cleanup = () => {
      fs.unlink(f.target, () => {});
    };
    try {
      if (f.stream.destroyed) cleanup();
      else {
        f.stream.once('close', cleanup);
        f.stream.destroy();
      }
    } catch {
      cleanup();
    }
    if (notify) this.send(f.ws, { t: 'file-error', id: f.id, message: reason });
    this.pushAudit('file_in', f.actor || '控制端', '失败', `${f.name} · ${reason}`);
    this.emit('file-progress', {
      id: f.id, name: f.name, size: f.size, received: f.received,
      done: true, error: reason, direction: 'in',
    });
  }
  receiveFileChunk(conn, msg) {
    const f = this.incomingFiles.get(String(msg.id || ''));
    if (!f || f.ws !== conn.ws || f.failed || f.stream.destroyed) return;
    try {
      const buf = Buffer.from(String(msg.data || ''), 'base64');
      if (f.size > 0 && f.received + buf.length > f.size) {
        this.abortIncoming(f, '文件超出声明大小', true);
        return;
      }
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
    if (!f || f.ws !== conn.ws || f.failed) return;
    if (f.size > 0 && f.received !== f.size) {
      this.abortIncoming(f, `文件不完整 ${f.received}/${f.size}`, true);
      return;
    }
    this.incomingFiles.delete(id);
    const done = () => {
      this.incomingPaths.delete(f.target);
      this.send(conn.ws, { t: 'file-done', id, name: f.name, size: f.received, path: f.target });
      this.pushAudit('file_in', conn.controller?.name || '控制端', '成功', `${f.name} · ${f.received} B`);
      this.emit('file-progress', { id: f.id, name: f.name, size: f.size, received: f.received, done: true, direction: 'in', path: f.target });
    };
    try {
      f.stream.end(() => {
        if (f.failed) return;
        done();
      });
    } catch {
      this.abortIncoming(f, '文件保存失败', true);
    }
  }

  async sendFileToActive(filePath) {
    const active = this.active;
    if (!active || !active.ws || active.ws.readyState !== WebSocket.OPEN) return null;
    if (active.permissions && active.permissions.file === false) return null;
    let st;
    try { st = fs.statSync(filePath); } catch { return null; }
    if (!st.isFile()) return null;
    const id = rid('file');
    const name = safeFileName(path.basename(filePath));
    const size = st.size;
    const ws = active.ws;
    this.send(ws, { t: 'file-begin', id, name, size });
    const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
    const out = { id, name, size, ws, stream, sent: 0, direction: 'out-agent', canceled: false };
    this.outgoingFiles.set(id, out);
    let sent = 0;
    stream.on('data', (buf) => {
      const current = this.outgoingFiles.get(id);
      if (!current || current.canceled) { stream.destroy(); return; }
      if (ws.readyState !== WebSocket.OPEN) { this.outgoingFiles.delete(id); stream.destroy(); return; }
      this.send(ws, { t: 'file-chunk', id, offset: sent, data: buf.toString('base64') });
      sent += buf.length;
      out.sent = sent;
      if (ws.bufferedAmount > 8 * 1024 * 1024) {
        // 大文件直读会把整个文件堆进 ws 缓冲；超过水位就暂停读取，降到低水位立刻继续
        stream.pause();
        resumeWhenDrained(stream, ws);
      }
      const ts = now();
      if (!stream.lastEmit || ts - stream.lastEmit > 300) {
        stream.lastEmit = ts;
        this.emit('file-progress', { id, name, size, received: sent, done: false, direction: 'out-agent' });
      }
    });
    stream.on('end', () => {
      if (out.canceled) return;
      this.outgoingFiles.delete(id);
      this.send(ws, { t: 'file-end', id });
      this.emit('file-progress', { id, name, size, received: sent, done: true, direction: 'out-agent' });
    });
    // 发送过程中文件被移走/读取失败时，ReadStream 的 error 不监听会直接崩主进程
    stream.on('error', (err) => {
      this.outgoingFiles.delete(id);
      if (out.canceled) return;
      this.send(ws, { t: 'file-error', id, message: '读取文件失败：' + err.message });
      this.emit('file-progress', {
        id, name, size, received: sent, done: true, error: err.message, direction: 'out-agent',
      });
      this.pushAudit('file_out', this.deviceName, '失败', `${name} · ${err.message}`);
    });
    this.pushAudit('file_out', this.deviceName, '开始', name);
    return { id, name, size };
  }

  async sendFile(filePath) {
    if (!this.client || this.client.state !== 'active') return null;
    if (this.client.grant?.permissions?.file === false) return null;
    let st;
    try { st = fs.statSync(filePath); } catch { return null; }
    if (!st.isFile()) return null;
    const id = rid('file');
    const name = safeFileName(path.basename(filePath));
    const size = st.size;
    const ws = this.client.ws;
    this.send(ws, { t: 'file-begin', id, name, size });
    const stream = fs.createReadStream(filePath, { highWaterMark: 256 * 1024 });
    const out = { id, name, size, ws, stream, sent: 0, direction: 'out', canceled: false };
    this.outgoingFiles.set(id, out);
    let sent = 0;
    stream.on('data', (buf) => {
      const current = this.outgoingFiles.get(id);
      if (!current || current.canceled) { stream.destroy(); return; }
      if (ws.readyState !== WebSocket.OPEN) { this.outgoingFiles.delete(id); stream.destroy(); return; }
      this.send(ws, { t: 'file-chunk', id, offset: sent, data: buf.toString('base64') });
      sent += buf.length;
      out.sent = sent;
      if (ws.bufferedAmount > 8 * 1024 * 1024) {
        stream.pause();
        resumeWhenDrained(stream, ws);
      }
      const ts = now();
      if (!stream.lastEmit || ts - stream.lastEmit > 300) {
        stream.lastEmit = ts;
        this.emit('file-progress', { id, name, size, received: sent, done: false, direction: 'out' });
      }
    });
    stream.on('end', () => {
      if (out.canceled) return;
      this.outgoingFiles.delete(id);
      this.send(ws, { t: 'file-end', id });
      this.emit('file-progress', { id, name, size, received: sent, done: true, direction: 'out' });
    });
    stream.on('error', (err) => {
      this.outgoingFiles.delete(id);
      if (out.canceled) return;
      this.send(ws, { t: 'file-error', id, message: '读取文件失败：' + err.message });
      this.emit('file-progress', {
        id, name, size, received: sent, done: true, error: err.message, direction: 'out',
      });
      this.pushAudit('file_out', this.deviceName, '失败', `${name} · ${err.message}`);
    });
    this.pushAudit('file_out', this.deviceName, '开始', name);
    return { id, name, size };
  }

  cancelFile(id) {
    return this.cancelOutgoing(id, true);
  }

  cancelOutgoing(id, notify, expectedWs) {
    const key = String(id || '');
    const out = this.outgoingFiles.get(key);
    if (!out) return false;
    if (expectedWs && out.ws !== expectedWs) return false;
    out.canceled = true;
    this.outgoingFiles.delete(key);
    try { out.stream.destroy(); } catch {}
    if (notify) this.send(out.ws, { t: 'file-error', id: key, message: '发送已取消' });
    this.emit('file-progress', {
      id: key, name: out.name, size: out.size, received: out.sent || 0,
      done: true, error: notify ? '发送已取消' : '对方已取消接收', direction: out.direction,
    });
    this.pushAudit('file_out', this.deviceName, notify ? '取消' : '中断', out.name);
    return true;
  }

  cancelIncoming(id) {
    const key = String(id || '');
    const f = this.incomingFiles.get(key);
    if (!f) return false;
    this.abortIncoming(f, '接收已取消', true);
    return true;
  }

  /** 取消一条正在发送或接收的文件；id 是本次传输的短期 id */
  cancelTransfer(id) {
    const outgoing = this.cancelFile(id);
    const incoming = this.cancelIncoming(id);
    return outgoing || incoming;
  }
  requestRemoteFile(remotePath) {
    if (!this.client || this.client.state !== 'active') return false;
    if (this.client.grant?.permissions?.file === false) return false;
    const value = String(remotePath || '').trim();
    if (!value) return false;
    this.send(this.client.ws, { t: 'fs-get', path: value });
    return true;
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
  setRecording(on) {
    if (!this.client || this.client.state !== 'active') return;
    this.send(this.client.ws, { t: 'recording', on: !!on });
  }
  startPing(ws) {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.client && this.client.ws === ws && ws.readyState === WebSocket.OPEN) {
        this.send(ws, { t: 'ping', ts: now() });
      }
    }, 2000);
  }
  stopPing() {
    clearInterval(this.pingTimer);
    this.pingTimer = null;
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
    this.saveAuditSoon();
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
    clearTimeout(this.grantTimer);
    this.stopCaptureHelper();
    this.stopPing();
    if (this.active) this.stopActive('app-quit', false);
    clearTimeout(this.knownSaveTimer);
    clearTimeout(this.auditTimer);
    this.knownSaveTimer = null;
    this.auditTimer = null;
    try { this.save(); this.saveAudit(); } catch {}
    clearInterval(this.udpTimer);
    clearInterval(this.pruneTimer);
    if (this.client) this.disconnect();
    for (const c of this.connections) { try { c.ws.close(); } catch {} }
    if (this.wss) { try { this.wss.close(); } catch {} }
    if (this.udp) { try { this.udp.close(); } catch {} }
    for (const f of this.dmIncoming.values()) {
      try { fs.unlink(f.target, () => {}); } catch {}
    }
    this.dmIncoming.clear();
    this.dmPaths.clear();
    this.dmAcks.clear();
    if (this.dm) { try { this.dm.close(); } catch {} }
    if (this.helper) { try { this.helper.kill(); } catch {} }
  }
}

module.exports = { RemoteManager, UDP_PORT };
