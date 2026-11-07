'use strict';
const { execFile } = require('child_process');
const { app } = require('electron');

const RUN_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run';
const VALUE = 'LanDrop';

/** 便携版解压运行时 process.execPath 指向临时目录，必须用原始 exe 路径 */
function targetExe() {
  return process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
}

function command() {
  const exe = targetExe();
  // 开发态直接跑 electron.exe，需要显式带上应用目录
  return app.isPackaged ? `"${exe}" --hidden` : `"${exe}" "${app.getAppPath()}" --hidden`;
}

function reg(args) {
  return new Promise((resolve) => {
    execFile('reg', args, { windowsHide: true }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: String(stdout || '') + String(stderr || '') });
    });
  });
}

async function enable() {
  const r = await reg(['add', RUN_KEY, '/v', VALUE, '/t', 'REG_SZ', '/d', command(), '/f']);
  return r.ok;
}

async function disable() {
  const r = await reg(['delete', RUN_KEY, '/v', VALUE, '/f']);
  return r.ok;
}

async function status() {
  const r = await reg(['query', RUN_KEY, '/v', VALUE]);
  if (!r.ok) return { enabled: false, stale: false };
  const enabled = r.out.includes(VALUE);
  const stale = enabled && !r.out.includes(targetExe());
  return { enabled, stale };
}

/** 自启动开启时每次启动都重写一遍，顺便修复 exe 被移动后的失效路径 */
async function sync(wanted) {
  const st = await status();
  if (wanted) {
    if (!st.enabled || st.stale) await enable();
  } else if (st.enabled) {
    await disable();
  }
  return status();
}

module.exports = { enable, disable, status, sync, targetExe };
