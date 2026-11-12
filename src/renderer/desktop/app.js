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

let state = null;
let view = 'connect';
let theme = 'dark';
let isFull = false;
let pinned = true;
let soundOn = true;
let currentUrl = '';
let currentQr = '';
let devices = [];
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

// ---------- 工具 ----------

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
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

// ---------- 视图 ----------

function currentList() {
  const q = searchQuery.trim().toLowerCase();
  if (!q) return loaded;
  return loaded.filter((m) => (
    (m.text && m.text.toLowerCase().includes(q))
    || (m.name && m.name.toLowerCase().includes(q))
  ));
}

function updateChrome() {
  const inSettings = view === 'settings';
  const inConnect = view === 'connect';
  $('brand').hidden = inSettings || inConnect;
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
  updateChrome();
  if (next === 'chat') renderAll(currentList());
  if (next === 'settings') fillSettings();
}

function targetView() {
  return (!loaded.length && !devices.length) ? 'connect' : 'chat';
}

function syncView() {
  if (view === 'settings') return;
  const next = targetView();
  appEl.classList.toggle('offline', devices.length === 0 && loaded.length > 0);
  if (next !== view) setView(next);
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
  $('flashName').textContent = `${name} 已连接`;
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

function messageEl(m) {
  const row = document.createElement('div');
  row.className = 'msg ' + (m.from === 'pc' ? 'pc' : 'phone');
  row.dataset.id = m.id;
  if (m.status === 'error') row.classList.add('failed');
  if (multiMode && picked.has(m.id)) row.classList.add('picked');

  const b = document.createElement('div');
  b.className = 'bubble';

  if (m.reply) {
    const q = document.createElement('div');
    q.className = 'quote';
    const who = m.reply.from === 'pc' ? '我' : '手机';
    const body = m.reply.text
      || (m.reply.kind === 'image' ? '[图片]' : '[文件] ' + (m.reply.name || ''));
    q.textContent = `${who}：${body}`;
    b.appendChild(q);
  }

  if (m.kind === 'text') {
    b.textContent = m.text || '';
    b.title = fmtTime(m.ts);
    if (m.from === 'pc' && m.status === 'ok') {
      const t = document.createElement('span');
      t.className = 'tick' + (m.seen ? ' seen' : '');
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
    } else {
      b.appendChild(fileCard(m));
    }
    if (m.status === 'uploading') b.appendChild(progressEl(m));
  }

  row.appendChild(b);
  if (multiMode) row.appendChild(pickEl());
  else row.appendChild(toolsEl(m));
  return row;
}

function chatEmpty(isSearch) {
  const d = document.createElement('div');
  d.className = 'chat-empty' + (isSearch ? ' results' : '');
  d.innerHTML = isSearch
    ? '<b>没有匹配的消息</b>换个关键词试试'
    : '<b>还没有消息</b>在手机上发送文字、图片或文件';
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
  const tight = lastFrom === m.from && m.ts - lastTs < 180000;
  addSeparator(m.ts);
  const el = messageEl(m);
  if (!tight) el.classList.add('break');
  el.classList.add('enter');
  setTimeout(() => el.classList.remove('enter'), 280);
  chat.appendChild(el);
  nodes.set(m.id, el);
  byId.set(m.id, m);
  lastFrom = m.from;

  // 自己发出的消息无条件跟到底；对方消息只在本来就在底部时才跟随
  if (m.from === 'pc' || wasNear) scrollBottom(true);
  else if (!rendering) {
    pendingNew += 1;
    $('jumpCount').textContent = String(pendingNew);
    $('jumpPill').hidden = false;
  }
  if (m.from === 'phone') markSeen();
}

let seenTimer = null;
function markSeen() {
  if (document.visibilityState !== 'visible') return;
  clearTimeout(seenTimer);
  seenTimer = setTimeout(() => {
    if (!devices.length) return;
    const ids = loaded.filter((m) => m.from === 'phone' && m.status === 'ok' && !m.seen).map((m) => m.id);
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

function patchMessage(id, patch) {
  const m = byId.get(id) || loaded.find((x) => x.id === id);
  if (!m) return;
  Object.assign(m, patch);

  if (typeof patch.progress === 'number') trackSpeed(m, patch.progress);

  const el = nodes.get(id);
  if (!el) return;

  if ('seen' in patch) {
    const t = el.querySelector('.tick');
    if (t) t.classList.add('seen');
    return;
  }

  const structural = 'path' in patch || (patch.status && patch.status !== 'uploading');
  if (structural) {
    const fresh = messageEl(m);
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

async function handleAction(a, m) {
  if (a === 'copy') {
    api.copyText(m.text || '');
    toast('已复制');
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
  if (!m) return;
  const items = [];
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

function sendText() {
  const v = input.value.trim();
  if (!v) return;
  api.sendText(v);
  play('send');
  input.value = '';
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
});
input.addEventListener('keydown', (e) => {
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

function applyMode(mode) {
  isFull = mode === 'full';
  appEl.dataset.mode = isFull ? 'full' : 'compact';
  $('btnMax').innerHTML = isFull ? ICON.restore : ICON.max;
  $('btnMax').title = isFull ? '还原小窗' : '最大化';
  if (!isFull && searchMode) closeSearch();
  updateChrome();
  setTimeout(() => scrollBottom(true), 140);
}

function applyPin() {
  $('btnPin').classList.toggle('active', pinned);
  $('btnPin').title = pinned ? '取消置顶' : '置顶窗口';
}

function applyUrl(url, qr) {
  if (url) currentUrl = url;
  if (qr) {
    currentQr = qr;
    $('qrBig').src = qr;
  }
  $('setUrl').textContent = hostOf(currentUrl) || '—';
  $('setUrl').title = currentUrl;
}

// ---------- 设置 ----------

function fillSettings() {
  if (!state) return;
  document.querySelectorAll('#setTheme button').forEach((b) => {
    b.classList.toggle('on', b.dataset.v === theme);
  });
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
  await api.openFirewall();
  state.firewall = true;
  $('setFwState').textContent = '已放通';
  flashRow($('setFw'));
});

$('setReset').addEventListener('click', async () => {
  const ok = await askConfirm('重置后所有手机都需要重新扫码', '重置');
  if (!ok) return;
  state = Object.assign(state, await api.resetToken());
  applyUrl(state.url, state.qr);
  toast('令牌已重置');
});

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
$('connbarBtn').addEventListener('click', () => setView('connect'));
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
  if (e.key !== 'Escape') return;
  if ($('lightbox').classList.contains('on')) return closeLightbox();
  if (view === 'settings') return setView(targetView());
  if (searchMode) return closeSearch();
  if (multiMode) return exitMulti();
  if (isFull) api.setMode('compact');
});

// ---------- 事件 ----------

function onPresence(list) {
  const had = devices.length;
  devices = Array.isArray(list) ? list : [];
  updateChrome();
  appEl.classList.toggle('offline', devices.length === 0 && loaded.length > 0);

  if (devices.length > had) {
    const name = devices[0] || '手机';
    if (view === 'connect') {
      playConnect(name);
      return;
    }
    if (Date.now() - lastConnectAt > 30000) {
      play('connect');
      toast(`${name} 已连接`);
      pulseDot();
      lastConnectAt = Date.now();
    }
  }
  syncView();
}

function onEvent(p) {
  if (!p || !p.t) return;
  switch (p.t) {
    case 'msg': {
      loaded.push(p.msg);
      if (p.msg.from === 'phone') play('recv');
      if (view !== 'chat') syncView();
      else appendMessage(p.msg);
      break;
    }
    case 'msg:update':
      patchMessage(p.id, p.patch);
      break;
    case 'msg:delete':
      removeMessage(p.id);
      break;
    case 'clear':
      loaded = [];
      renderAll([]);
      syncView();
      break;
    case 'theme':
      applyTheme(p.theme);
      break;
    case 'url':
      applyUrl(p.url, p.qr);
      break;
    case 'presence':
      onPresence(p.devices);
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
  const s = await api.state();
  state = s;
  theme = s.theme;
  soundOn = !!s.sound;
  pinned = !!s.pinned;
  devices = s.devices || [];
  loaded = s.messages || [];
  currentUrl = s.url || '';
  currentQr = s.qr || '';

  document.documentElement.dataset.theme = theme;
  applyMode(s.isFull ? 'full' : 'compact');
  applyPin();
  applyUrl(s.url, s.qr);

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
  setView((!loaded.length && !devices.length) ? 'connect' : 'chat');
  appEl.classList.toggle('offline', devices.length === 0 && loaded.length > 0);
  markSeen();

  if (s.locked) {
    setTimeout(() => toast('聊天记录无法解密，原文件已保留'), 900);
  }

  api.onEvent(onEvent);
})();
