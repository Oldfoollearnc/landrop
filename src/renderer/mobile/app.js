'use strict';

const $ = (id) => document.getElementById(id);
const chat = $('chat');
const input = $('input');
const sendBtn = $('send');

const CHUNK = 4 * 1024 * 1024;
const byId = new Map();
const nodes = new Map();
let lastTs = 0;
let lastFrom = '';
let ws = null;
let retryDelay = 500;
let myId = localStorage.getItem('ldDid') || '';
if (!myId) {
  myId = Math.random().toString(16).slice(2, 10).padEnd(8, '0');
  localStorage.setItem('ldDid', myId);
}
let connected = false;
const queue = [];

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

function extLabel(name) {
  const m = /\.([a-z0-9]{1,5})$/i.exec(String(name || ''));
  return m ? m[1].toUpperCase() : 'FILE';
}

const toastEl = document.createElement('div');
toastEl.className = 'toast';
document.body.appendChild(toastEl);
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove('on'), 1800);
}

// ---------- render ----------

function isMine(m) {
  return m.from === 'phone' && myId && m.src === myId;
}

function fileCard(m) {
  const wrap = document.createElement('div');
  wrap.className = 'file';
  wrap.innerHTML = `<div class="fi">${esc(extLabel(m.name))}</div><div class="fx"><div class="fn"></div><div class="fs"><span class="sz"></span><span class="pct"></span></div></div>`;
  wrap.querySelector('.fn').textContent = m.name || '文件';
  wrap.querySelector('.sz').textContent = fmtSize(m.size);
  const pct = wrap.querySelector('.pct');
  if (m.status === 'uploading') pct.textContent = ' · ' + Math.round((m.progress || 0) * 100) + '%';
  else if (m.status === 'error') pct.textContent = ' · 未完成';
  return wrap;
}

function messageEl(m) {
  const row = document.createElement('div');
  row.className = 'msg ' + (isMine(m) ? 'out' : 'in');
  row.dataset.id = m.id;
  if (m.status === 'error') row.classList.add('failed');

  const b = document.createElement('div');
  b.className = 'bubble';

  if (m.kind === 'text') {
    b.textContent = m.text || '';
  } else {
    b.classList.add('media');
    if (m.kind === 'image' && m.status === 'ok' && m.path) {
      const img = document.createElement('img');
      img.loading = 'lazy';
      img.src = `/t/${m.id}`;
      img.addEventListener('load', () => pin(false));
      img.addEventListener('click', () => openViewer(`/t/${m.id}`));
      b.appendChild(img);
      const cap = document.createElement('div');
      cap.className = 'cap';
      cap.innerHTML = `<span>${esc(m.name || '')}</span><span>${fmtSize(m.size)}</span>`;
      b.appendChild(cap);
    } else {
      b.appendChild(fileCard(m));
    }
    if (m.status === 'uploading') {
      const p = document.createElement('div');
      p.className = 'progress';
      p.innerHTML = '<i></i>';
      p.querySelector('i').style.width = Math.round((m.progress || 0) * 100) + '%';
      b.appendChild(p);
    }
  }

  attachLongPress(b, m);
  row.appendChild(b);
  return row;
}

function nearBottom() {
  return chat.scrollHeight - chat.scrollTop - chat.clientHeight < 100;
}

let stick = true;
chat.addEventListener('scroll', () => {
  stick = nearBottom();
});

function pin(force) {
  if (force) stick = true;
  if (stick) chat.scrollTop = chat.scrollHeight;
}

function addSeparator(ts) {
  if (!lastTs || ts - lastTs > 10 * 60 * 1000) {
    const sep = document.createElement('div');
    sep.className = 'sep';
    const d = new Date(ts);
    const sameDay = d.toDateString() === new Date().toDateString();
    sep.textContent = sameDay
      ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      : `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    chat.appendChild(sep);
  }
  lastTs = ts;
}

function append(m) {
  const wasNear = nearBottom();
  const tight = lastFrom === m.from && m.ts - lastTs < 180000;
  const empty = chat.querySelector('.empty');
  if (empty) empty.remove();
  addSeparator(m.ts);
  const el = messageEl(m);
  if (!tight) el.classList.add('break');
  el.classList.add('enter');
  setTimeout(() => el.classList.remove('enter'), 260);
  chat.appendChild(el);
  nodes.set(m.id, el);
  byId.set(m.id, m);
  lastFrom = m.from;
  // 自己发出的消息一定跟到底，对方消息只在本来就在底部时跟随
  if (isMine(m) || wasNear) pin(true);
}

function upsert(m) {
  if (nodes.has(m.id)) {
    byId.set(m.id, m);
    const el = messageEl(m);
    nodes.get(m.id).replaceWith(el);
    nodes.set(m.id, el);
  } else {
    append(m);
  }
}

function patch(id, changes) {
  const m = byId.get(id);
  if (!m) return;
  Object.assign(m, changes);
  const el = nodes.get(id);
  if (!el) return;
  if ('path' in changes || (changes.status && changes.status !== 'uploading')) {
    const fresh = messageEl(m);
    el.replaceWith(fresh);
    nodes.set(id, fresh);
    return;
  }
  const bar = el.querySelector('.progress i');
  if (bar && typeof m.progress === 'number') bar.style.width = Math.round(m.progress * 100) + '%';
  const pct = el.querySelector('.pct');
  if (pct && typeof m.progress === 'number') pct.textContent = ' · ' + Math.round(m.progress * 100) + '%';
}

function remove(id) {
  const el = nodes.get(id);
  if (el) el.remove();
  nodes.delete(id);
  byId.delete(id);
  if (!nodes.size) renderEmpty();
}

function renderEmpty() {
  chat.innerHTML = '<div class="empty"><b>已连通</b>在电脑上输入，或直接发图片、文件<br>大文件会分片直传，不压缩、不中转</div>';
}

function renderAll(list) {
  chat.innerHTML = '';
  nodes.clear();
  byId.clear();
  lastTs = 0;
  lastFrom = '';
  if (!list.length && !failedUploads.length) {
    renderEmpty();
    return;
  }
  for (const m of list) append(m);
  renderFailed();
  pin(true);
  setTimeout(() => pin(false), 150);
}

// ---------- actions ----------

function attachLongPress(el, m) {
  let timer = null;
  let moved = false;
  el.addEventListener('touchstart', (e) => {
    moved = false;
    timer = setTimeout(() => {
      if (!moved) {
        if (navigator.vibrate) navigator.vibrate(8);
        openActions(m);
      }
    }, 480);
  }, { passive: true });
  el.addEventListener('touchmove', () => {
    moved = true;
    clearTimeout(timer);
  }, { passive: true });
  el.addEventListener('touchend', () => clearTimeout(timer));
  el.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    openActions(m);
  });
}

function copyText(text) {
  const done = () => toast('已复制');
  if (navigator.clipboard && window.isSecureContext) {
    navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
  } else {
    fallbackCopy(text, done);
  }
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

function openActions(m) {
  const items = [];
  if (m.kind === 'text') {
    items.push({ label: '复制文字', icon: '⧉', run: () => copyText(m.text || '') });
  } else if (m.status === 'ok') {
    if (m.kind === 'image') items.push({ label: '查看大图', icon: '⤢', run: () => openViewer(`/t/${m.id}`) });
    items.push({ label: m.kind === 'image' ? '保存图片' : '下载文件', icon: '↓', run: () => download(m) });
  }
  items.push({ label: '删除', icon: '⌫', danger: true, run: () => send({ t: 'delete', id: m.id }) });
  showSheet(items);
}

function download(m) {
  const a = document.createElement('a');
  a.href = `/d/${m.id}`;
  a.download = m.name || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  toast('开始下载');
}

function showSheet(items) {
  const sheet = $('sheet');
  sheet.innerHTML = '';
  for (const it of items) {
    const b = document.createElement('button');
    if (it.danger) b.className = 'danger';
    b.innerHTML = `<span class="icon">${it.icon}</span><span>${esc(it.label)}</span>`;
    b.addEventListener('click', () => {
      closeSheet();
      it.run();
    });
    sheet.appendChild(b);
  }
  const cancel = document.createElement('button');
  cancel.className = 'cancel';
  cancel.textContent = '取消';
  cancel.addEventListener('click', closeSheet);
  sheet.appendChild(cancel);
  $('sheetWrap').classList.add('on');
}

function closeSheet() {
  $('sheetWrap').classList.remove('on');
}

$('sheetWrap').addEventListener('click', (e) => {
  if (e.target === $('sheetWrap')) closeSheet();
});

function openViewer(src) {
  $('viewer').querySelector('img').src = src;
  $('viewer').classList.add('on');
}

$('viewer').addEventListener('click', () => {
  $('viewer').classList.remove('on');
  $('viewer').querySelector('img').src = '';
});

// ---------- send ----------

function send(obj) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj));
  else queue.push(obj);
}

function autoGrow() {
  input.style.height = 'auto';
  input.style.height = Math.min(120, input.scrollHeight) + 'px';
}

function updateSend() {
  sendBtn.disabled = !input.value.trim();
}

function sendText() {
  const v = input.value.trim();
  if (!v) return;
  send({ t: 'text', text: v, cid: myId });
  input.value = '';
  autoGrow();
  updateSend();
}

sendBtn.addEventListener('click', sendText);
input.addEventListener('input', () => {
  autoGrow();
  updateSend();
});
input.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
    e.preventDefault();
    sendText();
  }
});

// ---------- upload ----------

function postJSON(url, data) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data || {}),
  }).then((r) => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  });
}

function putChunk(id, blob, offset) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', `/api/upload/${id}?off=${offset}`);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
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
    xhr.timeout = 120000;
    xhr.send(blob);
  });
}

const failedUploads = [];
let failedSeq = 0;

function failedEl(item) {
  const row = document.createElement('div');
  row.className = 'msg out failed enter';
  row.dataset.key = item.key;
  const b = document.createElement('div');
  b.className = 'bubble media';
  b.appendChild(fileCard({ name: item.name, size: item.size, status: 'error' }));
  const bar = document.createElement('div');
  bar.className = 'retry';
  bar.innerHTML = '<span>发送失败</span><button type="button">重试</button>';
  bar.querySelector('button').addEventListener('click', () => retryUpload(item));
  b.appendChild(bar);
  row.appendChild(b);
  setTimeout(() => row.classList.remove('enter'), 260);
  return row;
}

function renderFailed() {
  for (const item of failedUploads) chat.appendChild(failedEl(item));
}

function addFailed(file) {
  const item = { key: 'f' + (++failedSeq), name: file.name || '文件', size: file.size, file };
  failedUploads.push(item);
  chat.appendChild(failedEl(item));
  pin(true);
  toast(`「${item.name}」发送失败`);
}

function removeFailed(key) {
  const idx = failedUploads.findIndex((f) => f.key === key);
  if (idx >= 0) failedUploads.splice(idx, 1);
  const el = chat.querySelector(`[data-key="${key}"]`);
  if (el) el.remove();
}

async function retryUpload(item) {
  removeFailed(item.key);
  try {
    await uploadOne(item.file);
  } catch {
    /* 失败会重新生成一条重试卡片 */
  }
}

async function uploadOne(file) {
  const init = await postJSON('/api/upload/init', {
    name: file.name || 'file',
    size: file.size,
    mime: file.type || '',
    cid: myId,
  });
  const id = init.id;
  let offset = 0;
  try {
    while (offset < file.size) {
      const end = Math.min(offset + CHUNK, file.size);
      const r = await putChunk(id, file.slice(offset, end), offset);
      offset = typeof r.offset === 'number' ? r.offset : end;
    }
    await postJSON(`/api/upload/${id}/done`, {});
  } catch (err) {
    // 撤掉服务器上那条“传输中”的半成品，改成本地可重试的失败卡片
    fetch(`/api/msg/${id}`, { method: 'DELETE' }).catch(() => {});
    addFailed(file);
    throw err;
  }
}

async function handleFiles(files) {
  for (const f of files) {
    try {
      if (f.size > 2 * 1024 * 1024) toast('正在发送，请保持屏幕常亮');
      await uploadOne(f);
    } catch {
      /* addFailed 已提示 */
    }
  }
}

$('plus').addEventListener('click', () => {
  showSheet([
    { label: '相册 / 图片', icon: '▣', run: () => $('photoInput').click() },
    { label: '拍照', icon: '◉', run: () => $('cameraInput').click() },
    { label: '文件', icon: '▤', run: () => $('fileInput').click() },
  ]);
});

for (const id of ['photoInput', 'cameraInput', 'fileInput']) {
  $(id).addEventListener('change', (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length) handleFiles(files);
  });
}

document.addEventListener('paste', (e) => {
  const items = Array.from(e.clipboardData?.items || []);
  const img = items.find((i) => i.type.startsWith('image/'));
  if (!img) return;
  const f = img.getAsFile();
  if (f) handleFiles([f]);
});

// ---------- socket ----------

function setStatus(text, on) {
  $('conn').textContent = text;
  $('dot').classList.toggle('on', !!on);
}

function connect() {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  const token = new URLSearchParams(location.search).get('t') || '';
  const query = token ? `?t=${encodeURIComponent(token)}` : '';
  try {
    ws = new WebSocket(`${proto}://${location.host}/ws${query}`);
  } catch {
    return;
  }

  ws.addEventListener('open', () => {
    connected = true;
    retryDelay = 500;
    setStatus('已连接', true);
    while (queue.length) ws.send(JSON.stringify(queue.shift()));
  });

  ws.addEventListener('message', (e) => {
    let p;
    try {
      p = JSON.parse(e.data);
    } catch {
      return;
    }
    if (p.t === 'init') {
      document.documentElement.dataset.theme = p.theme === 'light' ? 'light' : 'dark';
      $('peer').textContent = p.host || '电脑';
      renderAll(p.messages || []);
    } else if (p.t === 'msg') {
      upsert(p.msg);
      if (p.msg && p.msg.from === 'pc' && ws && ws.readyState === 1) {
        ws.send(JSON.stringify({ t: 'seen', ids: [p.msg.id] }));
      }
    } else if (p.t === 'msg:update') {
      patch(p.id, p.patch);
    } else if (p.t === 'msg:delete') {
      remove(p.id);
    } else if (p.t === 'theme') {
      document.documentElement.dataset.theme = p.theme === 'light' ? 'light' : 'dark';
    } else if (p.t === 'clear') {
      renderAll([]);
    }
  });

  ws.addEventListener('close', () => {
    connected = false;
    ws = null;
    setStatus('连接断开，重连中…', false);
    setTimeout(connect, retryDelay);
    retryDelay = Math.min(retryDelay * 1.8, 5000);
  });

  ws.addEventListener('error', () => {
    if (ws) ws.close();
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && !connected) {
    if (ws) ws.close();
    else connect();
  }
});

renderEmpty();
connect();
