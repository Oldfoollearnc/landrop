'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');

const KEEP_IN_MEMORY = 500;
const COMPACT_AT = 1200;

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|avif|heic|heif)$/i;

function kindOf(mime, name) {
  if (mime && /^image\//i.test(mime)) return 'image';
  if (name && IMAGE_EXT.test(name)) return 'image';
  return 'file';
}

class Store extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
    this.list = [];
    this.byId = new Map();
  }

  load() {
    let raw = '';
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      return this;
    }
    const lines = raw.split('\n').filter(Boolean);
    for (const line of lines) {
      let ev;
      try {
        ev = JSON.parse(line);
      } catch {
        continue;
      }
      if (ev.op === 'add' && ev.msg) {
        this.list.push(ev.msg);
        this.byId.set(ev.msg.id, ev.msg);
      } else if (ev.op === 'patch' && ev.patch) {
        const m = this.byId.get(ev.id);
        if (m) Object.assign(m, ev.patch);
      } else if (ev.op === 'del') {
        this.dropLocal(ev.id);
      }
    }
    if (lines.length > COMPACT_AT) this.compact();
    return this;
  }

  append(ev) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, JSON.stringify(ev) + '\n');
    } catch (err) {
      console.error('[store] persist failed', err.message);
    }
  }

  compact() {
    const lines = this.list
      .slice(-KEEP_IN_MEMORY)
      .map((m) => JSON.stringify({ op: 'add', msg: m }));
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, lines.join('\n') + '\n');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[store] compact failed', err.message);
    }
  }

  messages() {
    return this.list.slice(-KEEP_IN_MEMORY);
  }

  get(id) {
    return this.byId.get(id);
  }

  add(partial) {
    const msg = Object.assign(
      {
        id: crypto.randomBytes(8).toString('hex'),
        ts: Date.now(),
        from: 'phone',
        kind: 'text',
        status: 'ok',
      },
      partial
    );
    this.list.push(msg);
    this.byId.set(msg.id, msg);
    if (this.list.length > KEEP_IN_MEMORY * 2) {
      this.list = this.list.slice(-KEEP_IN_MEMORY);
      this.compact();
    } else {
      this.append({ op: 'add', msg });
    }
    this.emit('msg', msg);
    return msg;
  }

  /**
   * persist=true 只在状态落定（ok/error）或字段永久有效时使用，
   * 进度条那种 200ms 一次的更新不写盘。
   */
  patch(id, changes, persist) {
    const msg = this.byId.get(id);
    if (!msg) return null;
    Object.assign(msg, changes);
    if (persist) this.append({ op: 'patch', id, patch: changes });
    this.emit('update', id, changes);
    return msg;
  }

  dropLocal(id) {
    const idx = this.list.findIndex((m) => m.id === id);
    if (idx >= 0) this.list.splice(idx, 1);
    this.byId.delete(id);
  }

  remove(id, purge) {
    const msg = this.byId.get(id);
    if (!msg) return false;
    if (purge && msg.path) {
      try {
        fs.unlinkSync(msg.path);
      } catch {
        /* 文件可能已被手动移走 */
      }
    }
    this.dropLocal(id);
    this.append({ op: 'del', id });
    this.emit('delete', id);
    return true;
  }

  clear(purgeFiles) {
    if (purgeFiles) {
      for (const m of this.list) {
        if (!m.path) continue;
        try {
          fs.unlinkSync(m.path);
        } catch {
          /* 忽略已被删除的文件 */
        }
      }
    }
    this.list = [];
    this.byId.clear();
    try {
      fs.writeFileSync(this.file, '');
    } catch (err) {
      console.error('[store] clear failed', err.message);
    }
    this.emit('clear');
  }
}

module.exports = { Store, kindOf };
