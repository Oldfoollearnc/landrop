'use strict';
/**
 * 手机端端到端回归测试（真实 Chromium + 真实服务端，不 mock）
 *
 * 覆盖上一版最致命的缺陷：
 *   1. 连发多条文字，气泡必须从「待发送/发送中」变成已送达（时间 + 单勾）
 *   2. 刷新页面后再连发多条，仍然全部送达
 *      —— 旧版 cid 每次刷新都从 1 开始，服务端按 cid 去重后静默丢弃，
 *         气泡会永远停在「待发送」。
 *   3. 同一 cid 通过 HTTP 重发两次，只落库一条，第二次返回 duplicate + msg
 *
 * 用法：
 *   1. 先启动电脑端（npm start 或已安装的 NearSend.exe）
 *   2. node tools/e2e-mobile.js                 # 默认端口 8899 / 调试端口 9333
 *      node tools/e2e-mobile.js --port 8900
 *      node tools/e2e-mobile.js --screenshot docs/verify-mobile-e2e.png
 *
 * 依赖：ws（已是运行时依赖）。浏览器自动从 Edge / Chrome 里找。
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawn } = require('child_process');
const WebSocket = require('ws');

// ---------- 小工具 ----------

function arg(name, def) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  if (hit) return hit.slice(name.length + 3);
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && process.argv[at + 1] && !process.argv[at + 1].startsWith('--')) {
    return process.argv[at + 1];
  }
  return def;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function getJson(url, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (err) {
          reject(new Error(`不是 JSON：${body.slice(0, 120)}`));
        }
      });
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', reject);
  });
}

function readConfig() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  const file = path.join(base, 'NearSend', 'config.json');
  if (!fs.existsSync(file)) {
    throw new Error(`找不到 ${file}。请先启动一次电脑端（npm start 或安装版），让它生成配置。`);
  }
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function findBrowser() {
  const candidates = [
    process.env.NEARSOND_BROWSER,
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  ].filter(Boolean);
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error('没找到 Edge 或 Chrome。可用 NEARSOND_BROWSER 指定浏览器路径。');
}

class CDP {
  constructor(ws) {
    this.ws = ws;
    this.seq = 0;
    this.pending = new Map();
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        if (msg.error) reject(new Error(`${msg.error.message} (${msg.error.code})`));
        else resolve(msg.result);
      }
    });
  }

  static async connect(wsUrl) {
    const ws = new WebSocket(wsUrl, { perMessageDeflate: false, maxPayload: 64 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    return new CDP(ws);
  }

  send(method, params = {}, sessionId) {
    const id = ++this.seq;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;
    this.ws.send(JSON.stringify(payload));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(new Error(`${method} 超时`));
        }
      }, 15000);
    });
  }

  close() {
    try {
      this.ws.close();
    } catch {
      /* ignore */
    }
  }
}

// ---------- 页面里的探针 ----------

const PROBE_STATE = `(() => {
  const rows = [...document.querySelectorAll('.msg.out')];
  const bad = rows
    .filter((r) => /待发送|发送中|发送失败|未送达/.test(r.innerText))
    .map((r) => r.innerText.replace(/\\s+/g, ' ').slice(0, 80));
  return {
    ready: document.readyState,
    url: location.href,
    online: navigator.onLine,
    outgoing: rows.length,
    pending: bad.length,
    pendingSamples: bad.slice(0, 5),
    texts: rows.map((r) => (r.querySelector('.bubble') || r).innerText.replace(/\\s+/g, ' ').slice(0, 80)),
    ws: (window.__nsState && window.__nsState.connected) || null,
  };
})()`;

function probe() {
  return PROBE_STATE;
}

// ---------- 主流程 ----------

const checks = [];
function check(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`);
}

async function main() {
  const cfg = readConfig();
  const port = Number(arg('port', cfg.port || 8899));
  const debugPort = Number(arg('debug', 9333));
  const token = arg('token', cfg.token);
  const shot = arg('screenshot', '');
  const keepOpen = process.argv.includes('--keep-open');
  const total = Number(arg('total', 3));

  if (!token) throw new Error('配置里没有 token');

  const base = `http://127.0.0.1:${port}`;
  const pageUrl = `${base}/?t=${encodeURIComponent(token)}`;

  // 1. 服务端活着吗
  await getJson(`${base}/api/history?t=${encodeURIComponent(token)}`, 4000).catch((err) => {
    throw new Error(`电脑端没有在 ${port} 监听（${err.message}）。先启动近传再跑这个测试。`);
  });
  console.log(`电脑端 ${base} 正常，开始端到端测试\n`);

  // 2. 起一个干净的无头浏览器
  const browser = findBrowser();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'nearsend-e2e-'));
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-background-networking',
    `--remote-debugging-port=${debugPort}`,
    `--user-data-dir=${profile}`,
    '--window-size=400,860',
    pageUrl,
  ];
  console.log(`浏览器 ${path.basename(browser)}，端口 ${debugPort}`);
  const proc = spawn(browser, args, { stdio: 'ignore', windowsHide: true });

  try {
    // 3. 等调试端口
    let version = null;
    for (let i = 0; i < 40; i += 1) {
      version = await getJson(`http://127.0.0.1:${debugPort}/json/version`, 1000).catch(() => null);
      if (version && version.webSocketDebuggerUrl) break;
      await sleep(250);
    }
    if (!version) throw new Error('浏览器调试端口没起来');

    const browserCdp = await CDP.connect(version.webSocketDebuggerUrl);

    let target = null;
    for (let i = 0; i < 40; i += 1) {
      const list = await browserCdp.send('Target.getTargets');
      target = (list.targetInfos || []).find((t) => t.type === 'page' && t.url.includes(`127.0.0.1:${port}`));
      if (target) break;
      await sleep(250);
    }
    if (!target) throw new Error('没找到手机页面 target');

    const { sessionId } = await browserCdp.send('Target.attachToTarget', { targetId: target.targetId, flatten: true });
    const cdp = browserCdp;

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: 390, height: 844, deviceScaleFactor: 2, mobile: true,
    }, sessionId).catch(() => {});

    async function evaluate(expression, awaitPromise = false) {
      const r = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise,
        returnByValue: true,
      }, sessionId);
      if (r.exceptionDetails) {
        throw new Error(r.exceptionDetails.text || JSON.stringify(r.exceptionDetails));
      }
      return r.result.value;
    }

    async function ready() {
      for (let i = 0; i < 100; i += 1) {
        try {
          if (await evaluate(probe())) {
            if ((await evaluate('document.readyState')) === 'complete') return;
          }
        } catch {
          /* 导航中，重试 */
        }
        await sleep(100);
      }
      throw new Error('页面一直没加载完');
    }

    async function waitSettled(markers, timeout = 12000) {
      const deadline = Date.now() + timeout;
      let last = null;
      while (Date.now() < deadline) {
        last = await evaluate(probe());
        const texts = last.texts.join('\n');
        const allThere = markers.every((m) => texts.includes(m));
        if (allThere && last.pending === 0) return last;
        await sleep(200);
      }
      return last;
    }

    async function send(text) {
      const js = `(() => {
        const i = document.getElementById('input');
        const b = document.getElementById('send');
        if (!i || !b) return 'no-ui';
        i.value = ${JSON.stringify(text)};
        i.dispatchEvent(new Event('input', { bubbles: true }));
        b.click();
        return 'clicked';
      })()`;
      const r = await evaluate(js);
      if (r !== 'clicked') throw new Error(`发送按钮不可用：${r}`);
    }

    await ready();
    // 等 WS 连上（页面顶部离线提示消失）
    for (let i = 0; i < 60; i += 1) {
      const offline = await evaluate(`!!document.querySelector('.offline:not([hidden])')`);
      if (!offline) break;
      await sleep(250);
    }

    const stamp = Date.now().toString(36);
    const first = Array.from({ length: total }, (_, i) => `E2E-${stamp}-A${i + 1}`);
    const second = Array.from({ length: total }, (_, i) => `E2E-${stamp}-B${i + 1}`);

    // ---------- 第一轮：连发 ----------
    for (const t of first) await send(t);
    let st = await waitSettled(first);
    check(`第一轮 ${total} 条全部送达，没有「待发送」`, st && st.pending === 0 && first.every((m) => st.texts.join(' ').includes(m)),
      st ? `pending=${st.pending}` : '无状态');

    // ---------- 第二轮：刷新后连发（旧版必失败） ----------
    await cdp.send('Page.reload', { ignoreCache: false }, sessionId);
    await sleep(400);
    await ready();
    for (let i = 0; i < 60; i += 1) {
      const offline = await evaluate(`!!document.querySelector('.offline:not([hidden])')`);
      if (!offline) break;
      await sleep(250);
    }
    for (const t of second) await send(t);
    st = await waitSettled(second);
    check(`刷新页面后 ${total} 条仍然全部送达`, st && st.pending === 0 && second.every((m) => st.texts.join(' ').includes(m)),
      st ? `pending=${st.pending}` : '无状态');

    // ---------- 落库校验：每条只出现一次 ----------
    const history = await evaluate(`fetch('/api/history').then(r => r.json())`, true);
    const msgs = (history && history.messages) || [];
    const all = first.concat(second);
    const counts = all.map((m) => msgs.filter((x) => x.text === m).length);
    check('服务端每条消息只落库一条（无重复/无丢失）', counts.every((n) => n === 1), `counts=${counts.join(',')}`);

    // ---------- 同 cid 重发：返回 duplicate 且带 msg ----------
    const cid = `e2e-dup-${stamp}`;
    const dup = await evaluate(`(async () => {
      const one = await fetch('/api/send/text', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'E2E-${stamp}-DUP', cid: '${cid}' })
      }).then(r => r.json());
      const two = await fetch('/api/send/text', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: 'E2E-${stamp}-DUP', cid: '${cid}' })
      }).then(r => r.json());
      return { one, two };
    })()`, true);
    check('同 cid 重发第二次返回 duplicate:true', !!(dup && dup.two && dup.two.duplicate === true),
      dup && dup.two ? `duplicate=${dup.two.duplicate}` : '无响应');
    check('duplicate 响应带回已落库的消息体', !!(dup && dup.two && dup.two.msg && dup.two.msg.id && dup.two.msg.id === dup.one.id),
      dup && dup.two && dup.two.msg ? `id=${dup.two.msg.id}` : '无 msg');

    const history2 = await evaluate(`fetch('/api/history').then(r => r.json())`, true);
    const dupCount = ((history2 && history2.messages) || []).filter((x) => x.text === `E2E-${stamp}-DUP`).length;
    check('重复 cid 只落库一条', dupCount === 1, `count=${dupCount}`);

    // ---------- 假连接 / 断网 → 重连自动补发（可选，--offline） ----------
    // DevTools 的 offline 只影响 HTTP，不影响已建立的 WebSocket，
    // 这里在页面里注入故障：send 的帧直接丢弃（模拟锁屏/切网后的假连接），
    // 同时让 HTTP 兜底也失败，完整走一遍「发送中 → 判死 → 重连 → 补发」。
    if (process.argv.includes('--offline')) {
      const offlineText = `E2E-${stamp}-OFF`;
      const injected = await evaluate(`(() => {
        window.__nsSavedSend = WebSocket.prototype.send;
        window.__nsSavedFetch = window.fetch;
        WebSocket.prototype.send = function () { return; };
        window.fetch = function () { return Promise.reject(new TypeError('simulated offline')); };
        return true;
      })()`);
      check('故障注入成功（模拟帧丢失 + HTTP 不通）', injected === true);

      await send(offlineText);
      await sleep(2000);
      const down = await evaluate(probe());
      check('假连接时消息不会假装已送达，停在待发送/发送中', !!down && down.pending >= 1,
        down ? `pending=${down.pending}` : '无状态');

      // 恢复“网络”：还原 send/fetch，并像系统恢复联网一样触发 online
      await evaluate(`(() => {
        WebSocket.prototype.send = window.__nsSavedSend;
        window.fetch = window.__nsSavedFetch;
        window.dispatchEvent(new Event('online'));
        return true;
      })()`);

      let recovered = false;
      let lastProbe = null;
      const deadline = Date.now() + 75000;
      while (Date.now() < deadline) {
        lastProbe = await evaluate(probe());
        if (lastProbe.pending === 0 && lastProbe.texts.join(' ').includes(offlineText)) {
          recovered = true;
          break;
        }
        await sleep(500);
      }
      check('恢复网络后自动补发成功（无需手动重发）', recovered,
        lastProbe ? `pending=${lastProbe.pending}` : '无状态');

      const h3 = await evaluate(`fetch('/api/history').then(r => r.json())`, true);
      const offCount = ((h3 && h3.messages) || []).filter((x) => x.text === offlineText).length;
      check('断网消息补发后只落库一条', offCount === 1, `count=${offCount}`);
    }

    // ---------- 截图（可选，用来看气泡状态） ----------
    if (shot) {
      const data = await cdp.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId);
      const out = path.resolve(process.cwd(), shot);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, Buffer.from(data.data, 'base64'));
      console.log(`\n截图：${out}`);
    }

    if (keepOpen) {
      console.log('\n--keep-open：浏览器保持打开，按 Ctrl+C 结束');
      await new Promise(() => {});
    }

    browserCdp.close();
  } finally {
    if (!keepOpen) {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
      await sleep(300);
      try {
        fs.rmSync(profile, { recursive: true, force: true });
      } catch {
        /* ignore */
      }
    }
  }

  const failed = checks.filter((c) => !c.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} 项通过`);
  if (failed.length) {
    console.log(`失败：${failed.map((c) => c.name).join('；')}`);
    process.exitCode = 1;
  } else {
    console.log('全部通过');
  }
}

main().catch((err) => {
  console.error(`\n测试无法继续：${err.message}`);
  process.exitCode = 1;
});
