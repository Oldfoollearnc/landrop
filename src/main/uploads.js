'use strict';
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const CHUNK_LIMIT = 16 * 1024 * 1024; // 单请求最大分片
const STALE_MS = 12 * 60 * 60 * 1000;

function safeName(input) {
  let n = String(input || 'file')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .trim()
    .replace(/[. ]+$/, '');
  if (!n) n = 'file';
  const stem = n.replace(/\.[^.]*$/, '');
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) n = '_' + n;
  if (n.length > 140) {
    const ext = path.extname(n).slice(0, 16);
    n = n.slice(0, 140 - ext.length) + ext;
  }
  return n;
}

function uniquePath(dir, name) {
  const { name: stem, ext } = path.parse(name);
  let candidate = path.join(dir, name);
  let i = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${stem} (${i})${ext}`);
    i += 1;
  }
  return candidate;
}

class Uploads extends EventEmitter {
  constructor(getSaveDir) {
    super();
    this.getSaveDir = getSaveDir;
    this.sessions = new Map();
    this.cleanup();
  }

  get incomingDir() {
    return path.join(this.getSaveDir(), '.incoming');
  }

  cleanup() {
    const dir = this.incomingDir;
    fs.readdir(dir, (err, names) => {
      if (err) return;
      const now = Date.now();
      for (const n of names) {
        const p = path.join(dir, n);
        fs.stat(p, (e, st) => {
          if (!e && now - st.mtimeMs > STALE_MS) fs.unlink(p, () => {});
        });
      }
    });
  }

  async init({ name, size, mime }) {
    const id = crypto.randomBytes(8).toString('hex');
    const dir = this.incomingDir;
    await fsp.mkdir(dir, { recursive: true });
    const tmpPath = path.join(dir, id + '.part');
    const fd = await fsp.open(tmpPath, 'w');
    const session = {
      id,
      name: safeName(name),
      size: Number(size) || 0,
      mime: mime || 'application/octet-stream',
      tmpPath,
      fd,
      offset: 0,
      chain: Promise.resolve(),
      touched: Date.now(),
    };
    this.sessions.set(id, session);
    return { id, offset: 0, name: session.name };
  }

  info(id) {
    const s = this.sessions.get(id);
    if (!s) return null;
    return { id, offset: s.offset, size: s.size, name: s.name, mime: s.mime };
  }

  /** 定点写入，串行化避免同一会话并发覆盖 */
  write(id, offset, buffer) {
    const s = this.sessions.get(id);
    if (!s) return Promise.reject(new Error('no such upload'));
    if (buffer.length > CHUNK_LIMIT) return Promise.reject(new Error('chunk too large'));
    if (s.size && offset + buffer.length > s.size) return Promise.reject(new Error('overflow'));

    const task = s.chain.then(async () => {
      // 客户端超时重发时，这一片可能已经落盘，直接确认进度
      if (offset + buffer.length <= s.offset) return s.offset;
      if (offset !== s.offset) throw new Error('offset mismatch: ' + s.offset);
      let written = 0;
      while (written < buffer.length) {
        const { bytesWritten } = await s.fd.write(
          buffer,
          written,
          buffer.length - written,
          offset + written
        );
        if (!bytesWritten) throw new Error('short write');
        written += bytesWritten;
      }
      s.offset = offset + buffer.length;
      s.touched = Date.now();
      this.emit('progress', { id, offset: s.offset, size: s.size });
      return s.offset;
    });

    s.chain = task.catch(() => {});
    return task;
  }

  async finish(id) {
    const s = this.sessions.get(id);
    if (!s) throw new Error('no such upload');
    await s.chain.catch(() => {});
    if (s.size && s.offset !== s.size) {
      throw new Error(`incomplete: ${s.offset}/${s.size}`);
    }
    await s.fd.close();
    const target = uniquePath(this.getSaveDir(), s.name);
    await fsp.rename(s.tmpPath, target);
    this.sessions.delete(id);
    return { path: target, name: path.basename(target), size: s.offset, mime: s.mime };
  }

  /** 返回长时间无写入的会话 id，交由上层标记为失败 */
  sweep(maxIdleMs) {
    const now = Date.now();
    const out = [];
    for (const [id, s] of this.sessions) {
      if (now - s.touched > maxIdleMs) out.push(id);
    }
    return out;
  }

  async abort(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    this.sessions.delete(id);
    try {
      await s.fd.close();
    } catch {
      /* ignore */
    }
    fs.unlink(s.tmpPath, () => {});
  }
}

module.exports = { Uploads, safeName, uniquePath };
