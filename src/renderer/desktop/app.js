'use strict';

const $ = (id) => document.getElementById(id);
const appEl = $('app');
const chat = $('chat');
const input = $('input');
const btnSend = $('btnSend');

const ICON = {
  copy: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"><rect x="5.6" y="5.6" width="7" height="7" rx="1.6"/><path d="M10.4 5.6V4.2A1.6 1.6 0 0 0 8.8 2.6H4.2A1.6 1.6 0 0 0 2.6 4.2v4.6a1.6 1.6 0 0 0 1.6 1.6h1.4"/></svg>',
  open: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M6.4 3.4H4.2A1.6 1.6 0 0 0 2.6 5v6.8A1.6 1.6 0 0 0 4.2 13.4H11a1.6 1.6 0 0 0 1.6-1.6V9.6"/><path d="M9.2 2.6h4.2v4.2M13.4 2.6L7.8 8.2" stroke-linecap="round"/></svg>',
  folder: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M2.6 5.4A1.6 1.6 0 0 1 4.2 3.8h2l1.3 1.6h4.3a1.6 1.6 0 0 1 1.6 1.6v4.2a1.6 1.6 0 0 1-1.6 1.6H4.2a1.6 1.6 0 0 1-1.6-1.6z"/></svg>',
  save: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2.8v6.6M5.4 6.8L8 9.4l2.6-2.6M3.4 12.6h9.2"/></svg>',
  trash: '<svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"><path d="M3.6 4.6h8.8M6 4.6V3.2h4v1.4M5 4.6l.5 8h5l.5-8"/></svg>',
  max: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4.2" y="4.2" width="7.6" height="7.6" rx="1.8"/></svg>',
  restore: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2.8" y="5.6" width="7.6" height="7.6" rx="1.7"/><path d="M6.6 5.6V3.9a1 1 0 0 1 1-1h3.9a1 1 0 0 1 1 1v3.9a1 1 0 0 1-1 1h-1.7"/></svg>',
};

const TICK = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 6.3l2.3 2.3 4.9-5.2"/></svg>';

const EMOJIS = [
  '😀', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉',
  '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪',
  '🤨', '🧐', '🤓', '😎', '🥳', '😏', '😒', '😞', '😔', '😟', '😕', '🙁',
  '😣', '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯',
  '😳', '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫',
  '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧', '😮', '😲', '🥱', '😴',
  '🤤', '😪', '😵', '🤐', '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '👍',
  '👎', '👌', '✌️', '🤞', '🤟', '🤘', '👏', '🙌', '🤝', '🙏', '💪', '👋',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💔', '💯', '✨', '🎉',
  '🔥', '⭐', '🌹', '🍀', '☕', '🍺', '🎂', '🧧', '🚀', '✅', '❌', '⚠️',
];

let state = null;
let view = 'connect';
let theme = 'dark';
let font = 'm';
let isFull = false;
let pinned = true;
let soundOn = true;
let currentUrl = '';
let currentQr = '';
let devices = [];
let room = { name: '近传群聊', host: { id: 'host', name: '我的电脑', color: 'sky', kind: 'desktop' }, onlineCount: 1, memberCount: 1 };
let members = [];
let blocked = [];
let me = { id: 'host', name: '我的电脑', color: 'sky', kind: 'desktop' };
let sideOpen = false;
let lastOnlineIds = new Set();
const typingMap = new Map();
let promptResolve = null;
let replyTo = null;
const mentionState = { open: false, items: [], index: 0, start: -1 };
const COLORS = ['sky', 'mint', 'amber', 'rose', 'violet', 'lime', 'coral', 'slate'];
let loaded = [];
const byId = new Map();
const nodes = new Map();
let lastTs = 0;
let lastFrom = '';
let stick = true;
let syncing = false;
let pendingNew = 0;
let searchMode = false;
let searchQuery = '';
let multiMode = false;
let rendering = false;
const picked = new Set();
let draftTimer = null;
let lastConnectAt = 0;
let pulseTimer = null;
let confirmResolve = null;
const speed = new Map();
let typingHideTimer = null;
let typingStopTimer = null;
let lastTypingSent = 0;
const RECALL_MS = 2 * 60 * 1000;

// ---------- 工具 ----------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

// ---------- 群成员 ----------

function memberById(id) {
  return members.find((m) => m && m.id === id) || null;
}

function authorOf(m) {
  if (!m) return { id: '', name: '成员', color: 'slate', kind: 'phone', online: false };
  const live = m.author && memberById(m.author.id);
  if (live) return live;
  if (m.author) return m.author;
  if (m.uid === 'host' || m.from === 'pc') return room.host || me;
  return { id: 'legacy', name: '成员', color: 'slate', kind: 'phone', online: false };
}

function isMine(m) {
  if (!m) return false;
  if (m.uid) return m.uid === 'host';
  return m.from === 'pc';
}

function avatarEl(person, small) {
  const el = document.createElement('span');
  el.className = 'av' + (small ? ' sm' : '');
  el.dataset.c = person && person.color ? person.color : 'slate';
  const chars = Array.from(String((person && person.name) || '?'));
  el.textContent = chars.length ? chars[0] : '?';
  return el;
}

function readCount(m) {
  if (!m) return 0;
  if (Array.isArray(m.seenBy)) return m.seenBy.length;
  return m.seen ? 1 : 0;
}

function readByMe(m) {
  if (!m) return false;
  return Array.isArray(m.seenBy) ? m.seenBy.includes('host') : !!m.seen;
}

function kindLabel(kind) {
  return kind === 'phone' ? '手机' : kind === 'tablet' ? '平板' : '电脑';
}

function lastSeenText(ts) {
  const diff = Date.now() - Number(ts || 0);
  if (!ts || diff < 0) return '离线';
  if (diff < 60e3) return '刚刚在线';
  if (diff < 3600e3) return Math.floor(diff / 60e3) + ' 分钟前';
  if (diff < 86400e3) return Math.floor(diff / 3600e3) + ' 小时前';
  const d = new Date(ts);
  return `${d.getMonth() + 1}月${d.getDate()}日`;
}

function fmtSize(n) {
  const v = Number(n) || 0;
  if (v < 1024) return v + ' B';
  const u = ['KB', 'MB', 'GB', 'TB'];
  let i = -1;
  let x = v;
  do {
    x /= 1024;
    i += 1;
  } while (x >= 1024 && i < u.length - 1);
  return (x < 10 ? x.toFixed(1) : Math.round(x)) + ' ' + u[i];
}

function fmtTime(ts) {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function hostOf(url) {
  return String(url || '').replace(/^https?:\/\//, '').split('/')[0];
}

function shortDir(p) {
  const parts = String(p || '').split(/[\\/]/).filter(Boolean);
  if (parts.length <= 2) return p || '—';
  return parts.slice(-2).join('\\');
}

function extLabel(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  return m ? m[1].toUpperCase() : 'FILE';
}

function toast(msg) {
  const el = $('toast');
  el.textContent = msg;
  el.classList.add('on');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('on'), 1600);
}

// ---------- 声音 ----------

let audioCtx = null;

function audio() {
  if (!audioCtx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    try {
      audioCtx = new Ctx();
    } catch {
      return null;
    }
  }
  if (audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
  return audioCtx;
}

function tone(freq, dur, delay, gain) {
  const ctx = audio();
  if (!ctx) return;
  const t0 = ctx.currentTime + (delay || 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g);
  g.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.03);
}

const SOUND = {
  connect() {
    tone(659, 0.14, 0, 0.05);
    tone(988, 0.2, 0.1, 0.042);
  },
  recv() {
    tone(587, 0.1, 0, 0.042);
  },
  send() {
    tone(880, 0.06, 0, 0.026);
  },
};

function play(name) {
  if (!soundOn) return;
  try {
    SOUND[name]();
  } catch {
    /* 音频上下文不可用时静默 */
  }
}

function hideTyping() {
  const el = $('typing');
  if (el) el.hidden = true;
  typingMap.clear();
  clearTimeout(typingHideTimer);
  typingHideTimer = null;
}

function renderTyping() {
  const now = Date.now();
  for (const [id, item] of typingMap) {
    if (!item || item.until <= now) typingMap.delete(id);
  }
  const el = $('typing');
  if (!el) return;
  clearTimeout(typingHideTimer);
  typingHideTimer = null;
  const names = [...typingMap.values()].map((x) => x.name).filter(Boolean);
  if (!names.length) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  $('typingText').textContent = names.length === 1
    ? `${names[0]} 正在输入`
    : names.length === 2
      ? `${names[0]}、${names[1]} 正在输入`
      : `${names.length} 人正在输入`;
  typingHideTimer = setTimeout(renderTyping, 1600);
}

function setTyping(id, name, on) {
  if (!id) return;
  if (on) typingMap.set(id, { name: name || '成员', until: Date.now() + 5000 });
  else typingMap.delete(id);
  renderTyping();
}

function sendTyping(on) {
  clearTimeout(typingStopTimer);
  typingStopTimer = null;
  if (on) {
    const now = Date.now();
    if (now - lastTypingSent < 1800) return;
    lastTypingSent = now;
    api.typing(true);
    typingStopTimer = setTimeout(() => sendTyping(false), 2500);
  } else {
    const wasActive = !!lastTypingSent;
    lastTypingSent = 0;
    if (wasActive) api.typing(false);
  }
}

// ---------- 视图 ----------

function matchQuery(m, q) {
  if (!q || m.recalled || m.kind === 'system') return false;
  const who = authorOf(m);
  return !!(
    (m.text && m.text.toLowerCase().includes(q))
    || (m.name && m.name.toLowerCase().includes(q))
    || (who && who.name && who.name.toLowerCase().includes(q))
  );
}

function currentList() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return loaded;
  return loaded.filter((m) => matchQuery(m, q));
}

function updateChrome() {
  const inSettings = view === 'settings';
  $('brand').hidden = inSettings;
  $('tbTitle').hidden = !inSettings;
  $('btnBack').hidden = !inSettings;
  // 设置入口在两种尺寸、所有视图都保留；已在设置页时不需要重复入口
  $('btnGear').hidden = inSettings;
  $('btnSearch').hidden = !(isFull && view === 'chat');
  $('dot').classList.toggle('on', devices.length > 0);
}

function setView(next) {
  if (view === next) {
    if (next === 'chat') renderAll(currentList());
    return;
  }
  view = next;
  appEl.dataset.view = next;
  if (next !== 'chat') {
    closeEmoji();
    closeSide();
  }
  updateChrome();
  if (next === 'chat') renderAll(currentList());
  if (next === 'settings') fillSettings();
}

function targetView() {
  const hasChat = loaded.some((m) => m.kind !== 'system');
  return (!hasChat && !devices.length) ? 'connect' : 'chat';
}

function syncView() {
  if (view === 'settings') return;
  const next = targetView();
  const hasChat = loaded.some((m) => m.kind !== 'system');
  appEl.classList.toggle('offline', devices.length === 0 && hasChat);
  if (next !== view) setView(next);
}

// ---------- 群聊外壳 ----------

let roomReady = false;

function applyRoomPayload(p, initial) {
  if (!p) return;
  if (p.room) room = p.room;
  if (Array.isArray(p.members)) members = p.members;
  if (Array.isArray(p.blocked)) blocked = p.blocked;
  me = Object.assign({ id: 'host', kind: 'desktop' }, room.host || me);
  devices = members.filter((m) => m.online && !m.isHost).map((m) => m.name);
  if (!devices.length) hideTyping();

  const nextOnline = new Set(members.filter((m) => m.online).map((m) => m.id));
  let incoming = [];
  if (roomReady && !initial) {
    incoming = [...nextOnline].filter((id) => !lastOnlineIds.has(id) && id !== 'host');
  }
  lastOnlineIds = nextOnline;

  updateChrome();
  renderRoomBar();
  renderRoomSide();
  if (view === 'settings') fillSettings();
  const hasChat = loaded.some((m) => m.kind !== 'system');
  appEl.classList.toggle('offline', devices.length === 0 && hasChat);
  if (!devices.length) {
    $('cbarText').textContent = hasChat ? '还没有其他成员在线' : '扫码邀请成员加入';
  }
  syncView();

  if (incoming.length) {
    const first = memberById(incoming[0]);
    const name = (first && first.name) || '新成员';
    if (view === 'connect') {
      playConnect(name);
    } else if (Date.now() - lastConnectAt > 15000) {
      play('connect');
      toast(`${name} 加入了群聊`);
      pulseDot();
      lastConnectAt = Date.now();
    }
  }
  roomReady = true;
}

function renderRoomBar() {
  if (!$('rbName')) return;
  $('rbName').textContent = room.name || '近传群聊';
  const total = room.memberCount || members.length || 1;
  const online = room.onlineCount || members.filter((m) => m.online).length || 1;
  $('rbSub').textContent = `${online} 人在线${online < total ? ` · ${total} 位成员` : ''}${room.locked ? ' · 已锁定' : ''}`;
  const stack = $('rbStack');
  stack.textContent = '';
  const onlineList = members.filter((m) => m && m.online);
  for (const m of onlineList.slice(0, 3)) stack.appendChild(avatarEl(m, true));
  if (onlineList.length > 3) {
    const more = document.createElement('span');
    more.className = 'rbmore';
    more.textContent = '+' + (onlineList.length - 3);
    stack.appendChild(more);
  }
  stack.title = onlineList.map((m) => m.name).join('、');
  $('qrRoom').textContent = room.name || '近传群聊';
  $('setRoomName').textContent = room.name || '近传群聊';
  $('setHostName').textContent = (room.host && room.host.name) || '我的电脑';
  $('setRoomMeta').textContent = `${online} 人在线 · ${total} 位成员`;
  $('setLock').classList.toggle('on', !!room.locked);
  $('setLock').setAttribute('aria-checked', room.locked ? 'true' : 'false');
}

function sideMemberRow(m) {
  const row = document.createElement('div');
  row.className = 'rs-row' + (m.online ? ' on' : '');
  row.appendChild(avatarEl(m));
  const info = document.createElement('div');
  info.className = 'rs-info';
  const line = document.createElement('div');
  line.className = 'rs-line';
  const name = document.createElement('b');
  name.textContent = m.name;
  line.appendChild(name);
  if (m.isHost) {
    const b = document.createElement('i');
    b.className = 'rs-badge host';
    b.textContent = '群主';
    line.appendChild(b);
  }
  info.appendChild(line);
  const sub = document.createElement('span');
  sub.className = 'rs-sub';
  sub.textContent = m.isHost
    ? '群主电脑 · 在线'
    : m.online
      ? `${kindLabel(m.kind)} · 在线`
      : `${kindLabel(m.kind)} · ${lastSeenText(m.lastSeen)}`;
  info.appendChild(sub);
  row.appendChild(info);
  const dot = document.createElement('span');
  dot.className = 'rs-dot' + (m.online ? ' on' : '');
  row.appendChild(dot);
  row.addEventListener('click', () => {
    const r = row.getBoundingClientRect();
    const items = [];
    if (m.isHost) {
      items.push({ label: '修改我的昵称', run: () => renameHost() });
    } else {
      items.push({ label: '@ 提到他', run: () => insertMention(m.name) });
      items.push({ label: '复制昵称', run: () => api.copyText(m.name) });
      items.push({ sep: true });
      items.push({ label: '移出群聊', danger: true, run: () => kickMember(m) });
    }
    openCtx(r.right, r.bottom, items);
  });
  return row;
}

function renderRoomSide() {
  const body = $('rsBody');
  if (!body) return;
  body.textContent = '';

  const card = document.createElement('div');
  card.className = 'rs-card';
  const mark = document.createElement('span');
  mark.className = 'rs-mark';
  mark.textContent = '群';
  card.appendChild(mark);
  const info = document.createElement('div');
  const rn = document.createElement('b');
  rn.textContent = room.name || '近传群聊';
  const rs = document.createElement('span');
  rs.textContent = `${room.onlineCount || 1} 人在线 · ${room.memberCount || 1} 位成员`;
  info.appendChild(rn);
  info.appendChild(rs);
  card.appendChild(info);
  body.appendChild(card);

  const invite = document.createElement('div');
  invite.className = 'rs-invite';
  if (currentQr) {
    const img = document.createElement('img');
    img.src = currentQr;
    img.alt = '邀请二维码';
    invite.appendChild(img);
    const tip = document.createElement('span');
    tip.textContent = '扫码加入群聊';
    invite.appendChild(tip);
    const copy = document.createElement('button');
    copy.className = 'rs-copy';
    copy.textContent = '复制邀请链接';
    copy.addEventListener('click', () => {
      api.copyText(currentUrl);
      toast('邀请链接已复制');
    });
    invite.appendChild(copy);
  } else {
    const tip = document.createElement('span');
    tip.textContent = '正在生成邀请二维码…';
    invite.appendChild(tip);
  }
  body.appendChild(invite);

  const online = members.filter((m) => m && m.online);
  const offline = members.filter((m) => m && !m.online);
  const section = (title, list) => {
    if (!list.length) return;
    const h = document.createElement('div');
    h.className = 'rs-sec';
    h.textContent = `${title} · ${list.length}`;
    body.appendChild(h);
    for (const m of list) body.appendChild(sideMemberRow(m));
  };
  section('在线', online);
  section('离线', offline);

  if (blocked.length) {
    const h = document.createElement('div');
    h.className = 'rs-sec';
    h.textContent = `已移出 · ${blocked.length}`;
    body.appendChild(h);
    for (const b of blocked) {
      const row = document.createElement('div');
      row.className = 'rs-row banned';
      const name = document.createElement('span');
      name.className = 'rs-banned';
      name.textContent = b.name;
      row.appendChild(name);
      const btn = document.createElement('button');
      btn.className = 'rs-restore';
      btn.textContent = '恢复';
      btn.addEventListener('click', async () => {
        const p = await api.roomUnblock(b.id);
        applyRoomPayload(p);
        toast(`${b.name} 可以重新加入了`);
      });
      row.appendChild(btn);
      body.appendChild(row);
    }
  }
}

function openSide() {
  sideOpen = true;
  appEl.classList.add('side-open');
  if (appEl.dataset.mode === 'compact') $('sideScrim').hidden = false;
  renderRoomSide();
}

function closeSide() {
  sideOpen = false;
  appEl.classList.remove('side-open');
  $('sideScrim').hidden = true;
}

function toggleSide() {
  if (sideOpen) closeSide();
  else openSide();
}

async function kickMember(m) {
  const ok = await askConfirm(`把「${m.name}」移出群聊？对方可以换新身份重新加入。`, '移出');
  if (!ok) return;
  const p = await api.roomKick(m.id);
  applyRoomPayload(p);
  toast(`${m.name} 已被移出`);
}

async function renameHost() {
  const name = await openPrompt('我的昵称', (room.host && room.host.name) || '我的电脑', 16);
  if (!name) return;
  const p = await api.roomHostName(name);
  applyRoomPayload(p);
}

async function openPrompt(title, value, maxLength) {
  $('promptTitle').textContent = title;
  const inputEl = $('promptInput');
  inputEl.maxLength = maxLength || 24;
  inputEl.value = value || '';
  $('promptWrap').hidden = false;
  return new Promise((resolve) => {
    promptResolve = resolve;
    setTimeout(() => {
      inputEl.focus();
      inputEl.select();
    }, 40);
  });
}

function closePrompt(value) {
  $('promptWrap').hidden = true;
  const resolve = promptResolve;
  promptResolve = null;
  if (resolve) resolve(value == null ? null : String(value));
}

async function openInvite() {
  $('inviteWrap').hidden = false;
  $('inviteQr').removeAttribute('src');
  if (!currentQr) {
    const inv = await api.roomInvite();
    if (inv && inv.qr) {
      currentQr = inv.qr;
      currentUrl = inv.url || currentUrl;
      applyUrl(currentUrl, currentQr);
    }
  }
  if (currentQr) $('inviteQr').src = currentQr;
  else $('inviteQr').removeAttribute('src');
  $('inviteUrl').textContent = currentUrl || '';
}


// ---------- 连接动画 ----------

function pulseDot() {
  const dot = $('dot');
  dot.classList.remove('pulse');
  void dot.offsetWidth;
  dot.classList.add('pulse');
  clearTimeout(pulseTimer);
  pulseTimer = setTimeout(() => dot.classList.remove('pulse'), 900);
}

function playConnect(name) {
  const flash = $('flash');
  $('flashName').textContent = `${name} 加入了群聊`;
  flash.classList.add('show');
  void flash.offsetHeight;
  flash.classList.add('on');
  play('connect');
  setTimeout(() => setView('chat'), 660);
  setTimeout(() => flash.classList.remove('on'), 820);
  setTimeout(() => flash.classList.remove('show'), 1120);
  setTimeout(() => {
    toast(`${name} 已连接`);
    pulseDot();
  }, 900);
  lastConnectAt = Date.now();
}

// ---------- 消息渲染 ----------

function progressEl(m) {
  const wrap = document.createElement('div');
  wrap.className = 'progress';
  const bar = document.createElement('i');
  bar.style.width = Math.round((m.progress || 0) * 100) + '%';
  wrap.appendChild(bar);
  return wrap;
}

function trackSpeed(m, progress) {
  const now = Date.now();
  const bytes = Math.round(progress * (m.size || 0));
  const prev = speed.get(m.id);
  if (!prev) {
    speed.set(m.id, { t: now, bytes, rate: 0 });
    return;
  }
  const dt = (now - prev.t) / 1000;
  if (dt < 0.15) return;
  const inst = (bytes - prev.bytes) / dt;
  const rate = prev.rate ? prev.rate * 0.65 + inst * 0.35 : inst;
  speed.set(m.id, { t: now, bytes, rate: Math.max(0, rate) });
}

function speedText(m) {
  const s = speed.get(m.id);
  if (!s || !s.rate || m.status !== 'uploading') return '';
  const rate = `${fmtSize(s.rate)}/s`;
  if (!m.size) return rate;
  const left = Math.max(0, (m.size - Math.round((m.progress || 0) * m.size)) / s.rate);
  if (left < 1) return rate;
  return `${rate} · 剩余 ${left < 60 ? Math.ceil(left) + 's' : Math.ceil(left / 60) + 'm'}`;
}

function isVideo(m) {
  return /^video\//i.test(m.mime || '') || /\.(mp4|mov|webm|m4v|mkv)$/i.test(m.name || '');
}

function isAudio(m) {
  return /^audio\//i.test(m.mime || '') || /\.(mp3|m4a|wav|ogg|aac|flac|opus)$/i.test(m.name || '');
}

function fileCard(m) {
  const wrap = document.createElement('div');
  wrap.className = 'file';
  wrap.innerHTML = `<div class="fi">${esc(extLabel(m.name))}</div><div class="fx"><div class="fn"></div><div class="fs"><span class="sz"></span><span class="pct"></span><span class="spd"></span></div></div>`;
  wrap.querySelector('.fn').textContent = m.name || '文件';
  wrap.querySelector('.fn').title = m.name || '';
  wrap.querySelector('.sz').textContent = fmtSize(m.size);
  const pct = wrap.querySelector('.pct');
  if (m.status === 'uploading') pct.textContent = ' · ' + Math.round((m.progress || 0) * 100) + '%';
  else if (m.status === 'error') pct.textContent = ' · 未完成';
  const spd = speedText(m);
  wrap.querySelector('.spd').textContent = spd ? ' · ' + spd : '';
  return wrap;
}

function toolsEl(m) {
  const box = document.createElement('div');
  box.className = 'tools';
  const acts = [];
  if (m.kind === 'text') {
    acts.push(['copy', '复制文字', ICON.copy]);
  } else if (m.status === 'ok' && m.path) {
    acts.push(['open', '打开', ICON.open]);
    if (m.kind === 'image') {
      acts.push(['save', '另存为', ICON.save]);
      acts.push(['copyimg', '复制图片', ICON.copy]);
    } else {
      acts.push(['reveal', '显示所在文件夹', ICON.folder]);
      acts.push(['save', '另存为', ICON.save]);
    }
  }
  acts.push(['del', '删除', ICON.trash]);
  for (const [a, title, icon] of acts) {
    const b = document.createElement('button');
    b.dataset.a = a;
    b.title = title;
    b.innerHTML = icon;
    box.appendChild(b);
  }
  return box;
}

function pickEl() {
  const span = document.createElement('span');
  span.className = 'pick';
  span.innerHTML = '<svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.4 6.3l2.3 2.3 4.9-5.2"/></svg>';
  return span;
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function richText(text) {
  const frag = document.createDocumentFragment();
  const value = String(text || '');
  const names = members.map((m) => m && m.name).filter(Boolean).sort((a, b) => b.length - a.length);
  if (!value.includes('@') || !names.length) {
    frag.appendChild(document.createTextNode(value));
    return frag;
  }
  const re = new RegExp('@(' + names.map(escapeRe).join('|') + ')(?![\\p{L}\\p{N}_])', 'gu');
  let last = 0;
  let hit;
  while ((hit = re.exec(value))) {
    if (hit.index > last) frag.appendChild(document.createTextNode(value.slice(last, hit.index)));
    const span = document.createElement('span');
    span.className = 'at' + (hit[1] === me.name ? ' me' : '');
    span.textContent = '@' + hit[1];
    frag.appendChild(span);
    last = hit.index + hit[0].length;
  }
  if (last < value.length) frag.appendChild(document.createTextNode(value.slice(last)));
  return frag;
}

function messageEl(m, cont) {
  const row = document.createElement('div');
  row.dataset.id = m.id;
  if (m.status === 'error') row.classList.add('failed');
  if (multiMode && picked.has(m.id)) row.classList.add('picked');

  if (m.kind === 'system') {
    row.className = 'msg sys';
    const tip = document.createElement('span');
    tip.textContent = m.text || '';
    row.appendChild(tip);
    if (multiMode) row.appendChild(pickEl());
    return row;
  }

  const out = isMine(m);
  const who = authorOf(m);
  row.className = 'msg ' + (out ? 'pc' : 'phone') + (cont ? ' cont' : '');

  if (m.recalled) {
    row.classList.add('sys');
    const tip = document.createElement('span');
    tip.textContent = out ? '你撤回了一条消息' : `${who.name} 撤回了一条消息`;
    row.appendChild(tip);
    if (multiMode) row.appendChild(pickEl());
    return row;
  }

  const mcol = document.createElement('div');
  mcol.className = 'mcol';
  if (!out) {
    const av = avatarEl(who);
    if (cont) av.classList.add('gone');
    row.appendChild(av);
    if (!cont) {
      const name = document.createElement('span');
      name.className = 'who';
      name.dataset.c = who.color || 'slate';
      name.textContent = who.name;
      mcol.appendChild(name);
    }
  }

  const b = document.createElement('div');
  b.className = 'bubble';

  if (m.reply) {
    const q = document.createElement('div');
    q.className = 'quote';
    const rwho = (m.reply.author && m.reply.author.name)
      || (m.reply.uid === 'host' ? room.host.name : '')
      || (m.reply.from === 'pc' ? room.host.name : '成员');
    const body = m.reply.text
      || (m.reply.kind === 'image' ? '[图片]' : '[文件] ' + (m.reply.name || ''));
    q.textContent = `${m.reply.uid === 'host' ? '我' : rwho}：${body}`;
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      jumpToMessage(m.reply.id);
    });
    b.appendChild(q);
  }

  if (m.kind === 'text') {
    b.appendChild(richText(m.text));
    b.title = fmtTime(m.ts);
    if (out && m.status === 'ok') {
      const t = document.createElement('span');
      const n = readCount(m);
      t.className = 'tick' + (n ? ' seen' : '');
      t.title = n ? `${n} 人已读` : '已送达';
      t.innerHTML = TICK;
      b.appendChild(t);
    }
  } else {
    b.classList.add('media');
    if (m.kind === 'image' && m.status === 'ok' && m.path) {
      const img = document.createElement('img');
      img.className = 'thumb loading';
      img.loading = 'lazy';
      img.src = api.toFileUrl(m.path);
      img.addEventListener('load', () => {
        img.classList.remove('loading');
        scrollBottom(false);
      });
      img.addEventListener('error', () => img.replaceWith(fileCard(m)));
      img.addEventListener('click', () => {
        if (!multiMode) openLightbox(img);
      });
      b.appendChild(img);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `<span>${esc(m.name || '')}</span><span>${fmtSize(m.size)}</span>`;
      b.appendChild(cap);
    } else if (m.status === 'ok' && m.path && isVideo(m)) {
      const v = document.createElement('video');
      v.className = 'thumb';
      v.controls = true;
      v.preload = 'metadata';
      v.src = api.toFileUrl(m.path);
      v.addEventListener('loadedmetadata', () => scrollBottom(false));
      v.addEventListener('error', () => {
        if (v.isConnected) v.replaceWith(fileCard(m));
      });
      b.appendChild(v);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `<span>${esc(m.name || '视频')}</span><span>${fmtSize(m.size)}</span>`;
      b.appendChild(cap);
    } else if (m.status === 'ok' && m.path && isAudio(m)) {
      const a = document.createElement('audio');
      a.controls = true;
      a.preload = 'metadata';
      a.src = api.toFileUrl(m.path);
      a.addEventListener('error', () => {
        if (a.isConnected) a.replaceWith(fileCard(m));
      });
      b.appendChild(a);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `<span>${esc(m.name || '音频')}</span><span>${fmtSize(m.size)}</span>`;
      b.appendChild(cap);
    } else {
      b.appendChild(fileCard(m));
    }
    if (m.status === 'uploading') b.appendChild(progressEl(m));
  }

  const bwrap = document.createElement('div');
  bwrap.className = 'bwrap';
  bwrap.appendChild(b);
  mcol.appendChild(bwrap);
  row.appendChild(mcol);
  if (multiMode) row.appendChild(pickEl());
  else row.appendChild(toolsEl(m));
  return row;
}

function chatEmpty(isSearch) {
  const d = document.createElement('div');
  d.className = 'chat-empty' + (isSearch ? ' results' : '');
  d.innerHTML = isSearch
    ? '<b>没有匹配的消息</b>换个关键词试试'
    : '<b>群聊已就绪</b>发一条消息，或扫码邀请手机和其他电脑加入';
  return d;
}

function nearBottom() {
  return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 90;
}

chat.addEventListener('scroll', () => {
  // 程序化滚动期间不要把 stick 重算成 false，否则后续消息不再跟底
  if (syncing) return;
  stick = nearBottom();
  if (stick && pendingNew) {
    pendingNew = 0;
    $('jumpPill').hidden = true;
  }
});

function scrollBottom(force) {
  if (force) stick = true;
  if (!stick) return;
  syncing = true;
  chat.scrollTop = chat.scrollHeight;
  clearTimeout(scrollBottom._t);
  scrollBottom._t = setTimeout(() => {
    syncing = false;
    stick = nearBottom();
  }, 80);
}

function addSeparator(ts) {
  if (!lastTs || ts - lastTs > 10 * 60 * 1000) {
    const sep = document.createElement('div');
    sep.className = 'sep';
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    sep.textContent = sameDay
      ? fmtTime(ts)
      : `${d.getMonth() + 1}月${d.getDate()}日 ${fmtTime(ts)}`;
    chat.appendChild(sep);
  }
  lastTs = ts;
}

function appendMessage(m) {
  const wasNear = nearBottom();
  const authorId = m.kind === 'system' ? '' : (m.uid || (m.from === 'pc' ? 'host' : 'legacy'));
  const tight = !!authorId && lastFrom === authorId && m.ts - lastTs < 180000;
  addSeparator(m.ts);
  const el = messageEl(m, tight);
  if (!tight) el.classList.add('break');
  el.classList.add('enter');
  setTimeout(() => el.classList.remove('enter'), 280);
  chat.appendChild(el);
  nodes.set(m.id, el);
  byId.set(m.id, m);
  lastFrom = authorId;

  // 自己发出的消息无条件跟到底；对方消息只在本来就在底部时才跟随
  if (isMine(m) || wasNear) scrollBottom(true);
  else if (!rendering && m.kind !== 'system') {
    pendingNew += 1;
    $('jumpCount').textContent = String(pendingNew);
    $('jumpPill').hidden = false;
  }
  if (!isMine(m) && m.kind !== 'system') markSeen();
  else if (!rendering) markWaitingDownload(m);
}

let seenTimer = null;
function markSeen() {
  if (document.visibilityState !== 'visible') return;
  clearTimeout(seenTimer);
  seenTimer = setTimeout(() => {
    if (!devices.length) return;
    const ids = loaded
      .filter((m) => !isMine(m) && m.kind !== 'system' && m.status === 'ok' && !readByMe(m))
      .map((m) => m.id);
    if (ids.length) api.markSeen(ids.slice(-300));
  }, 600);
}

window.addEventListener('focus', markSeen);
document.addEventListener('visibilitychange', markSeen);

function renderAll(list) {
  rendering = true;
  chat.innerHTML = '';
  nodes.clear();
  byId.clear();
  lastTs = 0;
  lastFrom = '';
  if (!list.length) {
    chat.appendChild(chatEmpty(!!searchQuery.trim()));
    rendering = false;
    return;
  }
  for (const m of list) appendMessage(m);
  rendering = false;
  pendingNew = 0;
  $('jumpPill').hidden = true;
  scrollBottom(true);
}

function authorKey(m) {
  return m.kind === 'system' ? '' : (m.uid || (m.from === 'pc' ? 'host' : 'legacy'));
}

function isCont(m, prev) {
  return !!(m && prev && m.kind !== 'system' && prev.kind !== 'system'
    && authorKey(m) === authorKey(prev) && m.ts - prev.ts < 180000);
}

function patchMessage(id, patch) {
  const m = byId.get(id) || loaded.find((x) => x.id === id);
  if (!m) return;
  Object.assign(m, patch);

  if (typeof patch.progress === 'number') trackSpeed(m, patch.progress);

  const el = nodes.get(id);
  if (!el) return;

  if ('seen' in patch || 'seenBy' in patch) {
    const t = el.querySelector('.tick');
    if (t) {
      const n = readCount(m);
      t.classList.toggle('seen', n > 0);
      t.title = n ? `${n} 人已读` : '已送达';
    }
    return;
  }

  const structural = 'path' in patch || 'recalled' in patch
    || (patch.status && patch.status !== 'uploading');
  if (structural) {
    const idx = loaded.findIndex((x) => x.id === id);
    const prev = idx > 0 ? loaded[idx - 1] : null;
    const cont = isCont(m, prev);
    const fresh = messageEl(m, cont);
    if (!cont) fresh.classList.add('break');
    el.replaceWith(fresh);
    nodes.set(id, fresh);
    return;
  }

  if (typeof m.progress === 'number') {
    const bar = el.querySelector('.progress > i');
    if (bar) bar.style.width = Math.round(m.progress * 100) + '%';
    const pct = el.querySelector('.pct');
    if (pct) pct.textContent = ' · ' + Math.round(m.progress * 100) + '%';
    const spd = el.querySelector('.spd');
    if (spd) {
      const t = speedText(m);
      spd.textContent = t ? ' · ' + t : '';
    }
  }
}

function removeMessage(id) {
  const el = nodes.get(id);
  if (el) {
    el.style.transition = 'opacity 160ms ease, max-height 160ms ease, margin 160ms ease';
    el.style.maxHeight = el.offsetHeight + 'px';
    requestAnimationFrame(() => {
      el.style.opacity = '0';
      el.style.maxHeight = '0px';
      el.style.marginTop = '0px';
      el.style.marginBottom = '0px';
      el.style.overflow = 'hidden';
    });
    setTimeout(() => el.remove(), 180);
  }
  nodes.delete(id);
  byId.delete(id);
  loaded = loaded.filter((m) => m.id !== id);
  speed.delete(id);
  if (picked.delete(id) && multiMode) updateMulti();
  if (!loaded.length) {
    chat.innerHTML = '';
    chat.appendChild(chatEmpty(false));
  }
  syncView();
}

// ---------- 图片预览 ----------

function openLightbox(img) {
  const box = $('lightbox');
  const big = $('lightboxImg');
  const from = img.getBoundingClientRect();
  big.src = img.src;
  box.classList.add('on');
  const to = big.getBoundingClientRect();
  if (!to.width) return;
  big.style.transition = 'none';
  big.style.transformOrigin = 'top left';
  big.style.transform = `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width}, ${from.height / to.height})`;
  requestAnimationFrame(() => {
    big.style.transition = 'transform 260ms cubic-bezier(.22,1,.36,1)';
    big.style.transform = 'none';
  });
}

function closeLightbox() {
  const box = $('lightbox');
  const big = $('lightboxImg');
  box.classList.remove('on');
  big.style.transition = 'none';
  big.style.transform = 'none';
  big.src = '';
}

$('lightbox').addEventListener('click', closeLightbox);

// ---------- 消息操作 ----------

function canRecall(m) {
  return isMine(m) && m.status === 'ok' && !m.recalled
    && Date.now() - Number(m.ts || 0) <= RECALL_MS;
}

function jumpToMessage(id) {
  const el = nodes.get(id);
  if (!el) {
    toast('这条消息不在当前记录里');
    return;
  }
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  el.classList.remove('flash');
  void el.offsetWidth;
  el.classList.add('flash');
  setTimeout(() => el.classList.remove('flash'), 1200);
}

function setReply(m) {
  if (!m) return;
  const who = authorOf(m);
  replyTo = {
    id: m.id,
    from: m.from,
    uid: m.uid || (m.from === 'pc' ? 'host' : ''),
    author: who ? { id: who.id, name: who.name, color: who.color, kind: who.kind } : null,
    kind: m.kind,
    text: m.kind === 'text' ? String(m.text || '').slice(0, 120) : '',
    name: m.name || '',
  };
  $('replyBar').hidden = false;
  $('replyName').textContent = isMine(m) ? '回复我自己的消息' : '回复 ' + who.name;
  $('replyText').textContent = m.kind === 'text'
    ? String(m.text || '').slice(0, 60)
    : m.kind === 'image'
      ? '[图片]'
      : '[文件] ' + (m.name || '');
  input.focus();
}

function clearReply() {
  replyTo = null;
  $('replyBar').hidden = true;
}

async function handleAction(a, m) {
  if (a === 'copy') {
    api.copyText(m.text || '');
    toast('已复制');
  } else if (a === 'recall') {
    const ok = await api.recallMsg(m.id);
    toast(ok ? '已撤回' : '超过 2 分钟，无法撤回');
  } else if (a === 'open') {
    api.openPath(m.path);
  } else if (a === 'reveal') {
    api.reveal(m.path);
  } else if (a === 'save') {
    const ok = await api.saveAs(m.id);
    if (ok) toast('已另存');
  } else if (a === 'copyimg') {
    const ok = await api.copyImage(m.path);
    toast(ok ? '图片已复制' : '复制失败');
  } else if (a === 'del') {
    api.deleteMsg(m.id, false);
  }
}

chat.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-a]');
  if (btn) {
    const row = btn.closest('.msg');
    const m = row && byId.get(row.dataset.id);
    if (m) handleAction(btn.dataset.a, m);
    return;
  }
  if (!multiMode) return;
  const row = e.target.closest('.msg');
  if (!row) return;
  const id = row.dataset.id;
  if (picked.has(id)) picked.delete(id);
  else picked.add(id);
  row.classList.toggle('picked', picked.has(id));
  updateMulti();
});

function updateMulti() {
  $('multiCount').textContent = String(picked.size);
  $('multiDel').disabled = picked.size === 0;
}

// ---------- 右键菜单 ----------

function closeCtx() {
  $('ctx').classList.remove('on');
}

function openCtx(x, y, items) {
  const box = $('ctx');
  box.innerHTML = '';
  for (const it of items) {
    if (it.sep) {
      const s = document.createElement('div');
      s.className = 'ctx-sep';
      box.appendChild(s);
      continue;
    }
    const b = document.createElement('button');
    if (it.danger) b.className = 'danger';
    b.textContent = it.label;
    b.addEventListener('click', () => {
      closeCtx();
      it.run();
    });
    box.appendChild(b);
  }
  box.classList.add('on');
  const r = box.getBoundingClientRect();
  box.style.left = Math.max(8, Math.min(x, window.innerWidth - r.width - 8)) + 'px';
  box.style.top = Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) + 'px';
}

chat.addEventListener('contextmenu', (e) => {
  const row = e.target.closest('.msg');
  if (!row || searchMode || multiMode) return;
  e.preventDefault();
  const m = byId.get(row.dataset.id);
  if (!m || m.kind === 'system') return;
  const items = [];
  if (m.recalled) {
    items.push({ label: '多选', run: () => enterMulti(m.id) });
    items.push({ label: '删除', danger: true, run: () => handleAction('del', m) });
    openCtx(e.clientX, e.clientY, items);
    return;
  }
  if (canRecall(m)) items.push({ label: '撤回', run: () => handleAction('recall', m) });
  items.push({ label: '回复', run: () => setReply(m) });
  const who = authorOf(m);
  if (!isMine(m) && memberById(who.id)) items.push({ label: `@${who.name}`, run: () => insertMention(who.name) });
  if (m.kind === 'text') items.push({ label: '复制文字', run: () => handleAction('copy', m) });
  if (m.kind !== 'text' && m.path) {
    items.push({ label: '打开', run: () => handleAction('open', m) });
    if (m.kind === 'image') items.push({ label: '复制图片', run: () => handleAction('copyimg', m) });
    else items.push({ label: '显示所在文件夹', run: () => handleAction('reveal', m) });
    items.push({ label: '另存为', run: () => handleAction('save', m) });
  }
  items.push({ sep: true });
  items.push({ label: '多选', run: () => enterMulti(m.id) });
  items.push({ label: '删除', danger: true, run: () => handleAction('del', m) });
  openCtx(e.clientX, e.clientY, items);
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('#ctx')) closeCtx();
});

// ---------- 多选 ----------

function enterMulti(firstId) {
  multiMode = true;
  picked.clear();
  if (firstId) picked.add(firstId);
  chat.classList.add('selectable');
  $('multibar').hidden = false;
  renderAll(currentList());
  updateMulti();
}

function exitMulti() {
  multiMode = false;
  picked.clear();
  chat.classList.remove('selectable');
  $('multibar').hidden = true;
  renderAll(currentList());
}

$('multiCancel').addEventListener('click', exitMulti);
$('multiDel').addEventListener('click', async () => {
  const n = picked.size;
  if (!n) return;
  const ok = await askConfirm(`删除 ${n} 条聊天记录？文件不会被删除`, '删除');
  if (!ok) return;
  const ids = [...picked];
  exitMulti();
  for (const id of ids) api.deleteMsg(id, false);
  toast(`已删除 ${n} 条`);
});

// ---------- 确认条 ----------

function askConfirm(text, okLabel) {
  return new Promise((resolve) => {
    const bar = $('confirm');
    $('confirmText').textContent = text;
    $('confirmOk').textContent = okLabel || '确定';
    bar.hidden = false;
    confirmResolve = (v) => {
      bar.hidden = true;
      confirmResolve = null;
      resolve(v);
    };
  });
}

$('confirmOk').addEventListener('click', () => confirmResolve && confirmResolve(true));
$('confirmCancel').addEventListener('click', () => confirmResolve && confirmResolve(false));

// ---------- 搜索 ----------

function openSearch() {
  searchMode = true;
  appEl.classList.add('searching');
  $('searchInput').value = searchQuery;
  setTimeout(() => $('searchInput').focus(), 40);
  renderAll(currentList());
}

function closeSearch() {
  searchMode = false;
  searchQuery = '';
  appEl.classList.remove('searching');
  $('searchInput').value = '';
  renderAll(currentList());
  scrollBottom(true);
}

$('btnSearch').addEventListener('click', () => (searchMode ? closeSearch() : openSearch()));
$('searchClose').addEventListener('click', closeSearch);
$('searchInput').addEventListener('input', (e) => {
  clearTimeout($('searchInput')._t);
  $('searchInput')._t = setTimeout(() => {
    searchQuery = e.target.value;
    renderAll(currentList());
  }, 150);
});

// ---------- 输入 ----------

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = Math.min(108, input.scrollHeight) + 'px';
}

function updateSendState() {
  const has = !!input.value.trim();
  if (btnSend.disabled === !has) return;
  btnSend.disabled = !has;
  if (has) {
    btnSend.classList.remove('bump');
    void btnSend.offsetWidth;
    btnSend.classList.add('bump');
  }
}

// ---------- 表情 ----------

function buildEmoji() {
  const grid = $('emojiGrid');
  if (!grid) return;
  for (const emoji of EMOJIS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = emoji;
    b.addEventListener('click', () => insertEmoji(emoji));
    grid.appendChild(b);
  }
}

function insertEmoji(emoji) {
  const start = input.selectionStart == null ? input.value.length : input.selectionStart;
  const end = input.selectionEnd == null ? start : input.selectionEnd;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  const pos = start + emoji.length;
  input.focus();
  try {
    input.setSelectionRange(pos, pos);
  } catch {
    /* ignore */
  }
  autoGrow();
  updateSendState();
  saveDraft();
  sendTyping(true);
}

function closeEmoji() {
  $('emojiPop').hidden = true;
  $('btnEmoji').classList.remove('active');
}

function toggleEmoji() {
  const pop = $('emojiPop');
  const show = pop.hidden;
  pop.hidden = !show;
  $('btnEmoji').classList.toggle('active', show);
  if (show) input.focus();
}

$('btnEmoji').addEventListener('click', (e) => {
  e.stopPropagation();
  toggleEmoji();
});

document.addEventListener('click', (e) => {
  if ($('emojiPop').hidden) return;
  if (e.target.closest('#emojiPop') || e.target.closest('#btnEmoji')) return;
  closeEmoji();
});


function saveDraft() {
  clearTimeout(draftTimer);
  draftTimer = setTimeout(() => {
    try {
      localStorage.setItem('ldDraft', input.value);
    } catch {
      /* ignore */
    }
  }, 300);
}

function insertMention(name) {
  if (!name) return;
  const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
  const end = input.selectionEnd == null ? pos : input.selectionEnd;
  const before = input.value.slice(0, pos);
  const needSpace = before && !/\s$/.test(before) ? ' ' : '';
  const text = `${needSpace}@${name} `;
  input.value = before + text + input.value.slice(end);
  const next = pos + text.length;
  try {
    input.setSelectionRange(next, next);
  } catch {
    /* ignore */
  }
  autoGrow();
  updateSendState();
  saveDraft();
  if (sideOpen && appEl.dataset.mode === 'compact') closeSide();
  input.focus();
  sendTyping(true);
}

function closeMention() {
  mentionState.open = false;
  mentionState.items = [];
  mentionState.start = -1;
  $('mentionPop').hidden = true;
}

function updateMention() {
  if (!input || input.selectionStart == null) return closeMention();
  const pos = input.selectionStart;
  const before = input.value.slice(0, pos);
  const hit = /(^|[\s(])@([^\s@]{0,16})$/.exec(before);
  if (!hit) return closeMention();
  const q = hit[2].toLowerCase();
  const items = members
    .filter((m) => m && !m.isHost)
    .filter((m) => !q || m.name.toLowerCase().includes(q))
    .sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1))
    .slice(0, 8);
  if (!items.length) return closeMention();
  mentionState.open = true;
  mentionState.items = items;
  mentionState.index = 0;
  mentionState.start = pos - hit[2].length - 1;
  renderMention();
}

function renderMention() {
  const box = $('mentionPop');
  if (!mentionState.open) {
    box.hidden = true;
    return;
  }
  box.textContent = '';
  mentionState.items.forEach((m, i) => {
    const btn = document.createElement('div');
    btn.className = 'mitem' + (i === mentionState.index ? ' on' : '');
    btn.setAttribute('role', 'button');
    btn.tabIndex = 0;
    btn.appendChild(avatarEl(m, true));
    const name = document.createElement('span');
    name.className = 'mname';
    name.textContent = m.name;
    btn.appendChild(name);
    if (m.isHost) {
      const tag = document.createElement('i');
      tag.textContent = '群主';
      btn.appendChild(tag);
    }
    btn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      chooseMention(m);
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        chooseMention(m);
      }
    });
    box.appendChild(btn);
  });
  box.hidden = false;
}

function chooseMention(person) {
  if (!person) return;
  const pos = input.selectionStart == null ? input.value.length : input.selectionStart;
  const end = input.selectionEnd == null ? pos : input.selectionEnd;
  const start = mentionState.start >= 0 ? mentionState.start : pos;
  const text = `@${person.name} `;
  input.value = input.value.slice(0, start) + text + input.value.slice(end);
  const next = start + text.length;
  try {
    input.setSelectionRange(next, next);
  } catch {
    /* ignore */
  }
  closeMention();
  autoGrow();
  updateSendState();
  saveDraft();
  input.focus();
  sendTyping(true);
}

function sendText() {
  const v = input.value.trim();
  if (!v) return;
  if (v.length > 20000) {
    toast('单条消息太长了');
    return;
  }
  api.sendText(v, replyTo);
  sendTyping(false);
  play('send');
  input.value = '';
  clearReply();
  closeMention();
  try {
    localStorage.removeItem('ldDraft');
  } catch {
    /* ignore */
  }
  autoGrow();
  btnSend.disabled = true;
}

btnSend.addEventListener('click', sendText);
input.addEventListener('input', () => {
  autoGrow();
  updateSendState();
  saveDraft();
  updateMention();
  if (input.value.trim()) sendTyping(true);
  else sendTyping(false);
});
input.addEventListener('blur', () => {
  sendTyping(false);
  setTimeout(closeMention, 120);
});
input.addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (mentionState.open) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const n = mentionState.items.length;
      mentionState.index = (mentionState.index + (e.key === 'ArrowDown' ? 1 : -1) + n) % n;
      renderMention();
      return;
    }
    if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      chooseMention(mentionState.items[mentionState.index]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMention();
      return;
    }
  }
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendText();
  }
});

$('btnImg').addEventListener('click', async () => {
  const ids = await api.pickFiles('image');
  if (ids.length) play('send');
});
$('btnFile').addEventListener('click', async () => {
  const ids = await api.pickFiles('all');
  if (ids.length) play('send');
});

document.addEventListener('paste', (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const img = items.find((i) => i.type.startsWith('image/'));
  if (!img) return;
  e.preventDefault();
  const file = img.getAsFile();
  if (!file) return;
  const ext = (img.type.split('/')[1] || 'png').replace('jpeg', 'jpg');
  file.arrayBuffer().then((buf) => api.sendImageBuffer(buf, `粘贴图片-${Date.now()}.${ext}`));
});

let dragDepth = 0;
window.addEventListener('dragenter', (e) => {
  if (!e.dataTransfer?.types?.includes('Files')) return;
  dragDepth += 1;
  $('drop').classList.add('on');
});
window.addEventListener('dragover', (e) => e.preventDefault());
window.addEventListener('dragleave', () => {
  dragDepth = Math.max(0, dragDepth - 1);
  if (!dragDepth) $('drop').classList.remove('on');
});
window.addEventListener('drop', (e) => {
  e.preventDefault();
  dragDepth = 0;
  $('drop').classList.remove('on');
  const files = Array.from(e.dataTransfer?.files || []);
  const paths = files.map((f) => f.path).filter(Boolean);
  if (paths.length) api.sendPaths(paths);
});

// ---------- 主题与窗口 ----------

function applyTheme(t) {
  if (theme === t) return;
  theme = t;
  document.documentElement.classList.add('theme-anim');
  document.documentElement.dataset.theme = t;
  setTimeout(() => document.documentElement.classList.remove('theme-anim'), 240);
  document.querySelectorAll('#setTheme button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === t);
  });
}

function applyFont(next) {
  font = ['s', 'm', 'l', 'xl'].includes(next) ? next : 'm';
  document.documentElement.dataset.font = font;
  document.querySelectorAll('#setFont button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === font);
  });
}

function applyMode(mode) {
  isFull = mode === 'full';
  appEl.dataset.mode = isFull ? 'full' : 'compact';
  $('btnMax').innerHTML = isFull ? ICON.restore : ICON.max;
  $('btnMax').title = isFull ? '还原小窗' : '最大化';
  if (!isFull && searchMode) closeSearch();
  if (isFull) $('sideScrim').hidden = true;
  else if (sideOpen) $('sideScrim').hidden = false;
  updateChrome();
  setTimeout(() => scrollBottom(true), 140);
}

function applyPin() {
  $('btnPin').classList.toggle('active', pinned);
  $('btnPin').title = pinned ? '取消置顶' : '置顶窗口';
}

function applyUrl(url, qr) {
  if (url) currentUrl = url;
  if (qr !== undefined) {
    currentQr = qr || '';
    if (currentQr) $('qrBig').src = currentQr;
    else $('qrBig').removeAttribute('src');
  }
  $('setUrl').textContent = hostOf(currentUrl) || '—';
  $('setUrl').title = currentUrl;
  renderRoomSide();
}

// ---------- 设置 ----------

function fillSettings() {
  if (!state) return;
  document.querySelectorAll('#setTheme button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === theme);
  });
  document.querySelectorAll('#setFont button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === font);
  });
  $('setDevices').textContent = `${room.onlineCount || 1} 在线 / ${room.memberCount || 1} 位`;
  renderRoomBar();
  $('setSound').classList.toggle('on', soundOn);
  $('setNotify').classList.toggle('on', !!state.notify);
  $('setAuto').classList.toggle('on', !!state.autostart);
  $('setSaveDir').textContent = shortDir(state.saveDir);
  $('setSaveDir').title = state.saveDir;
  $('setUrl').textContent = hostOf(currentUrl) || '—';
  $('setUrl').title = currentUrl;
  $('setPort').textContent = state.port ? String(state.port) : '—';
  $('setVer').textContent = state.version || '—';
  $('setFwState').textContent = state.firewall ? '已放通' : '未放通';
  $('setCrypto').textContent = state.locked
    ? '已锁定，原文件已保留'
    : (state.encrypted ? '已加密（AES-256-GCM）' : '未启用，当前环境不支持');

  const sel = $('setNic');
  sel.innerHTML = '';
  for (const n of state.nics || []) {
    const o = document.createElement('option');
    o.value = n.name;
    o.textContent = `${n.name} · ${n.address}`;
    if (n.name === state.nic) o.selected = true;
    sel.appendChild(o);
  }
  if (!state.nics || !state.nics.length) {
    const o = document.createElement('option');
    o.textContent = '未检测到局域网网卡';
    sel.appendChild(o);
  }
}

function flashRow(el) {
  const row = el.closest('.srow');
  if (!row) return;
  row.classList.add('flash');
  setTimeout(() => row.classList.remove('flash'), 420);
}

$('setTheme').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  applyTheme(b.dataset.v);
  await api.setSetting('theme', b.dataset.v);
  flashRow(b);
});

$('setFont').addEventListener('click', async (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  applyFont(b.dataset.v);
  await api.setSetting('font', b.dataset.v);
  flashRow(b);
});

$('setUpdate').addEventListener('click', () => {
  api.openReleases();
  toast('已打开下载页');
});

$('setSound').addEventListener('click', async () => {
  soundOn = !soundOn;
  $('setSound').classList.toggle('on', soundOn);
  state.sound = soundOn;
  await api.setSetting('sound', soundOn);
  if (soundOn) play('recv');
  flashRow($('setSound'));
});

$('setNotify').addEventListener('click', async () => {
  state.notify = !state.notify;
  $('setNotify').classList.toggle('on', state.notify);
  await api.setSetting('notify', state.notify);
  flashRow($('setNotify'));
});

$('setAuto').addEventListener('click', async () => {
  const next = !state.autostart;
  state.autostart = await api.setAutostart(next);
  $('setAuto').classList.toggle('on', state.autostart);
  toast(state.autostart ? '已设置开机启动' : '已关闭开机启动');
  flashRow($('setAuto'));
});

$('setSaveDirBtn').addEventListener('click', async () => {
  const dir = await api.chooseSaveDir();
  if (!dir) return;
  state.saveDir = dir;
  $('setSaveDir').textContent = shortDir(dir);
  $('setSaveDir').title = dir;
  flashRow($('setSaveDirBtn'));
});

$('setOpenDir').addEventListener('click', () => api.openSaveDir());
$('setDataDir').addEventListener('click', () => api.openDataDir());
$('setCopyUrl').addEventListener('click', () => {
  if (!currentUrl) return;
  api.copyText(currentUrl);
  toast('链接已复制');
});

$('setNic').addEventListener('change', async (e) => {
  state = Object.assign(state, await api.chooseNic(e.target.value));
  applyUrl(state.url, state.qr);
  flashRow($('setNic'));
});

$('setFw').addEventListener('click', async () => {
  toast('请在系统弹窗中允许');
  const ok = await api.openFirewall();
  state.firewall = !!ok;
  $('setFwState').textContent = ok ? '已放通' : '未放通';
  if (ok) flashRow($('setFw'));
  else toast('未放通，手机可能连不上');
});

$('setReset').addEventListener('click', async () => {
  const ok = await askConfirm('重置后已加入的设备都需要重新扫码，成员身份和群历史会保留。', '重置');
  if (!ok) return;
  state = Object.assign(state, await api.resetToken());
  applyUrl(state.url, state.qr);
  toast('邀请链接已重置');
});

// ---------- 群聊设置 ----------

$('setRoomNameBtn').addEventListener('click', async () => {
  const name = await openPrompt('群名称', room.name || '近传群聊', 24);
  if (!name) return;
  const p = await api.roomRename(name);
  applyRoomPayload(p);
  toast('群名已更新');
});

$('setHostNameBtn').addEventListener('click', renameHost);

$('setInvite').addEventListener('click', openInvite);

$('setLock').addEventListener('click', async () => {
  const p = await api.roomLock(!room.locked);
  applyRoomPayload(p);
  toast(room.locked ? '群聊已锁定' : '群聊已解锁');
});

$('rbMain').addEventListener('click', toggleSide);
$('rbMain').addEventListener('keydown', (e) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    toggleSide();
  }
});
$('rbMembers').addEventListener('click', toggleSide);
$('rbStack').addEventListener('click', toggleSide);
$('rbInvite').addEventListener('click', openInvite);
$('rsClose').addEventListener('click', closeSide);
$('sideScrim').addEventListener('click', closeSide);
$('rsNick').addEventListener('click', renameHost);
$('rsSettings').addEventListener('click', () => {
  closeSide();
  setView('settings');
});

$('inviteClose').addEventListener('click', () => {
  $('inviteWrap').hidden = true;
});
$('inviteWrap').addEventListener('click', (e) => {
  if (e.target === $('inviteWrap')) $('inviteWrap').hidden = true;
});
$('inviteCopy').addEventListener('click', () => {
  if (!currentUrl) return;
  api.copyText(currentUrl);
  toast('邀请链接已复制');
});

$('promptOk').addEventListener('click', () => closePrompt($('promptInput').value.trim()));
$('promptInput').addEventListener('keydown', (e) => {
  if (e.isComposing) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    closePrompt($('promptInput').value.trim());
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePrompt(null);
  }
});
$('promptWrap').addEventListener('click', (e) => {
  if (e.target === $('promptWrap')) closePrompt(null);
});

$('replyClose').addEventListener('click', clearReply);

$('setClear').addEventListener('click', async () => {
  const ok = await askConfirm('清空全部聊天记录？已保存的文件不受影响', '清空');
  if (!ok) return;
  await api.clearHistory(false);
});

// ---------- 窗口按钮 ----------

$('btnPin').addEventListener('click', () => api.togglePin());
$('btnMax').addEventListener('click', () => api.setMode(isFull ? 'compact' : 'full'));
$('btnClose').addEventListener('click', () => api.hide());
$('btnGear').addEventListener('click', () => setView('settings'));
$('btnBack').addEventListener('click', () => setView(targetView()));
$('connbarBtn').addEventListener('click', openInvite);
$('jumpPill').addEventListener('click', () => {
  pendingNew = 0;
  $('jumpPill').hidden = true;
  stick = true;
  syncing = true;
  chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  clearTimeout(scrollBottom._t);
  scrollBottom._t = setTimeout(() => {
    syncing = false;
    stick = nearBottom();
  }, 450);
});

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'f' && view === 'chat' && isFull) {
    e.preventDefault();
    openSearch();
    return;
  }
  if (e.ctrlKey && !e.altKey && e.key === ',') {
    e.preventDefault();
    setView('settings');
    return;
  }
  if (e.key !== 'Escape') return;
  if (!$('promptWrap').hidden) return closePrompt(null);
  if (!$('inviteWrap').hidden) return void ($('inviteWrap').hidden = true);
  if (mentionState.open) return closeMention();
  if (sideOpen) return closeSide();
  if (replyTo) return clearReply();
  if (!$('emojiPop').hidden) return closeEmoji();
  if ($('lightbox').classList.contains('on')) return closeLightbox();
  if (view === 'settings') return setView(targetView());
  if (searchMode) return closeSearch();
  if (multiMode) return exitMulti();
  if (isFull) api.setMode('compact');
});

// ---------- 事件 ----------

// 手机正在下载电脑上发出的文件：在气泡里显示进度
const dlTimers = new Map();
function onDownload(p) {
  if (!p || !p.id) return;
  const el = nodes.get(p.id);
  if (!el) return;
  const bubble = el.querySelector('.bubble');
  if (!bubble) return;
  let bar = bubble.querySelector('.dl');
  if (!bar) {
    bar = document.createElement('div');
    bar.className = 'dl';
    bar.innerHTML = '<i></i><span></span>';
    bubble.appendChild(bar);
  }
  const pct = p.total ? Math.min(100, Math.round((p.sent * 100) / p.total)) : 0;
  bar.querySelector('i').style.width = pct + '%';
  bar.querySelector('span').textContent = p.aborted
    ? '下载已中断'
    : p.waiting
      ? '等待成员下载'
      : p.done
        ? '成员已下载'
        : `成员下载中 ${pct}%`;
  bar.classList.toggle('done', !!p.done);
  bar.classList.toggle('waiting', !!p.waiting);
  if (p.done || p.aborted) {
    clearTimeout(dlTimers.get(p.id));
    dlTimers.set(p.id, setTimeout(() => {
      const cur = nodes.get(p.id);
      const b = cur && cur.querySelector('.dl');
      if (b) b.remove();
      dlTimers.delete(p.id);
    }, 5000));
  }
}

function markWaitingDownload(m) {
  if (!m || !isMine(m) || m.status !== 'ok') return;
  if (m.kind !== 'image' && m.kind !== 'file') return;
  onDownload({ id: m.id, sent: 0, total: m.size || 0, done: false, waiting: true });
}

function onEvent(p) {
  if (!p || !p.t) return;
  switch (p.t) {
    case 'msg': {
      // 初始化期间排队重放 + 服务端历史可能已经包含同一条，避免重复
      if (!p.msg || byId.has(p.msg.id)) break;
      loaded.push(p.msg);
      if (p.msg.uid) setTyping(p.msg.uid, authorOf(p.msg).name, false);
      if (!isMine(p.msg) && p.msg.kind !== 'system') {
        play('recv');
      }
      if (view !== 'chat') syncView();
      else if (searchMode && searchQuery.trim() && !matchQuery(p.msg, searchQuery.trim().toLowerCase())) break;
      else appendMessage(p.msg);
      break;
    }
    case 'typing':
      if (p.member && p.member.id) setTyping(p.member.id, p.member.name, !!p.on);
      break;
    case 'msg:update':
      patchMessage(p.id, p.patch);
      // 手机上传的文件只有收完（ok）才应显示已读
      if (p.patch && p.patch.status === 'ok') markSeen();
      break;
    case 'msg:delete':
      removeMessage(p.id);
      if (replyTo && replyTo.id === p.id) clearReply();
      break;
    case 'clear':
      loaded = [];
      clearReply();
      if (multiMode) exitMulti();
      if (searchMode) closeSearch();
      renderAll(currentList());
      syncView();
      break;
    case 'theme':
      applyTheme(p.theme);
      break;
    case 'url':
      applyUrl(p.url, p.qr);
      break;
    case 'room':
      applyRoomPayload(p);
      break;
    case 'download':
      onDownload(p);
      break;
    case 'mode':
      applyMode(p.mode);
      break;
    case 'pin':
      pinned = !!p.pinned;
      applyPin();
      break;
    case 'firewall':
      if (state) state.firewall = !!p.ok;
      if (view === 'settings') $('setFwState').textContent = p.ok ? '已放通' : '未放通';
      break;
    case 'setting':
      if (p.key === 'sound') soundOn = !!p.value;
      if (p.key === 'notify' && state) state.notify = !!p.value;
      break;
    case 'navigate':
      if (p.view === 'settings') setView('settings');
      break;
  }
}

// ---------- 启动 ----------

(async function init() {
  // 先接住事件：state() 往返期间到达的消息不能丢，等界面初始化完再按顺序重放
  let booting = true;
  const queued = [];
  api.onEvent((p) => {
    if (booting) queued.push(p);
    else onEvent(p);
  });

  const s = await api.state();
  state = s;
  theme = s.theme;
  applyFont(s.font || 'm');
  soundOn = !!s.sound;
  pinned = !!s.pinned;
  devices = s.devices || [];
  room = s.room || room;
  members = s.members || [];
  blocked = s.blocked || [];
  loaded = s.messages || [];
  currentUrl = s.url || '';
  currentQr = s.qr || '';

  document.documentElement.dataset.theme = theme;
  applyMode(s.isFull ? 'full' : 'compact');
  applyPin();
  applyUrl(s.url, s.qr);
  buildEmoji();
  applyRoomPayload({ room, members, blocked }, true);

  try {
    const draft = localStorage.getItem('ldDraft');
    if (draft) {
      input.value = draft;
      autoGrow();
    }
  } catch {
    /* ignore */
  }
  btnSend.disabled = !input.value.trim();

  view = '';
  setView(targetView());
  appEl.classList.toggle('offline', devices.length === 0 && loaded.some((m) => m.kind !== 'system'));
  markSeen();

  if (s.locked) {
    setTimeout(() => toast('聊天记录无法解密，原文件已保留'), 900);
  }

  booting = false;
  for (const p of queued.splice(0)) onEvent(p);
})();
