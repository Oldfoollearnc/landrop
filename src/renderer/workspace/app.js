/* 近传 · 远程工位 — 统一工作台 */
'use strict';

/* ---------- icons ---------- */
const ICONS = {
  monitor: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  laptop: '<rect x="4" y="5" width="16" height="11" rx="2"/><path d="M2.5 20h19"/>',
  play: '<path d="M8 5.5v13l10-6.5z" fill="currentColor" stroke="none"/>',
  shield: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-1.42 1.42-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1 1.55V20h-2v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-1.42-1.42.06-.06A1.7 1.7 0 0 0 9.4 15a1.7 1.7 0 0 0-1.55-1H7.7v-2h.15a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 1.42-1.42.06.06A1.7 1.7 0 0 0 12.36 8a1.7 1.7 0 0 0 1-1.55V6.3h2v.15a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 1.42 1.42-.06.06A1.7 1.7 0 0 0 19.4 11a1.7 1.7 0 0 0 1.55 1h.15v2h-.15a1.7 1.7 0 0 0-1.55 1z"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r="1"/><circle cx="3.5" cy="12" r="1"/><circle cx="3.5" cy="18" r="1"/>',
  activity: '<path d="M3 12h4l2.2-5 3.6 10 2.2-5H21"/>',
  search: '<circle cx="10.8" cy="10.8" r="6.3"/><path d="M15.4 15.4L20 20"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.2 14.6A7.8 7.8 0 0 1 9.4 3.8 8.2 8.2 0 1 0 20.2 14.6z"/>',
  beaker: '<path d="M8 3h8M10 3v6l-5 9a2 2 0 0 0 1.8 3h10.4A2 2 0 0 0 19 18l-5-9V3"/><path d="M7 15h10"/>',
  more: '<circle cx="5" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.3" fill="currentColor" stroke="none"/>',
  chevron: '<path d="M7 9l5 5 5-5"/>',
  arrowLeft: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
  arrowUpRight: '<path d="M7 17L17 7M8 7h9v9"/>',
  lock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  unlock: '<rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.6-1.4"/>',
  wifi: '<path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10 10 0 0 1 13 0M8.5 16a5 5 0 0 1 7 0"/><circle cx="12" cy="19.3" r="1" fill="currentColor" stroke="none"/>',
  check: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  warn: '<path d="M12 4l9 16H3z"/><path d="M12 9v5M12 17h.01"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/>',
  clipboard: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>',
  display: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  record: '<circle cx="12" cy="12" r="6" fill="currentColor" stroke="none"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 20h16"/>',
  copy: '<rect x="8" y="8" width="11" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h3"/>',
  external: '<path d="M14 4h6v6M20 4l-9 9M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-2.3 5.7"/><path d="M20 4v7h-7"/>',
  filter: '<path d="M3 5h18l-7 8v6l-4 2v-8z"/>',
  star: '<path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.9z"/>',
  user: '<circle cx="12" cy="8" r="3.4"/><path d="M4.5 20c.6-3.8 3.2-5.8 7.5-5.8s6.9 2 7.5 5.8"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="M11 12l8-8M16 5l3 3M14 7l3 3"/>',
  trash: '<path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6M14 11v6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/>',
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 20h16"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  power: '<path d="M12 3v8"/><path d="M6.2 6.2a8 8 0 1 0 11.6 0"/>',
  command: '<path d="M9 6a3 3 0 1 0 3 3v6a3 3 0 1 0 3-3H9a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3z"/>',
  minus: '<path d="M5 12h14"/>',
  square: '<rect x="6" y="6" width="12" height="12" rx="1.5"/>',
  chat: '<path d="M4 5h16v11H8l-4 3z"/><path d="M8 9h8M8 12h5"/>',
  info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  keyboard: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M7 10h.01M10.5 10h.01M14 10h.01M17.5 10h.01M7 13h.01M10.5 13h.01M14 13h.01M17.5 13h.01M8 16h8"/>',
  mouse: '<rect x="7" y="3" width="10" height="18" rx="5"/><path d="M12 7v4"/>',
  dot: '<circle cx="12" cy="12" r="2.6" fill="currentColor" stroke="none"/>',
  server: '<rect x="4" y="3" width="16" height="7" rx="2"/><rect x="4" y="14" width="16" height="7" rx="2"/><path d="M8 6.5h.01M8 17.5h.01M12 6.5h5M12 17.5h5"/>',
  shieldCheck: '<path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z"/><path d="M9 12l2 2 4-4"/>',
};

function icon(name, size = 16) {
  const body = ICONS[name] || ICONS.dot;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = icon(el.dataset.icon, Number(el.dataset.size) || 16);
  });
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/* ---------- demo data ---------- */
const PERMISSIONS = [
  { key: 'view', name: '查看屏幕', desc: '看到这台电脑的桌面画面', risk: '中' },
  { key: 'control', name: '控制键鼠', desc: '移动鼠标、点击和输入', risk: '高' },
  { key: 'unattended', name: '无人值守', desc: '锁屏/登录界面可连；仅 Windows 密码', risk: '高', dep: ['view', 'control'] },
  { key: 'clipboard', name: '剪贴板', desc: '同步复制的文字和图片', risk: '中' },
  { key: 'file', name: '文件传输', desc: '两台电脑之间发送文件', risk: '中' },
  { key: 'manage', name: '管理授权', desc: '添加/移除其他控制端，修改权限', risk: '高' },
  { key: 'audit', name: '查看审计', desc: '查看连接/解锁/授权记录', risk: '低' },
  { key: 'record', name: '录制', desc: '录制会话画面；被控端会显示提示', risk: '高' },
];
const PERM_LABEL = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p.name]));

let DEVICES = [
  {
    id: 'dev-1', name: '财务部-李伟的工位', host: 'DESKTOP-FIN-01', owner: '李伟', dept: '财务部',
    asset: 'A-0231', location: '3F 财务区', status: 'locked', relation: 'mine', grantType: 'owner',
    expiryLabel: '长期', expirySeconds: null,
    permissions: { view: true, control: true, unattended: true, clipboard: true, file: true, manage: true, audit: true, record: false },
    displays: [
      { id: 1, label: '屏幕 1', res: '2560×1440', dpi: '150%', primary: true },
      { id: 2, label: '屏幕 2', res: '1920×1080', dpi: '125%', primary: false },
    ],
    encoder: 'NVENC', wifi: '5GHz · Wi-Fi 6', version: '1.0.3', versionOk: true,
    ip: '192.168.10.23', fingerprint: 'A1B2 9F3C', lastSeen: '刚刚',
    lastSession: '今天 13:10–13:42', notes: '财务月结期间使用；副屏用于报表。',
    sessionHolder: null, starred: true, twoK: true,
  },
  {
    id: 'dev-2', name: '设计部-王芳的工位', host: 'DESKTOP-DESIGN-07', owner: '王芳', dept: '设计部',
    asset: 'D-0118', location: '5F 设计区', status: 'online', relation: 'managed', grantType: 'admin',
    expiryLabel: '7:58', expirySeconds: 478,
    permissions: { view: true, control: true, unattended: false, clipboard: false, file: false, manage: false, audit: true, record: false },
    displays: [{ id: 1, label: '屏幕 1', res: '1920×1080', dpi: '100%', primary: true }],
    encoder: 'Intel QSV', wifi: '5GHz · Wi-Fi 5', version: '1.0.3', versionOk: true,
    ip: '192.168.10.41', fingerprint: '77C1 0E2A', lastSeen: '刚刚',
    lastSession: '昨天 16:20–16:48', notes: '管理员临时支持；默认无人值守/剪贴板/文件关闭。',
    sessionHolder: null, starred: false, twoK: false,
  },
  {
    id: 'dev-3', name: '研发部-张敏的工位', host: 'DESKTOP-RD-12', owner: '张敏', dept: '研发部',
    asset: 'R-0321', location: '6F 研发区', status: 'offline', relation: 'mine', grantType: 'owner',
    expiryLabel: '长期', expirySeconds: null,
    permissions: { view: true, control: true, unattended: true, clipboard: true, file: true, manage: true, audit: true, record: false },
    displays: [{ id: 1, label: '屏幕 1', res: '2560×1440', dpi: '125%', primary: true }],
    encoder: 'NVENC', wifi: '5GHz · Wi-Fi 6', version: '1.0.1', versionOk: false,
    ip: '192.168.10.66', fingerprint: '3F9A 22D1', lastSeen: '2 小时前',
    lastSession: '今天 09:02–09:30', notes: 'Agent 版本落后；下次连接前需要更新。',
    sessionHolder: null, starred: false, twoK: true,
  },
  {
    id: 'dev-4', name: '共享工位 A-12', host: 'DESKTOP-SHARE-12', owner: '共享工位', dept: '行政部',
    asset: 'S-0012', location: '2F 共享区', status: 'online', relation: 'mine', grantType: 'owner',
    expiryLabel: '长期', expirySeconds: null,
    permissions: { view: true, control: true, unattended: false, clipboard: true, file: true, manage: false, audit: true, record: false },
    displays: [
      { id: 1, label: '屏幕 1', res: '1920×1080', dpi: '100%', primary: true },
      { id: 2, label: '屏幕 2', res: '1920×1080', dpi: '100%', primary: false },
    ],
    encoder: 'AMD AMF', wifi: '5GHz · Wi-Fi 6', version: '1.0.3', versionOk: true,
    ip: '192.168.10.88', fingerprint: 'B8D2 4A77', lastSeen: '刚刚',
    lastSession: '今天 11:05–11:40', notes: '共享工位，默认不授予无人值守；解锁时选择 Windows 账户。',
    sessionHolder: null, starred: false, twoK: true,
  },
  {
    id: 'dev-5', name: '行政部-陈晨的工位', host: 'DESKTOP-ADM-03', owner: '陈晨', dept: '行政部',
    asset: 'A-0107', location: '2F 行政区', status: 'online', relation: 'managed', grantType: 'admin',
    expiryLabel: '42 分钟', expirySeconds: 2520,
    permissions: { view: true, control: true, unattended: false, clipboard: false, file: false, manage: false, audit: true, record: false },
    displays: [{ id: 1, label: '屏幕 1', res: '2560×1440', dpi: '125%', primary: true }],
    encoder: 'NVENC', wifi: '5GHz · Wi-Fi 6', version: '1.0.3', versionOk: true,
    ip: '192.168.10.37', fingerprint: 'C4E9 81B0', lastSeen: '刚刚',
    lastSession: '今天 10:12–10:20', notes: '临时支持即将到期；员工可在工位端撤销。',
    sessionHolder: null, starred: false, twoK: true,
  },
  {
    id: 'dev-6', name: '财务部-赵强的工位', host: 'DESKTOP-FIN-06', owner: '赵强', dept: '财务部',
    asset: 'A-0254', location: '3F 财务区', status: 'offline', relation: 'managed', grantType: 'admin',
    expiryLabel: '已过期', expirySeconds: 0,
    permissions: { view: true, control: false, unattended: false, clipboard: false, file: false, manage: false, audit: false, record: false },
    displays: [{ id: 1, label: '屏幕 1', res: '1920×1080', dpi: '100%', primary: true }],
    encoder: 'Intel QSV', wifi: '2.4GHz · Wi-Fi 5', version: '1.0.3', versionOk: true,
    ip: '192.168.10.58', fingerprint: '9A04 6C2F', lastSeen: '昨天 18:20',
    lastSession: '昨天 17:02–17:18', notes: '授权已过期，需要员工重新授权。',
    sessionHolder: null, starred: false, twoK: false,
  },
];

DEVICES.forEach((d) => { d.demo = true; });
const DEMO_ENABLED = (() => { try { return localStorage.getItem('ns-demo') === '1'; } catch { return false; } })();

const GRANTS = [
  { id: 'g1', deviceId: 'dev-1', controller: '李伟的笔记本', type: '本人', scope: 'obtained', perms: ['view', 'control', 'unattended', 'clipboard', 'file', 'manage', 'audit'], expiryLabel: '长期', expirySeconds: null, status: '有效', lastUsed: '2 分钟前', source: '本人添加' },
  { id: 'g2', deviceId: 'dev-1', controller: 'IT-张伟的笔记本', type: '管理员', scope: 'managed', perms: ['view', 'control', 'audit'], expiryLabel: '7:58', expirySeconds: 478, status: '临时', lastUsed: '5 分钟前', source: '预置信任' },
  { id: 'g3', deviceId: 'dev-2', controller: '李伟的笔记本', type: '管理员', scope: 'obtained', perms: ['view', 'control', 'audit'], expiryLabel: '7:58', expirySeconds: 478, status: '临时', lastUsed: '刚刚', source: '6 位码' },
  { id: 'g4', deviceId: 'dev-4', controller: '王芳的笔记本', type: '本人', scope: 'managed', perms: ['view', 'control', 'clipboard', 'file', 'audit'], expiryLabel: '长期', expirySeconds: null, status: '有效', lastUsed: '今天 11:40', source: '本人添加' },
  { id: 'g5', deviceId: 'dev-5', controller: '李伟的笔记本', type: '管理员', scope: 'obtained', perms: ['view', 'control', 'audit'], expiryLabel: '42 分钟', expirySeconds: 2520, status: '即将到期', lastUsed: '今天 10:20', source: '局域网发现' },
  { id: 'g6', deviceId: 'dev-3', controller: '李伟的笔记本', type: '本人', scope: 'obtained', perms: ['view', 'control', 'unattended', 'clipboard', 'file'], expiryLabel: '12:00', expirySeconds: 0, status: '已过期', lastUsed: '今天 09:30', source: '本人添加' },
  { id: 'g7', deviceId: 'dev-6', controller: '王芳的笔记本', type: '管理员', scope: 'managed', perms: ['view'], expiryLabel: '已过期', expirySeconds: 0, status: '已过期', lastUsed: '昨天 17:18', source: '管理员预置' },
];

const AUDIT = [
  { id: 'a1', time: '14:32:10', event: '会话开始', code: 'SESSION_START', actor: '李伟的笔记本', deviceId: 'dev-1', result: '成功', type: 'connection', detail: '自动画质 1080p60；P2P 直连；延迟 18ms。' },
  { id: 'a2', time: '14:30:02', event: '解锁成功', code: 'UNLOCK_SUCCESS', actor: '李伟的笔记本', deviceId: 'dev-1', result: '成功', type: 'unlock', detail: 'Windows 本地账户 liwei；无人值守；未记录密码。' },
  { id: 'a3', time: '14:29:55', event: '解锁失败', code: 'PASSWORD_WRONG', actor: '李伟的笔记本', deviceId: 'dev-1', result: '失败', type: 'unlock', detail: '密码不正确；剩余尝试 2 次。' },
  { id: 'a4', time: '14:10:20', event: '授权续期', code: 'GRANT_RENEW', actor: 'IT-张伟的笔记本', deviceId: 'dev-1', result: '成功', type: 'grant', detail: '管理员临时支持延长 8 小时；无人值守保持关闭。' },
  { id: 'a5', time: '13:42:11', event: '会话结束', code: 'SESSION_END', actor: '李伟的笔记本', deviceId: 'dev-1', result: '成功', type: 'connection', detail: '时长 32 分钟；平均延迟 22ms；无重连。' },
  { id: 'a6', time: '13:10:03', event: '会话开始', code: 'SESSION_START', actor: '李伟的笔记本', deviceId: 'dev-1', result: '成功', type: 'connection', detail: '自动画质 2K60；强 Wi-Fi。' },
  { id: 'a7', time: '11:40:18', event: '授权创建', code: 'GRANT_CREATE', actor: '王芳的笔记本', deviceId: 'dev-4', result: '成功', type: 'grant', detail: '共享工位；本人授权；无人值守关闭。' },
  { id: 'a8', time: '11:05:01', event: '会话开始', code: 'SESSION_START', actor: '王芳的笔记本', deviceId: 'dev-4', result: '成功', type: 'connection', detail: 'Windows 账户 wangfang；屏幕 1。' },
  { id: 'a9', time: '10:20:44', event: '会话结束', code: 'SESSION_END', actor: '李伟的笔记本', deviceId: 'dev-5', result: '成功', type: 'connection', detail: '临时支持；时长 8 分钟。' },
  { id: 'a10', time: '10:12:31', event: '授权创建', code: 'GRANT_CREATE', actor: '李伟的笔记本', deviceId: 'dev-5', result: '成功', type: 'grant', detail: '管理员临时支持；8 小时；无人值守关闭。' },
  { id: 'a11', time: '09:30:12', event: '会话结束', code: 'SESSION_END', actor: '李伟的笔记本', deviceId: 'dev-3', result: '成功', type: 'connection', detail: '会话结束；授权已过期。' },
  { id: 'a12', time: '09:02:07', event: '会话开始', code: 'SESSION_START', actor: '李伟的笔记本', deviceId: 'dev-3', result: '成功', type: 'connection', detail: '自动画质 1080p60；单屏。' },
];

const SESSION_HISTORY = [
  { id: 's1', date: '今天 14:32–15:04', deviceId: 'dev-1', duration: '32 分钟', quality: '1080p60', latency: '18ms', result: '成功', reason: '用户结束' },
  { id: 's2', date: '今天 11:05–11:40', deviceId: 'dev-4', duration: '35 分钟', quality: '1080p60', latency: '21ms', result: '成功', reason: '空闲断开' },
  { id: 's3', date: '今天 10:12–10:20', deviceId: 'dev-5', duration: '8 分钟', quality: '2K60', latency: '16ms', result: '成功', reason: '用户结束' },
  { id: 's4', date: '今天 09:02–09:30', deviceId: 'dev-3', duration: '28 分钟', quality: '1080p60', latency: '24ms', result: '成功', reason: '授权到期' },
  { id: 's5', date: '昨天 16:20–16:48', deviceId: 'dev-2', duration: '28 分钟', quality: '1080p60', latency: '26ms', result: '成功', reason: '用户结束' },
];

const state = {
  view: 'devices',
  selectedDeviceId: 'dev-1',
  detailTab: 'overview',
  filter: 'all',
  search: '',
  theme: localStorage.getItem('rd-theme') || 'light',
  density: localStorage.getItem('rd-density') || 'standard',
  settingsSection: 'general',
  grantTab: 'obtained',
  auditFilter: 'all',
  session: null,
  sessionTimer: null,
  wizard: null,
  command: false,
  commandQuery: '',
  agent: false,
  agentPaused: false,
  agentCodeOpen: false,
  diagRunning: false,
  diagDone: false,
  lockOpen: false,
  remote: null,
  diag: null,
  peers: [],
  chat: null,
  lastFrame: null,
  frameRect: null,
  dmPeerId: null,
  dmConversations: {},
  pairResolve: null,
  addRole: 'owner',
  windowMaximized: false,
  incomingUnread: 0,
  uiSettings: (() => { try { return JSON.parse(localStorage.getItem('ns-ui-settings') || '{}'); } catch { return {}; } })(),
};

function deviceById(id) { return DEVICES.find((d) => d.id === id); }

function peerToDevice(peer) {
  const rawName = String(peer.name || '').replace('（本机）', '').trim() || peer.id;
  const name = peer.self ? `${rawName}（本机）` : rawName;
  return {
    id: `peer-${peer.id}`,
    peerId: peer.id,
    real: true,
    self: !!peer.self,
    name,
    host: rawName,
    owner: peer.self ? '本机' : '同事',
    dept: '局域网',
    asset: 'LAN',
    location: '同一 Wi-Fi',
    status: peer.online ? 'online' : 'offline',
    relation: 'mine',
    grantType: 'owner',
    expiryLabel: '长期',
    expirySeconds: null,
    permissions: { view: true, control: true, unattended: !!peer.self, clipboard: true, file: true, manage: false, audit: true, record: true },
    displays: Array.from({ length: Math.max(1, Math.min(2, peer.displayCount || 1)) }, (_, i) => ({
      id: i + 1,
      label: `屏幕 ${i + 1}`,
      res: peer.displays?.[i]?.res || '1920×1080',
      dpi: '100%',
      primary: peer.displays?.[i]?.primary ?? i === 0,
    })),
    encoder: 'JPEG · LAN',
    wifi: 'LAN',
    version: peer.version || '1.0.0',
    versionOk: true,
    ip: peer.ip,
    fingerprint: '',
    lastSeen: peer.self ? '本机' : peer.online ? '刚刚' : (peer.lastSeen ? new Date(peer.lastSeen).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'),
    lastSession: '—',
    notes: peer.self ? '本机被控预览：用于单机验证屏幕与输入。' : '局域网发现的近传设备；首次连接需要 6 位授权码。',
    sessionHolder: null,
    starred: !!peer.self,
    twoK: true,
    demo: false,
  };
}

function applySessionGrant() {
  const grant = state.session?.grant;
  if (!grant || !grant.permissions) return;
  const d = DEVICES.find((x) => x.id === state.session.deviceId);
  if (!d) return;
  d.permissions = { ...d.permissions, ...grant.permissions };
  d.relation = grant.role === 'admin' ? 'managed' : d.relation;
  d.grantType = grant.role === 'admin' ? 'admin' : 'owner';
  d.expiryLabel = grant.expiresAt
    ? `${Math.max(1, Math.ceil((grant.expiresAt - Date.now()) / 3600000))} 小时`
    : '长期';
  d.expirySeconds = grant.expiresAt ? Math.max(0, Math.floor((grant.expiresAt - Date.now()) / 1000)) : null;
  state.session.clipboard = !!d.permissions.clipboard;
}

function mergeRemoteState(remoteState) {
  if (!remoteState) return;
  const firstRemote = !state.remote;
  state.remote = remoteState;
  const peers = Array.isArray(remoteState.peers) ? remoteState.peers : [];
  state.peers = peers;
  const real = peers.map(peerToDevice);
  const demos = DEMO_ENABLED ? DEVICES.filter((d) => d.demo) : [];
  const all = [...real, ...demos];
  DEVICES = all;
  applySessionGrant();
  if (!DEVICES.some((d) => d.id === state.selectedDeviceId)) {
    state.selectedDeviceId = DEVICES[0] ? DEVICES[0].id : null;
  } else if (firstRemote && real.length && deviceById(state.selectedDeviceId)?.demo) {
    state.selectedDeviceId = real[0].id;
  }
  const badge = document.querySelector('.nav-item[data-view="devices"] .nav-badge');
  if (badge) badge.textContent = String(Math.max(0, peers.length));
}
function grantById(id) { return GRANTS.find((g) => g.id === id); }
function effectivePermissions(device) { return device.permissions; }
function permissionSummary(device) {
  const p = effectivePermissions(device);
  return PERMISSIONS.filter((x) => p[x.key]).map((x) => x.name).join('、') || '无';
}
function expiryClass(seconds) {
  if (seconds === 0) return 'red';
  if (seconds !== null && seconds <= 900) return 'red';
  if (seconds !== null && seconds <= 7200) return 'admin';
  return '';
}
function statusMeta(device) {
  switch (device.status) {
    case 'online': return { label: '在线', cls: 'ok', icon: 'dot' };
    case 'locked': return { label: '已锁屏', cls: 'ok', icon: 'lock' };
    case 'session': return { label: '会话中 · 我', cls: 'session', icon: 'play' };
    case 'offline': return { label: `离线 · ${device.lastSeen}`, cls: 'gray', icon: 'clock' };
    case 'updating': return { label: '更新中', cls: 'blue', icon: 'refresh' };
    case 'paused': return { label: '已暂停', cls: 'admin', icon: 'pause' };
    default: return { label: '需要处理', cls: 'red', icon: 'warn' };
  }
}
function statusTag(device) {
  const m = statusMeta(device);
  return `<span class="tag ${m.cls}">${icon(m.icon, 11)}${esc(m.label)}</span>`;
}
function expiryTag(device) {
  const cls = expiryClass(device.expirySeconds);
  return `<span class="tag ${cls}">${device.expirySeconds === null ? '长期' : esc(device.expiryLabel)}</span>`;
}
function adminTag(device) {
  return device.relation === 'managed' ? `<span class="tag admin">${icon('shield', 10)}管理员</span>` : '';
}
function devicePrimary(device) {
  if (device.status === 'offline') return { label: '查看离线原因', action: 'offline-help', icon: 'clock' };
  if (!device.versionOk) return { label: '查看兼容性', action: 'version-help', icon: 'warn' };
  if (device.status === 'session') return { label: '返回会话', action: 'resume-session', icon: 'play' };
  if (device.status === 'locked') return device.permissions.unattended
    ? { label: '连接（无人值守）', action: 'open-session', icon: 'unlock' }
    : { label: '查看原因', action: 'unattended-help', icon: 'lock' };
  if (device.status === 'paused') return { label: '查看原因', action: 'paused-help', icon: 'pause' };
  if (device.expirySeconds === 0) return { label: '请求续期', action: 'renew-device', icon: 'refresh' };
  return { label: '连接', action: 'open-session', icon: 'play' };
}

/* ---------- shell / nav ---------- */
function setView(view) {
  state.view = view;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  render();
  document.getElementById('main')?.focus({ preventScroll: true });
}
function render() {
  const actualTheme = state.theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : state.theme;
  document.documentElement.dataset.theme = actualTheme;
  document.documentElement.dataset.density = state.density;
  const themeBtn = document.getElementById('btnTheme');
  if (themeBtn) themeBtn.innerHTML = icon(actualTheme === 'light' ? 'moon' : 'sun');
  const main = document.getElementById('main');
  if (!main) return;
  if (state.view === 'devices') renderDevices();
  else if (state.view === 'sessions') renderSessions();
  else if (state.view === 'messages') renderMessages();
  else if (state.view === 'grants') renderGrants();
  else if (state.view === 'audit') renderAudit();
  else if (state.view === 'diagnostics') renderDiagnostics();
  else if (state.view === 'settings') renderSettings();
  hydrateIcons(main);
}

/* ---------- devices view ---------- */
function renderDevices() {
  const main = document.getElementById('main');
  const device = deviceById(state.selectedDeviceId) || DEVICES[0];
  state.selectedDeviceId = device.id;
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title">
        <h1>设备</h1>
        <p>局域网实时发现 · 同一 Wi-Fi · 无 Hub · 首次连接需授权码</p>
      </div>
      <div class="page-actions">
        <button class="btn" data-action="refresh"><span data-icon="refresh"></span>刷新</button>
        <button class="btn btn-primary" data-action="add-device"><span class="btn-plus">+</span> 添加设备</button>
      </div>
    </div>
    <div class="device-layout">
      <section class="panel device-panel">
        <div class="panel-head">
          <div class="panel-title-row"><b>我的设备</b><span class="count" id="deviceCount">${filteredDevices().length} 台</span></div>
          <label class="search-box">
            <span data-icon="search"></span>
            <input id="deviceSearch" type="search" placeholder="搜索设备、员工、资产编号" value="${esc(state.search)}" autocomplete="off">
          </label>
          <div class="filter-row">
            <button class="filter-chip ${state.filter === 'all' ? 'active' : ''}" data-action="filter" data-value="all">全部</button>
            <button class="filter-chip ${state.filter === 'mine' ? 'active' : ''}" data-action="filter" data-value="mine">我的</button>
            <button class="filter-chip ${state.filter === 'managed' ? 'active' : ''}" data-action="filter" data-value="managed">我管理的</button>
            <button class="filter-chip ${state.filter === 'attention' ? 'active' : ''}" data-action="filter" data-value="attention">需要处理</button>
            <button class="filter-icon" data-action="filter-more" title="更多筛选" aria-label="更多筛选"><span data-icon="filter"></span></button>
          </div>
        </div>
        <div class="device-list" id="deviceList">${deviceListHtml()}</div>
      </section>
      <section class="panel detail">${detailHtml(device)}</section>
    </div>`;
  hydrateIcons(main);
  const input = main.querySelector('#deviceSearch');
  if (input) {
    input.addEventListener('input', (e) => {
      state.search = e.target.value;
      const list = document.getElementById('deviceList');
      const count = document.getElementById('deviceCount');
      if (list) list.innerHTML = deviceListHtml();
      if (count) count.textContent = `${filteredDevices().length} 台`;
      hydrateIcons(list || main);
    });
  }
}

function filteredDevices() {
  const q = state.search.trim().toLowerCase();
  return DEVICES.filter((d) => {
    if (d.demo && state.filter !== 'all') return false;
    if (state.filter === 'mine' && d.relation !== 'mine') return false;
    if (state.filter === 'managed' && d.relation !== 'managed') return false;
    if (state.filter === 'attention' && !(d.status === 'offline' || !d.versionOk || d.expirySeconds === 0)) return false;
    if (!q) return true;
    return [d.name, d.owner, d.dept, d.asset, d.host].some((x) => String(x).toLowerCase().includes(q));
  });
}

function deviceRowHtml(device) {
  const active = device.id === state.selectedDeviceId;
  return `
    <div class="device-row ${active ? 'active' : ''}" data-device-id="${device.id}" role="button" tabindex="0" aria-selected="${active}">
      <span class="device-ico ${device.status === 'session' ? 'session' : ''}">${icon(device.status === 'offline' ? 'laptop' : 'monitor', 16)}</span>
      <span class="device-main">
        <span class="device-name"><b>${esc(device.name)}</b>${device.demo ? '<span class="tag gray">示例</span>' : ''}</span>
        <span class="device-sub">${esc(device.owner)} · ${esc(device.dept)} · ${esc(device.asset)} <span class="expiry-inline ${expiryClass(device.expirySeconds) === 'red' ? 'red' : expiryClass(device.expirySeconds) === 'admin' ? 'warn' : ''}">· ${device.expirySeconds === null ? '长期' : esc(device.expiryLabel)}</span></span>
      </span>
      <span class="device-side">${statusTag(device)}</span>
      <span class="row-actions"><button class="icon-btn sm" data-action="device-more" data-device-id="${device.id}" title="更多" aria-label="更多">${icon('more', 14)}</button></span>
    </div>`;
}

function deviceListHtml() {
  const items = filteredDevices();
  if (!items.length) {
    return `<div class="empty-state" style="padding:26px 10px">
      <div class="empty-ico">${icon('search', 20)}</div>
      <b>没有找到设备</b>
      <p>试试设备名、员工姓名或资产编号。</p>
      <div class="empty-actions"><button class="btn btn-sm" data-action="clear-search">清除筛选</button></div>
    </div>`;
  }
  const demo = items.filter((d) => d.demo);
  const starred = items.filter((d) => !d.demo && d.starred);
  const mine = items.filter((d) => !d.demo && !d.starred && d.relation === 'mine');
  const managed = items.filter((d) => !d.demo && !d.starred && d.relation === 'managed');
  const group = (title, list) => list.length ? `<div class="device-group-title"><span>${title}</span><span class="line"></span></div>${list.map(deviceRowHtml).join('')}` : '';
  return `${group('收藏', starred)}${group('我的设备', mine)}${group('我管理的设备（本机清单）', managed)}${group('示例设备（可删除）', demo)}`;
}

function detailHtml(device) {
  const primary = devicePrimary(device);
  return `
    <div class="detail-head">
      <div class="detail-breadcrumb"><span>设备</span>${icon('chevron', 12)}<span>${esc(device.relation === 'mine' ? '我的设备' : '我管理的设备')}</span></div>
      <div class="detail-title-row">
        <div class="detail-title">
          <h2>${esc(device.name)} ${adminTag(device)}</h2>
          <div class="detail-sub"><span>${esc(device.host)}</span><span class="dot-sep">·</span><span>${esc(device.owner)}</span><span class="dot-sep">·</span><span>${esc(device.dept)}</span><span class="dot-sep">·</span><span>${esc(device.asset)}</span><span class="dot-sep">·</span><span>${esc(device.location)}</span></div>
          <div class="trust-strip">${device.real
            ? `<span class="trust-item">${icon('wifi', 12)}局域网直连</span><span class="trust-item">${icon('shieldCheck', 12)}WS 会话</span><span class="trust-item">${icon('list', 12)}本机审计</span>`
            : `<span class="trust-item">${icon('shieldCheck', 12)}P2P 直连</span><span class="trust-item">${icon('lock', 12)}TLS 1.3</span><span class="trust-item">${icon('list', 12)}本机审计</span>`}</div>
        </div>
        <div class="detail-actions">
          <button class="btn btn-primary" data-action="${primary.action}" data-device-id="${device.id}">${icon(primary.icon, 14)} ${esc(primary.label)}</button>
          <button class="icon-btn" data-action="device-more" data-device-id="${device.id}" title="更多" aria-label="更多">${icon('more')}</button>
        </div>
      </div>
    </div>
    <div class="detail-tabs" role="tablist">
      ${tabHtml('overview', '概览')}${tabHtml('permissions', '权限')}${tabHtml('network', '屏幕与网络')}${tabHtml('history', '历史')}${tabHtml('maintenance', '维护')}
    </div>
    <div class="detail-body">${detailTabHtml(device)}</div>`;
}
function tabHtml(key, label) {
  return `<button class="tab-btn ${state.detailTab === key ? 'active' : ''}" data-action="detail-tab" data-value="${key}" role="tab" aria-selected="${state.detailTab === key}">${label}</button>`;
}

function detailTabHtml(device) {
  if (state.detailTab === 'permissions') return permissionsTab(device);
  if (state.detailTab === 'network') return networkTab(device);
  if (state.detailTab === 'history') return historyTab(device);
  if (state.detailTab === 'maintenance') return maintenanceTab(device);
  return overviewTab(device);
}

function overviewTab(device) {
  const p = effectivePermissions(device);
  const current = state.session && state.session.deviceId === device.id && !state.session.closed;
  const recent = SESSION_HISTORY.find((s) => s.deviceId === device.id);
  return `
    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><b>状态</b><span class="card-action" data-action="refresh">刷新</span></div>
          <dl class="kv">
            <dt>当前状态</dt><dd>${statusTag(device)}</dd>
            <dt>上次在线</dt><dd>${esc(device.lastSeen)}</dd>
            <dt>Agent 版本</dt><dd class="mono">${esc(device.version)} ${device.versionOk ? '' : '<span class="tag red" style="margin-left:6px">需更新</span>'}</dd>
            <dt>网络</dt><dd>${esc(device.wifi)}</dd>
            <dt>编码器</dt><dd>${esc(device.encoder)}</dd>
            <dt>P2P 地址</dt><dd class="mono">${esc(device.ip)}</dd>
          </dl>
          ${device.status === 'offline' ? `<div class="perm-summary" style="background:var(--surface-subtle);border-color:var(--line)">这台电脑离线。可能已关机、睡眠或断开 Wi-Fi。近传不会远程唤醒设备，请到工位开机后再试。</div>` : ''}
        </div>
        <div class="card">
          <div class="card-head"><b>${current ? '当前会话' : '最近会话'}</b><span class="card-action" data-action="view-sessions">全部记录</span></div>
          ${current ? `
            <div class="kv">
              <dt>控制端</dt><dd>${state.session.grant?.role === 'admin' ? '管理员临时支持' : '本机控制端'}</dd>
              <dt>开始</dt><dd>${new Date(state.session.startAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</dd>
              <dt>画质</dt><dd>${esc(state.session.qualityLabel || '自动 · 1080p')}</dd>
              <dt>传输</dt><dd class="mono">${esc(state.session.capture === 'gdi' ? 'GDI · JPEG' : '局域网 WS')}</dd>
            </div>
            <div style="margin-top:10px"><button class="btn btn-sm btn-soft" data-action="resume-session">${icon('play', 13)} 返回会话</button></div>
          ` : `
            <div class="kv">
              <dt>最近一次</dt><dd>${esc(recent?.date || device.lastSession || '—')}</dd>
              <dt>结果</dt><dd>${esc(recent?.result || '—')}</dd>
              <dt>连接方式</dt><dd class="mono">${esc(recent?.latency || '—')}</dd>
            </div>
          `}
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><b>我的权限</b><span class="card-action" data-action="detail-tab" data-value="permissions">详情</span></div>
          <div class="permission-summary">
            ${PERMISSIONS.map((x) => `<span class="perm-chip ${p[x.key] ? '' : 'off'}">${icon(p[x.key] ? 'check' : 'x', 11)}${x.name}</span>`).join('')}
          </div>
          <div class="expiry-big ${expiryClass(device.expirySeconds) === 'red' ? 'expiry-danger' : expiryClass(device.expirySeconds) === 'admin' ? 'expiry-warn' : ''}"><b>${device.expirySeconds === null ? '长期' : esc(device.expiryLabel)}</b><span>${device.expirySeconds === null ? '无到期时间' : '后到期'}</span></div>
          <div class="card-note">${device.relation === 'managed' ? '管理员临时支持：无人值守、剪贴板、文件默认关闭；员工可随时撤销。' : '员工本人授权：默认长期；录制默认关闭。'}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>2K 就绪</b><span class="tag ${device.twoK ? 'ok' : 'admin'}">${device.twoK ? '可用' : '受限'}</span></div>
          <dl class="kv">
            <dt>显示器</dt><dd>${device.displays.length} 块 · ${esc(device.displays[0].res)}</dd>
            <dt>硬件编码</dt><dd>${esc(device.encoder)}</dd>
            <dt>Wi-Fi</dt><dd>${esc(device.wifi)}</dd>
          </dl>
          <div class="card-note">${device.twoK ? '2K 采集可用；受 JPEG/局域网限制约 10–12fps，优先 1080p 保证操作流畅。' : '当前网络条件不建议 2K；默认 1080p。'}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>备注</b><span class="card-action" data-action="detail-tab" data-value="maintenance">编辑</span></div>
          <div class="card-note" style="margin-top:0;color:var(--ink-2)">${esc(device.notes)}</div>
        </div>
      </div>
    </div>`;
}

function permissionsTab(device) {
  const p = effectivePermissions(device);
  const deviceGrants = device.self
    ? (state.remote?.grants || []).map((g) => ({
      id: g.controllerId, controller: g.name || g.controllerId, source: '本机被控授权',
      type: g.role === 'admin' ? '管理员' : '本人',
      perms: Object.keys(g.permissions || {}).filter((k) => g.permissions[k]),
      expirySeconds: g.expiresAt ? Math.max(0, Math.floor((g.expiresAt - Date.now()) / 1000)) : null,
      expiryLabel: grantRemainLabel(g), status: g.expiresAt ? '临时' : '长期', real: true,
    }))
    : GRANTS.filter((g) => g.deviceId === device.id);
  return `
    ${device.relation === 'managed' ? `<div class="perm-summary" style="margin-bottom:12px;background:var(--amber-soft);border-color:var(--amber-line)"><b style="color:var(--amber)">临时支持</b>：管理员授权 8 小时后自动失效；无人值守、剪贴板、文件默认关闭；员工可在工位端撤销。</div>` : ''}
    <div class="card">
      <div class="card-head"><b>我的权限</b><span class="muted" style="font-size:10px">实时 · 本机缓存</span></div>
      <div class="perm-table" style="margin-top:0">
        ${PERMISSIONS.map((x) => `
          <div class="perm-row">
            <div class="perm-main"><b>${x.name}${x.risk === '高' ? '<span class="perm-risk high">敏感</span>' : ''}</b><span>${x.desc}</span></div>
            <div class="perm-switch"><button class="switch ${p[x.key] ? 'on' : ''}" aria-checked="${p[x.key]}" aria-label="${x.name}" disabled></button></div>
          </div>`).join('')}
      </div>
      <div class="card-note">撤销立即生效；角色在首次 6 位码配对时确定。无人值守策略在安全桌面场景下仍需原生服务。</div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-head"><b>这台设备上的授权</b><span class="card-action" data-action="open-agent">在工位电脑上管理</span></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>控制端</th><th>身份</th><th>权限</th><th>到期</th><th>状态</th><th></th></tr></thead>
          <tbody>
            ${deviceGrants.map((g) => `
              <tr ${g.real ? '' : `data-action="open-grant" data-grant-id="${g.id}"`}>
                <td><span class="cell-main">${esc(g.controller)}</span><span class="cell-sub">${esc(g.source)}</span></td>
                <td><span class="tag ${g.type === '管理员' ? 'admin' : ''}">${esc(g.type)}</span></td>
                <td>${g.perms.map((k) => PERM_LABEL[k] || k).join('、')}</td>
                <td><span class="tag ${expiryClass(g.expirySeconds)}">${esc(g.expiryLabel)}</span></td>
                <td>${esc(g.status)}</td>
                <td><div class="table-actions">${g.real ? `<button class="btn btn-sm" data-action="revoke-inbound" data-controller-id="${esc(g.id)}">撤销</button>` : `<button class="icon-btn" data-action="open-grant" data-grant-id="${g.id}" title="详情">${icon('chevron', 14)}</button>`}</div></td>
              </tr>`).join('') || `<tr><td colspan="6"><div class="table-empty">没有其他授权控制端。</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card-note">“控制本机的控制端”以本机被控列表为准；本页可撤销。其他设备的授权需在对应工位电脑上管理。</div>
    </div>`;
}

function networkTab(device) {
  return `
    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><b>显示器</b><span class="muted" style="font-size:10px">同一时间只传一块屏</span></div>
          ${device.displays.map((d) => `
            <div class="perm-row" style="padding-left:0;padding-right:0">
              <div class="perm-main"><b>${esc(d.label)} ${d.primary ? '<span class="tag blue">主屏</span>' : ''}</b><span>${esc(d.res)} · DPI ${esc(d.dpi)}</span></div>
              <span class="tag ${d.id === 1 ? 'ok' : 'gray'}">${d.id === 1 ? '当前' : '可切换'}</span>
            </div>`).join('')}
          <div class="card-note">双屏只切换，不同时传两块屏；切换不重连。</div>
        </div>
        <div class="card">
          <div class="card-head"><b>网络与编码</b></div>
          <dl class="kv">
            <dt>Wi-Fi</dt><dd>${esc(device.wifi)}</dd>
            <dt>编码器</dt><dd>${esc(device.encoder)}</dd>
            <dt>P2P 路径</dt><dd>直连 · ${esc(device.ip)}</dd>
            <dt>2K 采集</dt><dd>${device.twoK ? '可用（约 10–12fps）' : '不建议（默认 1080p）'}</dd>
            <dt>传输</dt><dd>${device.real ? '局域网 WS · JPEG' : 'P2P · 18 ms'}</dd>
          </dl>
          <div style="margin-top:10px"><button class="btn btn-sm btn-soft" data-action="go-diagnostics">${icon('activity', 13)} 运行网络自检</button></div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><b>2K 建议</b><span class="tag ${device.twoK ? 'ok' : 'admin'}">${device.twoK ? '可用' : '不建议'}</span></div>
          <div class="card-note" style="color:var(--ink-2)">${device.twoK ? '2K 采集约 10–12fps；日常操作建议 1080p，需要看细节时可切 2K。' : '当前条件不足；默认 1080p。'}</div>
        </div>
        <div class="card">
          <div class="card-head"><b>技术详情</b></div>
          <dl class="kv">
            <dt>主机名</dt><dd class="mono">${esc(device.host)}</dd>
            <dt>指纹</dt><dd class="mono">${esc(device.fingerprint)}</dd>
            <dt>Agent</dt><dd class="mono">${esc(device.version)}</dd>
            <dt>授权来源</dt><dd>${device.relation === 'managed' ? '管理员预置/一次性码' : '本人添加'}</dd>
          </dl>
        </div>
      </div>
    </div>`;
}

function historyTab(device) {
  const rows = SESSION_HISTORY.filter((s) => s.deviceId === device.id);
  const audits = AUDIT.filter((a) => a.deviceId === device.id).slice(0, 4);
  return `
    <div class="card">
      <div class="card-head"><b>会话记录</b><span class="muted" style="font-size:10px">本机记录</span><span class="card-action" data-action="view-sessions">全部</span></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>时间</th><th>时长</th><th>画质</th><th>延迟</th><th>结果</th><th>结束原因</th></tr></thead>
          <tbody>${rows.map((s) => `<tr><td>${esc(s.date)}</td><td>${esc(s.duration)}</td><td>${esc(s.quality)}</td><td class="mono">${esc(s.latency)}</td><td><span class="tag ok">${esc(s.result)}</span></td><td>${esc(s.reason)}</td></tr>`).join('') || `<tr><td colspan="6"><div class="table-empty">还没有会话记录。</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>
    <div class="card" style="margin-top:12px">
      <div class="card-head"><b>审计事件</b><span class="muted" style="font-size:10px">实时 · 本机缓存</span><span class="card-action" data-action="view-audit">全部</span></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>时间</th><th>事件</th><th>操作者</th><th>结果</th></tr></thead>
          <tbody>${audits.map((a) => `<tr data-action="open-audit" data-audit-id="${a.id}"><td class="mono">${esc(a.time)}</td><td>${esc(a.event)}</td><td>${esc(a.actor)}</td><td><span class="tag ${a.result === '成功' ? 'ok' : 'red'}">${esc(a.result)}</span></td></tr>`).join('') || `<tr><td colspan="4"><div class="table-empty">还没有审计事件。</div></td></tr>`}</tbody>
        </table>
      </div>
    </div>`;
}

function maintenanceTab(device) {
  return `
    <div class="detail-grid">
      <div class="stack">
        <div class="card">
          <div class="card-head"><b>设备信息</b><span class="card-action" data-action="save-device">保存</span></div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
            <label class="field"><span style="font-size:10.5px;color:var(--ink-3)">显示名</span><input class="input" value="${esc(device.name)}"></label>
            <label class="field"><span style="font-size:10.5px;color:var(--ink-3)">所有者</span><input class="input" value="${esc(device.owner)}"></label>
            <label class="field"><span style="font-size:10.5px;color:var(--ink-3)">部门</span><input class="input" value="${esc(device.dept)}"></label>
            <label class="field"><span style="font-size:10.5px;color:var(--ink-3)">资产编号</span><input class="input" value="${esc(device.asset)}"></label>
          </div>
          <div class="card-note">设备信息只保存在本机清单，不会同步到其他电脑。</div>
        </div>
        <div class="card">
          <div class="card-head"><b>Agent 版本</b><span class="tag ${device.versionOk ? 'ok' : 'red'}">${device.versionOk ? '兼容' : '需更新'}</span></div>
          <dl class="kv"><dt>当前</dt><dd class="mono">${esc(device.version)}</dd><dt>最低支持</dt><dd class="mono">3.0.0</dd><dt>更新方式</dt><dd>离线安装包</dd></dl>
          <div class="card-note">${device.versionOk ? '版本兼容。V1 不提供远程推送更新。' : '版本不兼容。请先在工位电脑上更新 Agent；控制端不能远程推送更新。'}</div>
        </div>
      </div>
      <div class="stack">
        <div class="card">
          <div class="card-head"><b>诊断</b></div>
          <div class="card-note" style="margin-top:0;color:var(--ink-2)">导出脱敏诊断包，包含版本、网络、最近错误；不包含密码、屏幕内容或剪贴板。</div>
          <div style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap"><button class="btn btn-sm" data-action="go-diagnostics">${icon('activity', 13)} 网络自检</button><button class="btn btn-sm" data-action="export-diag">${icon('download', 13)} 导出诊断</button></div>
        </div>
        <div class="card" style="border-color:var(--red-line)">
          <div class="card-head"><b style="color:var(--red)">危险操作</b></div>
          <div class="card-note" style="margin-top:0">移除设备只删除本机清单，不会卸载工位电脑上的 Agent，也不会自动撤销工位授权。建议先在工位电脑上撤销。</div>
          <div style="margin-top:10px"><button class="btn btn-sm" style="color:var(--red);border-color:var(--red-line);background:var(--red-soft)" data-action="remove-device">移除设备</button></div>
        </div>
      </div>
    </div>`;
}

window.addEventListener('DOMContentLoaded', init);
async function init() {
  const actualTheme = state.theme === 'system'
    ? (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
    : state.theme;
  document.documentElement.dataset.theme = actualTheme;
  document.documentElement.dataset.density = state.density;
  window.workspace?.theme?.(actualTheme);
  hydrateIcons(document);
  const gsIcon = document.querySelector('.gs-icon');
  if (gsIcon) gsIcon.innerHTML = icon('search', 14);
  const agentBtn = document.getElementById('btnAgentPreview');
  if (agentBtn) agentBtn.innerHTML = icon('laptop');
  try {
    const saved = JSON.parse(localStorage.getItem('ns-session-history') || '[]');
    if (Array.isArray(saved) && saved.length) SESSION_HISTORY.unshift(...saved);
  } catch {}
  bindShell();
  bindMain();
  bindSession();
  bindModal();
  bindDrawer();
  bindCommand();
  bindAgent();
  bindWindowControls();
  try {
    const payload = await window.workspace.state();
    state.chat = payload.chat || null;
    if (payload.remote) mergeRemoteState(payload.remote);
    state.diag = await window.workspace.remote.diagnostics().catch(() => null);
    const audit = await window.workspace.remote.audit().catch(() => []);
    audit.forEach(mergeAuditEvent);
    window.workspace.onEvent(handleWorkspaceEvent);
    updateUnreadBadge(state.chat?.unread || 0);
  } catch (err) {
    console.error('workspace state', err);
  }
  render();
  const panel = new URLSearchParams(location.search).get('panel');
  if (panel === 'agent') setTimeout(() => toggleAgent(true), 250);
  else if (panel === 'messages') setView('messages');
  else if (panel === 'session') {
    const self = DEVICES.find((d) => d.real && d.self);
    if (self) setTimeout(() => openSession(self.id), 300);
  }
}

function updateUnreadBadge(n) {
  const badge = document.getElementById('navUnread');
  if (!badge) return;
  const value = Number(n) || 0;
  badge.hidden = value <= 0;
  badge.textContent = value > 99 ? '99+' : String(value);
  badge.classList.add('warn');
}

function mergeAuditEvent(evt) {
  if (!evt || !evt.id) return;
  const device = deviceById(`peer-${evt.fromId || ''}`) || deviceById(state.selectedDeviceId);
  const labels = {
    session_start: '会话开始', session_end: '会话结束', pair: '设备配对', pair_failed: '配对失败',
    chat_in: '私聊接收', chat_out: '私聊发送', file_in: '接收文件', file_out: '发送文件',
    grant_expired: '临时授权到期', grant_revoke: '撤销授权', recording: '录制状态',
  };
  const t = String(evt.type || '');
  let kind = 'connection';
  if (t.startsWith('chat')) kind = 'message';
  else if (t.startsWith('file')) kind = 'file';
  else if (t.startsWith('grant')) kind = 'grant';
  AUDIT.unshift({
    id: evt.id, time: new Date(evt.ts).toLocaleTimeString('zh-CN', { hour12: false }),
    event: labels[t] || t, code: t.toUpperCase(), actor: evt.actor || '本机', deviceId: device?.id || 'dev-1',
    result: evt.result || '成功', type: kind, detail: evt.detail || '',
  });
}

async function mergeRemoteAudit() {
  const audit = await window.workspace.remote.audit().catch(() => []);
  audit.forEach(mergeAuditEvent);
  if (state.view === 'audit') renderAudit();
}
function handleWorkspaceEvent(payload) {
  if (!payload || typeof payload !== 'object') return;
  if (payload.t === 'peers') {
    mergeRemoteState({ ...(state.remote || {}), peers: payload.peers || [] });
    if (state.view === 'devices') renderDevices();
    else if (state.view === 'messages') renderMessages();
    if (state.agent) renderAgent();
    return;
  }
  if (payload.t === 'remote-state') {
    state.remote = payload.state;
    mergeRemoteState(payload.state);
    if (state.agent) renderAgent();
    if (state.view === 'grants') renderGrants();
    return;
  }
  if (payload.t === 'session') {
    const evt = payload.session || {};
    if (!state.session?.real) return;
    if (evt.state === 'active') {
      state.session.connected = true;
      document.querySelector('.remote-connecting')?.remove();
      toast('已连接 · 键盘与鼠标已捕获', 'success');
    } else if (evt.state === 'error') {
      toast(evt.message || '连接失败', 'danger');
    } else if (evt.state === 'ended') {
      if (state.session) closeSession('远程结束');
    }
    return;
  }
  if (payload.t === 'stats') {
    if (state.session?.real) {
      state.session.rtt = Number(payload.stats?.rtt) || 0;
      const rttEl = document.getElementById('hudRtt');
      if (rttEl) rttEl.textContent = `${state.session.rtt} ms`;
      const drawerRtt = document.querySelector('[data-session-rtt]');
      if (drawerRtt) drawerRtt.textContent = `${state.session.rtt} ms`;
    }
    return;
  }
  if (payload.t === 'frame') {
    if (state.session?.real) {
      drawRemoteFrame(payload.frame);
      document.querySelector('.remote-connecting')?.remove();
    }
    return;
  }
  if (payload.t === 'chat') {
    const chat = payload.chat || {};
    const peerId = chat.fromId || chat.from || 'peer';
    if (!chat.text) return;
    pushDM(peerId, { ...chat, direction: 'in' });
    if (state.view === 'messages' && state.dmPeerId === peerId) renderMessages();
    else {
      state.incomingUnread += 1;
      updateUnreadBadge(state.incomingUnread);
      toast(`${chat.from || '同事'}：${String(chat.text).slice(0, 28)}`, 'info');
    }
    return;
  }
  if (payload.t === 'clipboard') {
    const text = payload.clipboard?.text;
    if (text) { window.workspace.writeClipboard(text).catch(() => {}); toast('已同步远端剪贴板', 'success'); }
    return;
  }
  if (payload.t === 'file-progress') {
    const evt = payload.file || {};
    if (evt.done) toast(evt.direction === 'in' ? `收到文件 ${evt.name}` : `文件已发送 ${evt.name}`, evt.error ? 'danger' : 'success');
    if (!state.session) return;
    let f = state.session.files.find((x) => x.id === evt.id);
    if (!f) { f = { id: evt.id, name: evt.name, size: evt.size, received: 0, progress: 0 }; state.session.files.push(f); }
    f.received = evt.received;
    f.size = evt.size;
    f.done = !!evt.done;
    f.error = evt.error || '';
    if (state.session.drawer === 'files') renderSession();
    return;
  }
  if (payload.t === 'audit') {
    mergeAuditEvent(payload.audit);
    if (state.view === 'audit') renderAudit();
    return;
  }
  if (payload.t === 'chat-summary') {
    state.chat = payload.chat;
    updateUnreadBadge(payload.chat?.unread || 0);
    if (state.view === 'messages') renderMessages();
    return;
  }
  if (payload.t === 'unread') {
    if (state.chat) state.chat.unread = payload.n;
    updateUnreadBadge(payload.n);
    return;
  }
  if (payload.t === 'navigate') { setView(payload.view); return; }
  if (payload.t === 'window') {
    state.windowMaximized = !!payload.maximized;
    return;
  }
}
/* ---------- messages view ---------- */
function dmKey(peerId) { return `ns-dm:${peerId}`; }
function loadDM(peerId) {
  if (!state.dmConversations[peerId]) {
    try { state.dmConversations[peerId] = JSON.parse(localStorage.getItem(dmKey(peerId)) || '[]'); }
    catch { state.dmConversations[peerId] = []; }
  }
  return state.dmConversations[peerId];
}
function saveDM(peerId) {
  try { localStorage.setItem(dmKey(peerId), JSON.stringify(loadDM(peerId).slice(-200))); } catch {}
}
function pushDM(peerId, msg) {
  const list = loadDM(peerId);
  list.push(msg);
  if (list.length > 200) list.splice(0, list.length - 200);
  state.dmConversations[peerId] = list;
  saveDM(peerId);
}
function renderMessages() {
  const main = document.getElementById('main');
  const peers = (state.peers || []).filter((p) => !p.self);
  const chat = state.chat || {};
  const room = chat.room || {};
  const activePeer = peers.find((p) => p.id === state.dmPeerId) || null;
  const msgs = activePeer ? loadDM(activePeer.id) : [];
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title"><h1>消息</h1><p>团队群聊保留全部原有功能；同事私聊按设备直连，不上云</p></div>
      <div class="page-actions"><button class="btn" data-action="open-team-chat">${icon('external', 14)} 打开团队群聊</button></div>
    </div>
    <div class="messages-layout">
      <section class="panel messages-side">
        <div class="panel-head"><div class="panel-title-row"><b>会话</b><span class="count">${peers.length + 1}</span></div></div>
        <div class="conversation-list">
          <button class="conversation-item ${state.dmPeerId ? '' : 'active'}" data-action="dm-team">
            <span class="conv-avatar">${icon('chat', 15)}</span>
            <span class="conv-main"><b>${esc(room.name || '团队群聊')}</b><span>${chat.last ? esc(chat.last.author ? chat.last.author + '：' : '') + esc(chat.last.text || '') : '扫码/手机端加入的团队群聊'}</span></span>
            ${chat.unread ? `<span class="nav-badge warn">${chat.unread}</span>` : ''}
          </button>
          <div class="device-group-title"><span>同事私聊</span><span class="line"></span></div>
          ${peers.length ? peers.map((p) => `
            <button class="conversation-item ${state.dmPeerId === p.id ? 'active' : ''}" data-action="dm-peer" data-peer-id="${p.id}">
              <span class="conv-avatar">${icon('user', 15)}</span>
              <span class="conv-main"><b>${esc(p.name)}</b><span>${esc(p.ip)} · ${p.online ? '在线' : '离线'}</span></span>
            </button>`).join('') : `<div class="card-note" style="padding:12px">同一 Wi-Fi 下打开近传的同事会出现在这里。私聊只在局域网内传输。</div>`}
        </div>
      </section>
      <section class="panel messages-main">
        ${activePeer ? `
          <div class="conversation-head"><div><b>${esc(activePeer.name)}</b><span>${esc(activePeer.ip)} · 局域网私聊 · 按设备</span></div><button class="btn btn-sm" data-action="dm-back">返回团队群聊</button></div>
          <div class="conversation-body" id="dmBody">
            ${msgs.length ? msgs.map((m) => `<div class="dm-row ${m.direction === 'out' ? 'out' : ''}"><div class="dm-bubble"><div>${esc(m.text)}</div><span>${new Date(m.ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div></div>`).join('') : `<div class="empty-state"><div class="empty-ico">${icon('chat', 22)}</div><b>开始和 ${esc(activePeer.name)} 私聊</b><p>消息只通过局域网 UDP 直连，不经过云端；不保存到团队群聊。</p></div>`}
          </div>
          <div class="conversation-composer"><input id="dmInput" class="input" placeholder="发消息给 ${esc(activePeer.name)}…" autocomplete="off"><button class="btn btn-primary" data-action="dm-send" data-peer-id="${activePeer.id}">发送</button></div>
        ` : `
          <div class="conversation-head"><div><b>团队群聊</b><span>原有群聊完整保留；手机扫码即可加入</span></div></div>
          <div class="conversation-body">
            <div class="team-chat-card">
              <div class="team-chat-icon">${icon('chat', 24)}</div>
              <b>${esc(room.name || '团队群聊')}</b>
              <p>${chat.members?.length ? `${chat.members.filter((m) => m.online).length} 人在线 · ${chat.members.length} 位成员` : '打开消息中心，查看群成员、@、已读、图片和文件传输。'}</p>
              ${chat.last ? `<div class="team-last"><span>${esc(chat.last.author || '')}</span>${esc(chat.last.text || '')}</div>` : ''}
              <button class="btn btn-primary" data-action="open-team-chat">${icon('external', 14)} 打开团队群聊</button>
            </div>
            <div class="card-note" style="text-align:center">群聊继续使用现有近传房间，手机端/浏览器端不需要升级。</div>
          </div>
        `}
      </section>
    </div>`;
  hydrateIcons(main);
  const input = document.getElementById('dmInput');
  if (input) {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendDM(activePeer.id); }
    });
    input.focus();
  }
  const body = document.getElementById('dmBody');
  if (body) body.scrollTop = body.scrollHeight;
}
async function sendDM(peerId) {
  const input = document.getElementById('dmInput');
  const text = (input?.value || '').trim();
  if (!text) return;
  const evt = await window.workspace.remote.sendDM(peerId, text);
  if (!evt) { toast('发送失败：同事可能已离线', 'danger'); return; }
  pushDM(peerId, { ...evt, direction: 'out' });
  if (input) input.value = '';
  renderMessages();
}

/* ---------- sessions view ---------- */
function renderSessions() {
  const main = document.getElementById('main');
  const current = state.session && !state.session.closed ? state.session : null;
  const currentDevice = current ? deviceById(current.deviceId) : null;
  const history = SESSION_HISTORY.filter((s) => deviceById(s.deviceId) && (DEMO_ENABLED || !deviceById(s.deviceId).demo));
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title"><h1>会话</h1><p>当前会话与本机会话记录 · 本机记录，不上传</p></div>
      <div class="page-actions">
        <button class="btn" data-action="view-devices">${icon('monitor', 14)} 设备列表</button>
      </div>
    </div>
    ${current ? `
      <div class="card" style="margin-bottom:14px;border-color:var(--blue-line);background:linear-gradient(180deg,var(--blue-soft),var(--surface) 70%)">
        <div class="card-head"><b>当前会话</b><span class="tag blue">进行中</span><span class="card-action" data-action="resume-session">返回会话</span></div>
        <div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
          <div style="flex:1;min-width:220px">
            <div style="font-size:15px;font-weight:600">${esc(currentDevice.name)}</div>
            <div class="card-note" style="margin-top:3px">${esc(currentDevice.host)} · ${esc(currentDevice.owner)} · ${esc(currentDevice.dept)}</div>
          </div>
          <div class="stat-row" style="min-width:300px;flex:0 0 auto">
            <div class="stat"><span>时长</span><b data-session-duration>${formatDuration(current.duration || 0)}</b></div>
            <div class="stat"><span>画质</span><b>${esc(current.qualityLabel || '自动 1080p60')}</b></div>
            <div class="stat"><span>延迟</span><b>${current.real ? 'LAN' : '18 ms'}</b></div>
          </div>
          <button class="btn btn-primary" data-action="resume-session">${icon('play', 14)} 返回会话</button>
        </div>
      </div>` : `
      <div class="card" style="margin-bottom:14px">
        <div class="empty-state" style="padding:26px 10px">
          <div class="empty-ico">${icon('play', 22)}</div>
          <b>当前没有远程会话</b>
          <p>从设备列表选择一台在线设备开始。近传一次只保留一个前台会话。</p>
          <div class="empty-actions"><button class="btn btn-primary btn-sm" data-action="view-devices">去设备列表</button></div>
        </div>
      </div>`}
    <div class="card">
      <div class="card-head"><b>会话记录</b><span class="muted" style="font-size:10px">本机 · 保留 90 天</span><span class="card-action" data-action="export-sessions">导出</span></div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>时间</th><th>设备</th><th>时长</th><th>画质</th><th>平均延迟</th><th>结果</th><th>结束原因</th></tr></thead>
          <tbody>
            ${history.length ? history.map((s) => {
              const d = deviceById(s.deviceId);
              return `<tr data-action="session-detail" data-session-id="${s.id}">
                <td>${esc(s.date)}</td><td><span class="cell-main">${esc(d?.name || '—')}</span><span class="cell-sub">${esc(d?.host || '')}</span></td>
                <td>${esc(s.duration)}</td><td>${esc(s.quality)}</td><td class="mono">${esc(s.latency)}</td>
                <td><span class="tag ok">${esc(s.result)}</span></td><td>${esc(s.reason)}</td>
              </tr>`;
            }).join('') : `<tr><td colspan="7"><div class="table-empty">还没有会话记录。连接设备后，会话会自动记录在本机。</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  hydrateIcons(main);
}

/* ---------- grants view ---------- */
function grantRemainLabel(g) {
  if (!g.expiresAt) return '长期';
  const minutes = Math.max(0, Math.ceil((g.expiresAt - Date.now()) / 60000));
  return minutes >= 60 ? `${Math.ceil(minutes / 60)} 小时` : `${minutes} 分钟`;
}
function grantPermText(perms) {
  if (!perms) return '—';
  return Object.keys(perms).filter((k) => perms[k]).map((k) => PERM_LABEL[k] || k).join('、') || '只读';
}
function renderGrants() {
  const main = document.getElementById('main');
  const inbound = Array.isArray(state.remote?.grants) ? state.remote.grants : [];
  const outboundDevice = state.session?.grant ? deviceById(state.session.deviceId) : null;
  const outbound = state.session?.grant && outboundDevice ? [{ ...state.session.grant, deviceName: outboundDevice.name, deviceHost: outboundDevice.host }] : [];
  const tab = state.grantTab === 'managed' ? 'managed' : 'obtained';
  const list = tab === 'managed' ? inbound : outbound;
  const all = [...inbound, ...outbound];
  const adminCount = all.filter((g) => g.role === 'admin').length;
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title"><h1>授权</h1><p>本机授权与当前控制端授权 · 以工位电脑为准 · 不上传</p></div>
      <div class="page-actions"><button class="btn" data-action="refresh-grants">${icon('refresh', 14)} 刷新</button></div>
    </div>
    <div class="summary-strip">
      <span class="summary-chip"><b>${inbound.length}</b> 本机授权控制端</span>
      <span class="summary-chip"><b>${outbound.length}</b> 当前获得的授权</span>
      <span class="summary-chip ${adminCount ? 'warn' : ''}"><b>${adminCount}</b> 管理员临时</span>
      <span class="summary-chip"><b>0</b> 待处理</span>
    </div>
    <div class="card">
      <div class="card-head">
        <div class="seg" role="tablist">
          <button class="${tab === 'obtained' ? 'active' : ''}" data-action="grant-tab" data-value="obtained">我获得的</button>
          <button class="${tab === 'managed' ? 'active' : ''}" data-action="grant-tab" data-value="managed">控制本机的控制端</button>
        </div>
        <span class="muted" style="margin-left:auto;font-size:10px">${list.length} 条</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>对象</th><th>角色</th><th>权限</th><th>到期</th><th>操作</th></tr></thead>
          <tbody>
            ${list.length ? list.map((g) => {
              const isInbound = tab === 'managed';
              return `<tr>
                <td><span class="cell-main">${esc(isInbound ? (g.name || g.controllerId) : g.deviceName)}</span><span class="cell-sub">${esc(isInbound ? '控制端设备' : (g.deviceHost || ''))}</span></td>
                <td><span class="tag ${g.role === 'admin' ? 'admin' : ''}">${g.role === 'admin' ? '管理员临时' : '我的设备'}</span></td>
                <td>${esc(grantPermText(g.permissions))}</td>
                <td><span class="tag ${g.role === 'admin' ? 'admin' : 'ok'}">${esc(grantRemainLabel(g))}</span></td>
                <td><div class="table-actions">${isInbound
                  ? `<button class="btn btn-sm" data-action="revoke-inbound" data-controller-id="${esc(g.controllerId)}">撤销</button>`
                  : `<button class="btn btn-sm" data-action="end-outbound">结束会话</button>`}</div></td>
              </tr>`;
            }).join('') : `<tr><td colspan="5"><div class="table-empty">${tab === 'managed' ? '还没有控制端被授权控制这台电脑。控制端输入本机 6 位码后会出现在这里。' : '当前没有从本机获得的远程授权；连接设备后这里会显示本次授权的角色、权限与到期时间。'}</div></td></tr>`}
          </tbody>
        </table>
      </div>
      <div class="card-note">授权存储在对应工位电脑上；本页只显示本机已知的授权。管理员临时支持默认 8 小时，无人值守/剪贴板/文件/录制默认关闭，撤销后立即断开。</div>
    </div>`;
  hydrateIcons(main);
}

/* ---------- audit view ---------- */
function renderAudit() {
  const main = document.getElementById('main');
  const list = AUDIT.filter((a) => (state.auditFilter === 'all' || a.type === state.auditFilter) && deviceById(a.deviceId) && (DEMO_ENABLED || !deviceById(a.deviceId).demo));
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title"><h1>审计</h1><p>本机记录 · 不上传 · 配对/会话/文件/私聊事件</p></div>
      <div class="page-actions">
        <button class="btn" data-action="verify-audit">${icon('refresh', 14)} 刷新</button>
        <button class="btn" data-action="export-audit">${icon('download', 14)} 导出</button>
      </div>
    </div>
    <div class="perm-summary" style="display:flex;align-items:center;gap:6px;background:var(--green-soft);border-color:var(--green-line);color:var(--green);margin-bottom:12px">${icon('check', 13)} 本机记录 · 只追加 · 不上传 · 最近 90 天</div>
    <div class="card">
      <div class="toolbar" style="padding:10px 12px 0;margin-bottom:8px">
        <button class="filter-chip ${state.auditFilter === 'all' ? 'active' : ''}" data-action="audit-filter" data-value="all">全部</button>
        <button class="filter-chip ${state.auditFilter === 'connection' ? 'active' : ''}" data-action="audit-filter" data-value="connection">连接</button>
        <button class="filter-chip ${state.auditFilter === 'message' ? 'active' : ''}" data-action="audit-filter" data-value="message">消息</button>
        <button class="filter-chip ${state.auditFilter === 'grant' ? 'active' : ''}" data-action="audit-filter" data-value="grant">授权</button>
        <button class="filter-chip ${state.auditFilter === 'file' ? 'active' : ''}" data-action="audit-filter" data-value="file">文件</button>
        <span class="spacer"></span>
        <span class="toolbar-meta">${list.length} 条事件</span>
      </div>
      <div class="table-wrap">
        <table class="data">
          <thead><tr><th>时间</th><th>事件</th><th>操作者</th><th>设备</th><th>结果</th><th></th></tr></thead>
          <tbody>
            ${list.map((a) => {
              const d = deviceById(a.deviceId);
              return `<tr data-action="open-audit" data-audit-id="${a.id}">
                <td class="mono">${esc(a.time)}</td>
                <td><span class="cell-main">${esc(a.event)}</span><span class="cell-sub mono">${esc(a.code)}</span></td>
                <td>${esc(a.actor)}</td>
                <td>${esc(d?.name || '—')}</td>
                <td><span class="tag ${a.result === '成功' ? 'ok' : 'red'}">${esc(a.result)}</span></td>
                <td><div class="table-actions"><button class="icon-btn" data-action="open-audit" data-audit-id="${a.id}" title="详情">${icon('chevron', 14)}</button></div></td>
              </tr>`;
            }).join('') || `<tr><td colspan="6"><div class="table-empty">没有匹配的审计事件。</div></td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  hydrateIcons(main);
}

/* ---------- diagnostics view ---------- */
function renderDiagnostics() {
  const main = document.getElementById('main');
  const d = state.diag || {};
  const ip = d.ips?.[0]?.address || '未发现';
  const peers = Number(d.peers) || 0;
  const helper = !!d.helperExists;
  const checks = [
    { name: '本机网络', status: ip === '未发现' ? 'fail' : 'ok', detail: `IPv4 ${ip} · WS ${d.wsPort || '—'} · UDP ${d.udpPort || '—'}` },
    { name: '设备发现', status: peers > 0 ? 'ok' : 'warn', detail: peers > 0 ? `局域网发现 ${peers} 台设备（含本机）` : '尚未发现其他设备；确认同一 Wi-Fi、AP 未开启客户端隔离' },
    { name: '输入注入', status: helper ? 'ok' : 'fail', detail: helper ? 'remote-input.exe 可用' : '缺少输入组件；请重新安装完整包' },
    { name: '屏幕采集', status: 'ok', detail: d.capture === 'active' ? '正在被控会话中' : '待命；建立会话后开始采集' },
    { name: '被控服务', status: d.agentEnabled ? 'ok' : 'warn', detail: d.agentEnabled ? `已开启 · 端口 ${d.wsPort || '—'}` : '已关闭；其他设备无法连接' },
    { name: '版本', status: 'ok', detail: `本机 ${d.version || state.remote?.device?.version || '—'} · V1 不远程推送更新` },
  ];
  const summary = !helper ? '需修复输入组件' : peers > 1 ? '可连接' : '等待设备';
  const conclusion = peers > 1
    ? '已发现可连接设备。建议保持两台电脑在同一 5GHz Wi-Fi；2K 需要更高带宽。'
    : '尚未发现其他设备。请确认对方已打开近传并开启「本机被控」，两台电脑在同一 Wi-Fi，AP 未开启客户端隔离。';
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title"><h1>诊断</h1><p>本机网络、发现、输入注入与采集状态 · 不上传</p></div>
      <div class="page-actions">
        <button class="btn" data-action="copy-diag">${icon('copy', 14)} 复制给 IT</button>
        <button class="btn btn-primary" data-action="run-diag">${state.diagRunning ? '检测中…' : '重新检测'}</button>
      </div>
    </div>
    <div class="diag-layout">
      <div class="card">
        <div class="card-head"><b>检查项</b><span class="muted" style="font-size:10px">${state.diagDone ? '刚刚' : '实时'} · ${esc(d.device?.host || '本机')}</span></div>
        <div class="check-list">
          ${checks.map((c) => `
            <div class="check-row">
              <span class="check-ico ${c.status}">${icon(c.status === 'ok' ? 'check' : c.status === 'warn' ? 'warn' : 'x', 12)}</span>
              <div class="check-main"><b>${esc(c.name)}</b><span>${esc(c.detail)}</span></div>
              <span class="check-action">查看步骤</span>
            </div>`).join('')}
        </div>
      </div>
      <div class="stack diag-summary">
        <div class="card">
          <div class="card-head"><b>结论</b><span class="tag ${helper ? 'ok' : 'red'}">${summary}</span></div>
          <div class="diag-score">
            <div class="diag-ring" style="background:conic-gradient(${helper ? 'var(--green)' : 'var(--amber)'} 0 ${helper ? 92 : 58}%, var(--surface-muted) ${helper ? 92 : 58}% 100%)"><b>${helper ? '92' : '58'}</b></div>
            <span>${esc(conclusion)}</span>
          </div>
          <div class="diag-conclusion" style="background:var(--surface-subtle);border-color:var(--line)"><b>无 Hub 提示：</b> 近传只检查本机与已发现设备，不做全公司 20 路负载监控。AP 隔离需要 IT 在网络设备上关闭。</div>
          <div style="display:flex;gap:6px;margin-top:10px;flex-wrap:wrap">
            <button class="btn btn-sm" data-action="copy-diag">${icon('copy', 13)} 复制给 IT</button>
            <button class="btn btn-sm" data-action="export-diag">${icon('download', 13)} 导出诊断包</button>
          </div>
        </div>
        <div class="card">
          <div class="card-head"><b>本机信息</b><span class="tag ok">${helper ? '就绪' : '需修复'}</span></div>
          <dl class="kv"><dt>主机名</dt><dd>${esc(d.device?.host || '—')}</dd><dt>IPv4</dt><dd class="mono">${esc(ip)}</dd><dt>发现端口</dt><dd class="mono">${esc(String(d.udpPort || '—'))}</dd><dt>会话端口</dt><dd class="mono">${esc(String(d.wsPort || '—'))}</dd><dt>输入注入</dt><dd>${helper ? '可用' : '缺失'}</dd></dl>
          <div class="card-note">V1 传输层为局域网 WS + JPEG 帧；后续可替换 WebRTC。锁屏/UAC 安全桌面需原生服务。</div>
        </div>
      </div>
    </div>`;
  hydrateIcons(main);
}

/* ---------- settings view ---------- */
function renderSettings() {
  const main = document.getElementById('main');
  const sections = [
    ['general', '常规与外观'], ['connection', '连接与画质'], ['security', '安全'],
    ['storage', '存储与备份'], ['updates', '更新'], ['diagnostics', '诊断与支持'], ['about', '关于'],
  ];
  main.innerHTML = `
    <div class="page-head">
      <div class="page-title"><h1>设置</h1><p>本机偏好 · 不是组织策略 · 无 Hub</p></div>
      <div class="page-actions"><span class="toolbar-meta">${icon('info', 12)} 更改即时保存</span></div>
    </div>
    <div class="settings-layout">
      <nav class="settings-nav" aria-label="设置分类">
        ${sections.map(([k, v]) => `<button class="${state.settingsSection === k ? 'active' : ''}" data-action="settings-section" data-value="${k}">${v}</button>`).join('')}
      </nav>
      <div class="settings-content">${settingsContent(state.settingsSection)}</div>
    </div>`;
  hydrateIcons(main);
}

function settingsGroup(title, desc, rows) {
  return `<section class="settings-group"><div class="settings-group-head"><b>${title}</b>${desc ? `<p>${desc}</p>` : ''}</div>${rows}</section>`;
}
function settingRow(label, desc, control) {
  return `<div class="settings-row"><div class="settings-label"><b>${label}</b>${desc ? `<span>${desc}</span>` : ''}</div><div class="settings-value">${control}</div></div>`;
}
function switchHtml(on, label, action = 'setting-toggle', extra = '') {
  const value = Object.prototype.hasOwnProperty.call(state.uiSettings, label) ? !!state.uiSettings[label] : !!on;
  return `<button class="switch ${value ? 'on' : ''}" role="switch" aria-checked="${value}" aria-label="${esc(label)}" data-action="${action}" ${extra}></button>`;
}
function settingsContent(section) {
  if (section === 'connection') {
    return settingsGroup('连接与画质', '默认用于下一次会话；会话中仍可手动切换。', [
      settingRow('默认画质', '自动会在弱网时降档；手动选择不会被静默覆盖。', `<select class="select"><option>自动（推荐）</option><option>2K 2560×1440</option><option>1080p</option><option>720p</option></select>`),
      settingRow('默认帧率', '内测版由采集端决定：1080p 约 15fps、2K 约 10–12fps。', `<span class="tag gray">自动</span>`),
      settingRow('自动降级', '网络变差时自动降低画质，保证操作流畅。', switchHtml(true, '自动降级')),
      settingRow('剪贴板默认', '仅对本人设备生效；管理员默认关闭。', switchHtml(true, '剪贴板默认')),
      settingRow('文件传输默认', '仅对本人设备生效；管理员默认关闭。', switchHtml(true, '文件传输默认')),
      settingRow('局域网发现', '允许发现同一 Wi-Fi 下的设备；不广播员工姓名。', switchHtml(true, '局域网发现')),
    ]);
  }
  if (section === 'security') {
    return settingsGroup('安全', '本机安全设置；设备端授权以工位电脑为准。', [
      settingRow('启动 PIN', '内测版未开放；控制台跟随 Windows 登录会话。', `<span class="tag gray">暂未开放</span>`),
      settingRow('自动锁定', '内测版未开放；关闭窗口会最小化到托盘。', `<span class="tag gray">暂未开放</span>`),
      settingRow('会话水印', '内测版未开放。', `<span class="tag gray">暂未开放</span>`),
      settingRow('远程解锁说明', '安全桌面需要原生 Windows 服务；内测版暂不支持锁屏/UAC 解锁。', `<button class="btn btn-sm" data-action="remote-unlock-help">查看说明</button>`),
      settingRow('清除本地数据', '内测版未开放；请在关闭应用后手动清理本机数据目录。', `<span class="tag gray">暂未开放</span>`),
    ]);
  }
  if (section === 'storage') {
    return settingsGroup('存储与备份', '本机数据；不集中到服务器。', [
      settingRow('配置备份', '内测版暂不导出配置；设备授权以工位电脑为准。', `<span class="tag gray">暂未开放</span>`),
      settingRow('恢复备份', '内测版暂不提供恢复；重装后可重新发现设备并配对。', `<span class="tag gray">暂未开放</span>`),
      settingRow('会话记录保留', '本机会话历史；到期自动清理。', `<select class="select"><option>90 天</option><option>30 天</option><option>180 天</option></select>`),
      settingRow('录制保存目录', '录制默认关闭；开启后保存在本机。', `<span class="muted mono" style="font-size:10px">C:\\Users\\liwei\\Videos\\NearSend</span>`),
      settingRow('审计缓存', '来自设备的审计摘要；完整审计在工位电脑。', `<span class="muted" style="font-size:10px">90 天</span>`),
    ]);
  }
  if (section === 'updates') {
    const appVersion = state.remote?.device?.version || '3.0.0';
    return settingsGroup('更新', '内测版使用离线安装包；不自动更新，也不远程推送 Agent。', [
      settingRow('控制端版本', `当前 ${appVersion} · 内测通道`, `<span class="tag ok">内测版</span>`),
      settingRow('更新通道', '稳定版；公司内部自用。', `<select class="select"><option>稳定版</option></select>`),
      settingRow('检查更新', '内测版不提供自动更新；请从发布页下载新安装包覆盖安装。', `<button class="btn btn-sm" data-action="open-help">发布页</button>`),
      settingRow('更新历史', '3.0.0 · 远程工位首个内测版。', `<button class="btn btn-sm" data-action="open-help">查看</button>`),
    ]);
  }
  if (section === 'diagnostics') {
    return settingsGroup('诊断与支持', '本机自检、诊断包、日志；不默认上传。', [
      settingRow('网络与连接', '检查 Wi-Fi、AP 隔离、P2P、编码器、2K 就绪。', `<button class="btn btn-sm btn-soft" data-action="go-diagnostics">运行自检</button>`),
      settingRow('诊断包', '包含版本、网络、最近错误；不含密码/屏幕/剪贴板。', `<button class="btn btn-sm" data-action="export-diag">导出</button>`),
      settingRow('本机数据目录', '配置、设备历史与授权缓存。', `<button class="btn btn-sm" data-action="open-data-dir">打开</button>`),
      settingRow('帮助', '查看发布说明与已知限制。', `<button class="btn btn-sm" data-action="open-help">打开帮助</button>`),
    ]);
  }
  if (section === 'about') {
    const appVersion = state.remote?.device?.version || '3.0.0';
    return settingsGroup('关于', '近传 · 远程工位', [
      settingRow('版本', `${appVersion} · Windows 10/11 x64`, `<span class="muted mono" style="font-size:10px">${esc(appVersion)}</span>`),
      settingRow('隐私', '不登录、不上云、无默认遥测；诊断包由你决定发给谁。', `<span class="tag ok">本地优先</span>`),
      settingRow('许可', '公司内部自用；不做商业授权系统。', `<span class="muted" style="font-size:10px">Internal</span>`),
      settingRow('产品边界', '不做 4K/120fps、WoL、Hub、AD、手机控制端。', `<span class="muted" style="font-size:10px">V1</span>`),
    ]);
  }
  return settingsGroup('常规与外观', '本机偏好；不影响工位电脑授权。', [
    settingRow('主题', '浅色为主；深色可选；会话工具条始终深色。', `<div class="seg"><button class="${state.theme === 'light' ? 'active' : ''}" data-action="set-theme" data-value="light">浅色</button><button class="${state.theme === 'dark' ? 'active' : ''}" data-action="set-theme" data-value="dark">深色</button><button data-action="set-theme" data-value="system" class="${state.theme === 'system' ? 'active' : ''}">跟随系统</button></div>`),
    settingRow('密度', '标准 44px 设备行；紧凑 36px。', `<div class="seg"><button class="${state.density === 'standard' ? 'active' : ''}" data-action="set-density" data-value="standard">标准</button><button class="${state.density === 'compact' ? 'active' : ''}" data-action="set-density" data-value="compact">紧凑</button></div>`),
    settingRow('启动时打开', '登录 Windows 后自动打开控制台。', switchHtml(true, '启动时打开')),
    settingRow('关闭时最小化到托盘', '有活动会话时不会结束会话。', switchHtml(true, '关闭时最小化到托盘')),
    settingRow('本机名称', `${state.remote?.device?.host || '本机'} · 控制端`, `<button class="btn btn-sm">重命名</button>`),
  ]);
}

/* ---------- menus ---------- */
function showMenu(anchor, items) {
  closeMenu();
  const menu = document.createElement('div');
  menu.className = `menu ${state.session ? 'session-menu' : ''}`;
  menu.style.zIndex = String(state.session ? 130 : 30);
  menu.setAttribute('role', 'menu');
  menu.innerHTML = items.map((it, i) => {
    if (it.sep) return '<div class="menu-sep"></div>';
    if (it.label) return `<div class="menu-label">${esc(it.label)}</div>`;
    return `<button type="button" role="menuitem" data-menu-index="${i}" class="${it.danger ? 'danger' : ''}" ${it.disabled ? 'disabled' : ''}>${it.icon ? icon(it.icon, 14) : ''}<span>${esc(it.text)}</span>${it.shortcut ? `<kbd style="margin-left:auto">${esc(it.shortcut)}</kbd>` : ''}</button>`;
  }).join('');
  document.body.appendChild(menu);
  const r = anchor.getBoundingClientRect();
  const mr = menu.getBoundingClientRect();
  let left = Math.min(window.innerWidth - mr.width - 8, Math.max(8, r.right - mr.width));
  let top = r.bottom + 4;
  if (top + mr.height > window.innerHeight - 8) top = Math.max(8, r.top - mr.height - 4);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
  menu.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-menu-index]');
    if (!btn) return;
    const it = items[Number(btn.dataset.menuIndex)];
    if (!it || it.disabled) return;
    closeMenu();
    it.action?.();
  });
  state.menuEl = menu;
  const closer = (e) => {
    if (!menu.contains(e.target) && !anchor.contains(e.target)) closeMenu();
  };
  state.menuCloser = closer;
  setTimeout(() => document.addEventListener('click', closer), 0);
}
function closeMenu() {
  if (state.menuEl) { state.menuEl.remove(); state.menuEl = null; }
  if (state.menuCloser) { document.removeEventListener('click', state.menuCloser); state.menuCloser = null; }
}
function showDemoMenu(anchor) {
  showMenu(anchor, [
    { label: '演示状态' },
    { text: '打开被控端预览', icon: 'laptop', action: () => toggleAgent(true) },
    { text: '弱网降级', icon: 'activity', action: () => ensureSessionThen('degraded') },
    { text: '重连', icon: 'refresh', action: () => ensureSessionThen('reconnect') },
    { text: '授权到期', icon: 'clock', action: () => ensureSessionThen('expiry') },
    { text: '被接管', icon: 'shield', action: () => ensureSessionThen('takeover') },
    { text: '密码错误', icon: 'key', action: () => ensureSessionThen('password-error') },
    { sep: true },
    { text: 'AP 隔离错误', icon: 'wifi', action: () => openInfoModal({
      title: '无法直连这台电脑',
      sub: 'AP_ISOLATION · 财务部-李伟的工位',
      body: `<div class="perm-summary" style="background:var(--amber-soft);border-color:var(--amber-line)">当前 Wi-Fi 可能开启了客户端隔离，设备之间不能互相访问。重试不会成功；请把诊断结果发给 IT，或换一个未开启隔离的 Wi-Fi。</div><div class="card-note">近传没有 Hub/中继；AP 隔离时无法通过服务器绕过。请 IT 在 AP/交换机上关闭 Client Isolation/AP Isolation，并确认同一 VLAN 内设备可互访。</div>`,
      actions: [
        { label: '复制给 IT', primary: true, onClick: () => { copyText('AP_ISOLATION device=DESKTOP-FIN-01 sameSubnet=true mdns=slow udp=blocked recommendation=disable client isolation', '诊断结果已复制'); } },
        { label: '打开诊断', onClick: () => { closeModal(); setView('diagnostics'); } },
      ],
    }) },
    { text: '版本不兼容', icon: 'warn', action: () => openVersionModal(deviceById('dev-3')) },
    { text: '离线原因', icon: 'clock', action: () => openOfflineModal(deviceById('dev-3')) },
    { sep: true },
    { text: '打开财务部-李伟的工位会话', icon: 'play', action: () => openSession('dev-1') },
  ]);
}
function ensureSessionThen(action) {
  if (state.session && !state.session.closed) { sessionAction(action); return; }
  openSession('dev-1');
  setTimeout(() => sessionAction(action), 80);
}
function showDeviceMenu(anchor, device) {
  showMenu(anchor, [
    { text: '连接 / 返回会话', icon: 'play', action: () => openSession(device.id) },
    { text: '打开详情', icon: 'monitor', action: () => selectDevice(device.id) },
    { sep: true },
    { text: '复制设备名', icon: 'copy', action: () => copyText(device.name, '设备名已复制') },
    { text: '复制资产编号', icon: 'copy', action: () => copyText(device.asset, '资产编号已复制') },
    { text: '复制指纹', icon: 'key', action: () => copyText(device.fingerprint, '指纹已复制') },
    { sep: true },
    { text: device.starred ? '取消固定' : '固定到收藏', icon: 'star', action: () => { device.starred = !device.starred; renderDevices(); toast(device.starred ? '已固定到收藏' : '已取消固定', 'success'); } },
    { text: '授权管理', icon: 'shield', action: () => { const g = GRANTS.find((x) => x.deviceId === device.id && x.scope === 'managed'); if (g) openGrantDrawer(g.id); else { setView('grants'); toast('这台设备没有可管理的授权；以工位电脑为准', 'warn'); } } },
    { text: '查看审计', icon: 'list', action: () => setView('audit') },
    { text: '网络自检', icon: 'activity', action: () => setView('diagnostics') },
    { text: '导出诊断', icon: 'download', action: () => window.workspace.remote.exportDiag().then((p) => toast(p ? `诊断包已导出：${p}` : '已取消', p ? 'success' : 'info')) },
    { sep: true },
    { text: '移除设备', icon: 'trash', danger: true, action: () => confirmRemoveDevice(device) },
  ]);
}

/* ---------- modal / info ---------- */
function openModal(html, opts = {}) {
  const root = document.getElementById('modalRoot');
  root.innerHTML = `<div class="scrim" data-modal-scrim><div class="modal ${opts.size || ''}" role="dialog" aria-modal="true" aria-label="${esc(opts.label || '对话框')}">${html}</div></div>`;
  hydrateIcons(root);
  const scrim = root.querySelector('[data-modal-scrim]');
  scrim?.addEventListener('mousedown', (e) => { if (e.target === e.currentTarget && !opts.sticky) closeModal(); });
  setTimeout(() => {
    const focus = root.querySelector('input:not([type="hidden"]), select, textarea, .modal-foot .btn-primary, .modal-body .btn-primary');
    focus?.focus();
  }, 20);
}
function closeModal() {
  const root = document.getElementById('modalRoot');
  if (root) root.innerHTML = '';
  state.wizard = null;
  state.modalInfoActions = null;
  if (state.pairResolve) { const resolve = state.pairResolve; state.pairResolve = null; resolve(null); }
}
function modalHead(title, sub = '') {
  return `<div class="modal-head"><b>${esc(title)}</b>${sub ? `<span class="modal-sub">${esc(sub)}</span>` : ''}<button class="icon-btn" data-modal-close aria-label="关闭">${icon('x')}</button></div>`;
}
function modalFoot(buttons, note = '') {
  return `<div class="modal-foot">${note ? `<span class="foot-note">${note}</span>` : ''}<span class="spacer"></span>${buttons}</div>`;
}
function openInfoModal({ title, sub, body, actions = [], size = 'md' }) {
  state.modalInfoActions = actions;
  openModal(`${modalHead(title, sub)}<div class="modal-body">${body}</div>${modalFoot(actions.map((a, i) => `<button class="btn ${a.primary ? 'btn-primary' : ''} ${a.danger ? 'btn-danger' : ''}" data-info-index="${i}">${esc(a.label)}</button>`).join(''))}`, { size });
}
function openOfflineModal(device) {
  openInfoModal({
    title: '这台电脑离线',
    sub: device.name,
    body: `<div class="perm-summary" style="background:var(--surface-subtle);border-color:var(--line)">可能已关机、睡眠或断开 Wi-Fi。近传不会远程唤醒设备，请到工位开机后再试。</div>
      <dl class="kv" style="margin-top:12px"><dt>上次在线</dt><dd>${esc(device.lastSeen)}</dd><dt>最近会话</dt><dd>${esc(device.lastSession)}</dd><dt>Agent</dt><dd class="mono">${esc(device.version)}</dd><dt>地址</dt><dd class="mono">${esc(device.ip)}</dd></dl>
      <div class="card-note">如果工位电脑开着且在同一 Wi-Fi，可能是 Agent 服务停止、防火墙或 AP 隔离。可以运行网络自检。</div>`,
    actions: [
      { label: '网络自检', primary: true, onClick: () => { closeModal(); setView('diagnostics'); } },
      { label: '关闭', onClick: closeModal },
    ],
  });
}
function openVersionModal(device) {
  openInfoModal({
    title: '版本不兼容',
    sub: device.name,
    body: `<div class="perm-summary" style="background:var(--amber-soft);border-color:var(--amber-line)"><b style="color:var(--amber)">控制端 1.0.3 / 工位电脑 ${esc(device.version)} / 最低要求 1.0.2</b></div>
      <p style="font-size:11.5px;color:var(--ink-2);line-height:1.65;margin:12px 0 0">请先在工位电脑上更新近传 Agent。V1 不提供远程推送更新；可以使用本机 MSI 或离线更新包。更新会检查是否有活动会话。</p>
      <div class="card-note">如果无法到工位，请联系 IT；不要反复重试连接。</div>`,
    actions: [
      { label: '复制诊断信息', onClick: () => { copyText(`VERSION_MISMATCH device=${device.host} controller=1.0.3 agent=${device.version}`, '诊断信息已复制'); } },
      { label: '查看更新方法', primary: true, onClick: () => { closeModal(); toast('更新方法：工位电脑 → 设置 → 更新（原型）', 'success'); } },
    ],
  });
}
function openUnattendedModal(device) {
  openInfoModal({
    title: '这台电脑已锁屏',
    sub: device.name,
    body: `<div class="perm-summary" style="background:var(--amber-soft);border-color:var(--amber-line)">当前授权不包含无人值守。请让设备所有者在工位解锁，或单独授予无人值守权限。</div>
      <p style="font-size:11.5px;color:var(--ink-2);line-height:1.65;margin:12px 0 0">无人值守只能使用这台电脑的 Windows 账户密码；PIN、指纹、面容不能远程使用。管理员默认关闭无人值守，且不能在锁屏时远程自助提权。</p>`,
    actions: [
      { label: '请求授权', primary: true, onClick: () => { closeModal(); toast('已发送无人值守授权请求（原型）', 'success'); } },
      { label: '取消', onClick: closeModal },
    ],
  });
}
function openSessionRequestModal() {
  state.modalInfoActions = [
    { label: '拒绝', onClick: () => { closeModal(); toast('已拒绝连接请求', 'success'); } },
    { label: '允许', onClick: () => { closeModal(); toast('已允许连接（原型）', 'success'); } },
  ];
  openModal(`${modalHead('王芳的笔记本请求连接', '工位确认')}
    <div class="modal-body">
      <div class="identity-card"><div class="identity-ico">${icon('user', 18)}</div><div class="identity-main"><b>王芳的笔记本 <span class="tag admin">管理员</span></b><div class="identity-sub">DESKTOP-WANGFANG · 6 位码添加 · 请求一次支持</div><div class="fingerprint">请求：查看屏幕、控制键鼠、查看审计 · 有效期 8 小时</div></div></div>
      <div class="perm-summary" style="margin-top:12px"><b>无人值守：关闭</b> · 剪贴板：关闭 · 文件：关闭 · 录制：关闭。允许后，这台电脑会显示会话提示；你随时可以结束会话。</div>
      <div class="card-note">默认焦点在“拒绝”；30 秒后自动拒绝。允许不会静默开启无人值守或文件传输。</div>
    </div>
    ${modalFoot(`<button class="btn" data-info-index="0">拒绝</button><button class="btn btn-primary" data-info-index="1">允许</button>`, '30 秒后自动拒绝')}`, { size: 'sm', label: '连接请求' });
  setTimeout(() => {
    const reject = document.querySelector('[data-info-index="0"]');
    reject?.focus();
    reject?.classList.add('force-focus');
  }, 40);
}
function openBusyModal(device) {
  openInfoModal({
    title: '这台电脑正在使用',
    sub: device.name,
    body: `<p style="font-size:11.5px;color:var(--ink-2);line-height:1.65;margin:0">王芳的控制端正在会话中。接管需要工位确认，不会静默切换；如果无人确认，请求会自动拒绝。</p>`,
    actions: [
      { label: '请求接管', primary: true, onClick: () => { closeModal(); toast('已发送接管请求，等待工位确认（原型）', 'success'); } },
      { label: '取消', onClick: closeModal },
    ],
  });
}
function openBackupModal() {
  openModal(`${modalHead('创建加密备份', 'AES-256-GCM')}
    <div class="modal-body">
      <div class="perm-summary">备份包含本机设备列表、授权、设置和控制端身份密钥；不包含 Windows 密码、会话录制、审计日志。忘记密码无法恢复。</div>
      <div class="field" style="margin-top:12px"><label for="backupPwd">备份密码</label><input class="input" id="backupPwd" type="password" placeholder="至少 8 位"><div class="hint">密码不会保存；文件离开本机后只有密码能打开。</div></div>
      <div class="field" style="margin-top:10px"><label for="backupPwd2">确认密码</label><input class="input" id="backupPwd2" type="password" placeholder="再次输入"></div>
      <div id="backupError" class="card-note danger" hidden></div>
    </div>
    ${modalFoot(`<button class="btn" data-modal-close>取消</button><button class="btn btn-primary" data-modal-action="backup-create">创建备份</button>`, '建议存放在受控位置')}`, { size: 'sm' });
}

/* ---------- wizard ---------- */
function openAddDevice() {
  closeMenu();
  const peers = (state.peers || []).filter((p) => !p.self && p.online);
  openModal(`${modalHead('添加设备', '同一 Wi-Fi 下发现')}
    <div class="modal-body">
      <p style="margin:0 0 10px;font-size:11.5px;color:var(--ink-3)">在工位电脑上打开近传，确保「本机被控」已开启。首次连接需要它显示的 6 位授权码。</p>
      ${peers.length ? `<div class="perm-table" style="margin-top:0">${peers.map((p) => `<div class="perm-row"><div class="perm-main"><b>${esc(p.name)} <span class="tag ok">在线</span></b><span>${esc(p.ip)} · ${esc(p.os || 'Windows')} · v${esc(p.version || '—')}</span></div><button class="btn btn-sm btn-primary" data-modal-action="connect-peer" data-peer-id="${p.id}">连接</button></div>`).join('')}</div>` : `<div class="empty-state" style="padding:24px 10px"><div class="empty-ico">${icon('wifi', 20)}</div><b>没有发现其他设备</b><p>请确认两台电脑在同一 Wi-Fi、未开启 AP 隔离，并且对方已开启「本机被控」。也可以先用本机预览验证画质与输入。</p></div>`}
      <div class="field" style="margin-top:12px"><label for="manualAddr">广播被禁用？手动输入 IP:端口</label><div style="display:flex;gap:6px"><input class="input" id="manualAddr" placeholder="192.168.10.66:47820" autocomplete="off"><button class="btn" data-modal-action="manual-connect">添加</button></div><div class="hint">仍需工位端 6 位授权码；端口默认 47820。</div></div>
      <div class="role-row" style="margin-top:12px"><span>连接身份：</span><div class="seg">
        <button class="${state.addRole === 'owner' ? 'active' : ''}" data-modal-action="add-role" data-value="owner">我的设备</button>
        <button class="${state.addRole === 'admin' ? 'active' : ''}" data-modal-action="add-role" data-value="admin">管理员临时支持</button>
      </div></div>
      <div class="card-note">${state.addRole === 'admin' ? '管理员临时支持：8 小时后自动到期；无人值守、剪贴板、文件、录制默认关闭。员工可在工位端撤销。' : '我的设备：长期授权；剪贴板、文件、录制可用。'}</div>
      <div class="card-note">找不到？检查两台电脑是否在同一网段；Windows 防火墙是否放通近传；AP 是否开启客户端隔离。</div>
    </div>
    ${modalFoot(`<button class="btn" data-modal-close>取消</button><button class="btn" data-modal-action="self-preview">${icon('monitor', 13)} 本机预览</button><button class="btn btn-primary" data-modal-action="refresh-peers">${icon('refresh', 13)} 重新扫描</button>`)}`, { size: 'md', label: '添加设备' });
}
async function refreshPeers() {
  const peers = await window.workspace.remote.discover();
  if (state.remote) state.remote.peers = peers;
  mergeRemoteState({ ...(state.remote || {}), peers });
  render();
}
function wizardDefaults(role) {
  return role === 'admin'
    ? { view: true, control: true, unattended: false, clipboard: false, file: false, manage: false, audit: true, record: false }
    : { view: true, control: true, unattended: true, clipboard: true, file: true, manage: true, audit: true, record: false };
}
function renderWizard() {
  const w = state.wizard;
  if (!w) return;
  openModal(`
    ${modalHead('添加设备', '连接一台工位电脑')}
    <div class="modal-body">
      <div class="wizard-steps">
        ${wizardStep(1, '方式', w.step)}
        <span class="wizard-line"></span>
        ${wizardStep(2, '验证', w.step)}
        <span class="wizard-line"></span>
        ${wizardStep(3, '权限', w.step)}
        <span class="wizard-line"></span>
        ${wizardStep(4, '完成', w.step)}
      </div>
      ${w.step === 1 ? wizardStep1() : w.step === 2 ? wizardStep2() : w.step === 3 ? wizardStep3() : wizardStep4()}
    </div>
    ${wizardFoot()}
  `, { size: 'md', sticky: true, label: '添加设备' });
  if (w.step === 2 && w.method === 'code') {
    setTimeout(() => document.querySelector('[data-code-index="0"]')?.focus(), 30);
  }
  hydrateIcons(document.getElementById('modalRoot'));
}
function wizardStep(n, label, current) {
  const cls = current === n ? 'active' : current > n ? 'done' : '';
  return `<span class="wizard-step ${cls}"><i>${current > n ? '✓' : n}</i>${label}</span>`;
}
function wizardStep1() {
  return `<p style="margin:0 0 10px;font-size:11.5px;color:var(--ink-3)">选择一种方式。6 位码是主路径；扫码依赖本机摄像头；发现需要工位确认。</p>
    <div class="method-grid">
      <button class="method-card" data-wizard-action="method" data-method="code"><div class="method-ico">${icon('key', 15)}</div><b>6 位授权码<span class="recommend">推荐</span></b><span>输入工位电脑屏幕上的 6 位数字，5 分钟有效。</span></button>
      <button class="method-card" data-wizard-action="method" data-method="scan"><div class="method-ico">${icon('grid', 15)}</div><b>扫码</b><span>用本机摄像头扫描工位电脑屏幕上的二维码；没有摄像头请用 6 位码。</span></button>
      <button class="method-card" data-wizard-action="method" data-method="discovery"><div class="method-ico">${icon('wifi', 15)}</div><b>局域网发现</b><span>搜索同一 Wi-Fi 下已安装近传的电脑；需要工位确认。</span></button>
      <button class="method-card" data-wizard-action="method" data-method="admin"><div class="method-ico">${icon('shield', 15)}</div><b>管理员：预置信任</b><span>本机已预置管理员身份，可直接添加员工设备；默认 8 小时、无人值守关。</span></button>
    </div>
    <div class="card-note" style="margin-top:10px">被控端会显示这次授权的控制端、权限和有效期；设备所有者可以随时撤销。</div>`;
}
function wizardStep2() {
  const w = state.wizard;
  if (w.method === 'scan') {
    return `<div class="identity-card"><div class="identity-ico">${icon('grid', 18)}</div><div class="identity-main"><b>摄像头扫描</b><div class="identity-sub">演示：真实实现需要摄像头权限；没有摄像头时请改用 6 位码。</div><div class="fingerprint">识别框 · 二维码 220×220 · 仅本次有效</div></div></div>
      <div class="empty-state" style="padding:20px 10px"><div class="empty-ico">${icon('grid', 20)}</div><b>对准工位电脑上的二维码</b><p>二维码过期后，工位端会自动变暗并显示刷新。</p><div class="empty-actions"><button class="btn btn-primary btn-sm" data-wizard-action="scan-success">模拟扫描成功</button></div></div>`;
  }
  if (w.method === 'discovery') {
    return `<p style="margin:0 0 8px;font-size:11.5px;color:var(--ink-3)">同一 Wi-Fi 下发现设备 · 不显示员工姓名/部门，保护隐私。</p>
      <div class="perm-table" style="margin-top:0">
        ${[
          ['DESKTOP-FIN-01', '1.0.3', 'A1B2…9F3C'],
          ['DESKTOP-DESIGN-07', '1.0.3', '77C1…0E2A'],
          ['DESKTOP-RD-12', '1.0.1', '3F9A…22D1'],
        ].map(([host, ver, fp], i) => `<button class="perm-row" style="width:100%;text-align:left" data-wizard-action="discovery-select" data-index="${i}" data-host="${host}" data-version="${ver}" data-fp="${fp}"><div class="perm-main"><b>${host} ${i === 0 ? '<span class="tag ok">在线</span>' : ''}</b><span>版本 ${ver} · 指纹 ${fp}</span></div><span class="btn btn-sm">选择</span></button>`).join('')}
      </div>
      <div class="card-note">找不到？检查同一 Wi-Fi、未开启 AP 隔离、Agent 正在运行。选择后工位端会弹出确认。</div>`;
  }
  if (w.method === 'admin') {
    return `<div class="identity-card"><div class="identity-ico">${icon('shield', 18)}</div><div class="identity-main"><b>管理员预置信任</b><div class="identity-sub">IT-张伟的笔记本 · 预置公钥 A1B2…9F3C</div><div class="fingerprint">无需工位确认；工位电脑会显示“管理员 X 已授权”，员工可撤销。</div></div></div>
      <div class="perm-summary" style="margin-top:12px">管理员默认：查看/控制/审计只读；8 小时；无人值守、剪贴板、文件、管理授权、录制关闭。</div>`;
  }
  return `<div class="field"><label for="code0">输入工位电脑上的 6 位授权码</label><div class="code-inputs">${[0,1,2,3,4,5].map((i) => `<input class="code-slot ${w.code[i] ? 'filled' : ''}" data-code-index="${i}" maxlength="1" inputmode="numeric" value="${esc(w.code[i] || '')}" aria-label="授权码第 ${i+1} 位">`).join('')}</div><div class="code-meta"><span>05:00 后失效</span><span>·</span><span>还可尝试 5 次</span><span class="warn">演示：任意 6 位数字</span></div><div class="hint">在工位电脑上打开近传 → 添加控制端 → 屏幕上会显示 6 位数字。不要截图分享。</div></div>
    <div class="card-note">授权码一次性、5 分钟有效；连续失败会锁定 10 分钟。</div>`;
}
function wizardStep3() {
  const w = state.wizard;
  const d = w.method === 'discovery' ? { host: w.discoverySelected?.host || 'DESKTOP-FIN-01', fp: w.discoverySelected?.fp || 'A1B2 9F3C', ver: w.discoverySelected?.version || '1.0.3' } : { host: 'DESKTOP-FIN-01', fp: 'A1B2 9F3C', ver: '1.0.3' };
  return `<div class="identity-card"><div class="identity-ico">${icon('monitor', 18)}</div><div class="identity-main"><b>${w.role === 'admin' ? '员工工位' : '财务部-李伟的工位'} <span class="tag ${w.method === 'admin' ? 'admin' : 'blue'}">${w.method === 'admin' ? '预置信任' : '待核对'}</span></b><div class="identity-sub"><span>${esc(d.host)}</span><span>·</span><span>Agent ${esc(d.ver)}</span><span>·</span><span>在线</span></div><div class="fingerprint">指纹 ${esc(d.fp)}</div></div></div>
    <div class="identity-warn">${icon('warn', 12)} 请与工位电脑屏幕上显示的指纹核对；不一致请取消。</div>
    <div class="role-row"><span>添加为：</span><div class="seg"><button class="${w.role === 'owner' ? 'active' : ''}" data-wizard-action="role" data-value="owner">我的设备</button><button class="${w.role === 'admin' ? 'active' : ''}" data-wizard-action="role" data-value="admin">管理员支持</button></div></div>
    <div class="perm-table">
      ${PERMISSIONS.map((p) => `<div class="perm-row"><div class="perm-main"><b>${p.name}${p.risk === '高' ? '<span class="perm-risk high">敏感</span>' : ''}</b><span>${p.desc}</span></div><button class="switch ${w.permissions[p.key] ? 'on' : ''}" data-wizard-action="perm" data-key="${p.key}" role="switch" aria-checked="${w.permissions[p.key]}" aria-label="${p.name}"></button></div>`).join('')}
    </div>
    <div class="role-row"><span>有效期：</span><div class="seg">
      <button class="${w.expiry === '1h' ? 'active' : ''}" data-wizard-action="expiry" data-value="1h">1 小时</button>
      <button class="${w.expiry === '8h' ? 'active' : ''}" data-wizard-action="expiry" data-value="8h">8 小时</button>
      ${w.role === 'admin' ? '' : `<button class="${w.expiry === 'long' ? 'active' : ''}" data-wizard-action="expiry" data-value="long">长期</button>`}
    </div></div>
    <div class="perm-summary"><b>摘要：</b>${permissionSummaryFrom(w.permissions)}；${w.expiry === 'long' ? '长期有效' : w.expiry === '8h' ? '8 小时后到期' : '1 小时后到期'}。${w.role === 'admin' ? '无人值守/剪贴板/文件默认关闭。' : '录制默认关闭。'}</div>`;
}
function permissionSummaryFrom(p) {
  return PERMISSIONS.filter((x) => p[x.key]).map((x) => x.name).join('、') || '无';
}
function wizardStep4() {
  const w = state.wizard;
  return `<div class="success-state"><div class="success-ico">${icon('check', 24)}</div><b>已添加</b><p>设备已加入本机清单。工位电脑会显示这次授权，设备所有者可以随时撤销。</p>
    <div class="receipt">
      <div class="receipt-row"><span>设备</span><b>${esc(w.role === 'admin' ? '员工工位' : '财务部-李伟的工位')}</b></div>
      <div class="receipt-row"><span>权限</span><b>${permissionSummaryFrom(w.permissions)}</b></div>
      <div class="receipt-row"><span>有效期</span><b>${w.expiry === 'long' ? '长期' : w.expiry === '8h' ? '8 小时' : '1 小时'}</b></div>
      <div class="receipt-row"><span>身份</span><b>${w.role === 'admin' ? '管理员临时支持' : '本人设备'}</b></div>
    </div>
    <div class="card-note">工位电脑上的“授权控制端”是权威列表；控制端这里是本机缓存。</div>
  </div>`;
}
function wizardFoot() {
  const w = state.wizard;
  if (w.step === 4) {
    return modalFoot(`<button class="btn" data-wizard-action="finish">完成</button><button class="btn btn-primary" data-wizard-action="connect">${icon('play', 14)} 连接</button>`, '可以随时在授权页撤销');
  }
  const canNext = w.step !== 2 || (w.method === 'code' ? w.code.length === 6 : true);
  return modalFoot(`${w.step > 1 ? `<button class="btn" data-wizard-action="back">上一步</button>` : ''}<button class="btn" data-modal-close>取消</button><button class="btn btn-primary" data-wizard-action="next" ${canNext ? '' : 'disabled'}>下一步</button>`, w.step === 1 ? '6 位码推荐' : '');
}
function handleWizard(action, el) {
  const w = state.wizard;
  if (!w) return;
  if (action === 'method') {
    w.method = el.dataset.method;
    if (w.method === 'admin') { w.role = 'admin'; w.permissions = wizardDefaults('admin'); w.expiry = '8h'; w.step = 3; }
    else w.step = 2;
    renderWizard();
  } else if (action === 'scan-success') {
    w.code = '482731'; w.method = 'code'; w.step = 3; renderWizard();
  } else if (action === 'discovery-select') {
    w.discoverySelected = { host: el.dataset.host, version: el.dataset.version, fp: el.dataset.fp };
    w.step = 3; renderWizard();
  } else if (action === 'role') {
    w.role = el.dataset.value; w.permissions = wizardDefaults(w.role); w.expiry = w.role === 'admin' ? '8h' : 'long'; renderWizard();
  } else if (action === 'perm') {
    const k = el.dataset.key;
    const next = !w.permissions[k];
    w.permissions[k] = next;
    if (k === 'unattended' && next) { w.permissions.view = true; w.permissions.control = true; }
    if (k === 'control' && !next) { w.permissions.unattended = false; }
    if (k === 'view' && !next) { w.permissions.control = false; w.permissions.unattended = false; w.permissions.record = false; }
    renderWizard();
  } else if (action === 'expiry') {
    w.expiry = el.dataset.value; renderWizard();
  } else if (action === 'back') {
    w.step = Math.max(1, w.step - 1); renderWizard();
  } else if (action === 'next') {
    if (w.step === 2 && w.method === 'code' && w.code.length !== 6) { toast('请输入完整的 6 位授权码', 'warn'); return; }
    if (w.step === 3) createWizardDevice();
    else w.step += 1;
    renderWizard();
  } else if (action === 'finish') {
    const id = w.newDeviceId; closeModal(); if (id) selectDevice(id); setView('devices');
  } else if (action === 'connect') {
    const id = w.newDeviceId; closeModal(); if (id) openSession(id);
  }
}
function createWizardDevice() {
  const w = state.wizard;
  const id = `dev-new-${Date.now()}`;
  const admin = w.role === 'admin';
  DEVICES.unshift({
    id, name: admin ? '员工工位（新添加）' : '财务部-李伟的工位（新）', host: w.discoverySelected?.host || 'DESKTOP-NEW-01',
    owner: admin ? '待分配' : '李伟', dept: admin ? '待分配' : '财务部', asset: 'NEW-0001', location: '待补充',
    status: 'online', relation: admin ? 'managed' : 'mine', grantType: admin ? 'admin' : 'owner',
    expiryLabel: w.expiry === 'long' ? '长期' : w.expiry === '8h' ? '8:00' : '1:00',
    expirySeconds: w.expiry === 'long' ? null : w.expiry === '8h' ? 28800 : 3600,
    permissions: { ...w.permissions },
    displays: [{ id: 1, label: '屏幕 1', res: '1920×1080', dpi: '100%', primary: true }],
    encoder: 'NVENC', wifi: '5GHz · Wi-Fi 6', version: '1.0.3', versionOk: true,
    ip: '192.168.10.99', fingerprint: 'D3E4 5F60', lastSeen: '刚刚', lastSession: '—',
    notes: '通过添加设备向导创建（原型）。', sessionHolder: null, starred: false, twoK: true,
  });
  w.newDeviceId = id;
  state.selectedDeviceId = id;
  w.step = 4;
}

/* ---------- drawer ---------- */
function openDrawer(html, label = '详情') {
  const root = document.getElementById('drawerRoot');
  root.innerHTML = `<div class="drawer-scrim" data-drawer-scrim></div><aside class="drawer" role="dialog" aria-modal="true" aria-label="${esc(label)}">${html}</aside>`;
  hydrateIcons(root);
  root.querySelector('[data-drawer-scrim]')?.addEventListener('click', closeDrawer);
}
function closeDrawer() {
  const root = document.getElementById('drawerRoot');
  if (root) root.innerHTML = '';
}
function openGrantDrawer(grantId) {
  const g = grantById(grantId);
  if (!g) return;
  const d = deviceById(g.deviceId);
  openDrawer(`
    <div class="drawer-head"><b>授权详情</b><span class="tag ${g.type === '管理员' ? 'admin' : ''}">${esc(g.type)}</span><button class="icon-btn" data-drawer-close aria-label="关闭">${icon('x')}</button></div>
    <div class="drawer-body">
      <div class="card">
        <div class="card-head"><b>${esc(d?.name || '设备')}</b><span class="tag ${expiryClass(g.expirySeconds)}">${esc(g.expiryLabel)}</span></div>
        <dl class="kv"><dt>控制端</dt><dd>${esc(g.controller)}</dd><dt>来源</dt><dd>${esc(g.source)}</dd><dt>状态</dt><dd>${esc(g.status)}</dd><dt>最近使用</dt><dd>${esc(g.lastUsed)}</dd></dl>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-head"><b>权限</b><span class="muted" style="font-size:10px">来自设备</span></div>
        <div class="permission-summary">${PERMISSIONS.map((p) => `<span class="perm-chip ${g.perms.includes(p.key) ? '' : 'off'}">${icon(g.perms.includes(p.key) ? 'check' : 'x', 11)}${p.name}</span>`).join('')}</div>
        <div class="card-note">降权/撤销立即生效；提权需工位确认。管理员临时支持默认不含无人值守/剪贴板/文件。</div>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-head"><b>时间线</b></div>
        <div class="timeline">
          <div class="timeline-item"><span class="timeline-dot blue"></span><div class="timeline-main"><b>授权创建</b><span>${esc(g.source)}</span></div><span class="timeline-time">今天 10:12</span></div>
          <div class="timeline-item"><span class="timeline-dot green"></span><div class="timeline-main"><b>最近使用</b><span>${esc(g.lastUsed)}</span></div><span class="timeline-time">今天</span></div>
          <div class="timeline-item"><span class="timeline-dot"></span><div class="timeline-main"><b>到期</b><span>${g.expirySeconds === null ? '长期有效' : esc(g.expiryLabel)}</span></div><span class="timeline-time">${g.expirySeconds === null ? '—' : '倒计时'}</span></div>
        </div>
      </div>
      <div class="card-note">“控制本机的控制端”以本机被控列表为准；本页可撤销。其他设备的授权需在对应工位电脑上管理。</div>
    </div>
    <div class="drawer-foot"><button class="btn" data-drawer-close>关闭</button><span class="spacer"></span><button class="btn" data-drawer-action="revoke" data-grant-id="${g.id}" style="color:var(--red);border-color:var(--red-line);background:var(--red-soft)">撤销</button><button class="btn btn-primary" data-drawer-action="renew" data-grant-id="${g.id}">续期</button></div>
  `, '授权详情');
}
function openAuditDrawer(auditId) {
  const a = AUDIT.find((x) => x.id === auditId);
  if (!a) return;
  const d = deviceById(a.deviceId);
  openDrawer(`
    <div class="drawer-head"><b>审计事件</b><span class="tag ${a.result === '成功' ? 'ok' : 'red'}">${esc(a.result)}</span><button class="icon-btn" data-drawer-close aria-label="关闭">${icon('x')}</button></div>
    <div class="drawer-body">
      <div class="card">
        <div class="card-head"><b>${esc(a.event)}</b><span class="mono" style="font-size:10px">${esc(a.code)}</span></div>
        <dl class="kv"><dt>时间</dt><dd class="mono">${esc(a.time)}</dd><dt>操作者</dt><dd>${esc(a.actor)}</dd><dt>设备</dt><dd>${esc(d?.name || '—')}</dd><dt>结果</dt><dd>${esc(a.result)}</dd></dl>
        <div class="card-note" style="color:var(--ink-2)">${esc(a.detail)}</div>
      </div>
      <div class="card" style="margin-top:10px">
        <div class="card-head"><b>技术详情</b><span class="tag ok">本机</span></div>
        <dl class="kv"><dt>事件 ID</dt><dd class="mono" style="font-size:9.5px">${esc(a.id)}</dd><dt>类型</dt><dd class="mono" style="font-size:9.5px">${esc(a.code)}</dd><dt>记录</dt><dd>只追加 · 不上传</dd></dl>
        <div class="card-note">本机审计；不提供云端集中审计。导出用于内部支持。</div>
      </div>
    </div>
    <div class="drawer-foot"><button class="btn" data-drawer-close>关闭</button><span class="spacer"></span><button class="btn" data-drawer-action="copy-audit" data-audit-id="${a.id}">${icon('copy', 13)} 复制事件 ID</button></div>
  `, '审计事件');
}

/* ---------- command palette ---------- */
function openCommand() {
  closeMenu();
  state.command = true;
  state.commandQuery = '';
  const root = document.getElementById('commandRoot');
  root.innerHTML = `<div class="scrim" data-command-scrim><div class="command" role="dialog" aria-modal="true" aria-label="命令面板"><div class="command-input">${icon('search', 16)}<input id="commandInput" placeholder="搜索设备、员工、资产编号，或输入命令" autocomplete="off"><kbd>Esc</kbd></div><div class="command-list" id="commandList"></div></div></div>`;
  root.querySelector('[data-command-scrim]')?.addEventListener('mousedown', (e) => { if (e.target === e.currentTarget) closeCommand(); });
  renderCommandList('');
  setTimeout(() => document.getElementById('commandInput')?.focus(), 20);
}
function closeCommand() {
  state.command = false;
  const root = document.getElementById('commandRoot');
  if (root) root.innerHTML = '';
}
function renderCommandList(q) {
  const list = document.getElementById('commandList');
  if (!list) return;
  const query = q.trim().toLowerCase();
  const devices = DEVICES.filter((d) => !query || [d.name, d.owner, d.dept, d.asset, d.host].some((x) => String(x).toLowerCase().includes(query)));
  const actions = [
    { label: '添加设备', icon: 'plus', action: 'add-device' },
    { label: '打开本机被控', icon: 'laptop', action: 'agent' },
    { label: '打开团队群聊', icon: 'chat', action: 'team-chat' },
    { label: '运行网络自检', icon: 'activity', action: 'diagnostics' },
    { label: '导出诊断包', icon: 'download', action: 'export-diag' },
    { label: '打开发布说明', icon: 'external', action: 'open-help' },
    { label: '查看审计', icon: 'list', action: 'audit' },
    { label: '打开设置', icon: 'settings', action: 'settings' },
    { label: '切换主题', icon: 'moon', action: 'theme' },
  ].filter((a) => !query || a.label.toLowerCase().includes(query));
  list.innerHTML = `
    ${devices.length ? `<div class="command-group">设备</div>${devices.map((d) => `<button class="command-item" data-command-device="${d.id}"><span class="cmd-ico">${icon('monitor', 14)}</span><span class="cmd-main"><b>${esc(d.name)}</b><span>${esc(d.owner)} · ${esc(d.dept)} · ${esc(d.asset)} · ${esc(statusMeta(d).label)}</span></span><kbd>Enter</kbd></button>`).join('')}` : ''}
    ${actions.length ? `<div class="command-group">动作</div>${actions.map((a) => `<button class="command-item" data-command-action="${a.action}"><span class="cmd-ico">${icon(a.icon, 14)}</span><span class="cmd-main"><b>${esc(a.label)}</b><span>执行命令</span></span></button>`).join('')}` : ''}
    ${!devices.length && !actions.length ? `<div class="command-empty">没有匹配的设备或命令。试试设备名、员工姓名或“添加设备”。</div>` : ''}`;
}
function handleCommandAction(action) {
  if (action === 'add-device') { closeCommand(); state.addRole = 'owner'; openAddDevice(); }
  else if (action === 'agent') { closeCommand(); toggleAgent(true); }
  else if (action === 'team-chat') { closeCommand(); window.workspace.openChat(); }
  else if (action === 'diagnostics') { closeCommand(); setView('diagnostics'); }
  else if (action === 'export-diag') { closeCommand(); window.workspace.remote.exportDiag().then((p) => toast(p ? `诊断包已导出：${p}` : '已取消', p ? 'success' : 'info')); }
  else if (action === 'open-help') { closeCommand(); window.workspace.openHelp(); }
  else if (action === 'audit') { closeCommand(); setView('audit'); }
  else if (action === 'settings') { closeCommand(); setView('settings'); }
  else if (action === 'theme') { closeCommand(); toggleTheme(); }
}

/* ---------- session ---------- */
function openSession(deviceId) {
  const device = deviceById(deviceId);
  if (!device) return;
  if (device.status === 'offline') { openOfflineModal(device); return; }
  if (!device.versionOk) { openVersionModal(device); return; }
  if (device.status === 'paused') { openInfoModal({ title: '这台电脑已暂停远程访问', sub: device.name, body: '<p style="font-size:11.5px;color:var(--ink-2)">员工在工位端暂停了远程访问。请恢复后再连接。</p>', actions: [{ label: '关闭', primary: true, onClick: closeModal }] }); return; }
  if (device.real) { openRealSession(device); return; }
  if (device.status === 'locked' && !device.permissions.unattended) { openUnattendedModal(device); return; }
  if (device.status === 'session' && device.sessionHolder) { openBusyModal(device); return; }
  closeMenu(); closeCommand(); closeModal(); closeDrawer();
  state.agent = false; renderAgent();
  state.session = {
    deviceId,
    locked: device.status === 'locked',
    quality: 'auto',
    qualityLabel: '自动 · 1080p60',
    display: 1,
    clipboard: !!device.permissions.clipboard,
    files: device.permissions.file ? [{ name: '季度报表.xlsx', size: '1.8 MB', progress: 62 }] : [],
    recording: false,
    banner: null,
    reconnecting: false,
    takeover: false,
    expired: false,
    passwordError: '',
    duration: 0,
    drawer: null,
    startAt: Date.now(),
  };
  clearInterval(state.sessionTimer);
  state.sessionTimer = setInterval(() => {
    if (!state.session) return;
    state.session.duration += 1;
    document.querySelectorAll('[data-session-duration]').forEach((el) => { el.textContent = formatDuration(state.session.duration); });
  }, 1000);
  renderSession();
}
async function openRealSession(device) {
  let code = '';
  let remembered = false;
  try {
    if (device.self) {
      const rs = await window.workspace.remote.state();
      state.remote = rs;
      code = rs?.code || '';
    } else {
      remembered = localStorage.getItem(`ns-known:${device.peerId}`) === '1';
      if (!remembered) code = await promptPairCode(device);
    }
  } catch (err) {
    toast(err.message || '无法读取设备信息', 'danger');
    return;
  }
  if (!code && !remembered) return;
  closeMenu(); closeCommand(); closeModal(); closeDrawer();
  state.agent = false; renderAgent();
  state.lastFrame = null;
  state.frameRect = null;
  state.session = {
    real: true,
    deviceId: device.id,
    peerId: device.peerId,
    self: !!device.self,
    quality: 'auto',
    qualityLabel: '自动 · 1080p',
    display: 1,
    clipboard: !!device.permissions.clipboard,
    files: [],
    recording: false,
    fps: 0,
    frameCount: 0,
    rtt: null,
    banner: null,
    reconnecting: false,
    expired: false,
    passwordError: '',
    duration: 0,
    drawer: null,
    startAt: Date.now(),
  };
  clearInterval(state.sessionTimer);
  state.sessionTimer = setInterval(() => {
    if (!state.session) return;
    state.session.duration += 1;
    state.session.fps = state.session.frameCount || 0;
    state.session.frameCount = 0;
    document.querySelectorAll('[data-session-duration]').forEach((el) => { el.textContent = formatDuration(state.session.duration); });
    const fpsEl = document.getElementById('hudFps');
    if (fpsEl) fpsEl.textContent = `${state.session.fps} fps`;
  }, 1000);
  renderSession();
  toast('正在建立加密直连…', 'info');
  const role = state.pendingRole || 'owner';
  state.pendingRole = null;
  const complete = async () => {
    if (!state.session) return;
    state.session.connected = true;
    const rs = await window.workspace.remote.state();
    state.session.grant = rs?.session?.grant || null;
    applySessionGrant();
    if (!device.self) {
      try { localStorage.setItem(`ns-known:${device.peerId}`, '1'); } catch {}
    }
    toast(state.session.grant?.role === 'admin' ? '已连接 · 管理员临时支持' : '已连接', 'success');
    renderSession();
  };
  const failConnect = (err) => {
    if (!state.session) return;
    state.session = null;
    clearInterval(state.sessionTimer);
    state.sessionTimer = null;
    document.getElementById('sessionRoot').innerHTML = '';
    render();
    openInfoModal({
      title: '连接失败',
      sub: device.name,
      body: `<div class="perm-summary" style="background:var(--red-soft);border-color:var(--red-line);color:var(--red)">${esc(err?.message || '无法连接这台电脑')}</div><div class="card-note">请确认两台电脑在同一 Wi-Fi、被控端已开启，并输入正确的 6 位授权码。</div>`,
      actions: [{ label: '知道了', primary: true, onClick: closeModal }],
    });
  };
  const needsCode = (err) => /授权码|PAIR_DENIED|pair denied/i.test(String(err?.message || ''));
  try {
    await window.workspace.remote.connect(device.peerId, code, role);
    await complete();
  } catch (err) {
    if (!device.self && !code && needsCode(err)) {
      const newCode = await promptPairCode(device);
      if (newCode) {
        try {
          await window.workspace.remote.connect(device.peerId, newCode, role);
          await complete();
          return;
        } catch (err2) {
          failConnect(err2);
          return;
        }
      }
    }
    failConnect(err);
  }
}

function promptPairCode(device) {
  return new Promise((resolve) => {
    state.pairResolve = resolve;
    openModal(`${modalHead('输入 6 位授权码', device.name)}
      <div class="modal-body">
        <div class="field"><label for="pairCode">工位电脑「本机被控」中显示的 6 位码</label><input class="input" id="pairCode" maxlength="6" inputmode="numeric" placeholder="例如 482731" autocomplete="off"><div class="hint">首次连接需要授权码；授权后这台控制端会被记住。刷新或关闭被控后旧码失效。</div></div>
      </div>
      ${modalFoot(`<button class="btn" data-modal-close>取消</button><button class="btn btn-primary" data-modal-action="pair-connect">连接</button>`)}`, { size: 'sm', label: '输入授权码' });
    setTimeout(() => document.getElementById('pairCode')?.focus(), 30);
  });
}

function closeSession(reason = '用户结束') {
  if (!state.session) return;
  const device = deviceById(state.session.deviceId);
  clearInterval(state.sessionTimer);
  state.sessionTimer = null;
  if (state.session.recording) {
    try { state.session.recorder?.stop(); } catch {}
    state.session.recording = false;
    window.workspace.remote.setRecording?.(false);
  }
  if (reason === '用户结束' || reason === '会话已被接管' || reason === '授权到期' || reason === '远程结束') {
    const start = new Date(state.session.startAt || Date.now());
    const end = new Date();
    const fmt = (d) => d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    SESSION_HISTORY.unshift({ id: `s-${Date.now()}`, date: `今天 ${fmt(start)}–${fmt(end)}`, deviceId: state.session.deviceId, duration: formatDuration(state.session.duration), quality: state.session.qualityLabel.replace('自动 · ', '').replace('手动 · ', ''), latency: state.session.real ? 'LAN' : '18ms', result: reason === '会话已被接管' ? '已接管' : '成功', reason });
    try {
      const persist = SESSION_HISTORY.filter((x) => deviceById(x.deviceId) && !deviceById(x.deviceId).demo).slice(0, 200);
      localStorage.setItem('ns-session-history', JSON.stringify(persist));
    } catch {}
  }
  const name = device?.name || '设备';
  if (state.session.real) {
    try { window.workspace.remote.disconnect(); } catch {}
  }
  state.session = null;
  state.lastFrame = null;
  state.frameRect = null;
  document.getElementById('sessionRoot').innerHTML = '';
  toast(`会话已结束 · ${name}`, reason === '会话已被接管' ? 'warn' : 'success');
  render();
}
function formatDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function renderSession() {
  const s = state.session;
  const root = document.getElementById('sessionRoot');
  if (!s) { root.innerHTML = ''; return; }
  const device = deviceById(s.deviceId);
  if (!device) { closeSession(); return; }
  const locked = !s.real && s.locked && !s.unlocked;
  const admin = device.relation === 'managed' && !s.real;
  const grantMinutes = s.grant?.expiresAt ? Math.max(0, Math.ceil((s.grant.expiresAt - Date.now()) / 60000)) : null;
  const grantLabel = grantMinutes === null ? '' : grantMinutes >= 60 ? `${Math.ceil(grantMinutes / 60)} 小时` : `${grantMinutes} 分钟`;
  root.innerHTML = `
    <div class="session-shell">
      <div class="session-top">
        <div class="session-device">
          <span class="s-ico">${icon(locked ? 'lock' : 'monitor', 13)}</span>
          <div><b>${esc(device.name)}</b><div class="s-sub">${esc(device.host)} · ${esc(device.owner)}${admin ? ' · 管理员临时支持' : ''}</div></div>
          ${admin ? `<span class="tag admin" style="margin-left:4px">${icon('clock', 10)}${esc(device.expiryLabel)}</span>` : ''}
          ${s.grant?.role === 'admin' ? `<span class="tag admin" style="margin-left:4px">${icon('clock', 10)}临时支持 · ${esc(grantLabel)}</span>` : ''}
          ${locked ? `<span class="tag blue">无人值守</span>` : ''}
          <span class="tag red" id="recChip" ${s.recording ? '' : 'hidden'}>${icon('record', 10)}录制中</span>
        </div>
        <div class="session-hud">
          ${s.real
            ? `<span class="hud-item"><span class="hud-dot"></span>LAN</span><span class="hud-item" id="hudRtt">${s.rtt === null || s.rtt === undefined ? '— ms' : `${s.rtt} ms`}</span><span class="hud-item" id="hudFps">${s.fps ? `${s.fps} fps` : '— fps'}</span><span class="hud-item" id="hudCapture">${s.capture === 'gdi' ? 'GDI · JPEG' : 'JPEG'}</span><span class="hud-item">${esc(s.qualityLabel)}</span>`
            : `<span class="hud-item ${s.banner?.type === 'warn' ? 'warn' : ''}"><span class="hud-dot" style="${s.banner?.type === 'warn' ? 'background:#fbbf24' : ''}"></span>18 ms</span><span class="hud-item">60 fps</span><span class="hud-item">7.2 Mbps</span><span class="hud-item">${esc(s.qualityLabel)}</span>`}
        </div>
        <span class="spacer"></span>
        <div class="session-actions">
          <button class="session-btn" data-session-action="display-menu" title="切换显示器">${icon('display', 14)} <span>屏幕 ${s.display}</span></button>
          <button class="session-btn" data-session-action="quality-menu" title="画质">${icon('activity', 14)} <span>画质</span></button>
          <button class="session-btn ${s.clipboard ? 'active' : ''}" data-session-action="clipboard" title="剪贴板">${icon('clipboard', 14)} <span>剪贴板</span></button>
          <button class="session-btn" data-session-action="files" title="文件传输">${icon('folder', 14)} <span>文件</span></button>
          <button class="session-btn" data-session-action="more" title="更多">${icon('more', 14)}</button>
          <button class="session-btn danger" data-session-action="disconnect" title="断开">${icon('power', 14)} <span>断开</span></button>
        </div>
      </div>
      <div class="session-canvas">
        ${s.real
          ? `<div class="remote-canvas-wrap"><canvas id="remoteCanvas" class="remote-canvas" tabindex="0" aria-label="远程桌面画面"></canvas>${s.connected ? '' : '<div class="remote-connecting">正在获取画面…</div>'}</div>`
          : locked ? lockScreenHtml(device) : `<div class="remote-desktop" style="${s.reconnecting ? 'opacity:.45;filter:blur(1px)' : ''}">${fakeDesktopHtml(device, s)}</div>`}
        ${bannerHtml(s)}
        ${locked ? unlockPanelHtml(device, s) : ''}
        ${s.drawer ? sessionDrawerHtml(device, s) : ''}
        <div class="session-hint">${s.real ? '键盘输入直送远端 · Ctrl+Alt+Shift+E 结束会话 · 切回本机请先结束会话' : '键盘已捕获 · Ctrl+Alt+Shift+K 释放 · 右键发送到远端'}</div>
      </div>
      <div class="session-bottom">
        <span class="ok">● 已连接</span>
        <span data-session-duration>${formatDuration(s.duration)}</span>
        <span>${esc(s.qualityLabel)}</span>
        <span>${s.real ? '局域网直连' : '延迟 18ms'}</span>
        <span>${s.real ? 'WS · JPEG' : '丢包 0.2%'}</span>
        <span class="spacer"></span>
        <span>${s.real ? '局域网直连 · 本机审计' : 'P2P 直连 · TLS 1.3 · 本机审计'}</span>
      </div>
    </div>`;
  hydrateIcons(root);
  if (s.drawer === 'files') bindDropzone();
  if (s.real) {
    requestAnimationFrame(() => {
      bindRealCanvas();
      if (state.lastFrame) drawRemoteFrame(state.lastFrame);
    });
  }
}
function bannerHtml(s) {
  if (!s.banner) return '';
  const b = s.banner;
  return `<div class="session-banner ${b.type || ''}">${icon(b.type === 'warn' ? 'warn' : b.type === 'danger' ? 'warn' : 'info', 14)}<span>${esc(b.text)}</span>${(b.actions || []).map((a) => `<button class="s-banner-action" data-session-action="${a.action}">${esc(a.label)}</button>`).join('')}${b.closable ? `<button class="s-banner-close" data-session-action="dismiss-banner" aria-label="关闭">${icon('x', 12)}</button>` : ''}</div>`;
}
function lockScreenHtml(device) {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  return `<div class="remote-lock">
    <div class="lock-time">${time}</div>
    <div class="lock-date">${now.getMonth() + 1} 月 ${now.getDate()} 日 · 星期一</div>
    <div class="lock-user"><div class="lock-avatar">李</div><div class="lock-name">${esc(device.owner)}</div><div class="lock-hint">这台电脑已锁屏</div></div>
  </div>`;
}
function unlockPanelHtml(device, s) {
  return `<div class="unlock-wrap"><div class="unlock-panel" role="dialog" aria-modal="true" aria-label="无人值守解锁">
    <div class="unlock-title">${icon('unlock', 17)} 这台电脑已锁屏</div>
    <div class="unlock-sub">在本机输入，发送到工位电脑。密码只用于本次解锁，不保存、不写入日志。</div>
    <div class="unlock-field"><label for="unlockAccount">账户</label><select class="unlock-select" id="unlockAccount"><option>李伟（liwei）</option><option>王芳（wangfang）</option><option>其他账户…</option></select></div>
    <div class="unlock-field"><label for="unlockPassword">密码</label><div class="unlock-row"><input class="unlock-input" id="unlockPassword" type="password" placeholder="Windows 账户密码" autocomplete="off"><button class="session-btn" data-session-action="toggle-password" title="显示密码">显示</button></div><div class="unlock-hint">仅支持 Windows 账户密码；PIN、指纹、面容不能远程使用。</div></div>
    ${s.passwordError ? `<div class="unlock-error">${icon('warn', 12)}${esc(s.passwordError)}</div>` : ''}
    <div class="unlock-actions"><button class="btn btn-ghost" data-session-action="unlock-cancel">取消</button><span class="spacer"></span><button class="btn btn-primary" data-session-action="unlock">解锁</button></div>
    <div class="unlock-note">演示：输入 wrong 查看密码错误；输入其他任意密码解锁。真实实现中次数/锁定以 Windows 返回为准。</div>
  </div></div>`;
}
function fakeDesktopHtml(device, s) {
  const display = device.displays.find((d) => d.id === s.display) || device.displays[0];
  return `
    <div class="desktop-icon"><div class="di">${icon('folder', 16)}</div><span>项目资料</span></div>
    <div class="desktop-window">
      <div class="win-titlebar"><div class="win-dots"><i></i><i></i><i></i></div><div class="win-title">季度报表.xlsx — Excel</div><div class="win-controls">— □ ×</div></div>
      <div class="win-body">
        <div class="win-heading">Q4 预算执行</div>
        <div class="win-sub">财务部 · ${esc(device.owner)} · ${esc(display.label)} ${esc(display.res)}</div>
        <div class="win-table">
          <div class="wr header"><div class="wc">科目</div><div class="wc">说明</div><div class="wc">预算</div><div class="wc">执行</div></div>
          <div class="wr"><div class="wc">人力</div><div class="wc">工资、社保、公积金</div><div class="wc">1,200,000</div><div class="wc">86%<div class="bar"><i style="width:86%"></i></div></div></div>
          <div class="wr"><div class="wc">差旅</div><div class="wc">交通、住宿、补贴</div><div class="wc">180,000</div><div class="wc">62%<div class="bar"><i style="width:62%"></i></div></div></div>
          <div class="wr"><div class="wc">采购</div><div class="wc">设备、耗材</div><div class="wc">320,000</div><div class="wc">41%<div class="bar"><i style="width:41%"></i></div></div></div>
          <div class="wr"><div class="wc">培训</div><div class="wc">内训、外部课程</div><div class="wc">90,000</div><div class="wc">28%<div class="bar"><i style="width:28%"></i></div></div></div>
        </div>
      </div>
    </div>
    <div class="desktop-taskbar"><div class="taskbar-start">${icon('grid', 16)}</div><div class="taskbar-app active">${icon('file', 15)}</div><div class="taskbar-app">${icon('folder', 15)}</div><div class="taskbar-tray">${icon('wifi', 13)}<span>${esc(display.label)} · ${esc(display.res)}</span><span>${new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span></div></div>`;
}
function sessionDrawerHtml(device, s) {
  if (s.drawer === 'files') {
    const allowed = device.permissions.file;
    return `<aside class="session-drawer"><div class="session-drawer-head"><b>文件传输</b><button class="icon-btn" data-session-action="drawer-close" aria-label="关闭">${icon('x', 15)}</button></div><div class="session-drawer-body">
      ${allowed ? `<div class="dropzone" id="dropzone" data-session-action="pick-file" style="cursor:pointer">${icon('upload', 20)}<div>选择本地文件发送到 ${esc(device.name)}</div><div style="margin-top:3px;font-size:9px">文件写入被控端下载目录 NearSend；传输记录写入审计</div></div>` : `<div class="perm-summary" style="background:rgba(251,191,36,.08);border-color:rgba(251,191,36,.35);color:#fde68a">当前授权未开启文件传输。管理员默认关闭；请让设备所有者授权。</div>`}
      <div class="section-title" style="margin-top:13px;font-size:11px">传输队列</div>
      ${s.files.length ? s.files.map((f) => { const pct = f.done ? 100 : f.size ? Math.min(99, Math.round(((f.received || 0) / f.size) * 100)) : (f.progress || 0); return `<div class="file-row"><div class="file-ico">${icon('file', 14)}</div><div class="file-main"><b>${esc(f.name)}</b><span>${esc(f.size)} · ${f.error ? '失败' : f.done || pct >= 100 ? '已完成' : `传输中 ${pct}%`}</span><div class="file-progress"><i style="width:${pct}%"></i></div></div><button class="icon-btn" data-session-action="file-cancel" aria-label="取消">${icon('x', 14)}</button></div>`; }).join('') : `<div class="card-note" style="color:#8e9cb0">还没有文件。点击上方区域选择文件。</div>`}
      <div style="margin-top:10px;display:flex;gap:6px"><button class="btn btn-sm" data-session-action="pick-file">${icon('upload', 13)} 选择文件</button><button class="btn btn-sm" data-session-action="file-open">${icon('folder', 13)} 打开下载目录</button></div>
      <div class="card-note" style="color:#8e9cb0;margin-top:12px">只发送到被控端；不传输文件夹/系统文件。</div>
    </div></aside>`;
  }
  const startLabel = new Date(s.startAt || Date.now()).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  return `<aside class="session-drawer"><div class="session-drawer-head"><b>会话信息</b><button class="icon-btn" data-session-action="drawer-close" aria-label="关闭">${icon('x', 15)}</button></div><div class="session-drawer-body">
    <div class="card"><div class="card-head"><b>连接</b><span class="tag ok">${s.real ? '局域网直连' : 'P2P 直连'}</span></div><dl class="kv"><dt>设备</dt><dd>${esc(device.name)}</dd><dt>主机</dt><dd class="mono">${esc(device.host)}</dd><dt>控制端</dt><dd>${s.real ? '本机' : '李伟的笔记本'}</dd><dt>开始</dt><dd>今天 ${esc(startLabel)}</dd><dt>时长</dt><dd data-session-duration>${formatDuration(s.duration)}</dd></dl></div>
    <div class="card" style="margin-top:10px"><div class="card-head"><b>画质</b><span class="tag blue">${esc(s.qualityLabel)}</span></div><dl class="kv"><dt>请求</dt><dd>${esc(s.qualityLabel)}</dd><dt>实际</dt><dd>${s.real ? (s.capture === 'gdi' ? 'GDI · JPEG 帧' : 'WS · JPEG 帧') : '1080p60 · 7.2 Mbps'}</dd><dt>显示器</dt><dd>屏幕 ${s.display} · ${esc((device.displays.find((d) => d.id === s.display) || device.displays[0]).res)}</dd><dt>延迟</dt><dd class="mono" data-session-rtt>${s.real ? (s.rtt ? `${s.rtt} ms` : '测量中') : '18 ms · 丢包 0.2%'}</dd><dt>编码</dt><dd>${s.real ? (s.capture === 'gdi' ? 'GDI → JPEG' : 'JPEG') : 'H.264 · 4:2:0'}</dd></dl></div>
    <div class="card" style="margin-top:10px"><div class="card-head"><b>权限</b></div><div class="permission-summary">${PERMISSIONS.map((p) => `<span class="perm-chip ${device.permissions[p.key] ? '' : 'off'}">${icon(device.permissions[p.key] ? 'check' : 'x', 11)}${p.name}</span>`).join('')}</div><div class="card-note">${s.grant?.role === 'admin' ? '管理员临时支持：8 小时后到期；无人值守/剪贴板/文件/录制默认关闭。' : '本人设备：长期授权；录制默认关闭。'}</div></div>
    <div class="card" style="margin-top:10px"><div class="card-head"><b>安全</b></div><dl class="kv"><dt>传输</dt><dd>${s.real ? '局域网 WS · 无云端' : 'TLS 1.3 / DTLS-SRTP'}</dd><dt>审计</dt><dd>本机 + 设备</dd><dt>录制</dt><dd>${s.recording ? '录制中' : '关闭'}</dd></dl><div class="card-note">会话结束会释放按键；不保存 Windows 密码。锁屏/UAC 安全桌面需原生服务。</div></div>
    <button class="btn btn-sm" style="margin-top:10px" data-session-action="copy-diag">${icon('copy', 13)} 复制诊断信息</button>
  </div></aside>`;
}
function bindDropzone() {
  const dz = document.getElementById('dropzone');
  if (!dz) return;
  dz.addEventListener('dragover', (e) => { e.preventDefault(); dz.classList.add('drag'); });
  dz.addEventListener('dragleave', () => dz.classList.remove('drag'));
  dz.addEventListener('drop', async (e) => {
    e.preventDefault(); dz.classList.remove('drag');
    const files = [...(e.dataTransfer?.files || [])];
    if (!files.length || !state.session) return;
    let sent = 0;
    for (const f of files) {
      const p = f.path || f.filePath;
      if (!p) continue;
      const meta = await window.workspace.remote.sendFilePath(p);
      if (meta) { state.session.files.push({ ...meta, received: 0, progress: 0 }); sent += 1; }
    }
    if (sent) { toast(`正在发送 ${sent} 个文件`, 'success'); renderSession(); }
    else toast('无法读取文件路径；请用“选择文件”发送', 'warn');
  });
}
function formatBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
async function sessionAction(action) {
  const s = state.session;
  if (!s) return;
  const device = deviceById(s.deviceId);
  if (!device) return;
  if (action === 'disconnect' || action === 'close-session') { closeSession('用户结束'); return; }
  if (s.real && action === 'quality-menu') {
    const anchor = document.querySelector('[data-session-action="quality-menu"]');
    const opts = [['auto', '自动'], ['2k', '2K 2560×1440'], ['1080', '1080p'], ['720', '720p']];
    showMenu(anchor, opts.map(([key, text]) => ({
      text, icon: 'activity',
      action: () => {
        window.workspace.remote.setQuality(key);
        s.quality = key;
        s.qualityLabel = key === 'auto' ? '自动 · 1080p' : key === '2k' ? '2K · 2560×1440' : key === '1080' ? '1080p' : '720p';
        toast(`画质已切换为 ${s.qualityLabel}`, 'success');
        renderSession();
      },
    })));
    return;
  }
  if (s.real && action === 'display-menu') {
    const anchor = document.querySelector('[data-session-action="display-menu"]');
    const displays = Array.isArray(device.displays) && device.displays.length ? device.displays : [{ id: 1, primary: true }];
    showMenu(anchor, displays.map((d) => ({
      text: `${d.label || `屏幕 ${d.id}`}${d.primary ? '（主屏）' : ''}`, icon: s.display === d.id ? 'check' : 'display',
      action: () => {
        window.workspace.remote.setDisplay(d.id - 1);
        s.display = d.id;
        toast(`已切换到${d.label || `屏幕 ${d.id}`}`, 'success');
        renderSession();
      },
    })));
    return;
  }
  if (s.real && action === 'clipboard') {
    if (!device.permissions.clipboard) { toast('当前授权未开启剪贴板', 'warn'); return; }
    window.workspace.readClipboard().then((text) => {
      if (text) window.workspace.remote.clipboard(text);
      toast(text ? '本机剪贴板已发送到远端' : '剪贴板为空', text ? 'success' : 'warn');
    }).catch(() => toast('无法读取本机剪贴板', 'warn'));
    return;
  }
  if (s.real && action === 'files') {
    s.drawer = s.drawer === 'files' ? null : 'files';
    renderSession();
    return;
  }
  if (s.real && action === 'record') {
    if (!device.permissions.record) { toast('当前授权未开启录制', 'warn'); return; }
    if (s.recording) stopRecording(); else startRecording();
    return;
  }
  if (s.real && action === 'pick-file') {
    const meta = await window.workspace.remote.pickFile();
    if (meta) {
      s.files.push({ ...meta, received: 0, progress: 0 });
      s.drawer = 'files';
      renderSession();
      toast(`正在发送 ${meta.name}`, 'success');
    }
    return;
  }
  if (action === 'display-menu') {
    const anchor = document.querySelector('[data-session-action="display-menu"]');
    showMenu(anchor, device.displays.map((d) => ({ text: `${d.label} · ${d.res}${d.primary ? '（主屏）' : ''}`, icon: s.display === d.id ? 'check' : 'display', action: () => { s.display = d.id; toast(`已切换到${d.label}（不重连）`, 'success'); renderSession(); } })));
    return;
  }
  if (action === 'quality-menu') {
    const anchor = document.querySelector('[data-session-action="quality-menu"]');
    const opts = [
      ['auto', '自动（推荐）', '根据网络自动调整，优先稳定'],
      ['2k', '2K 2560×1440 60', device.twoK ? '12–25 Mbps · 需要硬件编码 + 强 Wi-Fi' : '当前设备不支持稳定 2K'],
      ['1080', '1080p 1920×1080 60', '6–12 Mbps'],
      ['720', '720p 1280×720 30', '3–6 Mbps'],
    ];
    showMenu(anchor, opts.map(([key, text, desc]) => ({ text, icon: s.quality === key ? 'check' : 'activity', disabled: key === '2k' && !device.twoK, action: () => {
      s.quality = key;
      s.qualityLabel = key === 'auto' ? '自动 · 1080p60' : key === '2k' ? '手动 · 2K60' : key === '1080' ? '手动 · 1080p60' : '手动 · 720p30';
      toast(`画质已切换为 ${s.qualityLabel}`, 'success');
      renderSession();
    } })));
    return;
  }
  if (action === 'clipboard') {
    if (!device.permissions.clipboard) { toast('当前授权未开启剪贴板', 'warn'); return; }
    s.clipboard = !s.clipboard;
    toast(s.clipboard ? '剪贴板同步已开启' : '剪贴板同步已关闭', 'success');
    renderSession(); return;
  }
  if (action === 'files') { s.drawer = s.drawer === 'files' ? null : 'files'; renderSession(); return; }
  if (action === 'info') { s.drawer = s.drawer === 'info' ? null : 'info'; renderSession(); return; }
  if (action === 'drawer-close') { s.drawer = null; renderSession(); return; }
  if (s.real && action === 'more') {
    const anchor = document.querySelector('[data-session-action="more"]');
    showMenu(anchor, [
      { text: s.recording ? '停止录制' : '开始录制', icon: 'record', action: () => sessionAction('record') },
      { text: '会话信息', icon: 'info', action: () => { s.drawer = 'info'; renderSession(); } },
      { text: '复制诊断信息', icon: 'copy', action: () => copyText(`REMOTE device=${device.name} peer=${device.ip} quality=${s.qualityLabel} transport=ws-jpeg`, '诊断信息已复制') },
      { sep: true },
      { text: '结束会话', icon: 'power', danger: true, action: () => closeSession('用户结束') },
    ]);
    return;
  }
  if (action === 'more') {
    const anchor = document.querySelector('[data-session-action="more"]');
    showMenu(anchor, [
      { text: '会话信息', icon: 'info', action: () => { s.drawer = 'info'; renderSession(); } },
      { text: s.recording ? '停止录制' : '开始录制', icon: 'record', action: () => {
        if (!device.permissions.record) { toast('当前授权未开启录制', 'warn'); return; }
        s.recording = !s.recording; toast(s.recording ? '开始录制（工位端会显示提示）' : '已停止录制并保存', s.recording ? 'warn' : 'success'); renderSession();
      } },
      { text: '发送 Ctrl+Alt+Del', icon: 'keyboard', action: () => toast('已发送 Ctrl+Alt+Del（原型）', 'success') },
      { text: '网络自检', icon: 'activity', action: () => { toast('会话结束后可运行网络自检；已复制诊断信息', 'success'); copyText('SESSION_DIAG device=财务部-李伟的工位 rtt=18ms loss=0.2% quality=1080p60', '诊断信息已复制'); } },
      { sep: true },
      { text: '结束会话', icon: 'power', danger: true, action: () => closeSession('用户结束') },
    ]);
    return;
  }
  if (action === 'unlock') {
    const input = document.getElementById('unlockPassword');
    const val = input?.value || '';
    if (!val) { s.passwordError = '请输入这台电脑的 Windows 账户密码。'; renderSession(); return; }
    if (val === 'wrong') { s.passwordError = '密码不正确，还可尝试 2 次。请使用 Windows 账户密码；PIN、指纹、面容不能远程使用。'; renderSession(); return; }
    s.passwordError = ''; s.locked = false; s.unlocked = true;
    device.status = 'online';
    toast('已解锁 · 14:32', 'success'); renderSession(); return;
  }
  if (action === 'unlock-cancel') { closeSession('用户结束'); return; }
  if (action === 'toggle-password') {
    const input = document.getElementById('unlockPassword');
    if (input) input.type = input.type === 'password' ? 'text' : 'password';
    return;
  }
  if (action === 'file-demo') {
    if (!device.permissions.file) { toast('当前授权未开启文件传输', 'warn'); return; }
    s.files.push({ name: `演示文件-${s.files.length + 1}.pdf`, size: '2.4 MB', progress: 34 });
    toast('已添加示例文件', 'success'); renderSession(); return;
  }
  if (action === 'file-cancel') { s.files.pop(); renderSession(); return; }
  if (action === 'file-open') { window.workspace.openDownloads(); return; }
  if (action === 'copy-diag') { const d = deviceById(s.deviceId); copyText(`SESSION device=${d?.name || ''} peer=${d?.ip || ''} quality=${s.qualityLabel} capture=${s.capture || 'n/a'} transport=ws-jpeg`, '诊断信息已复制'); return; }
  if (action === 'dismiss-banner') { s.banner = null; renderSession(); return; }
  if (action === 'degraded') {
    s.quality = '1080'; s.qualityLabel = '自动 · 1080p60';
    s.banner = { type: 'warn', text: '网络波动，已自动降低画质。当前 1080p，你可以锁定画质或查看详情。', actions: [{ label: '锁定画质', action: 'lock-quality' }, { label: '详情', action: 'info' }] };
    renderSession(); return;
  }
  if (action === 'lock-quality') { s.banner = { type: 'warn', text: '已锁定 1080p；持续卡顿时会提示，不会静默降档。', closable: true }; toast('已锁定 1080p', 'success'); renderSession(); return; }
  if (action === 'reconnect') {
    s.reconnecting = true;
    s.banner = { type: 'info', text: '连接中断，正在重连（2/5）… 约 4 秒后重试。', actions: [{ label: '取消', action: 'cancel-reconnect' }, { label: '诊断', action: 'info' }] };
    renderSession();
    setTimeout(() => { if (state.session) { state.session.reconnecting = false; state.session.banner = { type: 'info', text: '已恢复 · 用时 1.4s', closable: true }; renderSession(); toast('连接已恢复 · 用时 1.4s', 'success'); } }, 2200);
    return;
  }
  if (action === 'cancel-reconnect') { s.reconnecting = false; s.banner = null; renderSession(); toast('已取消重连', 'warn'); return; }
  if (action === 'expiry') {
    s.expired = true;
    s.banner = { type: 'danger', text: '授权将在 5 分钟后到期。到期后有 5 分钟宽限期。', actions: [{ label: '请求续期', action: 'renew-session' }, { label: '断开', action: 'disconnect' }] };
    renderSession(); return;
  }
  if (action === 'renew-session') { toast('已发送续期请求，等待工位确认（原型）', 'success'); s.banner = { type: 'info', text: '已发送续期请求；等待工位确认。', closable: true }; renderSession(); return; }
  if (action === 'takeover') {
    s.banner = { type: 'danger', text: '王芳请求接管这台电脑。接管需要工位确认，不会静默切换。', actions: [{ label: '允许', action: 'allow-takeover' }, { label: '拒绝', action: 'deny-takeover' }] };
    renderSession(); return;
  }
  if (action === 'allow-takeover') { closeSession('会话已被接管'); return; }
  if (action === 'deny-takeover') { s.banner = null; renderSession(); toast('已拒绝接管请求', 'success'); return; }
  if (action === 'password-error') { s.locked = true; s.unlocked = false; s.passwordError = '密码不正确，还可尝试 2 次。请使用 Windows 账户密码；PIN、指纹、面容不能远程使用。'; renderSession(); return; }
}

/* ---------- agent preview ---------- */
function toggleAgent(force) {
  state.agent = typeof force === 'boolean' ? force : !state.agent;
  if (state.agent) closeMenu();
  renderAgent();
}
function renderAgent() {
  const root = document.getElementById('agentRoot');
  if (!state.agent) { root.innerHTML = ''; return; }
  const rs = state.remote || {};
  const dev = rs.device || {};
  const on = rs.agentEnabled !== false;
  const active = rs.active;
  const ips = (dev.ips || []).map((x) => x.address).join(' · ');
  root.innerHTML = `<div class="agent-panel" role="dialog" aria-label="本机被控">
    <div class="agent-head"><div class="agent-ico">${icon('laptop', 16)}</div><div><b>本机被控 · ${esc(dev.host || '本机')}</b><span>${on ? '在线 · 可被同 Wi-Fi 设备连接' : '已关闭被控'}${ips ? ` · ${esc(ips)}` : ''}</span></div><button class="icon-btn" data-agent-action="close" aria-label="关闭">${icon('x')}</button></div>
    <div class="agent-body">
      <div class="agent-pill-preview">${icon('shield', 13)}<span>${on ? '近传 · 本机允许远程控制' : '近传 · 本机已暂停被控'}</span><span class="pill-actions"><button data-agent-action="copy-code">复制码</button><button data-agent-action="toggle">${on ? '暂停' : '开启'}</button></span></div>
      <div class="agent-section">
        <div class="agent-section-head">授权码 · 首次连接使用</div>
        <div class="agent-code-row">
          <div class="agent-code-main"><div class="agent-code">${esc(String(rs.code || '').replace(/(\d{3})(\d{3})/, '$1 $2'))}</div><div class="agent-code-sub">控制端输入后会被记住；关闭被控则拒绝新连接</div><div class="agent-code-actions"><button class="btn btn-sm" data-agent-action="copy-code">${icon('copy', 13)} 复制</button><button class="btn btn-sm" data-agent-action="refresh-code">${icon('refresh', 13)} 刷新</button></div></div>
        </div>
      </div>
      <div class="agent-section">
        <div class="agent-section-head">当前会话</div>
        ${active ? `<div class="agent-session-title">${icon('user', 14)} ${esc(active.controller || active.peerName || '控制端')} ${active.role === 'admin' ? '<span class="tag admin">管理员临时</span>' : ''} ${active.recording ? '<span class="tag red">录制中</span>' : ''}</div><div class="agent-session-meta">正在控制这台电脑 · ${esc(active.quality || 'auto')} · 屏幕 ${(active.display || 0) + 1}${active.role === 'admin' ? ' · 8 小时后到期' : ''}${active.recording ? ' · 本机会显示录制提示' : ''}</div><div class="agent-actions"><button class="btn btn-sm" data-agent-action="end-session">结束会话</button><button class="btn btn-sm" data-agent-action="send-file">发送文件给控制端</button><button class="btn btn-sm" data-agent-action="open-chat">打开消息</button></div>` : `<div class="agent-session-title">${icon('monitor', 14)} 当前没有远程会话</div><div class="agent-session-meta">${on ? '已授权控制端可在同一 Wi-Fi 下连接。' : '开启被控后，其他设备才能发现这台电脑。'}</div>`}
      </div>
      <div class="agent-quick">
        <button class="btn" data-agent-action="toggle">${icon(on ? 'pause' : 'play', 13)} ${on ? '暂停被控' : '开启被控'}</button>
        <button class="btn" data-agent-action="refresh-code">${icon('refresh', 13)} 刷新授权码</button>
        <button class="btn" data-agent-action="open-chat">${icon('chat', 13)} 团队群聊</button>
        <button class="btn" data-agent-action="settings">${icon('settings', 13)} 被控设置</button>
      </div>
      <div class="agent-section">
        <div class="agent-section-head">已授权控制端</div>
        ${(() => {
          const grants = Array.isArray(rs.grants) ? rs.grants : [];
          if (!grants.length) return `<div class="card-note">还没有授权控制端。控制端首次输入上方 6 位码后会出现在这里；可随时撤销。</div>`;
          return `<div class="agent-auth-list">${grants.map((g) => {
            const remain = g.expiresAt ? Math.max(0, Math.ceil((g.expiresAt - Date.now()) / 60000)) : null;
            const remainLabel = remain === null ? '长期' : remain >= 60 ? `剩余 ${Math.ceil(remain / 60)} 小时` : `剩余 ${remain} 分钟`;
            return `<div class="agent-auth-row"><div class="aa-main"><b>${esc(g.name || g.controllerId)}</b><span>${g.role === 'admin' ? `管理员临时支持 · ${remainLabel}` : `我的控制端 · 长期`} · 无人值守关</span></div>${g.role === 'admin' ? '<span class="tag admin">管理员</span>' : '<span class="tag ok">本人</span>'}<button class="icon-btn" data-agent-action="revoke" data-controller-id="${esc(g.controllerId)}" title="撤销">${icon('trash', 13)}</button></div>`;
          }).join('')}</div>`;
        })()}
      </div>
      <div class="agent-section">
        <div class="agent-section-head">本机信息</div>
        <dl class="kv" style="font-size:10.5px"><dt>主机名</dt><dd>${esc(dev.host || '—')}</dd><dt>地址</dt><dd class="mono">${esc(ips || '未发现 IPv4')}</dd><dt>端口</dt><dd class="mono">${esc(String(rs.port || '—'))}</dd><dt>版本</dt><dd class="mono">${esc(dev.version || '—')}</dd><dt>输入注入</dt><dd>${rs.helper?.exists ? '可用' : '缺少组件'}</dd></dl>
      </div>
    </div>
    <div class="agent-footer">${icon('shieldCheck', 12)} 同一 Wi-Fi · 6 位码配对 · 无云端</div>
  </div>`;
  hydrateIcons(root);
}
function drawFakeQr(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const size = 21;
  const cell = Math.floor(canvas.width / size);
  const off = Math.floor((canvas.width - cell * size) / 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#0f172a';
  let seed = 42;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const finder = (x < 7 && y < 7) || (x > size - 8 && y < 7) || (x < 7 && y > size - 8);
    if (finder) continue;
    if (rnd() > 0.53) ctx.fillRect(off + x * cell, off + y * cell, cell, cell);
  }
  const finder = (x, y) => {
    ctx.fillRect(off + x * cell, off + y * cell, 7 * cell, 7 * cell);
    ctx.fillStyle = '#fff'; ctx.fillRect(off + (x + 1) * cell, off + (y + 1) * cell, 5 * cell, 5 * cell);
    ctx.fillStyle = '#0f172a'; ctx.fillRect(off + (x + 2) * cell, off + (y + 2) * cell, 3 * cell, 3 * cell);
  };
  finder(0, 0); finder(size - 7, 0); finder(0, size - 7);
}
async function agentAction(action, el) {
  if (action === 'close') { toggleAgent(false); return; }
  if (action === 'copy-code') { copyText(state.remote?.code || '', '授权码已复制'); return; }
  if (action === 'revoke') {
    const id = el?.dataset.controllerId;
    if (!id) return;
    const ok = await window.workspace.remote.revokeGrant(id);
    if (ok) {
      const rs = await window.workspace.remote.state();
      state.remote = rs;
      renderAgent();
      toast('已撤销该控制端授权', 'success');
    } else toast('撤销失败：控制端不存在', 'warn');
    return;
  }
  if (action === 'refresh-code') {
    const code = await window.workspace.remote.refreshCode();
    if (state.remote) state.remote.code = code;
    toast('授权码已刷新', 'success'); renderAgent(); return;
  }
  if (action === 'toggle') {
    const next = !(state.remote?.agentEnabled !== false);
    const rs = await window.workspace.remote.agent(next);
    state.remote = rs; renderAgent(); toast(next ? '本机被控已开启' : '本机被控已暂停', next ? 'success' : 'warn'); return;
  }
  if (action === 'send-file') {
    if (state.remote?.active?.permissions?.file === false) { toast('当前授权未开启文件传输', 'warn'); return; }
    const meta = await window.workspace.remote.sendFileToController();
    toast(meta ? `正在发送 ${meta.name} 给控制端` : '没有活动会话或已取消', meta ? 'success' : 'warn');
    return;
  }
  if (action === 'end-session') {
    const rs = await window.workspace.remote.endActive();
    state.remote = rs; renderAgent(); toast('已结束当前会话', 'success'); return;
  }
  if (action === 'open-chat') { window.workspace.openChat(); return; }
  if (action === 'settings') { state.agent = false; renderAgent(); setView('settings'); state.settingsSection = 'security'; renderSettings(); return; }
}

/* ---------- command / modal / drawer bindings ---------- */
function bindModal() {
  const root = document.getElementById('modalRoot');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-modal-close]')) { closeModal(); return; }
    const wiz = e.target.closest('[data-wizard-action]');
    if (wiz) { handleWizard(wiz.dataset.wizardAction, wiz); return; }
    const info = e.target.closest('[data-info-index]');
    if (info) { const a = state.modalInfoActions?.[Number(info.dataset.infoIndex)]; a?.onClick?.(); return; }
    const act = e.target.closest('[data-modal-action]');
    if (act?.dataset.modalAction === 'add-role') {
      state.addRole = act.dataset.value === 'admin' ? 'admin' : 'owner';
      openAddDevice();
      return;
    }
    if (act?.dataset.modalAction === 'connect-peer') {
      const peerId = act.dataset.peerId;
      state.pendingRole = state.addRole;
      closeModal();
      const device = deviceById(`peer-${peerId}`);
      if (device) openSession(device.id); else toast('设备已离线', 'warn');
      return;
    }
    if (act?.dataset.modalAction === 'self-preview') {
      closeModal();
      const self = DEVICES.find((d) => d.real && d.self);
      if (self) openSession(self.id); else toast('本机被控未开启', 'warn');
      return;
    }
    if (act?.dataset.modalAction === 'refresh-peers') {
      refreshPeers().then(() => openAddDevice());
      return;
    }
    if (act?.dataset.modalAction === 'manual-connect') {
      const raw = (document.getElementById('manualAddr')?.value || '').trim();
      if (!raw) { toast('请输入 IP 地址', 'warn'); return; }
      state.pendingRole = state.addRole;
      window.workspace.remote.addManual(raw, 0).then(async (peer) => {
        const rs = await window.workspace.remote.state();
        state.remote = rs;
        mergeRemoteState(rs);
        closeModal();
        const device = deviceById(`peer-${peer.id}`);
        if (device) openSession(device.id); else toast('无法添加该地址', 'danger');
      }).catch((err) => toast(err.message || '地址添加失败', 'danger'));
      return;
    }
    if (act?.dataset.modalAction === 'backup-create') {
      const p1 = document.getElementById('backupPwd')?.value || '';
      const p2 = document.getElementById('backupPwd2')?.value || '';
      const err = document.getElementById('backupError');
      if (p1.length < 8) { if (err) { err.hidden = false; err.textContent = '密码至少 8 位。'; } return; }
      if (p1 !== p2) { if (err) { err.hidden = false; err.textContent = '两次输入的密码不一致。'; } return; }
      closeModal(); toast('加密备份已创建（原型）', 'success'); return;
    }
    if (act?.dataset.modalAction === 'pair-connect') {
      const code = (document.getElementById('pairCode')?.value || '').replace(/\D/g, '');
      if (code.length !== 6) { toast('请输入完整的 6 位授权码', 'warn'); return; }
      const resolve = state.pairResolve;
      state.pairResolve = null;
      closeModal();
      resolve?.(code);
      return;
    }
  });
  root.addEventListener('input', (e) => {
    const slot = e.target.closest('[data-code-index]');
    if (!slot) return;
    const idx = Number(slot.dataset.codeIndex);
    const val = slot.value.replace(/\D/g, '').slice(-1);
    slot.value = val;
    const w = state.wizard;
    if (!w) return;
    const arr = w.code.split('');
    arr[idx] = val;
    w.code = arr.join('').slice(0, 6);
    slot.classList.toggle('filled', !!val);
    slot.classList.toggle('active', !!val);
    if (val && idx < 5) document.querySelector(`[data-code-index="${idx + 1}"]`)?.focus();
    const nextBtn = document.querySelector('[data-wizard-action="next"]');
    if (nextBtn) nextBtn.disabled = w.code.length !== 6;
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'pairCode') {
      e.preventDefault();
      document.querySelector('[data-modal-action="pair-connect"]')?.click();
      return;
    }
    const slot = e.target.closest('[data-code-index]');
    if (slot && e.key === 'Backspace' && !slot.value) {
      const prev = document.querySelector(`[data-code-index="${Number(slot.dataset.codeIndex) - 1}"]`);
      prev?.focus();
    }
    if (e.key === 'Escape') closeModal();
  });
  root.addEventListener('paste', (e) => {
    const slot = e.target.closest('[data-code-index]');
    if (!slot) return;
    const text = (e.clipboardData?.getData('text') || '').replace(/\D/g, '').slice(0, 6);
    if (!text) return;
    e.preventDefault();
    const w = state.wizard;
    if (!w) return;
    w.code = text;
    document.querySelectorAll('[data-code-index]').forEach((el, i) => { el.value = text[i] || ''; el.classList.toggle('filled', !!text[i]); });
    const nextBtn = document.querySelector('[data-wizard-action="next"]');
    if (nextBtn) nextBtn.disabled = text.length !== 6;
    document.querySelector('[data-code-index="5"]')?.focus();
  });
}
function bindDrawer() {
  const root = document.getElementById('drawerRoot');
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-drawer-close]')) { closeDrawer(); return; }
    const act = e.target.closest('[data-drawer-action]');
    if (!act) return;
    const a = act.dataset.drawerAction;
    if (a === 'renew') { closeDrawer(); toast('已发送续期请求，等待工位确认（原型）', 'success'); }
    if (a === 'revoke') { closeDrawer(); openInfoModal({ title: '撤销授权', body: '<p style="font-size:11.5px;color:var(--ink-2);line-height:1.65">撤销后，该控制端将立即失去访问；如果正在会话，会话会结束。此操作写入审计，无法撤销。</p>', actions: [{ label: '取消', onClick: closeModal }, { label: '确认撤销', danger: true, primary: true, onClick: () => { closeModal(); toast('已撤销（原型）', 'success'); } }] }); }
    if (a === 'copy-audit') { copyText('evt_9f3c7d21e4c8', '事件 ID 已复制'); }
  });
}
function bindCommand() {
  const root = document.getElementById('commandRoot');
  root.addEventListener('input', (e) => { if (e.target.id === 'commandInput') { state.commandQuery = e.target.value; renderCommandList(e.target.value); } });
  root.addEventListener('click', (e) => {
    const dev = e.target.closest('[data-command-device]');
    if (dev) { closeCommand(); selectDevice(dev.dataset.commandDevice); setView('devices'); return; }
    const act = e.target.closest('[data-command-action]');
    if (act) { handleCommandAction(act.dataset.commandAction); return; }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeCommand();
    if (e.key === 'Enter') { const first = root.querySelector('.command-item'); if (first) first.click(); }
  });
}
function bindAgent() {
  const root = document.getElementById('agentRoot');
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-agent-action]');
    if (act) agentAction(act.dataset.agentAction, act);
  });
}
const VK = {
  Backspace: 8, Tab: 9, Enter: 13, ShiftLeft: 16, ShiftRight: 16, ControlLeft: 17, ControlRight: 17,
  AltLeft: 18, AltRight: 18, Pause: 19, CapsLock: 20, Escape: 27, Space: 32, PageUp: 33, PageDown: 34,
  End: 35, Home: 36, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, PrintScreen: 44, Insert: 45,
  Delete: 46, MetaLeft: 91, MetaRight: 92, ContextMenu: 93, Numpad0: 96, Numpad1: 97, Numpad2: 98,
  Numpad3: 99, Numpad4: 100, Numpad5: 101, Numpad6: 102, Numpad7: 103, Numpad8: 104, Numpad9: 105,
  NumpadMultiply: 106, NumpadAdd: 107, NumpadSubtract: 109, NumpadDecimal: 110, NumpadDivide: 111,
  Semicolon: 186, Equal: 187, Comma: 188, Minus: 189, Period: 190, Slash: 191, Backquote: 192,
  BracketLeft: 219, Backslash: 220, BracketRight: 221, Quote: 222,
};
for (let i = 65; i <= 90; i += 1) VK[`Key${String.fromCharCode(i)}`] = i;
for (let i = 0; i <= 9; i += 1) VK[`Digit${i}`] = 48 + i;
for (let i = 1; i <= 12; i += 1) VK[`F${i}`] = 111 + i;
function vkOf(e) {
  if (VK[e.code]) return VK[e.code];
  if (e.key && e.key.length === 1) {
    const c = e.key.toUpperCase().charCodeAt(0);
    if (c >= 32 && c <= 126) return c;
  }
  return 0;
}
function pointerNorm(e, canvas) {
  const r = canvas.getBoundingClientRect();
  const fr = state.frameRect || { x: 0, y: 0, w: r.width, h: r.height };
  const x = (e.clientX - r.left - fr.x) / Math.max(1, fr.w);
  const y = (e.clientY - r.top - fr.y) / Math.max(1, fr.h);
  return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}
function bindRealCanvas() {
  const canvas = document.getElementById('remoteCanvas');
  if (!canvas) return;
  canvas.focus();
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('pointermove', (e) => {
    const p = pointerNorm(e, canvas);
    window.workspace.remote.input({ kind: 'mouse', action: 'move', x: p.x, y: p.y, buttons: e.buttons });
  });
  canvas.addEventListener('pointerdown', (e) => {
    canvas.focus();
    try { canvas.setPointerCapture(e.pointerId); } catch {}
    const p = pointerNorm(e, canvas);
    window.workspace.remote.input({
      kind: 'mouse', action: 'down', button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
      x: p.x, y: p.y,
    });
  });
  canvas.addEventListener('pointerup', (e) => {
    const p = pointerNorm(e, canvas);
    window.workspace.remote.input({
      kind: 'mouse', action: 'up', button: e.button === 2 ? 'right' : e.button === 1 ? 'middle' : 'left',
      x: p.x, y: p.y,
    });
  });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    window.workspace.remote.input({ kind: 'mouse', action: 'wheel', delta: e.deltaY > 0 ? -120 : 120 });
  }, { passive: false });
}
function drawRemoteFrame(frame) {
  if (!frame || !frame.data) return;
  state.lastFrame = frame;
  if (state.session && frame.capture) state.session.capture = frame.capture;
  if (state.session) state.session.frameCount = (state.session.frameCount || 0) + 1;
  const hudCapture = document.getElementById('hudCapture');
  if (hudCapture && frame.capture === 'gdi') hudCapture.textContent = 'GDI · JPEG';
  const canvas = document.getElementById('remoteCanvas');
  if (!canvas) return;
  const img = new Image();
  img.onload = () => {
    const cw = canvas.clientWidth || 1280;
    const ch = canvas.clientHeight || 720;
    if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cw, ch);
    const scale = Math.min(cw / img.width, ch / img.height);
    const w = img.width * scale, h = img.height * scale;
    state.frameRect = { x: (cw - w) / 2, y: (ch - h) / 2, w, h };
    ctx.drawImage(img, state.frameRect.x, state.frameRect.y, w, h);
    const sess = state.session;
    if (sess?.recording && sess.recCanvas && sess.recCtx) {
      if (sess.recCanvas.width !== cw || sess.recCanvas.height !== ch) {
        sess.recCanvas.width = cw;
        sess.recCanvas.height = ch;
      }
      sess.recCtx.drawImage(canvas, 0, 0, cw, ch);
    }
  };
  img.src = `data:image/jpeg;base64,${frame.data}`;
}
async function startRecording() {
  const s = state.session;
  if (!s || !s.real) return;
  const canvas = document.getElementById('remoteCanvas');
  if (!canvas || !window.MediaRecorder) { toast('当前环境不支持录制', 'warn'); return; }
  try {
    const recCanvas = document.createElement('canvas');
    recCanvas.width = canvas.width || 1360;
    recCanvas.height = canvas.height || 792;
    const recCtx = recCanvas.getContext('2d');
    const stream = recCanvas.captureStream(5);
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 4_000_000 });
    s.recordingChunks = [];
    s.recCanvas = recCanvas;
    s.recCtx = recCtx;
    s.recStream = stream;
    rec.ondataavailable = (e) => { if (e.data && e.data.size) s.recordingChunks.push(e.data); };
    rec.onstop = async () => {
      const chunks = s.recordingChunks || [];
      s.recCanvas = null;
      s.recCtx = null;
      if (s.recStream) { try { s.recStream.getTracks().forEach((t) => t.stop()); } catch {} s.recStream = null; }
      if (!chunks.length) { toast('当前画面没有可保存的录制数据', 'warn'); return; }
      const blob = new Blob(chunks, { type: mime });
      const d = deviceById(s.deviceId);
      const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const name = `NearSend-${(d?.name || 'session').replace(/[\\/:*?"<>|]/g, '_')}-${stamp}.webm`;
      try {
        const buf = await blob.arrayBuffer();
        const saved = await window.workspace.saveRecording(name, buf);
        toast(saved ? `录制已保存：${saved}` : '已取消保存录制', saved ? 'success' : 'info');
      } catch (err) {
        toast(`录制保存失败：${err.message}`, 'danger');
      }
    };
    rec.start(1000);
    s.recorder = rec;
    s.recording = true;
    window.workspace.remote.setRecording?.(true);
    const chip = document.getElementById('recChip');
    if (chip) chip.hidden = false;
    toast('开始录制 · 工位端会显示录制提示', 'warn');
  } catch (err) {
    toast(`无法开始录制：${err.message}`, 'danger');
  }
}
function stopRecording() {
  const s = state.session;
  if (!s) return;
  try { s.recorder?.stop(); } catch {}
  s.recorder = null;
  s.recording = false;
  window.workspace.remote.setRecording?.(false);
  const chip = document.getElementById('recChip');
  if (chip) chip.hidden = true;
  toast('已停止录制，正在保存…', 'success');
}

function sendRemoteKey(e, down) {
  const vk = vkOf(e);
  if (!vk) return false;
  window.workspace.remote.input({ kind: 'key', action: down ? 'down' : 'up', vk });
  return true;
}

function bindSession() {
  const root = document.getElementById('sessionRoot');
  root.addEventListener('click', (e) => {
    const act = e.target.closest('[data-session-action]');
    if (act) sessionAction(act.dataset.sessionAction);
  });
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'unlockPassword') { e.preventDefault(); sessionAction('unlock'); }
    if (e.key === 'Escape') { closeMenu(); }
  });
}

/* ---------- main / shell bindings ---------- */
function selectDevice(id) {
  state.selectedDeviceId = id;
  if (state.view !== 'devices') setView('devices'); else renderDevices();
}
function confirmRemoveDevice(device) {
  openInfoModal({
    title: '移除设备',
    sub: device.name,
    body: `<div class="perm-summary" style="background:var(--red-soft);border-color:var(--red-line);color:var(--red)">移除只删除本机清单，不会卸载工位电脑上的 Agent，也不会自动撤销工位授权。建议先在工位电脑上撤销。</div>
      <div class="field" style="margin-top:12px"><label for="removeName">输入设备名确认 <em>*</em></label><input class="input" id="removeName" placeholder="${esc(device.name)}"></div>`,
    actions: [
      { label: '取消', onClick: closeModal },
      { label: '移除', danger: true, primary: true, onClick: async () => {
        closeModal();
        if (device.real && device.peerId) {
          const ok = await window.workspace.remote.forgetPeer(device.peerId);
          if (ok) {
            const rs = await window.workspace.remote.state();
            mergeRemoteState(rs);
            if (state.selectedDeviceId === device.id) state.selectedDeviceId = DEVICES[0]?.id || null;
            render();
            toast('已从本机设备列表移除', 'success');
          } else toast('无法移除本机设备或设备不存在', 'warn');
          return;
        }
        DEVICES = DEVICES.filter((d) => d.id !== device.id);
        if (state.selectedDeviceId === device.id) state.selectedDeviceId = DEVICES[0]?.id || null;
        render();
        toast('已移除示例设备', 'success');
      } },
    ],
  });
}
function handleMainClick(e) {
  const act = e.target.closest('[data-action]');
  if (act) {
    const a = act.dataset.action;
    const device = deviceById(act.dataset.deviceId || state.selectedDeviceId);
    if (a === 'add-device') { state.addRole = 'owner'; openAddDevice(); }
    else if (a === 'refresh') toast('状态已刷新 · 10:32', 'success');
    else if (a === 'refresh-grants') {
      window.workspace.remote.state().then((rs) => { state.remote = rs; mergeRemoteState(rs); renderGrants(); toast('授权已刷新', 'success'); }).catch(() => toast('刷新失败', 'danger'));
    }
    else if (a === 'filter') { state.filter = act.dataset.value; renderDevices(); }
    else if (a === 'filter-more') showMenu(act, [{ label: '更多筛选' }, { text: '只看离线', icon: 'clock', action: () => { state.filter = 'attention'; renderDevices(); } }, { text: '只看我管理的', icon: 'shield', action: () => { state.filter = 'managed'; renderDevices(); } }, { text: '清除筛选', icon: 'x', action: () => { state.filter = 'all'; state.search = ''; renderDevices(); } }]);
    else if (a === 'clear-search') { state.search = ''; state.filter = 'all'; renderDevices(); }
    else if (a === 'detail-tab') { state.detailTab = act.dataset.value; renderDevices(); }
    else if (a === 'device-more') { e.stopPropagation(); showDeviceMenu(act, device); }
    else if (a === 'open-session') { openSession(act.dataset.deviceId || device.id); }
    else if (a === 'resume-session') { if (state.session) renderSession(); else openSession(device.id); }
    else if (a === 'offline-help') openOfflineModal(device);
    else if (a === 'version-help') openVersionModal(device);
    else if (a === 'unattended-help') openUnattendedModal(device);
    else if (a === 'paused-help') openInfoModal({ title: '已暂停远程访问', sub: device.name, body: '<p style="font-size:11.5px;color:var(--ink-2)">员工在工位端暂停了远程访问；恢复后即可连接。</p>', actions: [{ label: '关闭', primary: true, onClick: closeModal }] });
    else if (a === 'renew-device') toast('已发送续期请求，等待工位确认（原型）', 'success');
    else if (a === 'view-sessions') setView('sessions');
    else if (a === 'view-audit') setView('audit');
    else if (a === 'view-devices') setView('devices');
    else if (a === 'go-diagnostics') setView('diagnostics');
    else if (a === 'open-grant') openGrantDrawer(act.dataset.grantId);
    else if (a === 'open-audit') openAuditDrawer(act.dataset.auditId);
    else if (a === 'save-device') toast('设备信息已保存到本机清单', 'success');
    else if (a === 'export-diag') window.workspace.remote.exportDiag().then((p) => toast(p ? `诊断包已导出：${p}` : '已取消', p ? 'success' : 'info'));
    else if (a === 'remove-device') confirmRemoveDevice(device);
    else if (a === 'grant-tab') { state.grantTab = act.dataset.value; renderGrants(); }
    else if (a === 'revoke-inbound') {
      const cid = act.dataset.controllerId;
      const g = (state.remote?.grants || []).find((x) => x.controllerId === cid);
      openInfoModal({
        title: '撤销控制端授权',
        sub: g?.name || cid,
        body: `<div class="perm-summary" style="background:var(--red-soft);border-color:var(--red-line);color:var(--red)">撤销后，该控制端将立即断开，且需要重新输入 6 位码才能连接。正在录制的会话也会停止。</div>`,
        actions: [
          { label: '取消', onClick: closeModal },
          { label: '确认撤销', danger: true, primary: true, onClick: async () => {
            closeModal();
            const ok = await window.workspace.remote.revokeGrant(cid);
            const rs = await window.workspace.remote.state();
            state.remote = rs;
            mergeRemoteState(rs);
            renderGrants();
            toast(ok ? '已撤销该控制端' : '撤销失败', ok ? 'success' : 'warn');
          } },
        ],
      });
    }
    else if (a === 'end-outbound') { closeSession('用户结束'); setView('grants'); }
    else if (a === 'grant-filter') toast(`筛选：${act.textContent.trim()}（原型）`, 'success');
    else if (a === 'audit-filter') { state.auditFilter = act.dataset.value; renderAudit(); }
    else if (a === 'verify-audit') { mergeRemoteAudit(); toast('本机审计已刷新', 'success'); }
    else if (a === 'export-audit') window.workspace.remote.exportAudit().then((p) => toast(p ? `审计已导出：${p}` : '已取消', p ? 'success' : 'info'));
    else if (a === 'run-diag') runDiagnostics();
    else if (a === 'copy-diag') copyText(`NEAR-SEND DIAG\n${JSON.stringify(state.diag || {}, null, 2)}`, '诊断结果已复制，可发给 IT');
    else if (a === 'open-backup') openBackupModal();
    else if (a === 'check-update') toast('内测版不提供自动更新，请从发布页下载新安装包', 'info');
    else if (a === 'open-help') window.workspace.openHelp();
    else if (a === 'open-data-dir') window.workspace.openDataDir();
    else if (a === 'remote-unlock-help') openInfoModal({
      title: '锁屏与 UAC 安全桌面',
      body: `<div class="perm-summary" style="background:var(--amber-soft);border-color:var(--amber-line)">内测版只覆盖已登录的 Windows 桌面，不能在锁屏或 UAC 界面注入输入。</div><div class="card-note">真实安全桌面解锁需要安装 Windows 服务，并使用 Windows 账户密码；PIN、指纹、面容不能远程使用。这不在当前内测范围内。</div>`,
      actions: [{ label: '知道了', primary: true, onClick: closeModal }],
    });
    else if (a === 'update-history') toast('更新历史：1.0.3 / 1.0.2 / 1.0.1', 'success');
    else if (a === 'settings-section') { state.settingsSection = act.dataset.value; renderSettings(); }
    else if (a === 'set-theme') { state.theme = act.dataset.value; localStorage.setItem('rd-theme', state.theme); render(); window.workspace.theme(document.documentElement.dataset.theme); }
    else if (a === 'set-density') { state.density = act.dataset.value; localStorage.setItem('rd-density', state.density); render(); }
    else if (a === 'setting-toggle') {
      const on = act.classList.toggle('on');
      act.setAttribute('aria-checked', String(on));
      const label = act.getAttribute('aria-label') || '';
      state.uiSettings[label] = on;
      try { localStorage.setItem('ns-ui-settings', JSON.stringify(state.uiSettings)); } catch {}
      if (label === '启动时打开') window.workspace.setAutostart(on).catch(() => {});
      toast(on ? '已开启' : '已关闭', 'success');
    }
    else if (a === 'session-detail') {
      const s = SESSION_HISTORY.find((x) => x.id === act.dataset.sessionId);
      if (s) {
        const d = deviceById(s.deviceId);
        openInfoModal({
          title: '会话详情',
          sub: d?.name || '本机设备',
          body: `<dl class="kv"><dt>时间</dt><dd>${esc(s.date)}</dd><dt>时长</dt><dd>${esc(s.duration)}</dd><dt>画质</dt><dd>${esc(s.quality)}</dd><dt>延迟</dt><dd class="mono">${esc(s.latency)}</dd><dt>结果</dt><dd>${esc(s.result)}</dd><dt>结束原因</dt><dd>${esc(s.reason)}</dd></dl>`,
          actions: [{ label: '关闭', primary: true, onClick: closeModal }],
        });
      }
    }
    else if (a === 'export-sessions') {
      const rows = SESSION_HISTORY.filter((s) => deviceById(s.deviceId) && !deviceById(s.deviceId).demo);
      const head = ['时间', '设备', '主机', '时长', '画质', '延迟', '结果', '结束原因'];
      const csv = [head, ...rows.map((s) => {
        const d = deviceById(s.deviceId);
        return [s.date, d?.name || '', d?.host || '', s.duration, s.quality, s.latency, s.result, s.reason];
      })].map((r) => r.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
      window.workspace.saveText(`nearsend-sessions-${new Date().toISOString().slice(0, 10)}.csv`, csv)
        .then((p) => toast(p ? `会话记录已导出：${p}` : '已取消导出', p ? 'success' : 'info'))
        .catch((err) => toast(`导出失败：${err.message}`, 'danger'));
    }
    else if (a === 'open-agent') toggleAgent(true);
    else if (a === 'open-team-chat') window.workspace.openChat();
    else if (a === 'dm-team') { state.dmPeerId = null; renderMessages(); }
    else if (a === 'dm-peer') { state.dmPeerId = act.dataset.peerId; renderMessages(); }
    else if (a === 'dm-back') { state.dmPeerId = null; renderMessages(); }
    else if (a === 'dm-send') sendDM(act.dataset.peerId);
    else return;
    return;
  }
  const row = e.target.closest('[data-device-id]');
  if (row) selectDevice(row.dataset.deviceId);
}
function handleMainKeydown(e) {
  const row = e.target.closest('[data-device-id]');
  if (row && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); selectDevice(row.dataset.deviceId); }
}
async function runDiagnostics() {
  if (state.diagRunning) return;
  state.diagRunning = true;
  renderDiagnostics();
  try { state.diag = await window.workspace.remote.diagnostics(); } catch {}
  setTimeout(() => {
    state.diagRunning = false;
    state.diagDone = true;
    renderDiagnostics();
    toast(state.diag?.helperExists ? '检查完成 · 输入注入可用' : '检查完成 · 输入组件缺失', state.diag?.helperExists ? 'success' : 'warn');
  }, 900);
}
function copyText(text, msg = '已复制') {
  const done = () => toast(msg, 'success');
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(() => { fallbackCopy(text); done(); });
  } else { fallbackCopy(text); done(); }
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
  document.body.appendChild(ta); ta.select();
  try { document.execCommand('copy'); } catch {}
  ta.remove();
}
function toast(msg, type = 'info') {
  const root = document.getElementById('toastRoot');
  if (!root) return;
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `${icon(type === 'success' ? 'check' : type === 'warn' ? 'warn' : type === 'danger' ? 'x' : 'info', 14)}<span>${esc(msg)}</span>`;
  root.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateY(4px)'; el.style.transition = 'all 160ms'; setTimeout(() => el.remove(), 180); }, 3600);
}
function toggleTheme() {
  state.theme = state.theme === 'light' ? 'dark' : 'light';
  localStorage.setItem('rd-theme', state.theme);
  render();
  window.workspace.theme(document.documentElement.dataset.theme);
}
function bindWindowControls() {
  document.getElementById('winMin')?.addEventListener('click', () => window.workspace.window('minimize'));
  document.getElementById('winMax')?.addEventListener('click', () => window.workspace.window('maximize'));
  document.getElementById('winClose')?.addEventListener('click', () => window.workspace.window('close'));
}
function handleSessionLocalShortcut(e) {
  const k = e.key.toLowerCase();
  if (k === 'q') sessionAction('quality-menu');
  else if (k === 'm') sessionAction('display-menu');
  else if (k === 'c') sessionAction('clipboard');
  else if (k === 't') sessionAction('files');
  else if (k === 'e') closeSession('用户结束');
  else if (k === 'f') toast('全屏由窗口最大化控制（V1）', 'info');
  else return false;
  [16, 17, 18].forEach((vk) => window.workspace.remote.input({ kind: 'key', action: 'up', vk }));
  return true;
}
function bindShell() {
  document.querySelectorAll('.nav-item').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.getElementById('btnAddDevice')?.addEventListener('click', openAddDevice);
  document.getElementById('btnAgentPreview')?.addEventListener('click', () => toggleAgent());
  document.getElementById('btnTheme')?.addEventListener('click', toggleTheme);
  document.getElementById('btnDemo')?.addEventListener('click', (e) => showDemoMenu(e.currentTarget));
  document.getElementById('globalSearch')?.addEventListener('click', openCommand);
  document.addEventListener('keydown', (e) => {
    if (state.session?.real) {
      if (e.ctrlKey && e.altKey && e.shiftKey) {
        if (handleSessionLocalShortcut(e)) { e.preventDefault(); return; }
      }
      if (e.key === 'Escape' || e.key === 'Tab' || e.key === 'F5' || e.key === 'F11' || e.key === 'F12') {
        e.preventDefault();
        sendRemoteKey(e, true); sendRemoteKey(e, false); return;
      }
      if (sendRemoteKey(e, true)) { e.preventDefault(); return; }
    }
    if (e.ctrlKey && !e.altKey && e.key.toLowerCase() === 'k') { e.preventDefault(); openCommand(); return; }
    if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'a') { e.preventDefault(); toggleAgent(); return; }
    if (e.ctrlKey && !e.altKey && /^[1-7]$/.test(e.key)) {
      const views = ['devices', 'sessions', 'messages', 'grants', 'audit', 'diagnostics', 'settings'];
      e.preventDefault(); setView(views[Number(e.key) - 1]); return;
    }
    if (e.key === 'Escape') {
      if (state.menuEl) { closeMenu(); return; }
      if (state.command) { closeCommand(); return; }
      if (document.getElementById('drawerRoot')?.innerHTML) { closeDrawer(); return; }
      if (document.getElementById('modalRoot')?.innerHTML) { closeModal(); return; }
    }
  });
  document.addEventListener('keyup', (e) => {
    if (state.session?.real && !(e.ctrlKey && e.altKey && e.shiftKey)) sendRemoteKey(e, false);
  });
}
function bindMain() {
  const main = document.getElementById('main');
  main.addEventListener('click', handleMainClick);
  main.addEventListener('keydown', handleMainKeydown);
  main.addEventListener('dblclick', (e) => {
    const row = e.target.closest('[data-device-id]');
    if (row) openSession(row.dataset.deviceId);
  });
}
// PART3

