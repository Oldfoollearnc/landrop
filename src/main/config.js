'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app } = require('electron');

let cache = null;
let configPath = null;

function file() {
  if (!configPath) configPath = path.join(app.getPath('userData'), 'config.json');
  return configPath;
}

function defaults() {
  return {
    token: crypto.randomBytes(12).toString('base64url'),
    theme: 'dark',
    font: 'm',
    sound: true,
    notify: true,
    saveDir: path.join(app.getPath('downloads'), 'NearSend'),
    autostart: true,
    nic: '',
    port: 8899,
    fullX: null,
    fullY: null,
  };
}

function load() {
  if (cache) return cache;
  const base = defaults();
  let existed = true;
  try {
    const raw = JSON.parse(fs.readFileSync(file(), 'utf8'));
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('invalid config');
    // JSON 里的 __proto__ 会通过 Object.assign 改掉原型的 setter
    delete raw.__proto__;
    delete raw.constructor;
    delete raw.prototype;
    cache = Object.assign(base, raw);
  } catch {
    cache = base;
    existed = false;
  }
  let dirty = !existed;
  // 配置文件被手工改坏时不能让启动直接失败；token 必须是可放进 URL/头部的稳定字符串
  if (typeof cache.token !== 'string' || !/^[A-Za-z0-9_-]{8,128}$/.test(cache.token)) {
    cache.token = crypto.randomBytes(12).toString('base64url');
    dirty = true;
  }
  if (!Number.isInteger(cache.port) || cache.port < 1 || cache.port > 65535) {
    cache.port = 8899;
    dirty = true;
  }
  if (typeof cache.saveDir !== 'string' || !cache.saveDir.trim()) {
    cache.saveDir = base.saveDir;
    dirty = true;
  }

  // 旧版主题名迁移：mono -> dark，blue -> light
  if (cache.theme === 'mono') {
    cache.theme = 'dark';
    dirty = true;
  } else if (cache.theme === 'blue') {
    cache.theme = 'light';
    dirty = true;
  } else if (cache.theme !== 'dark' && cache.theme !== 'light') {
    cache.theme = 'dark';
    dirty = true;
  }

  // 首次运行立即落盘：token 必须稳定，否则每次启动二维码都会变，手机书签失效
  if (dirty) save();
  return cache;
}

function all() {
  return Object.assign({}, load());
}

function get(key) {
  return load()[key];
}

function save() {
  const p = file();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  const tmp = p + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
  fs.renameSync(tmp, p);
}

function patch(obj) {
  Object.assign(load(), obj);
  save();
  return all();
}

module.exports = { load, all, get, patch, file, save };
