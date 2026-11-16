'use strict';
/**
 * 局域网群聊的房间真源。
 *
 * 房间文件只保存「谁在群里、群叫什么、谁被移出」；
 * 消息仍然由 Store 负责（加密落盘），在线状态由 WebSocket 连接推导。
 * 成员 key 明文只存在客户端，这里只存 SHA-256，避免房间文件被拷走后可直接冒名。
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const VERSION = 1;
const MAX_MEMBERS = 64;
const NAME_MAX = 16;
const ROOM_NAME_MAX = 24;
const COLORS = ['sky', 'mint', 'amber', 'rose', 'violet', 'lime', 'coral', 'slate'];
const KINDS = new Set(['phone', 'tablet', 'desktop']);

class RoomError extends Error {
  constructor(code, message) {
    super(message || code);
    this.code = code;
  }
}

function hashKey(key) {
  return crypto.createHash('sha256').update(String(key)).digest('hex');
}

/** 成员昵称不允许空白：@ 提名的解析要足够简单、可靠 */
function cleanName(input, fallback) {
  const s = String(input == null ? '' : input)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ')
    .replace(/[\s\u3000]+/g, '')
    .trim();
  const chars = Array.from(s || fallback || '成员');
  return chars.slice(0, NAME_MAX).join('');
}

function cleanRoomName(input) {
  const s = String(input == null ? '' : input)
    .replace(/[\u0000-\u001f\u007f\u200b-\u200f\u2028\u2029]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return Array.from(s).slice(0, ROOM_NAME_MAX).join('') || '近传群聊';
}

function colorFor(name, requested) {
  if (COLORS.includes(requested)) return requested;
  let h = 0;
  for (const ch of Array.from(String(name || ''))) h = (h * 31 + ch.codePointAt(0)) >>> 0;
  return COLORS[h % COLORS.length];
}

function kindFor(kind) {
  return KINDS.has(kind) ? kind : 'desktop';
}

function uniqueName(base, taken) {
  const name = cleanName(base, '成员');
  if (!taken.has(name)) return name;
  for (let i = 2; i < 100; i += 1) {
    const candidate = Array.from(name).slice(0, NAME_MAX - String(i).length - 1).join('') + '·' + i;
    if (!taken.has(candidate)) return candidate;
  }
  return Array.from(name).slice(0, NAME_MAX - 5).join('') + '·' + crypto.randomBytes(2).toString('hex');
}

function defaultData() {
  const now = Date.now();
  return {
    v: VERSION,
    name: '近传群聊',
    createdAt: now,
    locked: false,
    host: {
      id: 'host',
      name: '我的电脑',
      color: 'sky',
      kind: 'desktop',
      joinedAt: now,
    },
    members: {},
    blocked: [],
  };
}

class Room {
  constructor(file) {
    this.file = file;
    this.data = null;
    this.created = false;
  }

  load() {
    let raw = '';
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch {
      /* 第一次启动还没有房间文件 */
    }

    if (raw) {
      try {
        this.data = this.normalize(JSON.parse(raw));
        this.save();
        return this;
      } catch (err) {
        console.error('[room] 房间文件损坏，已备份并重建:', err.message);
        try {
          fs.renameSync(this.file, `${this.file}.bad-${Date.now()}`);
        } catch {
          /* ignore */
        }
      }
    }

    this.created = true;
    this.data = defaultData();
    this.save();
    return this;
  }

  normalize(input) {
    const base = defaultData();
    if (!input || typeof input !== 'object') return base;
    const out = {
      v: VERSION,
      name: cleanRoomName(input.name),
      createdAt: Number(input.createdAt) || base.createdAt,
      locked: !!input.locked,
      host: Object.assign({}, base.host),
      members: {},
      blocked: [],
    };

    const h = input.host && typeof input.host === 'object' ? input.host : {};
    out.host = {
      id: 'host',
      name: cleanName(h.name, base.host.name),
      color: colorFor(h.name, h.color),
      kind: 'desktop',
      joinedAt: Number(h.joinedAt) || base.createdAt,
    };

    const used = new Set([out.host.name]);
    const members = input.members && typeof input.members === 'object' ? input.members : {};
    for (const raw of Object.values(members)) {
      if (!raw || typeof raw !== 'object') continue;
      const id = String(raw.id || '');
      if (!/^[a-f0-9]{8,32}$/.test(id) || id === 'host' || out.members[id]) continue;
      const keyHash = String(raw.keyHash || '');
      if (!/^[a-f0-9]{64}$/.test(keyHash)) continue;
      const name = uniqueName(raw.name, used);
      used.add(name);
      out.members[id] = {
        id,
        name,
        color: colorFor(name, raw.color),
        kind: kindFor(raw.kind),
        joinedAt: Number(raw.joinedAt) || Date.now(),
        lastSeen: Number(raw.lastSeen) || Date.now(),
        keyHash,
      };
    }

    if (Array.isArray(input.blocked)) {
      const seen = new Set();
      for (const item of input.blocked.slice(-500)) {
        const id = String((item && item.id) || '');
        if (!/^[a-f0-9]{8,32}$/.test(id) || id === 'host' || seen.has(id)) continue;
        seen.add(id);
        const entry = {
          id,
          name: cleanName(item.name, '成员'),
          at: Number(item.at) || Date.now(),
        };
        // 保留被封禁成员的身份材料，群主点「恢复」后原来的设备还能凭 key 回来
        if (/^[a-f0-9]{64}$/.test(String(item.keyHash || ''))) {
          entry.keyHash = String(item.keyHash);
          entry.color = colorFor(item.name, item.color);
          entry.kind = kindFor(item.kind);
          entry.joinedAt = Number(item.joinedAt) || entry.at;
          entry.lastSeen = Number(item.lastSeen) || entry.at;
        }
        out.blocked.push(entry);
      }
    }

    return out;
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[room] 保存失败', err.message);
    }
  }

  get host() {
    return this.data.host;
  }

  keyMatches(member, key) {
    if (!member || !key) return false;
    const given = Buffer.from(hashKey(key), 'hex');
    const saved = Buffer.from(member.keyHash, 'hex');
    return given.length === saved.length && crypto.timingSafeEqual(given, saved);
  }

  isBlocked(id) {
    return this.data.blocked.some((m) => m.id === id);
  }

  member(id) {
    if (!id || id === 'host') return null;
    return this.data.members[id] || null;
  }

  auth(id, key) {
    const member = this.member(id);
    return this.keyMatches(member, key) ? member : null;
  }

  takenNames(exceptId) {
    const names = new Set([this.data.host.name]);
    for (const m of Object.values(this.data.members)) {
      if (m.id !== exceptId) names.add(m.name);
    }
    return names;
  }

  uniqueMemberName(name, exceptId) {
    return uniqueName(name, this.takenNames(exceptId));
  }

  uniqueHostName(name) {
    return uniqueName(name, new Set(Object.values(this.data.members).map((m) => m.name)));
  }

  /** 首入 / 重连。lock 只拦截新成员，老成员凭 key 仍能回来。 */
  join(profile, { locked } = {}) {
    const isLocked = locked === undefined ? this.data.locked : !!locked;
    const p = profile && typeof profile === 'object' ? profile : {};
    const id = String(p.id || '');
    const key = String(p.key || '');

    if (id === 'host') throw new RoomError('identity', '不能使用群主身份');

    if (id) {
      if (!/^[a-f0-9]{8,32}$/.test(id)) throw new RoomError('identity', '身份已失效，请重新加入');
      if (this.isBlocked(id)) throw new RoomError('blocked', '你已被移出群聊');
      const existing = this.member(id);
      if (!existing || !this.keyMatches(existing, key)) {
        throw new RoomError('identity', '身份已失效，请重新加入');
      }
      const nextName = p.name ? this.uniqueMemberName(cleanName(p.name, existing.name), id) : existing.name;
      const renamed = nextName !== existing.name;
      existing.name = nextName;
      existing.color = colorFor(nextName, p.color || existing.color);
      existing.kind = p.kind ? kindFor(p.kind) : existing.kind;
      existing.lastSeen = Date.now();
      this.save();
      return { member: existing, key: null, created: false, renamed };
    }

    if (isLocked) throw new RoomError('locked', '群聊已锁定，暂时无法加入');
    if (Object.keys(this.data.members).length >= MAX_MEMBERS - 1) {
      throw new RoomError('full', '群成员已满');
    }

    const memberId = crypto.randomBytes(6).toString('hex');
    const memberKey = crypto.randomBytes(18).toString('base64url');
    const name = this.uniqueMemberName(cleanName(p.name, '成员'));
    const member = {
      id: memberId,
      name,
      color: colorFor(name, p.color),
      kind: kindFor(p.kind),
      joinedAt: Date.now(),
      lastSeen: Date.now(),
      keyHash: hashKey(memberKey),
    };
    this.data.members[memberId] = member;
    this.save();
    return { member, key: memberKey, created: true, renamed: false };
  }

  renameMember(id, name) {
    if (id === 'host') return this.renameHost(name);
    const member = this.member(id);
    if (!member) throw new RoomError('notfound', '成员不存在');
    const oldName = member.name;
    member.name = this.uniqueMemberName(cleanName(name, member.name), id);
    this.save();
    return { member, oldName, renamed: oldName !== member.name };
  }

  renameHost(name) {
    const oldName = this.data.host.name;
    this.data.host.name = this.uniqueHostName(cleanName(name, oldName));
    this.save();
    return { member: this.data.host, oldName, renamed: oldName !== this.data.host.name };
  }

  setName(name) {
    const oldName = this.data.name;
    this.data.name = cleanRoomName(name);
    this.save();
    return oldName !== this.data.name;
  }

  setLocked(locked) {
    this.data.locked = !!locked;
    this.save();
    return this.data.locked;
  }

  touch(id) {
    const member = this.member(id);
    if (!member) return;
    member.lastSeen = Date.now();
    this.save();
  }

  kick(id) {
    const member = this.member(id);
    if (!member) throw new RoomError('notfound', '成员不存在');
    delete this.data.members[id];
    if (!this.isBlocked(id)) {
      this.data.blocked.push({
        id,
        name: member.name,
        at: Date.now(),
        keyHash: member.keyHash,
        color: member.color,
        kind: member.kind,
        joinedAt: member.joinedAt,
        lastSeen: member.lastSeen,
      });
      if (this.data.blocked.length > 500) this.data.blocked = this.data.blocked.slice(-500);
    }
    this.save();
    return member;
  }

  unblock(id) {
    const item = this.data.blocked.find((m) => m.id === id);
    if (!item) return false;
    this.data.blocked = this.data.blocked.filter((m) => m.id !== id);
    // 封禁期间原 key 还保留着：恢复后老设备重连即可回到原来的身份
    if (item.keyHash && !this.data.members[id]) {
      const name = this.uniqueMemberName(item.name, id);
      this.data.members[id] = {
        id,
        name,
        keyHash: item.keyHash,
        color: colorFor(name, item.color),
        kind: kindFor(item.kind),
        joinedAt: item.joinedAt || Date.now(),
        lastSeen: item.lastSeen || Date.now(),
      };
    }
    this.save();
    return true;
  }

  leave(id) {
    const member = this.member(id);
    if (!member) return null;
    delete this.data.members[id];
    this.save();
    return member;
  }

  publicMember(member, online, isHost) {
    return {
      id: isHost ? 'host' : member.id,
      name: member.name,
      color: member.color,
      kind: isHost ? 'desktop' : member.kind,
      isHost: !!isHost,
      online: !!online,
      joinedAt: member.joinedAt,
      lastSeen: member.lastSeen || member.joinedAt,
    };
  }

  info(onlineSet) {
    const online = onlineSet || new Set();
    let onlineCount = 1; // 群主电脑运行即在线
    for (const m of Object.values(this.data.members)) {
      if (online.has(m.id)) onlineCount += 1;
    }
    return {
      name: this.data.name,
      locked: this.data.locked,
      createdAt: this.data.createdAt,
      host: {
        id: 'host',
        name: this.data.host.name,
        color: this.data.host.color,
        kind: 'desktop',
      },
      memberCount: 1 + Object.keys(this.data.members).length,
      onlineCount,
    };
  }

  roster(onlineSet) {
    const online = onlineSet || new Set();
    const host = this.publicMember(this.data.host, true, true);
    const members = Object.values(this.data.members)
      .map((m) => this.publicMember(m, online.has(m.id), false))
      .sort((a, b) => {
        if (a.online !== b.online) return a.online ? -1 : 1;
        if (a.online) return a.name.localeCompare(b.name, 'zh');
        return b.lastSeen - a.lastSeen;
      });
    return [host, ...members];
  }

  blockedList() {
    return this.data.blocked
      .slice()
      .sort((a, b) => b.at - a.at)
      .map((m) => ({ id: m.id, name: m.name, at: m.at }));
  }
}

module.exports = { Room, RoomError, COLORS, MAX_MEMBERS };
