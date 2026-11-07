'use strict';
const os = require('os');

// 虚拟网卡一律排除：这些地址手机根本连不到
const VIRTUAL = /(vmware|vethernet|hyper-v|virtualbox|loopback|npcap|wsl|docker|bluetooth|蓝牙|tap-|tun\d|vpn|zerotier|tailscale|radmin|hamachi|virtual)/i;
const PHYSICAL = /(wlan|wi-?fi|wireless|无线|以太网|ethernet|eth\d|en\d)/i;

function isPrivate(ip) {
  return /^10\./.test(ip)
    || /^192\.168\./.test(ip)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(ip);
}

function score(nic) {
  let s = 0;
  if (PHYSICAL.test(nic.name)) s += 100;
  if (nic.address.startsWith('192.168.')) s += 20;
  else if (nic.address.startsWith('10.')) s += 10;
  else if (/^172\.(1[6-9]|2\d|3[01])\./.test(nic.address)) s += 5;
  if (isPrivate(nic.address)) s += 30;
  return s;
}

function listNics() {
  const physical = [];
  const ignored = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' || a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      const item = { name, address: a.address, virtual: VIRTUAL.test(name) };
      (item.virtual ? ignored : physical).push(item);
    }
  }
  const pool = physical.length ? physical : ignored;
  return pool.sort((a, b) => score(b) - score(a));
}

function pickNic(preferredName) {
  const nics = listNics();
  if (!nics.length) return null;
  if (preferredName) {
    const hit = nics.find((n) => n.name === preferredName);
    if (hit) return hit;
  }
  return nics[0];
}

// Host 头白名单用：本机所有 IPv4 都算合法目标
function localAddresses() {
  const set = new Set(['127.0.0.1', 'localhost', '::1']);
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family === 'IPv4') set.add(a.address);
    }
  }
  return set;
}

module.exports = { listNics, pickNic, localAddresses, isPrivate };
