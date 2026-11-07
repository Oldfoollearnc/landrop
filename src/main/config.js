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
    sound: true,
    notify: true,
    saveDir: path.join(app.getPath('downloads'), 'LanDrop'),
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
    cache = Object.assign(base, raw);
  } catch {
    cache = base;
    existed = false;
  }
  if (!cache.token) cache.token = crypto.randomBytes(12).toString('base64url');

  // 旧版主题名迁移：mono -> dark，blue -> light
  let dirty = !existed;
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
