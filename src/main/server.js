'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');
const QRCode = require('qrcode');
const netinfo = require('./netinfo');
const { kindOf } = require('./store');

const RENDERER = path.join(__dirname, '..', 'renderer');
const CHUNK_LIMIT = 16 * 1024 * 1024;
const RECALL_MS = 2 * 60 * 1000;

const MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif',
  '.webp': 'image/webp', '.bmp': 'image/bmp', '.avif': 'image/avif', '.svg': 'image/svg+xml',
  '.heic': 'image/heic', '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav',
  '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.json': 'application/json',
  '.zip': 'application/zip', '.7z': 'application/x-7z-compressed', '.rar': 'application/vnd.rar',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel', '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint', '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const STATIC = {
  '/': ['mobile/index.html', 'text/html; charset=utf-8'],
  '/m/app.js': ['mobile/app.js', 'text/javascript; charset=utf-8'],
  '/m/style.css': ['mobile/style.css', 'text/css; charset=utf-8'],
  '/m/manifest.webmanifest': ['mobile/manifest.webmanifest', 'application/manifest+json; charset=utf-8'],
  '/m/icon.png': ['../../assets/icon-192.png', 'image/png'],
};

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(body);
}

function text(res, code, body, type) {
  const buf = Buffer.from(body);
  res.writeHead(code, {
    'Content-Type': type || 'text/plain; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(buf);
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on('data', (c) => {
      total += c.length;
      if (total > limit) {
        reject(new Error('body too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
    req.on('aborted', () => reject(new Error('aborted')));
  });
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

function deviceLabel(ua) {
  const os = /iPhone/i.test(ua) ? 'iPhone'
    : /iPad/i.test(ua) ? 'iPad'
      : /Android/i.test(ua) ? 'Android'
        : /Macintosh/i.test(ua) ? 'Mac'
          : /Windows/i.test(ua) ? 'Windows' : '设备';
  const br = /MicroMessenger/i.test(ua) ? '微信'
    : /Edg/i.test(ua) ? 'Edge'
      : /CriOS|Chrome/i.test(ua) ? 'Chrome'
        : /Firefox/i.test(ua) ? 'Firefox'
          : /Safari/i.test(ua) ? 'Safari' : '浏览器';
  return `${os} · ${br}`;
}

function deviceKind(ua) {
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
  if (/iPhone|Android|Mobile|Windows Phone/i.test(ua)) return 'phone';
  return 'desktop';
}

function plainName(input, fallback) {
  return String(input == null ? '' : input).replace(/\s+/g, ' ').trim().slice(0, 200) || fallback;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

class LanServer extends EventEmitter {
  constructor({ core, uploads, token, room }) {
    super();
    this.core = core;
    this.uploads = uploads;
    this.room = room;
    this.tokenBuf = Buffer.from(token);
    this.port = 0;
    this.clients = new Set();
    this.lastProgress = new Map();
    this.qrCache = null;

    this.server = http.createServer((req, res) => {
      this.route(req, res).catch((err) => {
        if (!res.headersSent) json(res, 500, { error: err.message });
        else res.destroy();
      });
    });
    this.server.headersTimeout = 30000;

    this.wss = new WebSocketServer({ noServer: true });
    this.server.on('upgrade', (req, socket, head) => {
      try {
        this.onUpgrade(req, socket, head);
      } catch (err) {
        // 畸形请求不能把整个进程带崩
        console.error('[ws] upgrade failed', err.message);
        try {
          socket.destroy();
        } catch {
          /* ignore */
        }
      }
    });

    // 手机断线重发时用 cid 去重，避免同一条文字出现两次
    this.recentCids = new Map();
    // 上传会话 -> 归属成员。上传 id 会随消息广播出去，不能仅凭 id 就让别人写同一个文件
    this.uploadOwners = new Map();

    this.uploads.on('progress', (p) => this.onProgress(p));
    this.timer = setInterval(() => this.sweep(), 60 * 1000);
    this.hbTimer = setInterval(() => this.heartbeat(), 30 * 1000);
  }

  async start(preferred) {
    const last = Math.min(preferred + 11, 65535);
    for (let p = preferred; p <= last; p += 1) {
      const ok = await new Promise((resolve) => {
        const onError = (err) => {
          this.server.removeListener('listening', onListening);
          if (err.code === 'EADDRINUSE') resolve(false);
          else resolve(false);
        };
        const onListening = () => {
          this.server.removeListener('error', onError);
          resolve(true);
        };
        this.server.once('error', onError);
        this.server.once('listening', onListening);
        this.server.listen(p, '0.0.0.0');
      });
      if (ok) {
        this.port = p;
        return p;
      }
    }
    throw new Error('no free port');
  }

  stop() {
    clearInterval(this.timer);
    clearInterval(this.hbTimer);
    for (const c of this.clients) c.ws.terminate();
    this.clients.clear();
    this.uploadOwners.clear();
    this.recentCids.clear();
    if (this.uploads.abortAll) this.uploads.abortAll();
    this.wss.close();
    this.server.close();
  }

  setToken(token) {
    this.tokenBuf = Buffer.from(token);
    this.qrCache = null;
  }

  /** 重置令牌后踢掉所有已连接设备，它们必须重新扫码 */
  dropClients() {
    for (const c of this.clients) {
      try {
        c.ws.close(4001, 'token reset');
      } catch {
        /* ignore */
      }
    }
  }

  // ---------- 群成员 ----------

  onlineIds() {
    const set = new Set();
    for (const c of this.clients) {
      if (c.member && c.ws.readyState === 1) set.add(c.member.id);
    }
    return set;
  }

  authorOf(member) {
    if (!member) return null;
    return {
      id: member.id,
      name: member.name,
      color: member.color,
      kind: member.kind,
    };
  }

  legacyAuthor(req) {
    const ua = req.headers['user-agent'] || '';
    const kind = deviceKind(ua);
    return {
      id: 'legacy',
      name: kind === 'desktop' ? '电脑' : '手机',
      color: 'slate',
      kind,
    };
  }

  rosterPayload() {
    const online = this.onlineIds();
    return {
      room: this.room.info(online),
      members: this.room.roster(online),
      blocked: this.room.blockedList(),
    };
  }

  broadcastRoom() {
    const payload = this.rosterPayload();
    const frame = { t: 'room', room: payload.room, members: payload.members };
    const raw = JSON.stringify(frame);
    for (const c of this.clients) {
      if (!c.member || c.ws.readyState !== 1) continue;
      try {
        c.ws.send(raw);
      } catch {
        /* 断开的连接由 close 处理 */
      }
    }
    this.emit('room', payload);
  }

  /** 群主界面用：群信息 + 成员 + 黑名单 */
  snapshot() {
    return this.rosterPayload();
  }

  forgetUpload(id) {
    this.uploadOwners.delete(id);
    this.lastProgress.delete(id);
  }

  forgetAllUploads() {
    this.uploadOwners.clear();
    this.lastProgress.clear();
  }

  publishSystem(text, meta) {
    if (!text) return null;
    return this.core.publish({
      from: 'system',
      kind: 'system',
      status: 'ok',
      text,
      sys: meta || {},
    });
  }

  // ---------- 群主操作（只从桌面 IPC 调用） ----------

  setRoomName(name) {
    const changed = this.room.setName(name);
    if (changed) {
      this.publishSystem(`群名改为「${this.room.data.name}」`, { event: 'room-name' });
      this.broadcastRoom();
    }
    return this.room.info(this.onlineIds());
  }

  setHostName(name) {
    const result = this.room.renameHost(name);
    if (result.renamed) {
      this.publishSystem(`${result.oldName} 改名为 ${result.member.name}`, {
        event: 'rename',
        actor: { id: 'host', name: result.member.name },
      });
      this.broadcastRoom();
    }
    return result;
  }

  setLocked(locked) {
    this.room.setLocked(locked);
    this.broadcastRoom();
    return this.room.info(this.onlineIds());
  }

  kick(id) {
    const member = this.room.kick(id);
    for (const c of [...this.clients]) {
      if (!c.member || c.member.id !== member.id) continue;
      c.member = null;
      this.send(c.ws, { t: 'kicked', code: 'kicked', message: '你已被移出群聊' });
      try {
        c.ws.close(4003, 'kicked');
      } catch {
        /* ignore */
      }
    }
    this.publishSystem(`${member.name} 被移出群聊`, {
      event: 'kick',
      target: { id: member.id, name: member.name },
    });
    this.broadcastRoom();
    return member;
  }

  unblock(id) {
    const ok = this.room.unblock(id);
    if (ok) this.broadcastRoom();
    return ok;
  }

  renameMember(id, name) {
    const result = this.room.renameMember(id, name);
    if (result.renamed) {
      this.publishSystem(`${result.oldName} 改名为 ${result.member.name}`, {
        event: 'rename',
        actor: { id: result.member.id, name: result.member.name },
      });
      this.broadcastRoom();
    }
    return result;
  }

  markSeen(memberId, ids) {
    if (!Array.isArray(ids) || !memberId) return;
    const now = Date.now();
    for (const id of ids.slice(0, 200)) {
      const msg = this.core.get(id);
      if (!msg || msg.kind === 'system' || msg.status !== 'ok' || msg.recalled) continue;
      const authorId = msg.uid || (msg.from === 'pc' ? 'host' : 'legacy');
      if (authorId === memberId) continue;
      const seenBy = Array.isArray(msg.seenBy) ? msg.seenBy.slice() : [];
      if (seenBy.includes(memberId)) continue;
      seenBy.push(memberId);
      this.core.patch(id, { seenBy: seenBy.slice(-64), seen: msg.seen || now }, true);
    }
  }

  hostTyping(on) {
    this.broadcast({ t: 'typing', id: 'host', name: this.room.host.name, on: !!on });
  }

  async invite() {
    const url = this.core.getUrl();
    if (!url) return null;
    if (this.qrCache && this.qrCache.url === url) return this.qrCache;
    let qr = '';
    try {
      qr = await QRCode.toDataURL(url, {
        margin: 1,
        width: 560,
        errorCorrectionLevel: 'M',
        color: { dark: '#0a0a0b', light: '#ffffff' },
      });
    } catch (err) {
      console.error('[qr]', err.message);
    }
    this.qrCache = { url, qr };
    return this.qrCache;
  }

  onlineNames() {
    const online = this.onlineIds();
    return this.room.roster(online).filter((m) => m.online && !m.isHost).map((m) => m.name);
  }


  /** 锁屏后 NAT 超时的半死连接不会触发 close，靠 ping/pong 判活 */
  heartbeat() {
    for (const client of this.clients) {
      if (!client.alive) {
        client.ws.terminate();
        continue;
      }
      client.alive = false;
      try {
        client.ws.ping();
      } catch {
        /* 已断开的连接 terminate 会走 close 事件 */
      }
    }
  }

  // ---------- auth ----------

  hostAllowed(req) {
    const host = String(req.headers.host || '').toLowerCase();
    const idx = host.lastIndexOf(':');
    if (idx < 0) return false;
    const addr = host.slice(0, idx);
    const port = host.slice(idx + 1);
    if (Number(port) !== this.port) return false;
    return netinfo.localAddresses().has(addr);
  }

  originAllowed(req) {
    const origin = req.headers.origin;
    if (!origin) return true;
    try {
      return new URL(origin).host === req.headers.host;
    } catch {
      return false;
    }
  }

  tokenFrom(req, url) {
    const q = url.searchParams.get('t');
    if (q) return q;
    return parseCookies(req.headers.cookie).ld || '';
  }

  authorized(req, url) {
    const given = Buffer.from(this.tokenFrom(req, url));
    if (given.length !== this.tokenBuf.length) return false;
    return crypto.timingSafeEqual(given, this.tokenBuf);
  }

  cookieHeader() {
    return `ld=${this.tokenBuf.toString()}; Path=/; Max-Age=31536000; HttpOnly; SameSite=Lax`;
  }

  /**
   * HTTP 请求的成员身份。
   * 没带成员头 = 旧客户端（Android 原生分享/通知回复），走兼容身份；
   * 带了但校验失败 = 明确拒绝，不能悄悄降级成匿名，否则被移出的人还能继续发。
   */
  authHttp(req, body) {
    const id = String(req.headers['x-ns-member'] || (body && body.memberId) || '');
    const key = String(req.headers['x-ns-key'] || (body && body.memberKey) || '');
    if (!id && !key) {
      // 旧版 Android 原生分享/通知回复仍走令牌兼容通道；浏览器请求必须带成员身份。
      const ua = String(req.headers['user-agent'] || '');
      const legacy = /Android/i.test(ua) && !/Mozilla|Chrome|Safari/i.test(ua);
      return legacy
        ? { legacy: true, member: null, invalid: false }
        : { legacy: false, member: null, invalid: true };
    }
    const member = this.room.auth(id, key);
    return { legacy: false, member, invalid: !member };
  }

  /**
   * 上传分片/完成请求的成员校验。
   * 上传 id 和上传进度会广播给全群；如果只看令牌，任何群成员都能篡改别人的在传文件。
   */
  uploadSessionAuth(req, id) {
    const auth = this.authHttp(req, null);
    if (auth.invalid || (!auth.member && !auth.legacy)) return { ok: false, code: 401 };
    const uid = auth.member ? auth.member.id : 'legacy';
    const owner = this.uploadOwners.get(id);
    if (owner && owner !== uid) return { ok: false, code: 403 };
    return { ok: true, uid };
  }

  /** 消息里 @ 到的成员。先把名字按长度倒序，避免「张三丰」被「张三」截胡。 */
  mentionsFor(text, authorId) {
    const value = String(text || '');
    if (!value.includes('@')) return [];
    const people = [this.room.host, ...Object.values(this.room.data.members)]
      .filter((m) => m && m.id !== authorId)
      .sort((a, b) => b.name.length - a.name.length);
    const out = [];
    for (const person of people) {
      if (out.length >= 32) break;
      const re = new RegExp('@' + escapeRe(person.name) + '(?![\\p{L}\\p{N}_])', 'u');
      if (re.test(value)) out.push(person.id === 'host' ? 'host' : person.id);
    }
    return out;
  }


  // ---------- routing ----------

  async route(req, res) {
    const host = req.headers.host || '';
    const url = new URL(req.url, `http://${host || 'localhost'}`);
    const p = url.pathname;

    if (!this.hostAllowed(req)) {
      return text(res, 421, 'Misdirected Request');
    }
    if (!this.originAllowed(req)) {
      return text(res, 403, 'Forbidden');
    }

    if (p === '/') {
      if (!this.authorized(req, url)) return this.scanPage(req, res);
      res.setHeader('Set-Cookie', this.cookieHeader());
      return this.serveStatic(res, '/');
    }

    if (p.startsWith('/m/')) {
      // 浏览器抓取 PWA manifest / 图标时按规范不带 Cookie（credentials mode = omit），
      // 若也要求令牌，「添加到主屏幕」会退化成普通书签。这两个文件不含隐私数据。
      if (p === '/m/manifest.webmanifest' || p === '/m/icon.png') {
        return this.serveStatic(res, p);
      }
      if (!this.authorized(req, url)) return text(res, 403, 'Forbidden');
      return this.serveStatic(res, p);
    }

    // 下载链接要能被手机浏览器直接打开，所以 token 也接受 query 形式
    if (p.startsWith('/d/') || p.startsWith('/t/')) {
      if (!this.authorized(req, url)) return text(res, 403, 'Forbidden');
      return this.serveMedia(req, res, p.slice(3), p[1] === 't');
    }

    if (!p.startsWith('/api/')) return text(res, 404, 'Not Found');
    if (!this.authorized(req, url)) return json(res, 401, { error: 'unauthorized' });
    res.setHeader('Set-Cookie', this.cookieHeader());

    try {
      if (p === '/api/history' && req.method === 'GET') {
        const snapshot = this.rosterPayload();
        return json(res, 200, {
          ok: true,
          app: 'nearsend',
          version: this.core.version || '',
          host: os.hostname(),
          messages: this.core.history().map((m) => this.publicMessage(m)),
          theme: this.core.getTheme(),
          url: this.core.getUrl(),
          room: snapshot.room,
          members: snapshot.members,
        });
      }

      if (p === '/api/room' && req.method === 'GET') {
        const snapshot = this.rosterPayload();
        const invite = await this.invite();
        return json(res, 200, {
          ok: true,
          app: 'nearsend',
          version: this.core.version || '',
          room: snapshot.room,
          members: snapshot.members,
          invite: invite || null,
        });
      }

      if (p === '/api/send/text' && req.method === 'POST') {
        const body = await readBody(req, 128 * 1024);
        const meta = JSON.parse(body.toString('utf8') || '{}');
        const value = String(meta.text || '').trim();
        if (!value) return json(res, 400, { error: 'text required' });
        const auth = this.authHttp(req, meta);
        if (auth.invalid) return json(res, 401, { error: 'unauthorized member' });
        const member = auth.member;
        const author = member ? this.authorOf(member) : this.legacyAuthor(req);
        const uid = member ? member.id : 'legacy';
        const cid = String(meta.cid || '');
        if (cid) {
          this.seenCid(cid);
          const dup = this.findBySrc(cid, uid);
          if (dup) {
            // 重发同一条：把已落库的那条带回去，手机才能把本地气泡换成正式消息
            return json(res, 200, { ok: true, duplicate: true, id: dup.id, msg: dup });
          }
        }
        const msg = this.core.publish({
          from: 'phone',
          uid,
          author,
          src: cid || ('api' + Date.now().toString(36)),
          kind: 'text',
          text: value.slice(0, 20000),
          mentions: this.mentionsFor(value, uid),
          reply: this.cleanReply(meta.reply),
        });
        return json(res, 200, { ok: true, id: msg.id, msg });
      }

      if (p === '/api/clear' && req.method === 'POST') {
        // 群聊历史是共享的，清空只允许群主在桌面端操作。这里不再接受远程调用。
        return json(res, 403, { error: 'host only' });
      }

      if (p === '/api/upload/init' && req.method === 'POST') {
        const body = await readBody(req, 64 * 1024);
        const meta = JSON.parse(body.toString('utf8') || '{}');
        if (!meta.name) return json(res, 400, { error: 'name required' });
        const auth = this.authHttp(req, meta);
        if (auth.invalid) return json(res, 401, { error: 'unauthorized member' });
        const member = auth.member;
        const author = member ? this.authorOf(member) : this.legacyAuthor(req);
        const uid = member ? member.id : 'legacy';
        const requestedSize = Number(meta.size);
        const size = Number.isFinite(requestedSize) && requestedSize > 0 ? Math.floor(requestedSize) : 0;
        // mime 会进 HTTP 响应头；清掉换行/控制字符，防止写头失败或头注入
        const mime = typeof meta.mime === 'string'
          ? meta.mime.replace(/[\r\n\x00-\x1f\x7f]/g, '').trim().slice(0, 120)
          : '';
        const session = await this.uploads.init(Object.assign({}, meta, { mime }));
        this.uploadOwners.set(session.id, uid);
        this.core.publish({
          id: session.id,
          from: 'phone',
          uid,
          author,
          src: String(meta.cid || ''),
          kind: kindOf(mime, session.name),
          name: session.name,
          size,
          mime,
          status: 'uploading',
          progress: 0,
        });
        return json(res, 200, session);
      }

      const uploadMatch = p.match(/^\/api\/upload\/([a-f0-9]{16})$/);
      if (uploadMatch) {
        const id = uploadMatch[1];
        const allowed = this.uploadSessionAuth(req, id);
        if (!allowed.ok) return json(res, allowed.code, { error: allowed.code === 401 ? 'unauthorized' : 'forbidden' });
        if (req.method === 'GET') {
          const info = this.uploads.info(id);
          return info ? json(res, 200, { offset: info.offset, size: info.size }) : json(res, 404, { error: 'gone' });
        }
        if (req.method === 'PUT') {
          const off = Number(url.searchParams.get('off') || 0);
          const buf = await readBody(req, CHUNK_LIMIT);
          const next = await this.uploads.write(id, off, buf);
          return json(res, 200, { offset: next });
        }
      }

      const doneMatch = p.match(/^\/api\/upload\/([a-f0-9]{16})\/done$/);
      if (doneMatch && req.method === 'POST') {
        const id = doneMatch[1];
        const existing = this.core.get(id);
        if (existing && existing.status === 'ok' && existing.path) {
          // /done 重发：文件已经落盘，直接把结果回给客户端
          return json(res, 200, { id, name: existing.name, size: existing.size });
        }
        const allowed = this.uploadSessionAuth(req, id);
        if (!allowed.ok) return json(res, allowed.code, { ok: false, error: allowed.code === 401 ? 'unauthorized' : 'forbidden' });
        const file = await this.uploads.finish(id);
        this.uploadOwners.delete(id);
        this.lastProgress.delete(id);
        this.core.patch(
          id,
          { path: file.path, name: file.name, size: file.size, status: 'ok', progress: 1 },
          true
        );
        return json(res, 200, { id, name: file.name, size: file.size });
      }

      const recallMatch = p.match(/^\/api\/msg\/([a-f0-9]{16})\/recall$/);
      if (recallMatch && req.method === 'POST') {
        const auth = this.authHttp(req, null);
        if (auth.invalid) return json(res, 401, { ok: false, error: 'unauthorized member' });
        const msg = this.core.get(recallMatch[1]);
        if (!msg) return json(res, 404, { ok: false, error: 'not found' });
        const uid = msg.uid || (msg.from === 'pc' ? 'host' : 'legacy');
        const mine = auth.member ? uid === auth.member.id : (msg.from === 'phone' && uid === 'legacy');
        const can = mine && msg.status === 'ok' && !msg.recalled
          && Date.now() - Number(msg.ts || 0) <= RECALL_MS;
        if (!can) return json(res, 403, { ok: false, error: 'recall not allowed' });
        this.core.patch(msg.id, { recalled: true }, true);
        return json(res, 200, { ok: true });
      }

      const delMatch = p.match(/^\/api\/msg\/([a-f0-9]{16})$/);
      if (delMatch && req.method === 'DELETE') {
        const auth = this.authHttp(req, null);
        if (auth.invalid) return json(res, 401, { ok: false, error: 'unauthorized member' });
        const msg = this.core.get(delMatch[1]);
        if (!msg) return json(res, 404, { ok: false });
        const uid = msg.uid || (msg.from === 'pc' ? 'host' : 'legacy');
        const mine = auth.member ? uid === auth.member.id : (msg.from === 'phone' && uid === 'legacy');
        // 群主通过 IPC 删除任意消息，不走这个接口；这里只允许删自己的
        if (!mine) return json(res, 403, { ok: false, error: 'delete not allowed' });
        const purge = url.searchParams.get('purge') === '1';
        // 删除的如果是正在上传的消息，顺手结束上传会话，避免文件继续落盘却没人认领
        this.forgetUpload(delMatch[1]);
        this.uploads.abort(delMatch[1]);
        const ok = this.core.remove(delMatch[1], purge);
        return json(res, ok ? 200 : 404, { ok });
      }
    } catch (err) {
      return json(res, 400, { error: err.message });
    }

    return text(res, 404, 'Not Found');
  }

  serveStatic(res, key) {
    const entry = STATIC[key];
    if (!entry) return text(res, 404, 'Not Found');
    const file = path.join(RENDERER, entry[0]);
    fs.readFile(file, (err, buf) => {
      if (err) return text(res, 404, 'Not Found');
      res.writeHead(200, {
        'Content-Type': entry[1],
        'Content-Length': buf.length,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      });
      res.end(buf);
    });
  }

  scanPage(req, res) {
    const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0a0b0e">
<title>近传</title><style>
html,body{margin:0;height:100%;background:#0a0a0b;color:#ededf0;
font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
.wrap{height:100%;display:flex;align-items:center;justify-content:center;padding:32px;text-align:center}
h1{font-size:17px;margin:0 0 10px;font-weight:600;letter-spacing:.01em}
p{font-size:13px;line-height:1.7;color:#8f8f99;margin:0;max-width:280px}
.dot{width:46px;height:46px;border-radius:14px;background:#17171a;border:1px solid rgba(255,255,255,.08);
color:#ededf0;display:flex;align-items:center;justify-content:center;margin:0 auto 20px;font-size:19px}
</style></head><body><div class="wrap"><div>
<div class="dot">⇣</div><h1>需要从电脑上扫码进入</h1>
<p>这个链接缺少访问令牌。请打开电脑托盘里的「近传」，用手机扫描窗口中的二维码。</p>
</div></div></body></html>`;
    text(res, 200, html, 'text/html; charset=utf-8');
  }

  serveMedia(req, res, id, inline) {
    const msg = this.core.get(id);
    if (!msg || !msg.path) return text(res, 404, 'Not Found');
    let stat;
    try {
      stat = fs.statSync(msg.path);
    } catch {
      return text(res, 404, 'File missing');
    }
    const ext = path.extname(msg.path).toLowerCase();
    const declared = typeof msg.mime === 'string' && msg.mime.includes('/')
      ? msg.mime.replace(/[\r\n\x00-\x1f\x7f]/g, '').slice(0, 120)
      : '';
    const mime = declared || MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    };
    if (inline) {
      // 缩略图/预览可能在浏览器里被直接打开；sandbox 阻止 SVG/HTML 变成本地页面脚本
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }
    if (!inline) {
      const ascii = (msg.name || path.basename(msg.path)).replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, "'");
      const utf8 = encodeURIComponent(msg.name || path.basename(msg.path))
        .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
      headers['Content-Disposition'] =
        `attachment; filename="${ascii}"; filename*=UTF-8''${utf8}`;
    }

    const head = req.method === 'HEAD';

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start;
        let end;
        if (!m[1] && !m[2]) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        if (!m[1]) {
          // bytes=-N：最后 N 个字节，不是前 N 个
          const suffix = Number(m[2]);
          start = Math.max(0, stat.size - suffix);
          end = stat.size - 1;
        } else {
          start = Number(m[1]);
          end = m[2] ? Number(m[2]) : stat.size - 1;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end)
          || start > end || start >= stat.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        end = Math.min(end, stat.size - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        // HEAD 只回头部；继续读文件会让电脑端误报「手机已下载」
        if (head) return res.end();
        return this.streamFile(res, msg.path, { start, end }, id, inline);
      }
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (head) return res.end();
    return this.streamFile(res, msg.path, {}, id, inline);
  }

  /**
   * 边发边统计：/d/ 的下载进度回传给电脑端，手机上就能看到
   * 「对方下载中 42%」。/t/ 是缩略图，不统计，避免刷屏。
   */
  streamFile(res, file, opts, id, inline) {
    const stream = fs.createReadStream(file, opts);
    let total;
    try {
      const st = fs.statSync(file);
      total = opts && opts.end !== undefined ? opts.end - (opts.start || 0) + 1 : st.size;
    } catch {
      total = 0;
    }
    let sent = 0;
    let last = 0;
    let finished = false;
    const finish = (done) => {
      if (finished) return;
      finished = true;
      if (!inline) this.emit('served', { id, sent, total, done, aborted: !done && sent < total });
    };
    stream.on('data', (chunk) => {
      sent += chunk.length;
      if (inline) return;
      const now = Date.now();
      if (now - last > 250) {
        last = now;
        this.emit('served', { id, sent, total, done: false });
      }
    });
    stream.on('end', () => finish(true));
    stream.on('error', () => {
      finish(false);
      // pipe 在源出错时不会自动结束响应；不 destroy 的话客户端会一直卡到超时
      res.destroy();
    });
    res.on('close', () => {
      if (sent < total) stream.destroy();
      finish(sent >= total);
    });
    stream.pipe(res);
  }

  // ---------- websocket ----------

  onUpgrade(req, socket, head) {
    const host = req.headers.host || '';
    const url = new URL(req.url, `http://${host || 'localhost'}`);
    if (url.pathname !== '/ws' || !this.hostAllowed(req) || !this.originAllowed(req) || !this.authorized(req, url)) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    req.socket.setNoDelay(true);
    this.wss.handleUpgrade(req, socket, head, (ws) => {
      const ua = req.headers['user-agent'] || '';
      const device = deviceLabel(ua);
      const client = {
        id: crypto.randomBytes(4).toString('hex'),
        ws,
        device,
        kind: deviceKind(ua),
        alive: true,
        member: null,
        typing: false,
        ip: (req.socket.remoteAddress || '').replace('::ffff:', ''),
      };
      this.clients.add(client);
      ws.on('pong', () => {
        client.alive = true;
      });
      ws.on('message', (raw) => {
        try {
          this.onClientMessage(client, raw);
        } catch (err) {
          console.error('[ws] message failed', err.message);
        }
      });
      ws.on('close', () => {
        this.clients.delete(client);
        if (client.member) {
          if (client.typing) {
            const member = client.member;
            this.broadcast({ t: 'typing', id: member.id, name: member.name, on: false });
            this.emit('typing', { member: { id: member.id, name: member.name }, on: false });
          }
          this.room.touch(client.member.id);
          this.broadcastRoom();
        }
      });
      ws.on('error', () => {});
      const snapshot = this.rosterPayload();
      this.send(ws, {
        t: 'ready',
        app: 'nearsend',
        version: this.core.version || '',
        host: os.hostname(),
        url: this.core.getUrl(),
        room: snapshot.room,
        members: snapshot.members,
      });
    });
  }

  onClientMessage(client, raw) {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }

    if (data.t === 'hello') {
      this.joinClient(client, data);
      return;
    }
    if (data.t === 'ping') {
      this.send(client.ws, { t: 'pong', at: data.at || Date.now() });
      return;
    }
    // 旧版 Android 后台只读连接不发 hello；它们只收 msg 广播，不参与群成员
    if (!client.member) {
      if (data.t === 'text') {
        this.send(client.ws, { t: 'ack', cid: String(data.cid || ''), id: '', error: 'no identity' });
      }
      return;
    }

    const member = client.member;

    if (data.t === 'text') {
      const value = String(data.text || '').trim();
      const cid = String(data.cid || '');
      if (!value) {
        this.send(client.ws, { t: 'ack', cid, id: '', error: 'empty' });
        return;
      }
      // 手机刷新页面后 cid 可能重复：不能静默丢弃，要把原来那条回给它，
      // 否则气泡会永远停在「待发送」
      if (cid) {
        this.seenCid(cid);
        const dup = this.findBySrc(cid, member.id);
        if (dup) {
          this.send(client.ws, { t: 'msg', msg: dup });
          this.send(client.ws, { t: 'ack', cid, id: dup.id, duplicate: true, msg: dup });
          return;
        }
      }
      const msg = this.core.publish({
        from: 'phone',
        uid: member.id,
        author: this.authorOf(member),
        src: cid || client.id,
        kind: 'text',
        text: value.slice(0, 20000),
        mentions: this.mentionsFor(value, member.id),
        reply: this.cleanReply(data.reply),
      });
      this.send(client.ws, { t: 'ack', cid: cid || client.id, id: msg.id, msg });
      return;
    }

    if (data.t === 'typing') {
      client.typing = !!data.on;
      const frame = { t: 'typing', id: member.id, name: member.name, on: !!data.on };
      for (const c of this.clients) {
        if (c.member && c.ws.readyState === 1) this.send(c.ws, frame);
      }
      this.emit('typing', { member: { id: member.id, name: member.name }, on: !!data.on });
      return;
    }

    if (data.t === 'seen' && Array.isArray(data.ids)) {
      this.markSeen(member.id, data.ids);
      return;
    }

    if (data.t === 'delete' && typeof data.id === 'string') {
      const msg = this.core.get(data.id);
      if (!this.canEditMessage(msg, member)) {
        this.send(client.ws, { t: 'error', code: 'delete', message: '只能删除自己的消息' });
        return;
      }
      this.uploads.abort(data.id);
      this.forgetUpload(data.id);
      this.core.remove(data.id, false);
      return;
    }

    if (data.t === 'recall' && typeof data.id === 'string') {
      const msg = this.core.get(data.id);
      const can = this.canEditMessage(msg, member) && msg.status === 'ok' && !msg.recalled
        && Date.now() - Number(msg.ts || 0) <= RECALL_MS;
      if (!can) {
        this.send(client.ws, { t: 'error', code: 'recall', message: '撤回失败' });
        return;
      }
      this.core.patch(msg.id, { recalled: true }, true);
      return;
    }

    if (data.t === 'rename') {
      try {
        const result = this.renameMember(member.id, data.name);
        client.member = result.member;
        this.send(client.ws, { t: 'me', me: this.room.publicMember(result.member, true, false) });
      } catch (err) {
        this.send(client.ws, { t: 'error', code: err.code || 'rename', message: err.message });
      }
      return;
    }

    if (data.t === 'leave') {
      const leaving = this.room.leave(member.id);
      if (leaving) {
        this.publishSystem(`${leaving.name} 退出了群聊`, {
          event: 'leave',
          target: { id: leaving.id, name: leaving.name },
        });
      }
      for (const c of [...this.clients]) {
        if (!c.member || c.member.id !== member.id) continue;
        c.member = null;
        this.send(c.ws, { t: 'left' });
        try {
          c.ws.close(4004, 'left');
        } catch {
          /* ignore */
        }
      }
      this.broadcastRoom();
    }
  }

  joinClient(client, data) {
    if (client.member) return;
    const profile = data.member && typeof data.member === 'object' ? data.member : {};
    let result;
    try {
      result = this.room.join(profile, { locked: this.room.data.locked });
    } catch (err) {
      this.send(client.ws, {
        t: 'denied',
        code: err.code || 'identity',
        message: err.message || '无法加入群聊',
      });
      return;
    }

    client.member = result.member;
    client.kind = result.member.kind;
    const snapshot = this.rosterPayload();
    const me = this.room.publicMember(result.member, true, false);
    if (result.key) me.key = result.key;
    this.send(client.ws, {
      t: 'welcome',
      me,
      room: snapshot.room,
      members: snapshot.members,
      messages: this.core.history().map((m) => this.publicMessage(m)),
      url: this.core.getUrl(),
      serverTime: Date.now(),
    });
    this.broadcastRoom();
    if (result.created) {
      this.publishSystem(`${result.member.name} 加入了群聊`, {
        event: 'join',
        actor: { id: result.member.id, name: result.member.name },
      });
    }
  }

  canEditMessage(msg, member) {
    if (!msg || !member || msg.kind === 'system') return false;
    const uid = msg.uid || (msg.from === 'pc' ? 'host' : 'legacy');
    return uid === member.id;
  }

  send(ws, obj) {
    if (ws.readyState !== 1) return;
    try {
      ws.send(JSON.stringify(obj));
    } catch {
      /* 连接刚断开时 send 可能抛错，close 事件会负责清理 */
    }
  }

  /** 按客户端的 cid 找回已经落库的那条文字消息 */
  findBySrc(cid, uid) {
    if (!cid) return null;
    const list = this.core.history();
    for (let i = list.length - 1; i >= 0; i -= 1) {
      const m = list[i];
      if (!m || m.src !== cid || m.kind !== 'text' || m.status !== 'ok' || m.recalled) continue;
      if (uid && m.uid && m.uid !== uid) continue;
      return m;
    }
    return null;
  }

  /** cid 去重：同一部手机重连后重发，只算一次 */
  seenCid(cid) {
    const now = Date.now();
    if (this.recentCids.has(cid)) return true;
    this.recentCids.set(cid, now);
    if (this.recentCids.size > 400) {
      for (const [key, at] of this.recentCids) {
        if (now - at > 10 * 60 * 1000) this.recentCids.delete(key);
      }
    }
    return false;
  }

  /**
   * 引用信息以落库的原文为准，避免客户端伪造作者或原文。
   * 原文被删除时退回客户端给的展示字段。
   */
  cleanReply(reply) {
    if (!reply || typeof reply !== 'object') return undefined;
    const id = String(reply.id || '');
    if (!id || id.length > 64) return undefined;
    const src = this.core.get(id);
    // 只接受真实存在、未撤回的非系统消息；否则客户端可以伪造/复活引用
    if (!src || src.recalled || src.kind === 'system') return undefined;
    const out = { id };
    out.from = src.from === 'pc' ? 'pc' : 'phone';
    out.uid = src.uid || '';
    out.kind = src.kind === 'image' ? 'image' : src.kind === 'file' ? 'file' : 'text';
    if (src.author) {
      out.author = {
        id: String(src.author.id || '').slice(0, 32),
        name: plainName(src.author.name, '成员'),
        color: /^[a-z]{3,12}$/.test(String(src.author.color || '')) ? src.author.color : 'slate',
        kind: src.author.kind === 'phone' || src.author.kind === 'tablet' ? src.author.kind : 'desktop',
      };
    }
    if (out.kind === 'text') out.text = String(src.text || '').slice(0, 200);
    else out.name = String(src.name || '').slice(0, 200);
    return out;
  }

  /** 文件在本机的绝对路径只给桌面端；网页成员拿到 id 后走 /d/ 下载 */
  publicMessage(msg) {
    if (!msg || typeof msg !== 'object' || !msg.path) return msg;
    const copy = Object.assign({}, msg);
    delete copy.path;
    return copy;
  }

  broadcast(obj) {
    let out = obj;
    if (obj && obj.t === 'msg' && obj.msg) {
      out = Object.assign({}, obj, { msg: this.publicMessage(obj.msg) });
    } else if (obj && obj.t === 'msg:update' && obj.patch && obj.patch.path) {
      const patch = Object.assign({}, obj.patch);
      delete patch.path;
      out = Object.assign({}, obj, { patch });
    }
    const payload = JSON.stringify(out);
    for (const c of this.clients) {
      if (c.ws.readyState !== 1) continue;
      try {
        c.ws.send(payload);
      } catch {
        /* 单个连接失败不影响其他设备 */
      }
    }
  }

  onProgress({ id, offset, size }) {
    const now = Date.now();
    const last = this.lastProgress.get(id) || 0;
    const done = size && offset >= size;
    if (!done && now - last < 200) return;
    this.lastProgress.set(id, now);
    this.core.patch(id, { progress: size ? offset / size : 0 }, false);
  }

  sweep() {
    const stale = this.uploads.sweep ? this.uploads.sweep(5 * 60 * 1000) : [];
    for (const id of stale) {
      this.core.patch(id, { status: 'error' }, true);
      this.uploads.abort(id);
      this.uploadOwners.delete(id);
      this.lastProgress.delete(id);
    }
  }
}

module.exports = { LanServer, MIME };
