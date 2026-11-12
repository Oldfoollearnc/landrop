'use strict';
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const { WebSocketServer } = require('ws');
const netinfo = require('./netinfo');
const { kindOf } = require('./store');

const RENDERER = path.join(__dirname, '..', 'renderer');
const CHUNK_LIMIT = 16 * 1024 * 1024;

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

class LanServer extends EventEmitter {
  constructor({ core, uploads, token }) {
    super();
    this.core = core;
    this.uploads = uploads;
    this.tokenBuf = Buffer.from(token);
    this.port = 0;
    this.clients = new Set();
    this.lastProgress = new Map();

    this.server = http.createServer((req, res) => {
      this.route(req, res).catch((err) => {
        if (!res.headersSent) json(res, 500, { error: err.message });
        else res.destroy();
      });
    });
    this.server.headersTimeout = 30000;

    this.wss = new WebSocketServer({ noServer: true });
    this.server.on('upgrade', (req, socket, head) => this.onUpgrade(req, socket, head));

    // 手机断线重发时用 cid 去重，避免同一条文字出现两次
    this.recentCids = new Map();

    this.uploads.on('progress', (p) => this.onProgress(p));
    this.timer = setInterval(() => this.sweep(), 60 * 1000);
    this.hbTimer = setInterval(() => this.heartbeat(), 30 * 1000);
  }

  async start(preferred) {
    for (let p = preferred; p < preferred + 12; p += 1) {
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
    this.wss.close();
    this.server.close();
  }

  setToken(token) {
    this.tokenBuf = Buffer.from(token);
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
        return json(res, 200, {
          ok: true,
          app: 'nearsend',
          version: this.core.version || '',
          host: os.hostname(),
          messages: this.core.history(),
          theme: this.core.getTheme(),
          url: this.core.getUrl(),
        });
      }

      if (p === '/api/send/text' && req.method === 'POST') {
        const body = await readBody(req, 128 * 1024);
        const meta = JSON.parse(body.toString('utf8') || '{}');
        const value = String(meta.text || '').trim();
        if (!value) return json(res, 400, { error: 'text required' });
        const cid = String(meta.cid || '');
        if (cid && this.seenCid(cid)) return json(res, 200, { ok: true, duplicate: true });
        const msg = this.core.publish({
          from: 'phone',
          src: cid || ('api' + Date.now().toString(36)),
          kind: 'text',
          text: value.slice(0, 20000),
          reply: this.cleanReply(meta.reply),
        });
        return json(res, 200, { ok: true, id: msg.id });
      }

      if (p === '/api/clear' && req.method === 'POST') {
        this.core.clear();
        return json(res, 200, { ok: true });
      }

      if (p === '/api/upload/init' && req.method === 'POST') {
        const body = await readBody(req, 64 * 1024);
        const meta = JSON.parse(body.toString('utf8') || '{}');
        if (!meta.name) return json(res, 400, { error: 'name required' });
        const size = Number(meta.size) || 0;
        const session = await this.uploads.init(meta);
        this.core.publish({
          id: session.id,
          from: 'phone',
          src: String(meta.cid || ''),
          kind: kindOf(meta.mime, session.name),
          name: session.name,
          size,
          mime: meta.mime || '',
          status: 'uploading',
          progress: 0,
        });
        return json(res, 200, session);
      }

      const uploadMatch = p.match(/^\/api\/upload\/([a-f0-9]{16})$/);
      if (uploadMatch) {
        const id = uploadMatch[1];
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
        const file = await this.uploads.finish(id);
        this.core.patch(
          id,
          { path: file.path, name: file.name, size: file.size, status: 'ok', progress: 1 },
          true
        );
        return json(res, 200, { id, name: file.name, size: file.size });
      }

      const delMatch = p.match(/^\/api\/msg\/([a-f0-9]{16})$/);
      if (delMatch && req.method === 'DELETE') {
        const purge = url.searchParams.get('purge') === '1';
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
    const mime = msg.mime || MIME[ext] || 'application/octet-stream';
    const headers = {
      'Content-Type': mime,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'private, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    };
    if (!inline) {
      const ascii = (msg.name || path.basename(msg.path)).replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
      headers['Content-Disposition'] =
        `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(msg.name || path.basename(msg.path))}`;
    }

    const range = req.headers.range;
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (m) {
        let start = m[1] ? Number(m[1]) : 0;
        let end = m[2] ? Number(m[2]) : stat.size - 1;
        if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= stat.size) {
          res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` });
          return res.end();
        }
        end = Math.min(end, stat.size - 1);
        headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
        headers['Content-Length'] = end - start + 1;
        res.writeHead(206, headers);
        return fs.createReadStream(msg.path, { start, end }).pipe(res);
      }
    }

    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    fs.createReadStream(msg.path).pipe(res);
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
      const device = deviceLabel(req.headers['user-agent'] || '');
      const client = {
        id: crypto.randomBytes(4).toString('hex'),
        ws,
        device,
        alive: true,
        ip: (req.socket.remoteAddress || '').replace('::ffff:', ''),
      };
      this.clients.add(client);
      ws.on('pong', () => {
        client.alive = true;
      });
      ws.on('message', (raw) => this.onClientMessage(client, raw));
      ws.on('close', () => {
        this.clients.delete(client);
        this.broadcastPresence();
      });
      ws.on('error', () => {});
      this.send(ws, {
        t: 'init',
        id: client.id,
        host: os.hostname(),
        app: 'nearsend',
        version: this.core.version || '',
        messages: this.core.history(),
        theme: this.core.getTheme(),
        url: this.core.getUrl(),
      });
      this.broadcastPresence();
    });
  }

  onClientMessage(client, raw) {
    let data;
    try {
      data = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (data.t === 'text') {
      const value = String(data.text || '').trim();
      if (value) {
        const cid = String(data.cid || '');
        if (cid && this.seenCid(cid)) return;
        this.core.publish({
          from: 'phone',
          src: cid || client.id,
          kind: 'text',
          text: value.slice(0, 20000),
          reply: this.cleanReply(data.reply),
        });
      }
      return;
    }
    if (data.t === 'delete' && typeof data.id === 'string') {
      this.core.remove(data.id, false);
      return;
    }
    if (data.t === 'seen' && Array.isArray(data.ids)) {
      const now = Date.now();
      for (const id of data.ids.slice(0, 200)) {
        const msg = this.core.get(id);
        if (msg && msg.from === 'pc' && !msg.seen) this.core.patch(id, { seen: now }, true);
      }
      return;
    }
    if (data.t === 'theme' && (data.theme === 'dark' || data.theme === 'light')) {
      this.core.setTheme(data.theme);
    }
  }

  send(ws, obj) {
    if (ws.readyState === 1) ws.send(JSON.stringify(obj));
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

  /** 只接受引用消息的展示所需字段，避免手机端塞任意结构进来 */
  cleanReply(reply) {
    if (!reply || typeof reply !== 'object') return undefined;
    const id = String(reply.id || '');
    if (!id || id.length > 64) return undefined;
    const out = {
      id,
      from: reply.from === 'pc' ? 'pc' : 'phone',
      kind: reply.kind === 'image' ? 'image' : reply.kind === 'file' ? 'file' : 'text',
    };
    if (out.kind === 'text') out.text = String(reply.text || '').slice(0, 200);
    else out.name = String(reply.name || '').slice(0, 200);
    return out;
  }

  broadcast(obj) {
    const payload = JSON.stringify(obj);
    for (const c of this.clients) {
      if (c.ws.readyState === 1) c.ws.send(payload);
    }
  }

  broadcastPresence() {
    const devices = [...this.clients].map((c) => c.device);
    this.broadcast({ t: 'presence', n: this.clients.size, devices });
    this.emit('presence', devices);
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
      this.lastProgress.delete(id);
    }
  }
}

module.exports = { LanServer, MIME };
