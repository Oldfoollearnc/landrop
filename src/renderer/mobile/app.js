'use strict';

/* 近传 · 手机端聊天页
   纯原生 JS，无框架、无构建。这一版把原来缺的交互补齐：
   本地回显与离线队列、已读回执、回复引用、搜索跳转、多选删除、
   图片缩放滑动、聊天设置、原生桥接（剪贴板/保存/分享/震动）。 */

(() => {
  const $ = (id) => document.getElementById(id);
  const chat = $('chat');
  const input = $('input');
  const sendBtn = $('send');
  const CHUNK = 4 * 1024 * 1024;
  const MAX_TEXT = 20000;
  const RECALL_MS = 2 * 60 * 1000;

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

  const NS = 'http://www.w3.org/2000/svg';

  // ---------- 偏好 ----------

  const PREF_KEY = 'ns.prefs';
  const MEMBER_KEY = 'ns.member';
  const COLORS = ['sky', 'mint', 'amber', 'rose', 'violet', 'lime', 'coral', 'slate'];
  const storedPrefs = readJSON(PREF_KEY);
  const prefs = Object.assign(
    { enterSend: false, haptics: true, font: 'm', theme: 'auto', density: 'normal' },
    storedPrefs || {}
  );
  // 电脑浏览器默认回车发送；触屏设备仍然回车换行
  if (!storedPrefs && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
    prefs.enterSend = true;
  }
  function readJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key) || 'null');
    } catch {
      return null;
    }
  }
  function savePrefs() {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      /* 隐私模式下可能写不了，忽略 */
    }
  }

  let native = null;
  const hasBridge = !!(window.NearSend && window.NearSend.config);
  try {
    if (hasBridge) native = JSON.parse(window.NearSend.config());
  } catch {
    native = null;
  }

  let myId = localStorage.getItem('nsDid') || '';
  if (!myId) {
    myId = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
    localStorage.setItem('nsDid', myId);
  }
  let seq = 0;
  // 每次启动换一个随机片段。只用递增 seq 的话，刷新页面后第一条消息的 cid
  // 会和上次相同，服务端按 cid 去重会把它当成重复消息，气泡就永远停在「待发送」
  const bootTag = Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 6);
  const nextCid = (kind) => `${myId}.${bootTag}.${kind}${++seq}`;

  // ---------- 设备与群成员身份 ----------

  function deviceKind() {
    const ua = navigator.userAgent || '';
    if (/iPad|Tablet|PlayBook|Silk/i.test(ua)) return 'tablet';
    if (/iPhone|Android|Mobile|Windows Phone/i.test(ua)) return 'phone';
    return 'desktop';
  }

  function defaultName() {
    const ua = navigator.userAgent || '';
    if (/iPhone/i.test(ua)) return 'iPhone';
    if (/iPad/i.test(ua)) return 'iPad';
    if (/Android/i.test(ua)) return 'Android手机';
    if (/Macintosh/i.test(ua)) return 'Mac';
    if (/Windows/i.test(ua)) return 'Windows电脑';
    return '成员';
  }

  function colorForName(name, requested) {
    if (COLORS.includes(requested)) return requested;
    let h = 0;
    for (const ch of Array.from(String(name || ''))) h = (h * 31 + ch.codePointAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
  }

  function saveMember(next) {
    try {
      if (next) localStorage.setItem(MEMBER_KEY, JSON.stringify(next));
      else localStorage.removeItem(MEMBER_KEY);
    } catch {
      /* 隐私模式可能写不了，本次会话仍可继续 */
    }
  }

  function loadMember() {
    try {
      const saved = JSON.parse(localStorage.getItem(MEMBER_KEY) || 'null');
      if (!saved || typeof saved !== 'object') return null;
      if (!saved.id || !saved.key) return null;
      return {
        id: String(saved.id),
        key: String(saved.key),
        name: String(saved.name || defaultName()),
        color: colorForName(saved.name, saved.color),
        kind: deviceKind(),
      };
    } catch {
      return null;
    }
  }

  let member = loadMember();

  // ---------- 状态 ----------

  const state = {
    messages: [],
    byId: new Map(),
    nodes: new Map(),
    failed: [],
    pending: new Map(), // cid -> {text, reply, ts}
    locals: new Map(), // cid -> {id, kind}
    lastDay: '',
    lastTs: 0,
    lastFrom: '',
    stick: true,
    unread: 0,
    connected: false,
    everConnected: false,
    peer: '',
    version: '',
    selecting: false,
    selection: new Set(),
    hits: [],
    hitIndex: -1,
    reply: null,
    searching: false,
    expand: new Set(),
    dl: new Map(),      // 消息 id -> 下载进度
    dlIds: new Map(),   // 消息 id -> 系统下载任务 id
    saved: new Set(),
    cancelUploads: new Set(), // cid -> 用户已取消，上传循环看到后停止
    me: null,
    room: null,
    members: [],
    blocked: [],
    typing: new Map(),
    joined: false,
    sideOpen: false,
    invite: null,
    joining: false,
    hiddenUnread: 0,
  };

  let ws = null;
  let retryDelay = 600;
  let connectPaused = false;
  let reconnectTimer = null;
  let hbTimer = null;
  let typingHideTimer = null;
  let typingStopTimer = null;
  let lastTypingSent = 0;
  let lastInbound = Date.now();
  // 发出后多久没有回执就认为这条链路可能已经死了
  const ACK_TIMEOUT = 6000;
  const MAX_ATTEMPTS = 3;
  let seenTimer = null;
  let seenQueue = new Set();
  let lastSheetAt = 0;

  // ---------- 工具 ----------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[c]));
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

  function extLabel(name) {
    const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
    return m ? m[1].toUpperCase() : 'FILE';
  }

  const pad = (n) => String(n).padStart(2, '0');
  function clock(ts) {
    const d = new Date(ts);
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function dayKey(ts) {
    const d = new Date(ts);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  function dayLabel(ts) {
    const d = new Date(ts);
    const today = new Date();
    const k = dayKey(ts);
    if (k === dayKey(today.getTime())) return '今天';
    const y = new Date(today.getTime() - 86400000);
    if (k === dayKey(y.getTime())) return '昨天';
    const sameYear = d.getFullYear() === today.getFullYear();
    const week = '日一二三四五六'[d.getDay()];
    return sameYear
      ? `${d.getMonth() + 1}月${d.getDate()}日 周${week}`
      : `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
  }
  function fullTime(ts) {
    return `${dayLabel(ts)} ${clock(ts)}`;
  }

  const isLocal = (m) => !!m && (String(m.id).startsWith('local:') || (m.src && state.pending.has(m.src)));

  function isMine(m) {
    if (!m) return false;
    if (isLocal(m)) return true;
    if (m.uid) return !!(state.me && m.uid === state.me.id);
    // 旧版历史没有署名：手机端不再把「所有 phone 消息」误认成自己
    return false;
  }

  function memberById(id) {
    return state.members.find((x) => x.id === id) || null;
  }

  function authorOf(m) {
    if (!m) return { id: '', name: '成员', color: 'slate', kind: 'phone' };
    const live = m.author && memberById(m.author.id);
    if (live) return live;
    if (m.author) return m.author;
    if (m.uid === 'host' || m.from === 'pc') {
      const host = state.room && state.room.host;
      return host || { id: 'host', name: '电脑', color: 'sky', kind: 'desktop' };
    }
    return { id: 'legacy', name: '成员', color: 'slate', kind: 'phone' };
  }

  function avatarEl(person, small) {
    const el = document.createElement('span');
    el.className = 'av' + (small ? ' sm' : '');
    el.dataset.c = person && person.color ? person.color : 'slate';
    const chars = Array.from(String((person && person.name) || '?'));
    el.textContent = chars.length ? chars[0] : '?';
    return el;
  }

  function onlineMembers() {
    return state.members.filter((m) => m && m.online);
  }

  function readCount(m) {
    if (!m) return 0;
    if (Array.isArray(m.seenBy)) return m.seenBy.length;
    return m.seen ? 1 : 0;
  }

  function readByMe(m) {
    return !!(state.me && (Array.isArray(m.seenBy)
      ? m.seenBy.includes(state.me.id)
      : m.seen));
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
  const isMedia = (m) => m.kind === 'image' || m.kind === 'file' || m.kind === 'video';

  function buzz(ms = 8) {
    try {
      // 原生容器里以 App 的「震动反馈」设置为准，网页偏好可能是旧版本留下的
      if (native && window.NearSend && window.NearSend.vibrate) {
        window.NearSend.vibrate(ms);
        return;
      }
      if (!prefs.haptics) return;
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch {
      /* ignore */
    }
  }

  let toastTimer = null;
  const toastEl = $('toast');
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1900);
  }

  function renderTyping() {
    const now = Date.now();
    for (const [id, item] of state.typing) {
      if (!item || item.until <= now) state.typing.delete(id);
    }
    const el = $('typing');
    const names = [...state.typing.entries()]
      .filter(([id]) => !state.me || id !== state.me.id)
      .map(([, item]) => item.name)
      .filter(Boolean);
    clearTimeout(typingHideTimer);
    typingHideTimer = null;
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
    if (!id || (state.me && id === state.me.id)) return;
    if (on) state.typing.set(id, { name: name || '成员', until: Date.now() + 5000 });
    else state.typing.delete(id);
    renderTyping();
  }

  function sendTyping(on) {
    clearTimeout(typingStopTimer);
    typingStopTimer = null;
    if (on) {
      if (!state.connected || !state.joined || !ws || ws.readyState !== 1) return;
      const now = Date.now();
      if (now - lastTypingSent < 1800) return;
      lastTypingSent = now;
      try {
        ws.send(JSON.stringify({ t: 'typing', on: true }));
      } catch {
        /* ignore */
      }
      typingStopTimer = setTimeout(() => sendTyping(false), 2500);
    } else {
      const wasActive = !!lastTypingSent;
      lastTypingSent = 0;
      if (wasActive && state.connected && ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ t: 'typing', on: false }));
        } catch {
          /* ignore */
        }
      }
    }
  }

  function svg(path, size = 20, opts = {}) {
    const s = document.createElementNS(NS, 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('width', size);
    s.setAttribute('height', size);
    s.setAttribute('fill', opts.fill ? 'currentColor' : 'none');
    if (!opts.fill) {
      s.setAttribute('stroke', 'currentColor');
      s.setAttribute('stroke-width', opts.width || 1.8);
      s.setAttribute('stroke-linecap', 'round');
      s.setAttribute('stroke-linejoin', 'round');
    }
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', path);
    s.appendChild(p);
    return s;
  }

  const PATH = {
    copy: 'M9 9h9v11H9z M15.5 9V5.5H5.5V16h3.5',
    reply: 'M9.5 7.5L4.5 12l5 4.5 M5 12h9.2a5.3 5.3 0 0 1 0 10.6',
    select: 'M4 7h16 M4 12h16 M4 17h10',
    trash: 'M4.5 7h15 M9 7V4.8h6V7 M6.6 7l1 13h8.8l1-13',
    save: 'M12 4v11 M7.5 11L12 15.5 16.5 11 M5 20.5h14',
    share: 'M12 16V5 M8 9l4-4 4 4 M5 14v6h14v-6',
    view: 'M4 4h6 M4 4v6 M20 4h-6 M20 4v6 M4 20h6 M4 20v-6 M20 20h-6 M20 20v-6',
    close: 'M6 6l12 12 M18 6L6 18',
    image: 'M3.6 5.4h16.8v13.2H3.6z M3.6 15.4l4.6-4.2 4 3.6 3.1-2.6 5.1 4.2',
    file: 'M7 3.5h7l4 4v13H7z M14 3.5V8h4',
    clipboard: 'M9 4.6h6v3.2H9z M7 6.2H5v14.3h14V6.2h-2',
    camera: 'M4 8h3.2l1.4-2h6.8l1.4 2H20v11H4z M12 16.6a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z',
    link: 'M10 14a4 4 0 0 0 5.7 0l2.3-2.3a4 4 0 0 0-5.7-5.7l-1 1 M14 10a4 4 0 0 0-5.7 0l-2.3 2.3a4 4 0 0 0 5.7 5.7l1-1',
    info: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8z M12 11v5.4 M12 7.8v.1',
    help: 'M12 3.6a8.4 8.4 0 1 0 0 16.8 8.4 8.4 0 0 0 0-16.8z M9.7 9.5a2.4 2.4 0 1 1 3.1 2.3c-.6.2-.9.8-.9 1.4v.5 M12 17v.1',
    settings: 'M12 15.2a3.2 3.2 0 1 0 0-6.4 3.2 3.2 0 0 0 0 6.4z M19 12c0-.5 0-.9-.1-1.3l2-1.5-2-3.4-2.3.9c-.7-.5-1.4-.9-2.2-1.1L14 3h-4l-.4 2.6c-.8.2-1.5.6-2.2 1.1l-2.3-.9-2 3.4 2 1.5c-.1.4-.1.8-.1 1.3s0 .9.1 1.3l-2 1.5 2 3.4 2.3-.9c.7.5 1.4.9 2.2 1.1L10 21h4l.4-2.6c.8-.2 1.5-.6 2.2-1.1l2.3.9 2-3.4-2-1.5c.1-.4.1-.8.1-1.3z',
    brush: 'M4 20l4.5-1.2L20 7.3 16.7 4 5.2 15.5z',
    undo: 'M9.5 7.5L4.5 12l5 4.5 M5.2 12h8.6a5.2 5.2 0 0 1 0 10.4h-1',
    chevron: 'M9 5.5L15.5 12 9 18.5',
    edit: 'M4 20l4.2-1 10.4-10.4-3.2-3.2L5 15.8z M13.8 7l3.2 3.2',
  };

  // ---------- 主题与字号 ----------

  function nativeTheme() {
    return native && (native.theme === 'dark' || native.theme === 'light') ? native.theme : null;
  }

  function resolvedTheme() {
    const nt = nativeTheme();
    if (nt) return nt;
    if (prefs.theme === 'light' || prefs.theme === 'dark') return prefs.theme;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  }

  function applyTheme() {
    document.documentElement.dataset.theme = resolvedTheme();
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', resolvedTheme() === 'dark' ? '#121418' : '#ffffff');
  }

  function fontScale() {
    if (native && typeof native.fontScale === 'number') return native.fontScale;
    const f = native ? native.font : prefs.font;
    return { s: 0.9, m: 1, l: 1.1, xl: 1.22 }[f] || 1;
  }

  function applyFont() {
    document.documentElement.style.setProperty('--fs', (15 * fontScale()).toFixed(1) + 'px');
  }

  if (window.matchMedia) {
    try {
      window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (!nativeTheme() && prefs.theme === 'auto') applyTheme();
      });
    } catch {
      /* 老 WebView 没有 addEventListener */
    }
  }
  applyTheme();
  applyFont();

  // ---------- 渲染 ----------

  function nearBottom() {
    return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 120;
  }

  chat.addEventListener('scroll', () => {
    const near = nearBottom();
    state.stick = near;
    if (near && state.unread) {
      state.unread = 0;
      updateJump();
    }
  });

  function pin(force) {
    if (force) state.stick = true;
    if (state.stick) chat.scrollTop = chat.scrollHeight;
  }

  function updateJump() {
    const jump = $('jump');
    if (state.unread > 0 && !state.stick) {
      $('jumpCount').textContent = state.unread > 99 ? '99+' : String(state.unread);
      jump.hidden = false;
    } else {
      jump.hidden = true;
    }
  }

  function addDaySeparator(ts) {
    const key = dayKey(ts);
    if (key !== state.lastDay) {
      state.lastDay = key;
      const d = document.createElement('div');
      d.className = 'day';
      d.textContent = dayLabel(ts);
      chat.appendChild(d);
      return true;
    }
    return false;
  }

  function addTimeSeparator(ts) {
    if (!state.lastTs) return;
    const gap = ts - state.lastTs;
    const newDay = state.lastDay !== dayKey(ts);
    if (gap > 10 * 60 * 1000 || newDay) {
      const sep = document.createElement('div');
      sep.className = 'sep';
      sep.textContent = clock(ts);
      chat.appendChild(sep);
    }
  }

  function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function appendMentions(container, text) {
    const names = state.members.map((m) => m && m.name).filter(Boolean)
      .sort((a, b) => b.length - a.length);
    if (!names.length || !text.includes('@')) {
      container.appendChild(document.createTextNode(text));
      return;
    }
    const re = new RegExp('@(' + names.map(escapeRe).join('|') + ')(?![\\p{L}\\p{N}_])', 'gu');
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
      const span = document.createElement('span');
      span.className = 'at';
      const hit = state.members.find((x) => x && x.name === m[1]);
      if (state.me && hit && hit.id === state.me.id) span.classList.add('me');
      span.textContent = '@' + m[1];
      container.appendChild(span);
      last = m.index + m[0].length;
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  }

  function linkify(container, text) {
    const re = /(https?:\/\/[^\s<>()"'，。；！？、]+)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) appendMentions(container, text.slice(last, m.index));
      const a = document.createElement('a');
      a.href = m[1];
      a.textContent = m[1];
      a.rel = 'noopener noreferrer';
      a.addEventListener('click', (e) => {
        e.preventDefault();
        openLink(m[1]);
      });
      container.appendChild(a);
      last = m.index + m[1].length;
    }
    if (last < text.length) appendMentions(container, text.slice(last));
  }

  function openLink(url) {
    if (native && window.NearSend && window.NearSend.openUrl) {
      window.NearSend.openUrl(url);
      return;
    }
    window.open(url, '_blank', 'noopener');
  }

  function quoteEl(reply) {
    const q = document.createElement('div');
    q.className = 'quote';
    const name = document.createElement('span');
    name.className = 'qname';
    let who = '';
    if (reply.author && reply.author.name) who = reply.author.name;
    else if (reply.uid && state.me && reply.uid === state.me.id) who = '我';
    else if (reply.uid === 'host' || reply.from === 'pc') who = (state.room && state.room.host && state.room.host.name) || '电脑';
    else who = '成员';
    if (state.me && reply.uid === state.me.id) who = '我';
    name.textContent = who;
    const text = document.createElement('span');
    text.className = 'qtext';
    text.textContent = reply.kind === 'image'
      ? '[图片] ' + (reply.name || '')
      : reply.kind === 'file'
        ? '[文件] ' + (reply.name || '')
        : String(reply.text || '');
    q.appendChild(name);
    q.appendChild(text);
    q.addEventListener('click', (e) => {
      e.stopPropagation();
      jumpTo(reply.id);
    });
    return q;
  }

  function textContentEl(m) {
    const box = document.createElement('div');
    box.className = 'txt';
    const full = String(m.text || '');
    const collapsed = full.length > 700 && !state.expand.has(m.id);
    linkify(box, collapsed ? full.slice(0, 700) : full);
    if (collapsed) {
      const more = document.createElement('span');
      more.className = 'more';
      more.textContent = '展开';
      more.addEventListener('click', (e) => {
        e.stopPropagation();
        state.expand.add(m.id);
        const fresh = buildRow(m);
        const old = state.nodes.get(m.id);
        if (old) {
          old.replaceWith(fresh);
          state.nodes.set(m.id, fresh);
        }
      });
      box.appendChild(document.createElement('br'));
      box.appendChild(more);
    }
    return box;
  }

  function seenLabel(m) {
    const n = readCount(m);
    if (!n) return '已送达';
    return n === 1 ? '已读' : `${n} 人已读`;
  }

  function ticksEl(m) {
    const wrap = document.createElement('span');
    const n = readCount(m);
    wrap.className = 'ticks' + (n ? ' seen' : '');
    wrap.title = seenLabel(m);
    const count = n ? 2 : 1;
    for (let i = 0; i < count; i++) {
      const s = svg('M4.5 12.5l4.2 4.2L19.5 5.8', 11, { width: 2.4 });
      s.style.marginLeft = i ? '-6px' : '0';
      wrap.appendChild(s);
    }
    return wrap;
  }

  function statusText(m) {
    if (m.status === 'queued') return '待发送';
    if (m.status === 'sending') return '发送中';
    if (m.status === 'error') return '发送失败';
    return '';
  }

  function metaEl(m) {
    const meta = document.createElement('div');
    meta.className = 'meta';
    const t = document.createElement('span');
    t.textContent = clock(m.ts);
    meta.appendChild(t);
    if (m.status === 'queued' || m.status === 'sending') {
      const st = document.createElement('span');
      st.textContent = statusText(m);
      meta.appendChild(st);
    } else if (m.status === 'error') {
      const st = document.createElement('span');
      st.className = 'failed-label';
      st.textContent = '未送达';
      meta.appendChild(st);
    } else if (isMine(m) && m.kind === 'text') {
      meta.appendChild(ticksEl(m));
      const n = readCount(m);
      if (n) {
        const r = document.createElement('span');
        r.textContent = n === 1 ? '已读' : `${n} 人已读`;
        meta.appendChild(r);
      }
    }
    return meta;
  }

  function fileCard(m) {
    const wrap = document.createElement('div');
    wrap.className = 'file';
    const ic = document.createElement('div');
    ic.className = 'fi';
    ic.textContent = extLabel(m.name);
    const fx = document.createElement('div');
    fx.className = 'fx';
    const fn = document.createElement('div');
    fn.className = 'fn';
    fn.textContent = m.name || '文件';
    const fs = document.createElement('div');
    fs.className = 'fs';
    const sz = document.createElement('span');
    sz.textContent = fmtSize(m.size);
    fs.appendChild(sz);
    const pct = document.createElement('span');
    pct.className = 'pct';
    if (m.status === 'uploading') pct.textContent = ' · ' + Math.round((m.progress || 0) * 100) + '%';
    else if (m.status === 'error') pct.textContent = ' · 未完成';
    fs.appendChild(pct);
    if (isMine(m) && m.status === 'ok') {
      const tick = ticksEl(m);
      tick.style.marginLeft = '5px';
      tick.style.verticalAlign = '-1px';
      fs.appendChild(tick);
    }    fx.appendChild(fn);
    fx.appendChild(fs);
    wrap.appendChild(ic);
    wrap.appendChild(fx);
    return wrap;
  }

  function progressEl(m) {
    const p = document.createElement('div');
    p.className = 'progress';
    const i = document.createElement('i');
    i.style.width = Math.round((m.progress || 0) * 100) + '%';
    p.appendChild(i);
    return p;
  }

  function buildRow(m, cont) {
    const row = document.createElement('div');
    row.dataset.id = m.id;
    // 长按弹出的操作面板在松手后仍可能补发一次 click（打开大图/链接/重发）。
    // 在捕获阶段吞掉这次 click，避免面板和 viewer 同时打开。
    row.addEventListener('click', (e) => {
      if (Date.now() - lastSheetAt < 400) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true);

    if (m.kind === 'system') {
      row.className = 'msg sys';
      const tip = document.createElement('span');
      tip.textContent = m.text || '';
      row.appendChild(tip);
      return row;
    }

    const out = isMine(m);
    const who = authorOf(m);
    row.className = 'msg ' + (out ? 'out' : 'in')
      + (m.status === 'error' ? ' failed' : '')
      + (cont ? ' cont' : '');

    if (m.recalled) {
      row.classList.add('sys');
      if (state.selection.has(m.id)) row.classList.add('sel');
      const tip = document.createElement('span');
      tip.textContent = out ? '你撤回了一条消息' : `${who.name} 撤回了一条消息`;
      row.appendChild(tip);
      return row;
    }

    if (m.status === 'queued') row.classList.add('queued');
    if (state.selection.has(m.id)) row.classList.add('sel');

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

    if (m.reply) b.appendChild(quoteEl(m.reply));

    if (m.kind === 'text') {
      b.appendChild(textContentEl(m));
      if (out) b.appendChild(metaEl(m));
    } else {
      b.classList.add('media');
      const video = /^video\//i.test(m.mime || '') || /\.(mp4|mov|webm|m4v)$/i.test(m.name || '');
      const audio = !video && (/^audio\//i.test(m.mime || '')
        || /\.(mp3|m4a|wav|ogg|aac|flac|opus)$/i.test(m.name || ''));
      if (m.kind === 'image' && m.status === 'ok') {
        const img = document.createElement('img');
        img.loading = 'lazy';
        img.alt = m.name || '图片';
        img.src = `/t/${m.id}`;
        img.addEventListener('click', () => {
          if (!state.selecting) openViewer(m.id);
        });
        img.addEventListener('load', () => {
          if (state.stick) pin(true);
        });
        img.addEventListener('error', () => {
          // 电脑上的原文件被移走/删除时，别留一个破图标
          if (img.isConnected) img.replaceWith(fileCard(m));
        });
        b.appendChild(img);
      } else if (video && m.status === 'ok') {
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.src = `/t/${m.id}`;
        v.addEventListener('click', (e) => e.stopPropagation());
        v.addEventListener('loadedmetadata', () => {
          if (state.stick) pin(true);
        });
        v.addEventListener('error', () => {
          if (v.isConnected) v.replaceWith(fileCard(m));
        });
        b.appendChild(v);
      } else if (audio && m.status === 'ok') {
        const a = document.createElement('audio');
        a.controls = true;
        a.preload = 'metadata';
        a.src = `/t/${m.id}`;
        a.addEventListener('click', (e) => e.stopPropagation());
        a.addEventListener('error', () => {
          if (a.isConnected) a.replaceWith(fileCard(m));
        });
        b.appendChild(a);
      } else {
        b.appendChild(fileCard(m));
      }

      // 图片/视频/音频在缩略图下补一行文件名；文件卡片本身已经有名字和大小，不再重复
      const hasThumb = (m.kind === 'image' || video || audio) && m.status === 'ok';
      if (hasThumb) {
        const cap = document.createElement('div');
        cap.className = 'cap';
        const name = document.createElement('span');
        name.className = 'cname';
        name.textContent = m.name || (m.kind === 'image' ? '图片' : video ? '视频' : audio ? '音频' : '文件');
        const size = document.createElement('span');
        size.textContent = fmtSize(m.size);
        cap.appendChild(name);
        cap.appendChild(size);
        if (out && m.status === 'ok') cap.appendChild(ticksEl(m));
        b.appendChild(cap);
      }

      if (m.status === 'uploading') b.appendChild(progressEl(m));

      // 文件/视频：点一下就直接给操作，不必先摸索长按
      if (m.kind !== 'image' && m.status === 'ok') {
        b.addEventListener('click', (e) => {
          if (state.selecting) return;
          if (Date.now() - lastSheetAt < 400) return;
          e.stopPropagation();
          openActions(m);
        });
      }

      // 下载中 / 已保存：在卡片下方给一条可见的进度
      const dlState = state.dl.get(m.id);
      if (dlState || state.saved.has(m.id)) b.appendChild(downloadEl(m, dlState));
    }

    // 未送达的文字：点一下就地重发
    if (m.status === 'error' && out && m.kind === 'text') {
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!state.selecting) retryText(m);
      });
    }

    // 长按整行都能触发：文件卡片的留白区域也要能按到
    const bubbleWrap = document.createElement('div');
    bubbleWrap.className = 'bwrap';
    bubbleWrap.appendChild(b);
    mcol.appendChild(bubbleWrap);
    row.appendChild(mcol);
    attachPress(row, m);
    return row;
  }

  function appendMessage(m) {
    const wasNear = nearBottom();
    const empty = chat.querySelector('.empty');
    if (empty) empty.remove();

    const newDay = addDaySeparator(m.ts);
    if (!newDay) addTimeSeparator(m.ts);

    const authorId = m.kind === 'system' ? '' : (m.uid || (m.from === 'pc' ? 'host' : 'legacy'));
    const tight = !!authorId && state.lastFrom === authorId && m.ts - state.lastTs < 180000 && !newDay;
    const el = buildRow(m, tight);
    if (!tight) el.classList.add('break');
    el.classList.add('enter');
    setTimeout(() => el.classList.remove('enter'), 240);
    chat.appendChild(el);

    state.messages.push(m);
    state.byId.set(m.id, m);
    state.nodes.set(m.id, el);
    state.lastTs = m.ts;
    state.lastFrom = authorId;

    if (isMine(m) || wasNear) {
      pin(true);
      updateJump();
    } else if (!state.stick && m.kind !== 'system') {
      state.unread += 1;
      updateJump();
    }

    if (!isMine(m) && m.kind !== 'system' && m.status === 'ok') scheduleSeen(m.id);
  }

  function renderEmpty() {
    chat.textContent = '';
    const box = document.createElement('div');
    box.className = 'empty';
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.appendChild(svg('M8.4 16.2V7.4M8.4 7.4L5.6 10.2M8.4 7.4l2.8 2.8M15.6 7.8v8.8M15.6 16.6l-2.8-2.8M15.6 16.6l2.8-2.8', 26, { width: 2.2 }));
    const t = document.createElement('b');
    t.textContent = '群聊已就绪';
    const d = document.createElement('span');
    d.textContent = '发一条消息，或者邀请同 Wi-Fi 下的手机、电脑扫码加入。大文件分片直传，不压缩、不中转。'
      + (deviceKind() === 'desktop' ? ' 右键消息可以回复、复制或删除。' : '');
    box.appendChild(mark);
    box.appendChild(t);
    box.appendChild(d);
    chat.appendChild(box);
  }

  function renderAll(list) {
    chat.textContent = '';
    state.messages = [];
    state.byId.clear();
    state.nodes.clear();
    state.lastDay = '';
    state.lastTs = 0;
    state.lastFrom = '';
    state.expand.clear();

    if (list.length >= 500) {
      const hint = document.createElement('div');
      hint.className = 'history-hint';
      hint.textContent = '只显示最近 500 条记录';
      chat.appendChild(hint);
    }
    if (!list.length && !state.pending.size) {
      renderEmpty();
      return;
    }
    for (const m of list) appendMessage(m);
    renderPending();
    renderFailed();
    pin(true);
    setTimeout(() => pin(false), 120);
  }

  function authorKey(m) {
    return m.kind === 'system' ? '' : (m.uid || (m.from === 'pc' ? 'host' : 'legacy'));
  }

  function isCont(m, prev) {
    if (!m || !prev || m.kind === 'system' || prev.kind === 'system') return false;
    return authorKey(m) === authorKey(prev)
      && m.ts - prev.ts < 180000
      && dayKey(m.ts) === dayKey(prev.ts);
  }

  function rebuildRow(m) {
    const old = state.nodes.get(m.id);
    if (!old) return;
    const idx = state.messages.findIndex((x) => x.id === m.id);
    const prev = idx > 0 ? state.messages[idx - 1] : null;
    const fresh = buildRow(m, isCont(m, prev));
    if (!isCont(m, prev)) fresh.classList.add('break');
    old.replaceWith(fresh);
    state.nodes.set(m.id, fresh);
  }

  function removeRow(id) {
    const el = state.nodes.get(id);
    if (el) el.remove();
    state.nodes.delete(id);
    state.byId.delete(id);
    state.messages = state.messages.filter((m) => m.id !== id);
    if (state.selection.delete(id) && state.selecting) refreshSelection();
    if (!state.messages.length && !state.failed.length) {
      renderAll([]);
    }
  }

  function jumpTo(id) {
    const el = state.nodes.get(id);
    if (!el) {
      toast('这条消息不在当前记录里');
      return;
    }
    state.stick = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    el.classList.add('hit', 'active');
    setTimeout(() => el.classList.remove('active'), 1600);
  }

  // ---------- 待发送队列 ----------

  const QUEUE_KEY = 'ns.queue';

  function saveQueue() {
    try {
      const arr = [...state.pending.entries()].map(([cid, v]) => ({
        cid,
        text: v.text,
        reply: v.reply || null,
        ts: v.ts,
      }));
      localStorage.setItem(QUEUE_KEY, JSON.stringify(arr));
    } catch {
      /* ignore */
    }
  }

  function loadQueue() {
    const arr = readJSON(QUEUE_KEY);
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || !item.cid || typeof item.text !== 'string') continue;
      state.pending.set(item.cid, { text: item.text, reply: item.reply || null, ts: item.ts || Date.now() });
    }
  }

  function renderPending() {
    for (const [cid, v] of state.pending) {
      const m = {
        id: 'local:' + cid,
        src: cid,
        from: 'phone',
        uid: state.me ? state.me.id : '',
        author: state.me ? { id: state.me.id, name: state.me.name, color: state.me.color, kind: state.me.kind } : null,
        kind: 'text',
        text: v.text,
        reply: v.reply,
        status: 'queued',
        ts: v.ts || Date.now(),
      };
      state.locals.set(cid, { id: m.id, kind: 'text' });
      appendMessage(m);
    }
  }

  function queueText(text, reply) {
    const cid = nextCid('t');
    state.pending.set(cid, { text, reply: reply || null, ts: Date.now() });
    saveQueue();
    const m = {
      id: 'local:' + cid,
      src: cid,
      from: 'phone',
      uid: state.me ? state.me.id : '',
      author: state.me ? { id: state.me.id, name: state.me.name, color: state.me.color, kind: state.me.kind } : null,
      kind: 'text',
      text,
      reply: reply || null,
      status: 'queued',
      ts: Date.now(),
    };
    state.locals.set(cid, { id: m.id, kind: 'text' });
    appendMessage(m);
    return cid;
  }

  function setPendingStatus(cid, status) {
    const local = state.locals.get(cid);
    if (!local) return;
    const m = state.byId.get(local.id);
    if (!m) return;
    m.status = status;
    rebuildRow(m);
  }

  // ---------- 连接 ----------

  function setStatus(text, mode) {
    $('conn').textContent = text;
    const dot = $('dot');
    dot.classList.toggle('on', mode === 'on');
    dot.classList.toggle('warn', mode === 'warn');
  }

  function setOffline(show, text, retryable) {
    const bar = $('offline');
    bar.hidden = !show;
    if (show) {
      $('offlineText').textContent = text;
      $('offlineRetry').hidden = !retryable;
    }
  }

  function wsUrl() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const token = new URLSearchParams(location.search).get('t') || '';
    return `${proto}://${location.host}/ws${token ? '?t=' + encodeURIComponent(token) : ''}`;
  }

  function connect() {
    if (!member || connectPaused) return;
    if (ws && (ws.readyState === 0 || ws.readyState === 1)) return;
    clearTimeout(reconnectTimer);
    let socket;
    try {
      socket = new WebSocket(wsUrl());
    } catch {
      scheduleReconnect();
      return;
    }
    ws = socket;
    setStatus('连接中…', 'warn');

    socket.addEventListener('open', () => {
      if (ws !== socket) return;
      state.connected = true;
      state.everConnected = true;
      retryDelay = 600;
      lastInbound = Date.now();
      setStatus('已连接', 'on');
      setOffline(false);
      startHeartbeat();
      try {
        ws.send(JSON.stringify({
          t: 'hello',
          member: {
            id: member.id,
            key: member.key,
            name: member.name,
            color: member.color,
            kind: deviceKind(),
          },
        }));
      } catch {
        /* close 会兜底 */
      }
    });

    socket.addEventListener('message', (e) => {
      lastInbound = Date.now();
      let p;
      try {
        p = JSON.parse(e.data);
      } catch {
        return;
      }
      onSocket(p);
    });

    socket.addEventListener('close', (event) => {
      if (ws !== socket) return;
      ws = null;
      state.connected = false;
      state.joined = false;
      delete $('app').dataset.joined;
      if (state.joining) {
        state.joining = false;
        connectPaused = true;
        member = null;
        saveMember(null);
        state.me = null;
        setStatus('加入失败', 'warn');
        setOffline(false);
        showJoin('加入失败，请检查网络后重试');
        return;
      }
      if (event && event.code === 4001) {
        connectPaused = true;
        for (const cid of state.pending.keys()) setPendingStatus(cid, 'queued');
        state.typing.clear();
        renderTyping();
        setStatus('邀请已重置，请重新扫码', 'warn');
        setOffline(true, '群主重置了邀请链接，请重新扫描二维码', false);
        toast('邀请链接已重置，请重新扫码');
        return;
      }
      setStatus('连接断开，正在重连…', 'warn');
      const queued = state.pending.size;
      setOffline(true, queued ? `连接断开 · ${queued} 条消息待发送` : '连接断开，正在重连…', true);
      for (const cid of state.pending.keys()) setPendingStatus(cid, 'queued');
      state.typing.clear();
      renderTyping();
      if (!connectPaused) scheduleReconnect();
    });

    socket.addEventListener('error', () => {
      if (ws === socket) socket.close();
    });
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 1.8, 5000);
  }

  function dropSocket() {
    const dead = ws;
    ws = null;
    state.connected = false;
    clearInterval(hbTimer);
    hbTimer = null;
    if (dead) {
      try {
        dead.close();
      } catch {
        /* ignore */
      }
    }
    setStatus('连接断开，正在重连…', 'warn');
  }

  /**
   * 手机切网、锁屏、进后台之后，WebSocket 经常是「假连接」：
   * readyState 还是 1，send 也不报错，但帧根本到不了电脑。
   * 所以既要心跳判活，也要给每条消息加回执与超时重发。
   */
  function startHeartbeat() {
    clearInterval(hbTimer);
    hbTimer = setInterval(() => {
      if (!ws || ws.readyState !== 1) return;
      if (Date.now() - lastInbound > 45000) {
        dropSocket();
        scheduleReconnect();
        return;
      }
      try {
        ws.send(JSON.stringify({ t: 'ping', at: Date.now() }));
      } catch {
        dropSocket();
        scheduleReconnect();
      }
    }, 15000);
  }

  function deliver(cid) {
    const item = state.pending.get(cid);
    if (!item) return;
    if (!ws || ws.readyState !== 1 || !state.connected || !state.joined) {
      setPendingStatus(cid, 'queued');
      return;
    }
    item.attempts = (item.attempts || 0) + 1;
    item.failed = false;
    clearTimeout(item.timer);
    item.timer = setTimeout(() => onNoAck(cid), ACK_TIMEOUT);
    try {
      ws.send(JSON.stringify({ t: 'text', text: item.text, cid, reply: item.reply || undefined }));
      setPendingStatus(cid, 'sending');
    } catch {
      clearTimeout(item.timer);
      onNoAck(cid);
    }
  }

  function onNoAck(cid) {
    const item = state.pending.get(cid);
    if (!item) return;
    if ((item.attempts || 0) >= MAX_ATTEMPTS) {
      failText(cid);
      return;
    }
    // WebSocket 没回执就再用 HTTP 走一遍，两条链路总有一条是活的
    postJSON('/api/send/text', { text: item.text, cid, reply: item.reply || undefined })
      .then((r) => {
        if (r && r.msg) resolveLocal(cid, r.msg);
        else if (r && r.id) resolveLocal(cid, { id: r.id, src: cid });
        else failText(cid);
      })
      .catch(() => {
        const it = state.pending.get(cid);
        if (!it) return;
        if ((it.attempts || 0) >= MAX_ATTEMPTS) {
          failText(cid);
          return;
        }
        setPendingStatus(cid, 'sending');
        dropSocket();
        scheduleReconnect();
      });
  }

  function resolveLocal(cid, msg) {
    const item = state.pending.get(cid);
    if (item) clearTimeout(item.timer);
    state.pending.delete(cid);
    saveQueue();
    const local = state.locals.get(cid);
    if (local) {
      removeLocalRow(local.id);
      state.locals.delete(cid);
    }
    if (msg && msg.id && msg.kind && !state.byId.has(msg.id)) appendMessage(msg);
  }

  function failText(cid) {
    const item = state.pending.get(cid);
    if (item) {
      clearTimeout(item.timer);
      item.failed = true;
    }
    setPendingStatus(cid, 'error');
    let n = 0;
    for (const [, v] of state.pending) if (v.failed) n += 1;
    if (n) setOffline(true, `${n} 条消息未送达，点一下气泡可以重新发送`, false);
  }

  function retryText(m) {
    const item = state.pending.get(m.src);
    if (!item) return;
    item.attempts = 0;
    item.failed = false;
    setOffline(false);
    if (!ws || ws.readyState !== 1) {
      connect();
      scheduleReconnect();
    }
    deliver(m.src);
    scheduleReconnect();
  }

  function flushPending() {
    if (!ws || ws.readyState !== 1) return;
    for (const cid of state.pending.keys()) {
      const item = state.pending.get(cid);
      if (!item) continue;
      item.attempts = 0;
      item.failed = false;
      deliver(cid);
    }
  }

  function onSocket(p) {
    if (p.t === 'ready') {
      state.version = p.version || state.version;
      if (p.room) state.room = p.room;
      if (p.members) state.members = p.members;
      renderHeader();
      renderSide();
      return;
    }
    if (p.t === 'welcome') {
      if (p.me) {
        const key = p.me.key || (member && member.id === p.me.id ? member.key : '');
        state.me = {
          id: p.me.id,
          name: p.me.name,
          color: p.me.color,
          kind: p.me.kind,
          key,
        };
        member = {
          id: p.me.id,
          key,
          name: p.me.name,
          color: p.me.color,
          kind: deviceKind(),
        };
        saveMember(member);
      }
      state.room = p.room || state.room;
      state.members = p.members || [];
      state.blocked = p.blocked || [];
      state.joined = true;
      state.joining = false;
      connectPaused = false;
      state.peer = (state.room && state.room.name) || '群聊';
      $('app').dataset.joined = '1';
      $('join').hidden = true;
      joinFocused = false;
      $('joinBtn').disabled = false;
      $('joinBtn').textContent = '加入群聊';
      setStatus('已连接', 'on');
      renderHeader();
      renderSide();
      reconcileHistory(p.messages || []);
      flushPending();
      return;
    }
    if (p.t === 'denied') {
      state.joining = false;
      connectPaused = true;
      member = null;
      saveMember(null);
      state.me = null;
      state.joined = false;
      delete $('app').dataset.joined;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      const msg = p.code === 'blocked'
        ? '你已被移出群聊，可以以新成员身份加入'
        : p.code === 'locked'
          ? '群聊已锁定，暂时无法加入'
          : p.code === 'full'
            ? '群成员已满'
            : '身份已失效，重新加入即可';
      showJoin(msg);
      return;
    }
    if (p.t === 'me') {
      if (p.me) {
        state.me = Object.assign({}, state.me, p.me);
        if (member) {
          member.name = p.me.name;
          member.color = p.me.color;
          saveMember(member);
        }
        renderHeader();
        renderSide();
      }
      return;
    }
    if (p.t === 'room') {
      applyRoom(p);
      return;
    }
    if (p.t === 'typing') {
      setTyping(p.id, p.name, !!p.on);
      return;
    }
    if (p.t === 'msg') {
      const m = p.msg;
      if (!m) return;
      if (m.uid) setTyping(m.uid, (authorOf(m) || {}).name, false);
      if (m.src && state.locals.has(m.src)) {
        const local = state.locals.get(m.src);
        removeLocalRow(local.id);
        if (local.kind === 'text') {
          state.pending.delete(m.src);
          saveQueue();
          state.locals.delete(m.src);
        } else {
          // 上传成功后继续用服务端 id 跟踪进度
          state.locals.set(m.src, { id: m.id, kind: local.kind });
        }
        // 重连后的历史里可能已经有这条（例如 ack 丢了），不要再画一遍
        if (!state.byId.has(m.id)) appendMessage(m);
        return;
      }
      if (state.byId.has(m.id)) return;
      appendMessage(m);
      if (!isMine(m) && m.kind !== 'system' && document.visibilityState !== 'visible') {
        state.hiddenUnread += 1;
        updateTitle();
      }
      return;
    }
    if (p.t === 'msg:update') {
      patch(p.id, p.patch || {});
      return;
    }
    if (p.t === 'msg:delete') {
      cancelUploadFor(p.id);
      removeRow(p.id);
      return;
    }
    if (p.t === 'clear') {
      cancelAllUploads();
      clearReply();
      closeMention();
      state.typing.clear();
      renderTyping();
      renderAll([]);
      return;
    }
    if (p.t === 'ack') {
      resolveLocal(p.cid, p.msg || null);
      return;
    }
    if (p.t === 'kicked') {
      state.joined = false;
      connectPaused = true;
      member = null;
      saveMember(null);
      state.me = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      showJoin('你已被移出群聊，可以以新成员身份加入');
      return;
    }
    if (p.t === 'left') {
      state.joined = false;
      connectPaused = true;
      member = null;
      saveMember(null);
      state.me = null;
      if (ws) {
        try {
          ws.close();
        } catch {
          /* ignore */
        }
        ws = null;
      }
      showJoin('已退出群聊，可以重新加入');
      return;
    }
    if (p.t === 'error') {
      toast(p.message || '操作失败');
      return;
    }
    if (p.t === 'url') {
      state.invite = null;
      ensureInvite().then((inv) => {
        if (inv && inv.qr) renderSide();
      });
      return;
    }
    if (p.t === 'pong' || p.t === 'presence') {
      return;
    }
  }

  function applyRoom(p) {
    if (p.room) state.room = p.room;
    if (Array.isArray(p.members)) state.members = p.members;
    if (Array.isArray(p.blocked)) state.blocked = p.blocked;
    if (state.me) {
      const live = memberById(state.me.id);
      if (live) {
        state.me.name = live.name;
        state.me.color = live.color;
        state.me.online = true;
        if (member) {
          member.name = live.name;
          member.color = live.color;
          saveMember(member);
        }
      }
    }
    state.peer = (state.room && state.room.name) || state.peer || '群聊';
    renderHeader();
    renderSide();
    updateTitle();
  }

  function updateTitle() {
    const base = ((state.room && state.room.name) || '近传群聊') + ' · 近传';
    const n = state.hiddenUnread || 0;
    document.title = n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base;
  }

  function renderHeader() {
    const room = state.room || { name: '近传群聊', onlineCount: 1, memberCount: 1, locked: false };
    $('peer').textContent = room.name || '近传群聊';
    const online = Number(room.onlineCount) || 1;
    const total = Number(room.memberCount) || 1;
    $('online').textContent = online >= total ? `${total} 人在线` : `${online}/${total} 在线`;
    $('lockBadge').hidden = !room.locked;

    const stack = $('stack');
    stack.textContent = '';
    const onlineList = state.members.filter((m) => m && m.online);
    for (const m of onlineList.slice(0, 3)) {
      stack.appendChild(avatarEl(m, true));
    }
    if (onlineList.length > 3) {
      const more = document.createElement('span');
      more.className = 'stackmore';
      more.textContent = '+' + (onlineList.length - 3);
      stack.appendChild(more);
    }
    stack.title = onlineList.map((m) => m.name).join('、');
    updateTitle();
  }

  function memberRow(m) {
    const row = document.createElement('div');
    row.className = 'mrow' + (m.online ? ' on' : '');
    row.setAttribute('role', 'button');
    row.tabIndex = 0;
    row.appendChild(avatarEl(m));
    const info = document.createElement('div');
    info.className = 'minfo';
    const line = document.createElement('div');
    line.className = 'mline';
    const name = document.createElement('b');
    name.textContent = m.name;
    line.appendChild(name);
    if (m.isHost) {
      const badge = document.createElement('i');
      badge.className = 'mbadge host';
      badge.textContent = '群主';
      line.appendChild(badge);
    }
    if (state.me && m.id === state.me.id) {
      const badge = document.createElement('i');
      badge.className = 'mbadge';
      badge.textContent = '我';
      line.appendChild(badge);
    }
    info.appendChild(line);
    const status = document.createElement('span');
    status.className = 'msub';
    status.textContent = m.isHost
      ? '群主电脑 · 在线'
      : m.online
        ? `${kindLabel(m.kind)} · 在线`
        : `${kindLabel(m.kind)} · ${lastSeenText(m.lastSeen)}`;
    info.appendChild(status);
    row.appendChild(info);
    const dot = document.createElement('span');
    dot.className = 'mdot' + (m.online ? ' on' : '');
    row.appendChild(dot);
    row.addEventListener('click', () => openMemberActions(m));
    row.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openMemberActions(m);
      }
    });
    return row;
  }

  function renderSide() {
    const body = $('sideBody');
    if (!body) return;
    const room = state.room || { name: '近传群聊', onlineCount: 1, memberCount: 1 };
    body.textContent = '';

    const card = document.createElement('div');
    card.className = 'side-room';
    const mark = document.createElement('span');
    mark.className = 'side-mark';
    mark.textContent = '群';
    card.appendChild(mark);
    const rinfo = document.createElement('div');
    const rn = document.createElement('b');
    rn.textContent = room.name || '近传群聊';
    const rs = document.createElement('span');
    rs.textContent = `${room.onlineCount || 1} 人在线 · ${room.memberCount || 1} 位成员${room.locked ? ' · 已锁定' : ''}`;
    rinfo.appendChild(rn);
    rinfo.appendChild(rs);
    card.appendChild(rinfo);
    body.appendChild(card);

    const invite = document.createElement('div');
    invite.className = 'invite-card';
    if (state.invite && state.invite.qr) {
      const img = document.createElement('img');
      img.src = state.invite.qr;
      img.alt = '邀请二维码';
      invite.appendChild(img);
      const tip = document.createElement('span');
      tip.textContent = '手机或电脑扫码加入';
      invite.appendChild(tip);
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.textContent = '复制链接';
      copy.addEventListener('click', () => {
        copyText(state.invite.url || location.href);
        toast('邀请链接已复制');
      });
      invite.appendChild(copy);
    } else {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'invite-open';
      btn.textContent = '邀请成员 · 展示二维码';
      btn.addEventListener('click', openInvite);
      invite.appendChild(btn);
      ensureInvite().then((inv) => {
        if (inv && inv.qr) renderSide();
      });
    }
    body.appendChild(invite);

    const online = state.members.filter((m) => m && m.online);
    const offline = state.members.filter((m) => m && !m.online);
    const mkGroup = (title, list) => {
      if (!list.length) return;
      const h = document.createElement('div');
      h.className = 'side-sec';
      h.textContent = `${title} · ${list.length}`;
      body.appendChild(h);
      for (const m of list) body.appendChild(memberRow(m));
    };
    mkGroup('在线', online);
    mkGroup('离线', offline);
  }

  let inviteLoading = false;
  function ensureInvite() {
    if (state.invite && state.invite.qr) return Promise.resolve(state.invite);
    if (inviteLoading) return Promise.resolve(null);
    inviteLoading = true;
    return fetch('/api/room', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          if (data.room) state.room = data.room;
          if (Array.isArray(data.members)) state.members = data.members;
          if (data.invite) state.invite = data.invite;
          renderHeader();
        }
        return state.invite;
      })
      .catch(() => null)
      .finally(() => {
        inviteLoading = false;
      });
  }

  function openSide() {
    state.sideOpen = true;
    $('sideScrim').hidden = false;
    $('app').classList.add('side-open');
    renderSide();
    ensureInvite();
  }

  function closeSide() {
    state.sideOpen = false;
    $('app').classList.remove('side-open');
    $('sideScrim').hidden = true;
  }

  function openMemberActions(m) {
    if (!m) return;
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader(m.name, m.isHost
        ? '群主电脑 · 在线'
        : m.online
          ? `${kindLabel(m.kind)} · 在线成员`
          : `${kindLabel(m.kind)} · ${lastSeenText(m.lastSeen)}`));
      if (!state.me || m.id !== state.me.id) {
        sheet.appendChild(sheetItem(PATH.reply, '在消息里提到他', () => {
          insertMention(m.name);
        }));
      }
      sheet.appendChild(sheetItem(PATH.copy, '复制昵称', () => {
        copyText(m.name);
        toast('昵称已复制');
      }));
      if (state.me && m.id === state.me.id) {
        sheet.appendChild(sheetItem(PATH.edit, '修改昵称', () => askNickname()));
      }
      sheet.appendChild(sheetCancel());
    });
  }

  function openInvite() {
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader('邀请成员', '同一 Wi-Fi 下扫码，或复制链接'));
      const box = document.createElement('div');
      box.className = 'invite-sheet';
      const status = document.createElement('span');
      status.textContent = '正在生成二维码…';
      box.appendChild(status);
      sheet.appendChild(box);
      ensureInvite().then((invite) => {
        box.textContent = '';
        if (!invite || !invite.qr) {
          const tip = document.createElement('span');
          tip.textContent = '暂时拿不到邀请二维码，请确认电脑端网络正常';
          box.appendChild(tip);
          return;
        }
        const img = document.createElement('img');
        img.src = invite.qr;
        img.alt = '邀请二维码';
        box.appendChild(img);
        const url = document.createElement('code');
        url.textContent = invite.url || '';
        box.appendChild(url);
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.className = 'invite-copy';
        copy.textContent = '复制链接';
        copy.addEventListener('click', () => {
          copyText(invite.url || location.href);
          toast('邀请链接已复制');
        });
        box.appendChild(copy);
      });
      sheet.appendChild(sheetCancel());
    });
  }

  const mentionState = { open: false, items: [], index: 0, start: -1 };

  function closeMention() {
    mentionState.open = false;
    mentionState.items = [];
    mentionState.start = -1;
    const el = $('mention');
    if (el) el.hidden = true;
  }

  function updateMention() {
    if (!input || input.selectionStart == null) return closeMention();
    const pos = input.selectionStart;
    const before = input.value.slice(0, pos);
    const hit = /(^|[\s(])@([^\s@]{0,16})$/.exec(before);
    if (!hit) return closeMention();
    const q = hit[2].toLowerCase();
    const items = state.members
      .filter((m) => m && (!state.me || m.id !== state.me.id))
      .filter((m) => !q || m.name.toLowerCase().includes(q))
      .sort((a, b) => (a.online === b.online ? 0 : a.online ? -1 : 1))
      .slice(0, 8);
    if (!items.length) return closeMention();
    mentionState.open = true;
    mentionState.items = items;
    mentionState.index = 0;
    mentionState.start = pos - hit[2].length - 1;
    renderMentionList();
  }

  function renderMentionList() {
    const box = $('mention');
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
      const pick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        chooseMention(m);
      };
      btn.addEventListener('pointerdown', pick);
      btn.addEventListener('click', (e) => e.preventDefault());
      btn.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') pick(e);
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
    updateSend();
    saveDraft();
    input.focus();
    sendTyping(true);
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
    updateSend();
    closeSheet();
    closeSide();
    input.focus();
    sendTyping(true);
  }

  function askNickname() {
    const current = (state.me && state.me.name) || defaultName();
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader('修改昵称', '群成员会看到这个名字'));
      const wrap = document.createElement('div');
      wrap.className = 'nick-edit';
      const field = document.createElement('input');
      field.maxLength = 16;
      field.value = current;
      field.autocomplete = 'nickname';
      wrap.appendChild(field);
      const save = document.createElement('button');
      save.type = 'button';
      save.textContent = '保存';
      save.addEventListener('click', () => {
        const name = field.value.replace(/\s+/g, '').trim();
        if (!name) {
          toast('昵称不能为空');
          return;
        }
        closeSheet();
        if (ws && ws.readyState === 1) {
          ws.send(JSON.stringify({ t: 'rename', name }));
        } else {
          toast('连接断开，稍后再试');
        }
      });
      wrap.appendChild(save);
      field.addEventListener('keydown', (e) => {
        if (e.isComposing) return;
        if (e.key === 'Enter') {
          e.preventDefault();
          save.click();
        }
      });
      sheet.appendChild(wrap);
      sheet.appendChild(sheetCancel());
      setTimeout(() => field.focus(), 80);
    });
  }

  // ---------- 入群 ----------

  let joinColor = 'sky';
  let joinFocused = false;

  function renderJoinColors() {
    const box = $('joinColors');
    box.textContent = '';
    for (const color of COLORS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jcolor' + (color === joinColor ? ' on' : '');
      b.dataset.c = color;
      b.setAttribute('aria-label', color);
      b.addEventListener('click', () => {
        joinColor = color;
        try {
          localStorage.setItem('ns.color', color);
        } catch {
          /* ignore */
        }
        renderJoinColors();
      });
      box.appendChild(b);
    }
  }

  function showJoin(message) {
    state.joining = false;
    delete $('app').dataset.joined;
    clearReply();
    closeMention();
    if (state.sideOpen) closeSide();
    if (!$('sheetWrap').hidden) closeSheet($('sheetWrap'));
    if (!$('emojiWrap').hidden) closeEmoji();
    if (!$('attachWrap').hidden) closeSheet($('attachWrap'));
    if (!$('viewer').hidden) closeViewer();
    if (state.selecting) exitSelection();
    if (state.searching) closeSearch();
    $('join').hidden = false;
    $('joinError').hidden = !message;
    $('joinError').textContent = message || '';
    const room = state.room;
    $('joinRoom').textContent = (room && room.name) || '近传群聊';
    $('joinSub').textContent = room
      ? `${room.onlineCount || 1} 人在线 · ${room.memberCount || 1} 位成员${room.locked ? ' · 已锁定' : ''}`
      : '正在连接群主电脑…';
    const stack = $('joinStack');
    stack.textContent = '';
    for (const m of state.members.filter((x) => x.online).slice(0, 5)) {
      stack.appendChild(avatarEl(m, true));
    }
    let savedName = '';
    try {
      savedName = localStorage.getItem('ns.nick') || '';
    } catch {
      savedName = '';
    }
    $('joinName').value = savedName || defaultName();
    try {
      joinColor = localStorage.getItem('ns.color') || colorForName($('joinName').value);
    } catch {
      joinColor = colorForName($('joinName').value);
    }
    renderJoinColors();
    renderHeader();
    renderSide();
    const locked = !!(state.room && state.room.locked);
    $('joinBtn').disabled = locked;
    $('joinBtn').textContent = locked ? '群聊已锁定' : '加入群聊';
    if (!joinFocused && window.matchMedia && window.matchMedia('(pointer: fine)').matches) {
      joinFocused = true;
      setTimeout(() => {
        if ($('join').hidden) return;
        $('joinName').focus();
        $('joinName').select();
      }, 180);
    }
  }

  function joinRoom() {
    if (state.joining) return;
    const name = $('joinName').value.replace(/\s+/g, '').trim().slice(0, 16);
    if (!name) {
      toast('先给自己起个昵称');
      $('joinName').focus();
      return;
    }
    try {
      localStorage.setItem('ns.nick', name);
    } catch {
      /* ignore */
    }
    state.joining = true;
    $('joinBtn').disabled = true;
    $('joinBtn').textContent = '正在加入…';
    member = {
      id: '',
      key: '',
      name,
      color: joinColor,
      kind: deviceKind(),
    };
    connectPaused = false;
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
      ws = null;
    }
    connect();
  }

  function openJoinFlow(message) {
    if (message) showJoin(message);
    if (state.room) {
      showJoin(message);
      return;
    }
    fetch('/api/room', { headers: authHeaders() })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) {
          state.room = data.room || state.room;
          state.members = data.members || state.members;
          state.invite = data.invite || state.invite;
        }
        showJoin(message);
      })
      .catch(() => showJoin(message));
  }

  function reconcileHistory(list) {
    // 历史里已经有这条文字（上次 ack 丢了），就不要继续显示/重发本地副本
    if (Array.isArray(list) && list.length) {
      const done = new Set();
      for (const m of list) {
        if (m && m.kind === 'text' && m.status === 'ok' && m.src) done.add(m.src);
      }
      let changed = false;
      for (const cid of [...state.pending.keys()]) {
        if (!done.has(cid)) continue;
        const item = state.pending.get(cid);
        if (item) clearTimeout(item.timer);
        state.pending.delete(cid);
        state.locals.delete(cid);
        changed = true;
      }
      if (changed) saveQueue();
    }
    const loader = chat.querySelector('.loader');
    if (loader) loader.remove();
    renderAll(list);
    pin(true);
  }

  function removeLocalRow(id) {
    const el = state.nodes.get(id);
    if (el) el.remove();
    state.nodes.delete(id);
    state.byId.delete(id);
    state.messages = state.messages.filter((m) => m.id !== id);
    if (state.selection.delete(id) && state.selecting) refreshSelection();
  }

  function patch(id, changes) {
    const m = state.byId.get(id);
    if (!m) return;
    Object.assign(m, changes);
    if (changes.status === 'ok' || changes.status === 'error') {
      for (const [cid, local] of state.locals) {
        if (local.id === id) state.locals.delete(cid);
      }
    }
    const el = state.nodes.get(id);
    if (!el) return;
    if ('status' in changes || 'path' in changes || 'seen' in changes || 'seenBy' in changes
      || 'name' in changes || 'recalled' in changes || 'author' in changes) {
      rebuildRow(m);
      return;
    }
    if (typeof m.progress === 'number') {
      const bar = el.querySelector('.progress i');
      if (bar) bar.style.width = Math.round(m.progress * 100) + '%';
      const pct = el.querySelector('.pct');
      if (pct) pct.textContent = ' · ' + Math.round(m.progress * 100) + '%';
    }
  }

  function sendSeen(ids) {
    for (const id of ids) seenQueue.add(id);
    if (seenTimer) return;
    seenTimer = setTimeout(() => {
      seenTimer = null;
      const list = [...seenQueue];
      seenQueue = new Set();
      if (ws && ws.readyState === 1 && list.length) {
        ws.send(JSON.stringify({ t: 'seen', ids: list.slice(-200) }));
      }
    }, 400);
  }

  function scheduleSeen(id) {
    if (document.visibilityState !== 'visible') return;
    sendSeen([id]);
  }

  // ---------- 发送 ----------

  function autoGrow() {
    input.style.height = 'auto';
    input.style.height = Math.min(132, input.scrollHeight) + 'px';
  }

  function updateSend() {
    sendBtn.disabled = !input.value.trim();
    saveDraft();
  }

  function draftKey() {
    return 'ns.draft.' + (location.host || 'peer');
  }
  let draftTimer = null;
  function saveDraft() {
    clearTimeout(draftTimer);
    draftTimer = setTimeout(() => {
      try {
        if (input.value.trim()) localStorage.setItem(draftKey(), input.value);
        else localStorage.removeItem(draftKey());
      } catch {
        /* ignore */
      }
    }, 300);
  }
  function restoreDraft() {
    try {
      const v = localStorage.getItem(draftKey());
      if (v) {
        input.value = v;
        autoGrow();
        updateSend();
      }
    } catch {
      /* ignore */
    }
  }

  function sendText() {
    const value = input.value.trim();
    if (!value) return;
    if (value.length > MAX_TEXT) {
      toast('单条消息太长了');
      return;
    }
    const reply = state.reply;
    const cid = nextCid('t');
    state.pending.set(cid, { text: value, reply, ts: Date.now() });
    saveQueue();
    const local = {
      id: 'local:' + cid,
      src: cid,
      from: 'phone',
      uid: state.me ? state.me.id : '',
      author: state.me ? { id: state.me.id, name: state.me.name, color: state.me.color, kind: state.me.kind } : null,
      kind: 'text',
      text: value,
      reply,
      status: state.connected ? 'sending' : 'queued',
      ts: Date.now(),
    };
    state.locals.set(cid, { id: local.id, kind: 'text' });
    appendMessage(local);

    if (state.connected && ws && ws.readyState === 1) {
      deliver(cid);
    } else {
      setOffline(true, '当前离线 · 消息会在连上后自动发送', false);
      connect();
    }

    input.value = '';
    sendTyping(false);
    closeEmoji();
    closeMention();
    autoGrow();
    sendBtn.disabled = true;
    clearReply();
    saveDraft();
    buzz(8);
    pin(true);
  }

  function authHeaders(extra) {
    const headers = Object.assign({}, extra || {});
    if (state.me && state.me.id) {
      headers['x-ns-member'] = state.me.id;
      headers['x-ns-key'] = state.me.key || '';
    }
    return headers;
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(data || {}),
    }).then((r) => {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json().catch(() => ({}));
    });
  }

  function putChunk(id, blob, offset, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/upload/${id}?off=${offset}`);
      xhr.setRequestHeader('Content-Type', 'application/octet-stream');
      const headers = authHeaders();
      for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(e.loaded);
      };
      xhr.onload = () => {
        let data = {};
        try {
          data = JSON.parse(xhr.responseText || '{}');
        } catch {
          data = {};
        }
        if (xhr.status === 200) resolve(data);
        else reject(new Error(data.error || 'HTTP ' + xhr.status));
      };
      xhr.onerror = () => reject(new Error('网络中断'));
      xhr.ontimeout = () => reject(new Error('超时'));
      xhr.timeout = 180000;
      xhr.send(blob);
    });
  }

  function uploadTracker() {
    const map = new Map();
    return {
      start(cid, total) {
        map.set(cid, { total, at: Date.now(), sent: 0, speed: 0 });
      },
      update(cid, sent) {
        const t = map.get(cid);
        if (!t) return 0;
        const now = Date.now();
        if (now - t.at > 260) {
          const inst = ((sent - t.sent) * 1000) / (now - t.at);
          t.speed = t.speed ? t.speed * 0.6 + inst * 0.4 : inst;
          t.sent = sent;
          t.at = now;
        }
        return t.speed;
      },
      stop(cid) {
        map.delete(cid);
      },
    };
  }
  const trackers = uploadTracker();

  function uploadLocalId(cid) {
    const local = state.locals.get(cid);
    return local ? local.id : null;
  }

  function onUploadProgress(cid, sent, total) {
    const id = uploadLocalId(cid);
    if (!id) return;
    const m = state.byId.get(id);
    const el = state.nodes.get(id);
    if (!m || !el) return;
    m.progress = total ? sent / total : 0;
    m.status = 'uploading';
    const bar = el.querySelector('.progress i');
    if (bar) bar.style.width = Math.round(m.progress * 100) + '%';
    const pct = el.querySelector('.pct');
    const speed = trackers.update(cid, sent);
    if (pct) {
      const left = total - sent;
      const eta = speed > 1 ? Math.ceil(left / speed) : 0;
      pct.textContent =
        ' · ' + Math.round(m.progress * 100) + '%' +
        (speed > 1 ? ' · ' + fmtSize(speed) + '/s' : '') +
        (eta > 0 ? ' · 剩 ' + (eta >= 60 ? Math.ceil(eta / 60) + ' 分' : eta + ' 秒') : '');
    }
  }

  async function uploadOne(file) {
    const cid = nextCid('u');
    const isImage = /^image\//i.test(file.type || '') || /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/i.test(file.name || '');
    const local = {
      id: 'local:' + cid,
      src: cid,
      from: 'phone',
      uid: state.me ? state.me.id : '',
      author: state.me ? { id: state.me.id, name: state.me.name, color: state.me.color, kind: state.me.kind } : null,
      kind: isImage ? 'image' : 'file',
      name: file.name || '文件',
      size: file.size,
      mime: file.type || '',
      status: 'uploading',
      progress: 0,
      ts: Date.now(),
    };
    state.locals.set(cid, { id: local.id, kind: 'upload' });
    appendMessage(local);
    trackers.start(cid, file.size);
    pin(true);

    let uploadId = '';
    try {
      const init = await postJSON('/api/upload/init', {
        name: local.name,
        size: local.size,
        mime: local.mime,
        cid,
        memberId: state.me ? state.me.id : '',
        memberKey: state.me ? state.me.key : '',
      });
      const id = init.id;
      uploadId = id;
      let offset = 0;
      while (offset < file.size) {
        if (state.cancelUploads.has(cid)) throw new Error('cancelled');
        const end = Math.min(offset + CHUNK, file.size);
        const r = await putChunk(id, file.slice(offset, end), offset, (loaded) =>
          onUploadProgress(cid, offset + loaded, file.size)
        );
        offset = typeof r.offset === 'number' ? r.offset : end;
        onUploadProgress(cid, offset, file.size);
      }
      if (state.cancelUploads.has(cid)) throw new Error('cancelled');
      await postJSON(`/api/upload/${id}/done`, {});
      state.cancelUploads.delete(cid);
      trackers.stop(cid);
      buzz(8);
    } catch (err) {
      trackers.stop(cid);
      const cancelled = state.cancelUploads.delete(cid);
      // 用服务端的上传 id（就是消息 id）清理；cid 是手机端编号，服务端不认识
      if (uploadId) {
        try {
          await fetch(`/api/msg/${uploadId}`, { method: 'DELETE', headers: authHeaders() });
        } catch {
          /* ignore */
        }
      }
      const local = state.locals.get(cid);
      if (local) {
        removeLocalRow(local.id);
        state.locals.delete(cid);
      }
      if (cancelled) return;
      state.failed.push({
        key: 'f' + Date.now() + Math.random().toString(16).slice(2, 6),
        name: file.name || '文件',
        size: file.size,
        file,
      });
      renderFailed();
      pin(true);
      toast(`「${file.name || '文件'}」发送失败`);
      throw err;
    }
  }

  function failedEl(item) {
    const row = document.createElement('div');
    row.className = 'msg out failed enter';
    row.dataset.key = item.key;
    const b = document.createElement('div');
    b.className = 'bubble media';
    b.appendChild(fileCard({ name: item.name, size: item.size, status: 'error' }));
    const bar = document.createElement('div');
    bar.className = 'retry';
    const label = document.createElement('span');
    label.textContent = '发送失败';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = '重试';
    btn.addEventListener('click', () => retryUpload(item));
    bar.appendChild(label);
    bar.appendChild(btn);
    b.appendChild(bar);
    row.appendChild(b);
    setTimeout(() => row.classList.remove('enter'), 240);
    return row;
  }

  function renderFailed() {
    for (const item of state.failed) chat.appendChild(failedEl(item));
  }

  async function retryUpload(item) {
    state.failed = state.failed.filter((f) => f.key !== item.key);
    const el = chat.querySelector(`[data-key="${item.key}"]`);
    if (el) el.remove();
    try {
      await uploadOne(item.file);
    } catch {
      /* 失败会重新生成一张卡片 */
    }
  }

  async function handleFiles(files) {
    for (const f of files) {
      if (f.size > 2 * 1024 * 1024) toast('正在发送，请保持屏幕常亮');
      try {
        await uploadOne(f);
      } catch {
        /* 已提示 */
      }
    }
  }

  // ---------- 消息操作 ----------

  function attachPress(el, m) {
    let timer = null;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let fired = false;

    el.addEventListener('touchstart', (e) => {
      if (state.selecting) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      moved = false;
      fired = false;
      clearTimeout(timer);
      timer = setTimeout(() => {
        if (moved || fired) return;
        fired = true;
        buzz(10);
        openActions(m);
      }, 450);
    }, { passive: true });

    el.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (Math.abs(t.clientX - startX) > 10 || Math.abs(t.clientY - startY) > 10) {
        moved = true;
        clearTimeout(timer);
      }
    }, { passive: true });

    el.addEventListener('touchend', () => clearTimeout(timer));
    el.addEventListener('touchcancel', () => clearTimeout(timer));

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      if (Date.now() - lastSheetAt < 350) return;
      openActions(m);
    });
  }

  function sheetItem(icon, label, run, opts = {}) {
    const b = document.createElement('button');
    b.className = 'row' + (opts.danger ? ' danger' : '');
    const ic = document.createElement('span');
    ic.className = 'icon';
    ic.appendChild(svg(icon, 18));
    const labelEl = document.createElement('span');
    labelEl.className = 'label';
    labelEl.textContent = label;
    if (opts.hint) {
      const h = document.createElement('span');
      h.className = 'hint';
      h.textContent = opts.hint;
      labelEl.appendChild(h);
    }
    b.appendChild(ic);
    b.appendChild(labelEl);
    if (opts.right) b.appendChild(opts.right);
    b.addEventListener('click', () => {
      closeSheet();
      run();
    });
    return b;
  }

  function showSheet(build, opts = {}) {
    const wrap = opts.wrap || $('sheetWrap');
    const sheet = opts.sheet || $('sheet');
    sheet.textContent = '';
    build(sheet);
    wrap.hidden = false;
    lastSheetAt = Date.now();
    return sheet;
  }

  function closeSheet(wrap) {
    const w = wrap || $('sheetWrap');
    w.hidden = true;
    const s = w.firstElementChild;
    if (s) s.textContent = '';
  }

  function sheetHeader(title, sub) {
    const head = document.createElement('div');
    head.className = 'shead';
    const t = document.createElement('div');
    t.className = 'st';
    t.textContent = title;
    head.appendChild(t);
    if (sub) {
      const s = document.createElement('div');
      s.className = 'ss';
      s.textContent = sub;
      head.appendChild(s);
    }
    return head;
  }

  function sheetCancel() {
    const b = document.createElement('button');
    b.className = 'row cancel';
    b.textContent = '取消';
    b.addEventListener('click', () => closeSheet());
    return b;
  }

  function openActions(m) {
    const desktopWeb = !native && deviceKind() === 'desktop';
    if (m.id.startsWith('local:')) {
      const cid = m.id.slice(6);
      showSheet((sheet) => {
        sheet.appendChild(sheetHeader('这条消息还没发出去', '其他成员还看不到它'));
        sheet.appendChild(sheetItem(PATH.trash, '取消发送', () => cancelLocal(cid), { danger: true }));
        sheet.appendChild(sheetCancel());
      });
      return;
    }
    const mine = isMine(m);
    const who = authorOf(m);
    const media = isMedia(m) && m.status === 'ok';
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader(mine ? '我发送的' : `${who.name} 发送的`, fullTime(m.ts)));
      if (canRecall(m)) {
        sheet.appendChild(sheetItem(PATH.undo, '撤回', () => recallMessage(m.id)));
      }
      if (m.kind === 'text') {
        sheet.appendChild(sheetItem(PATH.copy, '复制文字', () => copyText(m.text || '')));
      }
      if (m.kind === 'image' && m.status === 'ok') {
        sheet.appendChild(sheetItem(PATH.view, '查看大图', () => openViewer(m.id)));
      }
      if (!mine) {
        sheet.appendChild(sheetItem(PATH.reply, '回复', () => setReply(m)));
        if (memberById(who.id)) sheet.appendChild(sheetItem(PATH.edit, '提到他', () => insertMention(who.name)));
      } else {
        sheet.appendChild(sheetItem(PATH.reply, '回复', () => setReply(m)));
      }
      if (media) {
        sheet.appendChild(sheetItem(
          PATH.save,
          desktopWeb ? (m.kind === 'image' ? '下载图片' : '下载文件') : (m.kind === 'image' ? '保存到相册' : '保存到手机'),
          () => saveMedia(m)
        ));
        if (!desktopWeb) sheet.appendChild(sheetItem(PATH.share, '分享到其他应用', () => shareMedia(m)));
      }
      if (m.kind === 'text') {
        sheet.appendChild(sheetItem(PATH.share, '分享这段文字', () => shareText(m.text || '')));
      }
      if (mine) {
        sheet.appendChild(sheetItem(PATH.select, '多选', () => enterSelection(m.id)));
        sheet.appendChild(sheetItem(PATH.trash, '删除', () => deleteMessage(m.id), { danger: true }));
      }
      sheet.appendChild(sheetCancel());
    });
  }

  function cancelLocalSilent(cid) {
    state.pending.delete(cid);
    saveQueue();
    const local = state.locals.get(cid);
    if (local) {
      if (local.kind === 'upload') state.cancelUploads.add(cid);
      removeLocalRow(local.id);
      state.locals.delete(cid);
    }
  }

  function cancelLocal(cid) {
    cancelLocalSilent(cid);
    toast('已取消');
  }

  function copyText(text) {
    const done = () => toast('已复制');
    try {
      if (native && window.NearSend && window.NearSend.copy) {
        window.NearSend.copy(text);
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
        return;
      }
    } catch {
      /* ignore */
    }
    fallbackCopy(text, done);
  }

  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    document.body.removeChild(ta);
    if (ok) done();
    else toast('复制失败，请长按选择');
  }

  function downloadEl(m, d) {
    const wrap = document.createElement('div');
    const done = !d || d.state === 'done';
    wrap.className = 'dlbar' + (done ? ' done' : '');
    const track = document.createElement('div');
    track.className = 'dtrack';
    const fill = document.createElement('i');
    fill.style.width = Math.round((done ? 1 : d.pct || 0) * 100) + '%';
    track.appendChild(fill);
    wrap.appendChild(track);

    const txt = document.createElement('span');
    txt.className = 'dtxt';
    if (done) {
      txt.textContent = '已保存';
    } else if (d.state === 'failed') {
      txt.textContent = d.error ? '下载失败：' + d.error : '下载失败';
    } else if (d.state === 'paused') {
      txt.textContent = '已暂停';
    } else {
      const speed = d.speed > 1 ? ' · ' + fmtSize(d.speed) + '/s' : '';
      if (!d.total || d.total <= 0) {
        txt.textContent = '下载中 ' + fmtSize(d.bytes || 0) + speed;
      } else {
        const pct = Math.round((d.pct || 0) * 100);
        const left = d.total - (d.bytes || 0);
        const eta = d.speed > 1 && left > 0 ? ' · 剩 ' + Math.ceil(left / d.speed / 60) + ' 分' : '';
        txt.textContent = '下载中 ' + pct + '%' + speed + eta;
      }
    }
    wrap.appendChild(txt);

    const btn = document.createElement('button');
    btn.type = 'button';
    if (!done && d && d.state !== 'failed') {
      btn.textContent = '取消';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        cancelDownload(m.id);
      });
    } else if (done) {
      btn.textContent = '打开';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        openSaved(m.id);
      });
    } else {
      btn.textContent = '重试';
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        saveMedia(m);
      });
    }
    wrap.appendChild(btn);
    return wrap;
  }

  function markSaved(id) {
    state.saved.add(id);
    try {
      localStorage.setItem('ns.saved', JSON.stringify([...state.saved].slice(-200)));
    } catch {
      /* ignore */
    }
  }

  function cancelDownload(msgId) {
    const d = state.dl.get(msgId);
    if (d && d.dlId && hasBridge && window.NearSend.cancelDownload) {
      try {
        window.NearSend.cancelDownload(String(d.dlId));
      } catch {
        /* ignore */
      }
    }
    state.dl.delete(msgId);
    const m = state.byId.get(msgId);
    if (m) rebuildRow(m);
    toast('已取消下载');
  }

  function openSaved(msgId) {
    const dlId = state.dlIds.get(msgId);
    if (dlId && hasBridge && window.NearSend.openDownload) {
      window.NearSend.openDownload(String(dlId));
      return;
    }
    if (hasBridge && window.NearSend.openDownloads) {
      window.NearSend.openDownloads();
      return;
    }
    toast('请在系统的「下载」里查看');
  }

  /** 只替换下载条本身，避免每次轮询重建整行导致图片重新加载 */
  function updateDownloadUI(m) {
    const el = state.nodes.get(m.id);
    if (!el) return;
    const bubble = el.querySelector('.bubble');
    if (!bubble) return;
    const rec = state.dl.get(m.id);
    const done = state.saved.has(m.id);
    const old = bubble.querySelector('.dlbar');
    if (!rec && !done) {
      if (old) old.remove();
      return;
    }
    const fresh = downloadEl(m, rec);
    if (old) old.replaceWith(fresh);
    else bubble.appendChild(fresh);
  }

  function startDownload(m, dlId) {
    state.dlIds.set(m.id, dlId);
    state.dl.set(m.id, { state: 'running', pct: 0, dlId, at: Date.now(), sent: 0, speed: 0 });
    updateDownloadUI(m);
    startDownloadPolling(m, dlId);
  }

  function startDownloadPolling(m, dlId) {
    const timer = setInterval(() => {
      let s;
      try {
        s = JSON.parse(window.NearSend.downloadStatus(String(dlId)));
      } catch {
        return;
      }
      const rec = state.dl.get(m.id);
      if (!rec) {
        clearInterval(timer);
        return;
      }
      const now = Date.now();
      const sent = Number(s.sent) || 0;
      const total = Number(s.total) || 0;
      if (rec.at && sent >= rec.sent && now - rec.at > 350) {
        const inst = ((sent - rec.sent) * 1000) / (now - rec.at);
        rec.speed = rec.speed ? rec.speed * 0.6 + inst * 0.4 : inst;
        rec.sent = sent;
        rec.at = now;
      }
      rec.bytes = sent;
      rec.pct = total > 0 ? Math.min(1, sent / total) : 0;
      rec.total = total;
      rec.state = s.state === 'done' ? 'done' : s.state;
      if (s.error) rec.error = String(s.error).slice(0, 60);

      if (s.state === 'done') {
        clearInterval(timer);
        state.dl.delete(m.id);
        markSaved(m.id);
        updateDownloadUI(m);
        toast('已保存到「' + (isImageName(m.name) ? '相册' : '下载') + '/NearSend」');
        return;
      }
      if (s.state === 'failed' || s.state === 'gone') {
        clearInterval(timer);
        updateDownloadUI(m);
        toast('下载失败，可重试');
        return;
      }
      updateDownloadUI(m);
    }, 800);
  }

  function isImageName(name) {
    return /\.(png|jpe?g|gif|webp|bmp|heic|avif)$/i.test(String(name || ''));
  }

  function saveMedia(m) {
    if (hasBridge && window.NearSend.saveMedia) {
      let dlId = '';
      try {
        dlId = window.NearSend.saveMedia(m.id, m.name || 'file');
      } catch {
        dlId = '';
      }
      if (dlId) {
        startDownload(m, dlId);
        return;
      }
      // Android 9 及以下走原生存盘，没有系统进度
      toast('正在保存…');
      return;
    }
    const a = document.createElement('a');
    a.href = `/d/${m.id}`;
    a.download = m.name || 'file';
    document.body.appendChild(a);
    a.click();
    a.remove();
    toast('开始下载');
  }

  function shareMedia(m) {
    if (native && window.NearSend && window.NearSend.shareMedia) {
      window.NearSend.shareMedia(m.id, m.name || 'file', m.mime || '');
      return;
    }
    if (deviceKind() === 'desktop') {
      saveMedia(m);
      return;
    }
    toast('在浏览器里可以长按图片保存后再分享');
  }

  function shareText(text) {
    if (native && window.NearSend && window.NearSend.shareText) {
      window.NearSend.shareText(text);
      return;
    }
    copyText(text);
    toast('已复制，可以粘贴到其他应用');
  }

  function canRecall(m) {
    return isMine(m) && m.status === 'ok' && !m.recalled
      && Date.now() - Number(m.ts || 0) <= RECALL_MS;
  }

  function recallMessage(id) {
    fetch(`/api/msg/${id}/recall`, { method: 'POST', headers: authHeaders() })
      .then(async (r) => {
        if (r.ok) {
          patch(id, { recalled: true });
          toast('已撤回');
          return;
        }
        let data = {};
        try {
          data = await r.json();
        } catch {
          data = {};
        }
        toast(data.error === 'recall not allowed' ? '超过 2 分钟，无法撤回' : '撤回失败');
      })
      .catch(() => toast('撤回失败，请检查连接'));
  }

  function cancelUploadFor(id) {
    for (const [cid, local] of state.locals) {
      if (local.id === id && local.kind === 'upload') state.cancelUploads.add(cid);
    }
  }

  function cancelAllUploads() {
    for (const [cid, local] of state.locals) {
      if (local.kind === 'upload') state.cancelUploads.add(cid);
    }
  }

  /** 以服务端结果为准；连不上时不要把消息从界面上删掉，否则刷新后会复活 */
  function serverDelete(id) {
    return fetch(`/api/msg/${id}`, { method: 'DELETE', headers: authHeaders() }).then((r) => {
      if (!r.ok && r.status !== 404) throw new Error('HTTP ' + r.status);
    });
  }

  function deleteMessage(id) {
    cancelUploadFor(id);
    serverDelete(id)
      .then(() => {
        removeRow(id);
        toast('已删除');
      })
      .catch(() => toast('删除失败，请检查连接'));
  }

  // ---------- 回复 ----------

  function setReply(m) {
    const who = authorOf(m);
    state.reply = {
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
    $('replyText').textContent =
      m.kind === 'text' ? String(m.text || '').slice(0, 60) : m.kind === 'image' ? '[图片]' : '[文件] ' + (m.name || '');
    input.focus();
  }

  function clearReply() {
    state.reply = null;
    $('replyBar').hidden = true;
  }

  // ---------- 多选 ----------

  function enterSelection(id) {
    state.selecting = true;
    state.selection.clear();
    if (id) state.selection.add(id);
    $('selBar').hidden = false;
    refreshSelection();
    for (const [mid, el] of state.nodes) el.classList.toggle('sel', state.selection.has(mid));
  }

  function refreshSelection() {
    $('selCount').textContent = String(state.selection.size);
    $('selDelete').disabled = !state.selection.size;
    $('selDelete').style.opacity = state.selection.size ? '1' : '0.45';
  }

  function exitSelection() {
    state.selecting = false;
    state.selection.clear();
    $('selBar').hidden = true;
    for (const el of state.nodes.values()) el.classList.remove('sel');
  }

  function deleteSelection() {
    const ids = [...state.selection];
    if (!ids.length) return;
    exitSelection();
    const locals = ids.filter((id) => id.startsWith('local:'));
    const remotes = ids.filter((id) => !id.startsWith('local:'));
    for (const id of locals) cancelLocalSilent(id.slice(6));
    for (const id of remotes) cancelUploadFor(id);
    Promise.allSettled(remotes.map((id) => serverDelete(id))).then((results) => {
      let ok = locals.length;
      let fail = 0;
      results.forEach((r, i) => {
        if (r.status === 'fulfilled') {
          ok += 1;
          removeRow(remotes[i]);
        } else {
          fail += 1;
        }
      });
      toast(fail ? `已删除 ${ok} 条，${fail} 条失败` : `已删除 ${ok} 条`);
    });
  }

  chat.addEventListener('click', (e) => {
    if (!state.selecting) return;
    const row = e.target.closest('.msg');
    if (!row || !row.dataset.id) return;
    const id = row.dataset.id;
    const m = state.byId.get(id);
    if (!m || !isMine(m)) return;
    if (state.selection.has(id)) {
      state.selection.delete(id);
      row.classList.remove('sel');
    } else {
      state.selection.add(id);
      row.classList.add('sel');
    }
    e.preventDefault();
    e.stopPropagation();
    refreshSelection();
  }, true);

  // ---------- 搜索 ----------

  function openSearch() {
    state.searching = true;
    $('searchWrap').hidden = false;
    $('searchInput').value = '';
    $('searchCount').textContent = '0/0';
    clearHits();
    setTimeout(() => $('searchInput').focus(), 60);
  }

  function closeSearch() {
    state.searching = false;
    $('searchWrap').hidden = true;
    clearHits();
  }

  function clearHits() {
    for (const el of state.nodes.values()) el.classList.remove('hit', 'active');
    state.hits = [];
    state.hitIndex = -1;
  }

  function runSearch(q) {
    clearHits();
    const needle = q.trim().toLowerCase();
    if (!needle) {
      $('searchCount').textContent = '0/0';
      return;
    }
    for (const m of state.messages) {
      if (m.recalled || m.kind === 'system') continue;
      const who = authorOf(m);
      const hay = ((m.text || '') + ' ' + (m.name || '') + ' ' + (who && who.name ? who.name : '')).toLowerCase();
      if (hay.includes(needle)) state.hits.push(m.id);
    }
    $('searchCount').textContent = state.hits.length ? `1/${state.hits.length}` : '0/0';
    if (!state.hits.length) return;
    state.hitIndex = 0;
    focusHit();
  }

  function focusHit() {
    clearActiveHit();
    const id = state.hits[state.hitIndex];
    const el = state.nodes.get(id);
    if (!el) return;
    el.classList.add('hit', 'active');
    state.stick = false;
    el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    $('searchCount').textContent = `${state.hitIndex + 1}/${state.hits.length}`;
  }

  function clearActiveHit() {
    for (const el of state.nodes.values()) el.classList.remove('active');
  }

  function stepHit(dir) {
    if (!state.hits.length) return;
    state.hitIndex = (state.hitIndex + dir + state.hits.length) % state.hits.length;
    focusHit();
  }

  // ---------- 图片查看器 ----------

  const viewer = {
    list: [],
    index: 0,
    scale: 1,
    x: 0,
    y: 0,
    startDist: 0,
    startScale: 1,
    startX: 0,
    startY: 0,
    mode: '',
    lastTap: 0,
  };

  function images() {
    return state.messages.filter((m) => m.kind === 'image' && m.status === 'ok' && !m.recalled);
  }

  function setChrome(dark) {
    try {
      if (hasBridge && window.NearSend.setChrome) window.NearSend.setChrome(dark ? 'dark' : 'light');
    } catch {
      /* 浏览器里没有状态栏可改 */
    }
  }

  function openViewer(id) {
    viewer.list = images();
    viewer.index = Math.max(0, viewer.list.findIndex((m) => m.id === id));
    if (!viewer.list.length) return;
    $('viewer').hidden = false;
    setChrome(true);
    showViewerImage();
  }

  function closeViewer() {
    $('viewer').hidden = true;
    $('viewerImg').src = '';
    resetZoom();
    setChrome(resolvedTheme() === 'dark');
  }

  function resetZoom() {
    viewer.scale = 1;
    viewer.x = 0;
    viewer.y = 0;
    applyTransform();
  }

  function applyTransform(animate) {
    const img = $('viewerImg');
    img.style.transition = animate ? 'transform 0.18s cubic-bezier(0.22,1,0.36,1)' : 'none';
    img.style.transform = `translate(${viewer.x}px, ${viewer.y}px) scale(${viewer.scale})`;
  }

  function showViewerImage() {
    const m = viewer.list[viewer.index];
    if (!m) return;
    resetZoom();
    $('viewerImg').src = `/t/${m.id}`;
    $('viewerIdx').textContent = `${viewer.index + 1} / ${viewer.list.length}`;
  }

  function stepViewer(dir) {
    const next = viewer.index + dir;
    if (next < 0 || next >= viewer.list.length) return;
    viewer.index = next;
    showViewerImage();
  }

  $('viewerStage').addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) {
      viewer.mode = 'pinch';
      viewer.startDist = dist(e.touches[0], e.touches[1]);
      viewer.startScale = viewer.scale;
      viewer.mode = viewer.mode || 'pinch';
      return;
    }
    const t = e.touches[0];
    viewer.startX = t.clientX - viewer.x;
    viewer.startY = t.clientY - viewer.y;
    viewer.swipeX = t.clientX;
    viewer.swipeY = t.clientY;
    viewer.mode = viewer.scale > 1.05 ? 'pan' : 'swipe';
  }, { passive: true });

  $('viewerStage').addEventListener('touchmove', (e) => {
    if (viewer.mode === 'pinch' && e.touches.length === 2) {
      const d = dist(e.touches[0], e.touches[1]);
      viewer.scale = clamp((viewer.startScale * d) / (viewer.startDist || d), 1, 4.5);
      applyTransform(false);
      return;
    }
    if (viewer.mode === 'pan' && e.touches.length === 1) {
      const t = e.touches[0];
      viewer.x = t.clientX - viewer.startX;
      viewer.y = t.clientY - viewer.startY;
      applyTransform(false);
    }
  }, { passive: true });

  $('viewerStage').addEventListener('touchend', (e) => {
    if (Math.abs(viewer.scale - 1) < 0.05) {
      viewer.scale = 1;
      viewer.x = 0;
      viewer.y = 0;
      applyTransform(true);
    }
    if (viewer.mode === 'swipe' && e.changedTouches.length) {
      const t = e.changedTouches[0];
      const dx = t.clientX - viewer.swipeX;
      const dy = t.clientY - viewer.swipeY;
      if (Math.abs(dx) > 56 && Math.abs(dx) > Math.abs(dy) * 1.4) {
        stepViewer(dx < 0 ? 1 : -1);
      } else if (Math.abs(dx) < 8 && Math.abs(dy) < 8) {
        const now = Date.now();
        if (now - viewer.lastTap < 280) {
          viewer.scale = viewer.scale > 1.5 ? 1 : 2.2;
          viewer.x = 0;
          viewer.y = 0;
          applyTransform(true);
          viewer.lastTap = 0;
        } else {
          viewer.lastTap = now;
          setTimeout(() => {
            if (viewer.lastTap && Date.now() - viewer.lastTap > 260 && viewer.scale <= 1.05) closeViewer();
          }, 300);
        }
      }
    }
    viewer.mode = '';
  });

  function dist(a, b) {
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  }
  function clamp(v, min, max) {
    return Math.max(min, Math.min(max, v));
  }

  $('viewerStage').addEventListener('wheel', (e) => {
    e.preventDefault();
    viewer.scale = clamp(viewer.scale * (e.deltaY < 0 ? 1.12 : 0.9), 1, 4.5);
    if (viewer.scale === 1) {
      viewer.x = 0;
      viewer.y = 0;
    }
    applyTransform(false);
  }, { passive: false });

  $('viewerClose').addEventListener('click', closeViewer);
  $('viewerSave').addEventListener('click', () => {
    const m = viewer.list[viewer.index];
    if (m) saveMedia(m);
  });
  $('viewerShare').addEventListener('click', () => {
    const m = viewer.list[viewer.index];
    if (m) shareMedia(m);
  });

  // ---------- 设置 ----------

  function openSettings() {
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader('设置', native ? '与「近传」应用设置同步' : '只影响这台设备'));

      const room = state.room || {};
      sheet.appendChild(sheetItem(PATH.info, '群聊信息', () => {
        closeSheet();
        openSide();
      }, { hint: `${room.onlineCount || 1} 人在线 · ${room.memberCount || 1} 位成员` }));

      sheet.appendChild(sheetItem(PATH.link, '邀请成员', openInvite, { hint: '二维码 / 链接' }));

      sheet.appendChild(sheetItem(PATH.edit, '我的昵称', askNickname, {
        hint: (state.me && state.me.name) || '',
      }));

      if (!native) {
        const themeRow = document.createElement('div');
        themeRow.className = 'setrow';
        const lbl = document.createElement('span');
        lbl.className = 'lbl';
        lbl.textContent = '主题';
        themeRow.appendChild(lbl);
        themeRow.appendChild(seg([['auto', '自动'], ['light', '浅色'], ['dark', '深色']], prefs.theme, (v) => {
          prefs.theme = v;
          savePrefs();
          applyTheme();
        }));
        sheet.appendChild(themeRow);

        const fontRow = document.createElement('div');
        fontRow.className = 'setrow';
        const fl = document.createElement('span');
        fl.className = 'lbl';
        fl.textContent = '聊天字号';
        fontRow.appendChild(fl);
        fontRow.appendChild(seg([['s', '小'], ['m', '标准'], ['l', '大'], ['xl', '特大']], prefs.font, (v) => {
          prefs.font = v;
          savePrefs();
          applyFont();
        }));
        sheet.appendChild(fontRow);
      }

      const enterRow = document.createElement('div');
      enterRow.className = 'setrow';
      const el1 = document.createElement('span');
      el1.className = 'lbl';
      el1.textContent = '回车直接发送';
      const sub1 = document.createElement('span');
      sub1.className = 'sub';
      sub1.textContent = '关闭时回车换行，用发送按钮发送';
      el1.appendChild(sub1);
      enterRow.appendChild(el1);
      enterRow.appendChild(toggle(prefs.enterSend, (on) => {
        prefs.enterSend = on;
        savePrefs();
      }));
      sheet.appendChild(enterRow);

      // 原生 App 里震动由「设置 → 通知 → 震动」控制，网页里的开关改不到原生偏好
      if (!native && navigator.vibrate) {
        const vibRow = document.createElement('div');
        vibRow.className = 'setrow';
        const el2 = document.createElement('span');
        el2.className = 'lbl';
        el2.textContent = '震动反馈';
        const sub2 = document.createElement('span');
        sub2.className = 'sub';
        sub2.textContent = '发送、长按、删除时轻震一下';
        el2.appendChild(sub2);
        vibRow.appendChild(el2);
        vibRow.appendChild(toggle(prefs.haptics, (on) => {
          prefs.haptics = on;
          savePrefs();
        }));
        sheet.appendChild(vibRow);
      }

      sheet.appendChild(sheetItem(PATH.link, '连接信息', () => {
        showSheet((s2) => {
          const host = (state.room && state.room.host && state.room.host.name) || '群主电脑';
          s2.appendChild(sheetHeader((state.room && state.room.name) || '近传群聊', `群主：${host} · ${location.host}`));
          s2.appendChild(sheetItem(PATH.copy, '复制连接地址', () => copyText(location.href)));
          if (native) s2.appendChild(sheetItem(PATH.settings, '打开应用设置', () => window.NearSend.openSettings()));
          s2.appendChild(sheetCancel());
        });
      }, { hint: location.host }));

      sheet.appendChild(sheetItem(PATH.help, native ? '帮助与诊断' : '帮助', () => {
        if (native && window.NearSend.openHelp) window.NearSend.openHelp();
        else showHelp();
      }));

      if (hasBridge && window.NearSend.openDownloads) {
        sheet.appendChild(sheetItem(PATH.save, '下载管理', () => window.NearSend.openDownloads(), {
          hint: '查看下载中的文件和已完成的位置',
        }));
      }

      sheet.appendChild(sheetItem(PATH.trash, '退出群聊', () => {
        confirmSheet('退出后可以重新扫码加入，群里的历史消息不会删除。', '退出', () => {
          closeSheet();
          if (ws && ws.readyState === 1) {
            try {
              ws.send(JSON.stringify({ t: 'leave' }));
            } catch {
              /* ignore */
            }
          } else {
            member = null;
            saveMember(null);
            state.me = null;
            showJoin('已退出群聊');
          }
        });
      }, { danger: true }));

      sheet.appendChild(sheetItem(PATH.info, '关于近传', () => {
        showSheet((s2) => {
          s2.appendChild(sheetHeader('近传 ' + (state.version || (native && native.version) || '2.2.0'), '局域网群聊 · 文字 / 图片 / 文件'));
          const p = document.createElement('p');
          p.style.cssText = 'margin:10px 12px 14px;font-size:12.5px;line-height:1.8;color:var(--ink-3)';
          p.textContent = '没有账号，没有云端，没有广告。群聊由一台电脑托管，所有设备在同一个 Wi-Fi 内直连，聊天记录只保存在群主电脑上。';
          s2.appendChild(p);
          s2.appendChild(sheetCancel());
        });
      }));

      sheet.appendChild(sheetCancel());
    });
  }

  function showHelp() {
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader('连不上群聊？', '按顺序检查这几点'));
      const tips = [
        '群主电脑上的「近传」是否还在运行（可以收起到托盘）',
        '当前设备是否和群主电脑在同一个 Wi-Fi',
        '路由器是否开了「AP 隔离」或访客网络',
        '群主电脑防火墙是否放通了这个端口',
        '如果群主重置了邀请链接，重新扫一次二维码',
      ];
      const ol = document.createElement('div');
      ol.style.cssText = 'padding:4px 14px 12px;font-size:13px;line-height:1.9;color:var(--ink-2)';
      tips.forEach((t, i) => {
        const row = document.createElement('div');
        row.textContent = `${i + 1}. ${t}`;
        ol.appendChild(row);
      });
      sheet.appendChild(ol);
      sheet.appendChild(sheetCancel());
    });
  }

  function seg(options, current, onPick) {
    const box = document.createElement('div');
    box.className = 'segset';
    for (const [value, label] of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      if (value === current) b.classList.add('on');
      b.addEventListener('click', () => {
        [...box.children].forEach((c) => c.classList.remove('on'));
        b.classList.add('on');
        onPick(value);
      });
      box.appendChild(b);
    }
    return box;
  }

  function toggle(on, onPick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tswitch' + (on ? ' on' : '');
    b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', on ? 'true' : 'false');
    b.addEventListener('click', () => {
      const next = !b.classList.contains('on');
      b.classList.toggle('on', next);
      b.setAttribute('aria-checked', next ? 'true' : 'false');
      buzz(6);
      onPick(next);
    });
    return b;
  }

  function confirmSheet(text, okLabel, onOk) {
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader('确认操作', text));
      sheet.appendChild(sheetItem(PATH.close, okLabel, onOk, { danger: true }));
      sheet.appendChild(sheetCancel());
    });
  }

  // ---------- 附件面板 ----------

  function insertEmoji(emoji) {
    const start = input.selectionStart == null ? input.value.length : input.selectionStart;
    const end = input.selectionEnd == null ? start : input.selectionEnd;
    input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
    const pos = start + emoji.length;
    try {
      input.setSelectionRange(pos, pos);
    } catch {
      /* ignore */
    }
    autoGrow();
    updateSend();
    saveDraft();
    sendTyping(true);
    buzz(4);
  }

  function closeEmoji() {
    if (!$('emojiWrap').hidden) closeSheet($('emojiWrap'));
  }

  function openEmoji() {
    if (!$('emojiWrap').hidden) return;
    input.blur();
    showSheet((sheet) => {
      const grid = document.createElement('div');
      grid.className = 'emoji-grid';
      for (const emoji of EMOJIS) {
        const b = document.createElement('button');
        b.type = 'button';
        b.textContent = emoji;
        b.addEventListener('click', () => insertEmoji(emoji));
        grid.appendChild(b);
      }
      sheet.appendChild(grid);
    }, { wrap: $('emojiWrap'), sheet: $('emojiSheet') });
    const composer = $('composer');
    if (composer) {
      const top = composer.getBoundingClientRect().top;
      $('emojiWrap').style.bottom = Math.max(8, window.innerHeight - top + 6) + 'px';
    }
  }

  function openAttach() {
    showSheet((sheet) => {
      const grid = document.createElement('div');
      grid.className = 'grid';
      const cells = [
        { icon: PATH.image, label: '相册', run: () => $('photoInput').click() },
        { icon: PATH.camera, label: '拍照', run: () => $('cameraInput').click() },
        { icon: PATH.file, label: '文件', run: () => $('fileInput').click() },
      ];
      if (native && window.NearSend && window.NearSend.clipboard) {
        cells.push({ icon: PATH.clipboard, label: '剪贴板', run: pasteFromClipboard });
      }
      for (const c of cells) {
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell';
        const ic = document.createElement('span');
        ic.className = 'bubbleicon';
        ic.appendChild(svg(c.icon, 23));
        const lb = document.createElement('span');
        lb.textContent = c.label;
        cell.appendChild(ic);
        cell.appendChild(lb);
        cell.addEventListener('click', () => {
          closeSheet($('attachWrap'));
          setTimeout(c.run, 60);
        });
        grid.appendChild(cell);
      }
      sheet.appendChild(grid);
      const cancel = document.createElement('button');
      cancel.className = 'row cancel';
      cancel.textContent = '取消';
      cancel.addEventListener('click', () => closeSheet($('attachWrap')));
      sheet.appendChild(cancel);
    }, { wrap: $('attachWrap'), sheet: $('attach') });
  }

  function pasteFromClipboard() {
    try {
      const text = window.NearSend.clipboard();
      if (!text || !text.trim()) {
        toast('剪贴板是空的');
        return;
      }
      input.value = text.trim();
      autoGrow();
      updateSend();
      input.focus();
      toast('已粘贴剪贴板内容');
    } catch {
      toast('读不到剪贴板');
    }
  }

  // ---------- 事件 ----------

  sendBtn.addEventListener('click', sendText);
  input.addEventListener('input', () => {
    autoGrow();
    updateSend();
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
        renderMentionList();
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
      if (prefs.enterSend) {
        e.preventDefault();
        sendText();
      }
    }
  });

  $('plus').addEventListener('click', openAttach);
  $('emojiBtn').addEventListener('click', (e) => {
    e.stopPropagation();
    if (!$('emojiWrap').hidden) closeEmoji();
    else openEmoji();
  });
  document.addEventListener('click', (e) => {
    if ($('emojiWrap').hidden) return;
    if (e.target.closest('#emojiWrap') || e.target.closest('#emojiBtn')) return;
    closeEmoji();
  });

  for (const id of ['photoInput', 'cameraInput', 'fileInput']) {
    $(id).addEventListener('change', (e) => {
      const files = Array.from(e.target.files || []);
      e.target.value = '';
      if (files.length) handleFiles(files);
    });
  }

  document.addEventListener('paste', (e) => {
    const items = Array.from((e.clipboardData && e.clipboardData.items) || []);
    const img = items.find((i) => i.type.startsWith('image/'));
    if (!img) return;
    const f = img.getAsFile();
    if (f) handleFiles([f]);
  });

  $('jump').addEventListener('click', () => {
    state.stick = true;
    state.unread = 0;
    updateJump();
    pin(true);
    chat.scrollTo({ top: chat.scrollHeight, behavior: 'smooth' });
  });

  $('btnSearch').addEventListener('click', openSearch);
  $('searchBack').addEventListener('click', closeSearch);
  $('searchInput').addEventListener('input', (e) => runSearch(e.target.value));
  $('searchInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      stepHit(1);
    }
  });
  $('searchPrev').addEventListener('click', () => stepHit(-1));
  $('searchNext').addEventListener('click', () => stepHit(1));

  $('btnMore').addEventListener('click', openSettings);

  $('offlineRetry').addEventListener('click', () => {
    if (ws) {
      try {
        ws.close();
      } catch {
        /* ignore */
      }
    }
    ws = null;
    retryDelay = 600;
    connect();
  });

  $('replyClose').addEventListener('click', clearReply);
  $('selCancel').addEventListener('click', exitSelection);
  $('selDelete').addEventListener('click', deleteSelection);

  for (const id of ['sheetWrap', 'attachWrap', 'emojiWrap']) {
    $(id).addEventListener('click', (e) => {
      // 长按抬起手指时产生的这一次点击，不应该把刚弹出的层关掉
      if (Date.now() - lastSheetAt < 420) return;
      if (e.target === $(id)) closeSheet($(id));
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      state.hiddenUnread = 0;
      updateTitle();
      if (!state.connected && member) {
        retryDelay = 600;
        connect();
      }
      const unseen = state.messages
        .filter((m) => !isMine(m) && m.kind !== 'system' && m.status === 'ok' && !readByMe(m))
        .map((m) => m.id);
      if (unseen.length) sendSeen(unseen.slice(-200));
    }
  });

  window.addEventListener('online', () => {
    retryDelay = 600;
    connect();
  });
  window.addEventListener('offline', () => {
    setOffline(true, '网络已断开', false);
  });

  // 键盘弹出时把输入框留在可见区域
  const vv = window.visualViewport;
  if (vv) {
    const onResize = () => {
      const app = document.getElementById('app');
      if (!app) return;
      if (vv.height && vv.height < window.innerHeight - 60) {
        app.style.height = vv.height + 'px';
        app.style.top = vv.offsetTop + 'px';
        setTimeout(() => pin(true), 60);
      } else {
        app.style.height = '';
        app.style.top = '';
      }
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
  }
  input.addEventListener('focus', () => setTimeout(() => pin(true), 260));

  // ---------- 群聊外壳 ----------

  function requestLeave() {
    confirmSheet('退出后可以重新扫码加入，群里的历史消息不会删除。', '退出', () => {
      closeSheet();
      if (ws && ws.readyState === 1) {
        try {
          ws.send(JSON.stringify({ t: 'leave' }));
        } catch {
          /* ignore */
        }
      } else {
        member = null;
        saveMember(null);
        state.me = null;
        showJoin('已退出群聊');
      }
    });
  }

  $('roomBtn').addEventListener('click', openSide);
  $('roomBtn').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openSide();
    }
  });
  $('stack').addEventListener('click', (e) => {
    e.stopPropagation();
    openSide();
  });
  $('btnInvite').addEventListener('click', openInvite);
  $('sideClose').addEventListener('click', closeSide);
  $('sideScrim').addEventListener('click', closeSide);
  $('sideNick').addEventListener('click', askNickname);
  $('sideLeave').addEventListener('click', requestLeave);
  $('joinBtn').addEventListener('click', joinRoom);
  $('joinName').addEventListener('keydown', (e) => {
    if (e.isComposing) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      joinRoom();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!$('join').hidden) return;
    if ((e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      openSearch();
      return;
    }
    if (e.key !== 'Escape') return;
    if (mentionState.open) return closeMention();
    if (!$('viewer').hidden) return closeViewer();
    if (!$('sheetWrap').hidden) return closeSheet($('sheetWrap'));
    if (!$('emojiWrap').hidden) return closeEmoji();
    if (!$('attachWrap').hidden) return closeSheet($('attachWrap'));
    if (state.sideOpen) return closeSide();
    if (state.searching) return closeSearch();
    if (state.selecting) return exitSelection();
    if (state.reply) return clearReply();
  });

  // 电脑浏览器拖文件进来直接发送
  let dragDepth = 0;
  const dropEl = $('drop');
  document.addEventListener('dragenter', (e) => {
    if (!state.joined || !e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    dragDepth += 1;
    dropEl.hidden = false;
  });
  document.addEventListener('dragover', (e) => {
    if (dropEl.hidden) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  document.addEventListener('dragleave', () => {
    if (dropEl.hidden) return;
    dragDepth = Math.max(0, dragDepth - 1);
    if (!dragDepth) dropEl.hidden = true;
  });
  document.addEventListener('drop', (e) => {
    if (dropEl.hidden) return;
    e.preventDefault();
    dragDepth = 0;
    dropEl.hidden = true;
    const files = Array.from((e.dataTransfer && e.dataTransfer.files) || []);
    if (files.length) handleFiles(files);
  });

  // ---------- 原生桥接 ----------

  window.__nsApplyNative = function (cfg) {
    if (!cfg) return;
    native = Object.assign({}, native, cfg);
    applyTheme();
    applyFont();
  };

  window.__nsBack = function () {
    if (!$('join').hidden) return true;
    if (mentionState.open) {
      closeMention();
      return true;
    }
    if (state.sideOpen) {
      closeSide();
      return true;
    }
    if (!$('viewer').hidden) {
      closeViewer();
      return true;
    }
    if (!$('sheetWrap').hidden) {
      closeSheet($('sheetWrap'));
      return true;
    }
    if ($('emojiWrap').hidden === false) {
      closeEmoji();
      return true;
    }
    if (!$('attachWrap').hidden) {
      closeSheet($('attachWrap'));
      return true;
    }
    if (state.searching) {
      closeSearch();
      return true;
    }
    if (state.selecting) {
      exitSelection();
      return true;
    }
    if (state.reply) {
      clearReply();
      return true;
    }
    return false;
  };

  // ---------- 启动 ----------

  function boot() {
    if (!native && deviceKind() === 'desktop') $('viewerShare').textContent = '下载';
    chat.innerHTML = '<div class="loader"><span class="spinner"></span><span>正在加入群聊…</span></div>';
    loadQueue();
    try {
      const saved = JSON.parse(localStorage.getItem('ns.saved') || '[]');
      if (Array.isArray(saved)) state.saved = new Set(saved);
    } catch {
      /* ignore */
    }
    $('peer').textContent = '近传群聊';
    setStatus('连接中…', 'warn');
    // 待发送的消息先渲染出来，断网也能看见自己写了什么
    if (state.pending.size) {
      renderAll([]);
      pin(true);
    }
    restoreDraft();
    autoGrow();
    updateTitle();
    if (member) {
      connect();
    } else {
      setStatus('等待加入', 'warn');
      openJoinFlow();
    }

    // 回到前台、网络恢复时立刻验一次连接，别等心跳发现
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') return;
      if (!state.joined) return;
      if (!ws || ws.readyState !== 1) {
        connect();
        return;
      }
      try {
        ws.send(JSON.stringify({ t: 'ping', at: Date.now() }));
      } catch {
        /* 心跳会兜底 */
      }
    });
    window.addEventListener('online', () => {
      if (member && (!ws || ws.readyState !== 1)) connect();
    });
  }

  boot();
})();
