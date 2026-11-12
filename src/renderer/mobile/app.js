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

  const NS = 'http://www.w3.org/2000/svg';

  // ---------- 偏好 ----------

  const PREF_KEY = 'ns.prefs';
  const prefs = Object.assign(
    { enterSend: false, haptics: true, font: 'm', theme: 'auto', density: 'normal' },
    readJSON(PREF_KEY) || {}
  );
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
  const nextCid = (kind) => `${myId}.${kind}${++seq}`;

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
    selecting: false,
    selection: new Set(),
    hits: [],
    hitIndex: -1,
    reply: null,
    searching: false,
    expand: new Set(),
  };

  let ws = null;
  let retryDelay = 600;
  let reconnectTimer = null;
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

  const isMine = (m) => m.from === 'phone';
  const isMedia = (m) => m.kind === 'image' || m.kind === 'file' || m.kind === 'video';

  function buzz(ms = 8) {
    if (!prefs.haptics) return;
    try {
      if (native && window.NearSend && window.NearSend.vibrate) window.NearSend.vibrate(ms);
      else if (navigator.vibrate) navigator.vibrate(ms);
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
    chevron: 'M9 5.5L15.5 12 9 18.5',
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

  function linkify(container, text) {
    const re = /(https?:\/\/[^\s<>()"'，。；！？、]+)/g;
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
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
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
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
    name.textContent = reply.from === 'pc' ? '对方' : '我';
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

  function ticksEl(m) {
    const wrap = document.createElement('span');
    wrap.className = 'ticks' + (m.seen ? ' seen' : '');
    const n = m.seen ? 2 : 1;
    for (let i = 0; i < n; i++) {
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
    } else if (m.from === 'phone' && m.kind === 'text') {
      meta.appendChild(ticksEl(m));
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
    }
    fx.appendChild(fn);
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

  function buildRow(m) {
    const row = document.createElement('div');
    row.className = 'msg ' + (isMine(m) ? 'out' : 'in') + (m.status === 'error' ? ' failed' : '');
    row.dataset.id = m.id;
    if (m.status === 'queued') row.classList.add('queued');
    if (state.selection.has(m.id)) row.classList.add('sel');

    const b = document.createElement('div');
    b.className = 'bubble';

    if (m.reply) b.appendChild(quoteEl(m.reply));

    if (m.kind === 'text') {
      b.appendChild(textContentEl(m));
      if (isMine(m)) b.appendChild(metaEl(m));
    } else {
      b.classList.add('media');
      const video = /^video\//i.test(m.mime || '') || /\.(mp4|mov|webm|m4v)$/i.test(m.name || '');
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
        b.appendChild(img);
      } else if (video && m.status === 'ok') {
        const v = document.createElement('video');
        v.controls = true;
        v.playsInline = true;
        v.preload = 'metadata';
        v.src = `/t/${m.id}`;
        v.addEventListener('loadedmetadata', () => {
          if (state.stick) pin(true);
        });
        b.appendChild(v);
      } else {
        b.appendChild(fileCard(m));
      }

      // 图片/视频在缩略图下补一行文件名；文件卡片本身已经有名字和大小，不再重复
      const hasThumb = (m.kind === 'image' || video) && m.status === 'ok';
      if (hasThumb) {
        const cap = document.createElement('div');
        cap.className = 'cap';
        const name = document.createElement('span');
        name.className = 'cname';
        name.textContent = m.name || (m.kind === 'image' ? '图片' : '文件');
        const size = document.createElement('span');
        size.textContent = fmtSize(m.size);
        cap.appendChild(name);
        cap.appendChild(size);
        if (isMine(m) && m.status === 'ok') cap.appendChild(ticksEl(m));
        b.appendChild(cap);
      }

      if (m.status === 'uploading') b.appendChild(progressEl(m));
    }

    attachPress(b, m);
    row.appendChild(b);
    return row;
  }

  function appendMessage(m) {
    const wasNear = nearBottom();
    const empty = chat.querySelector('.empty');
    if (empty) empty.remove();

    const newDay = addDaySeparator(m.ts);
    if (!newDay) addTimeSeparator(m.ts);

    const tight = state.lastFrom === m.from && m.ts - state.lastTs < 180000 && !newDay;
    const el = buildRow(m);
    if (!tight) el.classList.add('break');
    el.classList.add('enter');
    setTimeout(() => el.classList.remove('enter'), 240);
    chat.appendChild(el);

    state.messages.push(m);
    state.byId.set(m.id, m);
    state.nodes.set(m.id, el);
    state.lastTs = m.ts;
    state.lastFrom = m.from;

    if (isMine(m) || wasNear) {
      pin(true);
      updateJump();
    } else if (!state.stick) {
      state.unread += 1;
      updateJump();
    }

    if (m.from === 'pc' && m.status === 'ok') scheduleSeen(m.id);
  }

  function renderEmpty() {
    chat.textContent = '';
    const box = document.createElement('div');
    box.className = 'empty';
    const mark = document.createElement('div');
    mark.className = 'mark';
    mark.appendChild(svg('M8.4 16.2V7.4M8.4 7.4L5.6 10.2M8.4 7.4l2.8 2.8M15.6 7.8v8.8M15.6 16.6l-2.8-2.8M15.6 16.6l2.8-2.8', 26, { width: 2.2 }));
    const t = document.createElement('b');
    t.textContent = '已经连通';
    const d = document.createElement('span');
    d.textContent = '在电脑上输入，或者直接发图片、文件。大文件会分片直传，不压缩、不中转。';
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

  function rebuildRow(m) {
    const old = state.nodes.get(m.id);
    if (!old) return;
    const fresh = buildRow(m);
    old.replaceWith(fresh);
    state.nodes.set(m.id, fresh);
  }

  function removeRow(id) {
    const el = state.nodes.get(id);
    if (el) el.remove();
    state.nodes.delete(id);
    state.byId.delete(id);
    state.messages = state.messages.filter((m) => m.id !== id);
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
      setStatus('已连接 · 局域网直传', 'on');
      setOffline(false);
      flushPending();
      const unseen = state.messages.filter((m) => m.from === 'pc' && m.status === 'ok' && !m.seen).map((m) => m.id);
      if (unseen.length) sendSeen(unseen.slice(-200));
    });

    socket.addEventListener('message', (e) => {
      let p;
      try {
        p = JSON.parse(e.data);
      } catch {
        return;
      }
      onSocket(p);
    });

    socket.addEventListener('close', () => {
      if (ws !== socket) return;
      ws = null;
      state.connected = false;
      setStatus('连接断开，正在重连…', 'warn');
      const queued = state.pending.size;
      setOffline(true, queued ? `连接断开 · ${queued} 条消息待发送` : '连接断开，正在重连…', true);
      for (const cid of state.pending.keys()) setPendingStatus(cid, 'queued');
      scheduleReconnect();
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

  function flushPending() {
    if (!ws || ws.readyState !== 1) return;
    for (const [cid, v] of state.pending) {
      ws.send(JSON.stringify({ t: 'text', text: v.text, cid, reply: v.reply || undefined }));
      setPendingStatus(cid, 'sending');
    }
  }

  function onSocket(p) {
    if (p.t === 'init') {
      state.peer = p.host || state.peer || '电脑';
      $('peer').textContent = state.peer;
      document.title = state.peer + ' · 近传';
      // 电脑上的主题不驱动手机；手机端自己决定
      reconcileHistory(p.messages || []);
      return;
    }
    if (p.t === 'msg') {
      const m = p.msg;
      if (!m) return;
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
        appendMessage(m);
        return;
      }
      if (state.byId.has(m.id)) return;
      appendMessage(m);
      return;
    }
    if (p.t === 'msg:update') {
      patch(p.id, p.patch || {});
      return;
    }
    if (p.t === 'msg:delete') {
      removeRow(p.id);
      return;
    }
    if (p.t === 'clear') {
      renderAll([]);
      return;
    }
    if (p.t === 'presence') {
      return;
    }
    if (p.t === 'url') {
      return;
    }
  }

  function reconcileHistory(list) {
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
    if ('status' in changes || 'path' in changes || 'seen' in changes || 'name' in changes) {
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
      kind: 'text',
      text: value,
      reply,
      status: state.connected ? 'sending' : 'queued',
      ts: Date.now(),
    };
    state.locals.set(cid, { id: local.id, kind: 'text' });
    appendMessage(local);

    if (state.connected && ws && ws.readyState === 1) {
      ws.send(JSON.stringify({ t: 'text', text: value, cid, reply: reply || undefined }));
    } else {
      setOffline(true, '当前离线 · 消息会在连上后自动发送', false);
    }

    input.value = '';
    autoGrow();
    sendBtn.disabled = true;
    clearReply();
    saveDraft();
    buzz(8);
    pin(true);
  }

  function postJSON(url, data) {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

    try {
      const init = await postJSON('/api/upload/init', {
        name: local.name,
        size: local.size,
        mime: local.mime,
        cid,
      });
      const id = init.id;
      let offset = 0;
      while (offset < file.size) {
        const end = Math.min(offset + CHUNK, file.size);
        const r = await putChunk(id, file.slice(offset, end), offset, (loaded) =>
          onUploadProgress(cid, offset + loaded, file.size)
        );
        offset = typeof r.offset === 'number' ? r.offset : end;
        onUploadProgress(cid, offset, file.size);
      }
      await postJSON(`/api/upload/${id}/done`, {});
      trackers.stop(cid);
      buzz(8);
    } catch (err) {
      trackers.stop(cid);
      try {
        await fetch(`/api/msg/${cid}`, { method: 'DELETE' });
      } catch {
        /* ignore */
      }
      const local = state.locals.get(cid);
      if (local) {
        removeLocalRow(local.id);
        state.locals.delete(cid);
      }
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
    if (m.id.startsWith('local:')) {
      const cid = m.id.slice(6);
      showSheet((sheet) => {
        sheet.appendChild(sheetHeader('这条消息还没发出去', '对方还看不到它'));
        sheet.appendChild(sheetItem(PATH.trash, '取消发送', () => cancelLocal(cid), { danger: true }));
        sheet.appendChild(sheetCancel());
      });
      return;
    }
    const media = isMedia(m) && m.status === 'ok';
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader(isMine(m) ? '我发送的' : '对方发送的', fullTime(m.ts)));
      if (m.kind === 'text') {
        sheet.appendChild(sheetItem(PATH.copy, '复制文字', () => copyText(m.text || '')));
      }
      if (m.kind === 'image' && m.status === 'ok') {
        sheet.appendChild(sheetItem(PATH.view, '查看大图', () => openViewer(m.id)));
      }
      sheet.appendChild(sheetItem(PATH.reply, '回复', () => setReply(m)));
      if (media) {
        sheet.appendChild(sheetItem(PATH.save, m.kind === 'image' ? '保存到相册' : '保存到手机', () => saveMedia(m)));
        sheet.appendChild(sheetItem(PATH.share, '分享到其他应用', () => shareMedia(m)));
      }
      if (m.kind === 'text') {
        sheet.appendChild(sheetItem(PATH.share, '分享这段文字', () => shareText(m.text || '')));
      }
      sheet.appendChild(sheetItem(PATH.select, '多选', () => enterSelection(m.id)));
      sheet.appendChild(sheetItem(PATH.trash, '删除', () => deleteMessage(m.id), { danger: true }));
      sheet.appendChild(sheetCancel());
    });
  }

  function cancelLocal(cid) {
    state.pending.delete(cid);
    saveQueue();
    const local = state.locals.get(cid);
    if (local) {
      removeLocalRow(local.id);
      state.locals.delete(cid);
    }
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

  function saveMedia(m) {
    if (native && window.NearSend && window.NearSend.saveMedia) {
      window.NearSend.saveMedia(m.id, m.name || 'file');
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

  function deleteMessage(id) {
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'delete', id }));
    else fetch(`/api/msg/${id}`, { method: 'DELETE' }).catch(() => {});
    removeRow(id);
    toast('已删除');
  }

  // ---------- 回复 ----------

  function setReply(m) {
    state.reply = {
      id: m.id,
      from: m.from,
      kind: m.kind,
      text: m.kind === 'text' ? String(m.text || '').slice(0, 120) : '',
      name: m.name || '',
    };
    $('replyBar').hidden = false;
    $('replyName').textContent = isMine(m) ? '回复我自己的消息' : '回复 ' + (state.peer || '电脑');
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
    for (const id of ids) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ t: 'delete', id }));
      else fetch(`/api/msg/${id}`, { method: 'DELETE' }).catch(() => {});
      removeRow(id);
    }
    exitSelection();
    toast(`已删除 ${ids.length} 条`);
  }

  chat.addEventListener('click', (e) => {
    if (!state.selecting) return;
    const row = e.target.closest('.msg');
    if (!row || !row.dataset.id) return;
    const id = row.dataset.id;
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
      const hay = ((m.text || '') + ' ' + (m.name || '')).toLowerCase();
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
    return state.messages.filter((m) => m.kind === 'image' && m.status === 'ok');
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
      sheet.appendChild(sheetHeader('聊天设置', native ? '与「近传」应用设置同步' : '只影响这个页面'));

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

      if (native || navigator.vibrate) {
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
          s2.appendChild(sheetHeader(state.peer || '电脑', location.host));
          s2.appendChild(sheetItem(PATH.copy, '复制连接地址', () => copyText(location.href)));
          if (native) s2.appendChild(sheetItem(PATH.settings, '打开应用设置', () => window.NearSend.openSettings()));
          s2.appendChild(sheetCancel());
        });
      }, { hint: location.host }));

      sheet.appendChild(sheetItem(PATH.help, native ? '帮助与诊断' : '帮助', () => {
        if (native && window.NearSend.openHelp) window.NearSend.openHelp();
        else showHelp();
      }));

      sheet.appendChild(sheetItem(PATH.trash, '清空聊天记录', () => {
        confirmSheet('电脑端的聊天记录会被清空，已接收的文件保留。', '清空', () => {
          postJSON('/api/clear', {}).then(() => {
            renderAll([]);
            toast('已清空');
          }).catch(() => toast('清空失败'));
        });
      }, { danger: true }));

      sheet.appendChild(sheetItem(PATH.info, '关于近传', () => {
        showSheet((s2) => {
          s2.appendChild(sheetHeader('近传 ' + (native && native.version ? native.version : '1.0.0'), '手机 ⇄ 电脑，局域网直传'));
          const p = document.createElement('p');
          p.style.cssText = 'margin:10px 12px 14px;font-size:12.5px;line-height:1.8;color:var(--ink-3)';
          p.textContent = '没有账号，没有云端，没有广告。文字和文件在两台设备之间直连，聊天记录只保存在电脑上。';
          s2.appendChild(p);
          s2.appendChild(sheetCancel());
        });
      }));

      sheet.appendChild(sheetCancel());
    });
  }

  function showHelp() {
    showSheet((sheet) => {
      sheet.appendChild(sheetHeader('连不上电脑？', '按顺序检查这几点'));
      const tips = [
        '电脑上的「近传」是否还在运行（可以收起到托盘）',
        '手机和电脑连的是不是同一个 Wi-Fi',
        '路由器是否开了「AP 隔离」或访客网络',
        '电脑防火墙是否放通了这个端口',
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
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
      if (prefs.enterSend) {
        e.preventDefault();
        sendText();
      }
    }
  });

  $('plus').addEventListener('click', openAttach);

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

  for (const id of ['sheetWrap', 'attachWrap']) {
    $(id).addEventListener('click', (e) => {
      if (e.target === $(id)) closeSheet($(id));
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      if (!state.connected) {
        retryDelay = 600;
        connect();
      }
      const unseen = state.messages.filter((m) => m.from === 'pc' && m.status === 'ok' && !m.seen).map((m) => m.id);
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

  // ---------- 原生桥接 ----------

  window.__nsApplyNative = function (cfg) {
    if (!cfg) return;
    native = Object.assign({}, native, cfg);
    applyTheme();
    applyFont();
  };

  window.__nsBack = function () {
    if (!$('viewer').hidden) {
      closeViewer();
      return true;
    }
    if (!$('sheetWrap').hidden) {
      closeSheet($('sheetWrap'));
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
    chat.innerHTML = '<div class="loader"><span class="spinner"></span><span>正在连接电脑…</span></div>';
    loadQueue();
    $('peer').textContent = '电脑';
    setStatus('连接中…', 'warn');
    // 待发送的消息先渲染出来，断网也能看见自己写了什么
    if (state.pending.size) {
      renderAll([]);
      pin(true);
    }
    connect();
    restoreDraft();
    autoGrow();
  }

  boot();
})();
