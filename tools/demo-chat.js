// 仅用于本地视觉验收：模拟电脑端协议，喂假数据，截图看排版。
// 不参与打包。用法：node tools/demo-chat.js 8899
const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require(path.join(__dirname, '..', 'node_modules', 'ws'));

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.argv[2] || 8899);

const STATIC = {
  '/': ['src/renderer/mobile/index.html', 'text/html; charset=utf-8'],
  '/m/app.js': ['src/renderer/mobile/app.js', 'text/javascript; charset=utf-8'],
  '/m/style.css': ['src/renderer/mobile/style.css', 'text/css; charset=utf-8'],
  '/m/manifest.webmanifest': ['src/renderer/mobile/manifest.webmanifest', 'application/manifest+json'],
  '/m/icon.png': ['assets/icon-192.png', 'image/png'],
  '/m/stub.js': ['tools/bridge-stub.js', 'text/javascript; charset=utf-8'],
};

const now = Date.now();
const messages = [
  {
    id: 'a100000000000001', ts: now - 3600e3 * 26, from: 'pc', kind: 'text', status: 'ok',
    text: '会议改到 10 点半，复盘材料我先发你。',
  },
  {
    id: 'a100000000000002', ts: now - 3600e3 * 26 + 40e3, from: 'phone', kind: 'text', status: 'ok',
    seen: now - 3600e3 * 26 + 90e3, src: 'demo', text: '收到。原始数据在压缩包里吗？',
  },
  {
    id: 'a100000000000003', ts: now - 3600e3 * 2, from: 'pc', kind: 'text', status: 'ok',
    text: '在。顺便把现场照片也打包了，3 个 G，慢慢下。',
  },
  {
    id: 'a100000000000004', ts: now - 3600e3 * 2 + 20e3, from: 'pc', kind: 'image', status: 'ok',
    name: '现场-东区.png', size: 48213, mime: 'image/png',
  },
  {
    id: 'a100000000000005', ts: now - 3600e3 * 2 + 60e3, from: 'phone', kind: 'text', status: 'ok',
    src: 'demo', text: '这张我加进周报了。',
    reply: { id: 'a100000000000004', from: 'pc', kind: 'image', name: '现场-东区.png' },
  },
  {
    id: 'a100000000000006', ts: now - 1800e3, from: 'phone', kind: 'image', status: 'ok',
    src: 'demo', name: '录屏封面.png', size: 22480, mime: 'image/png',
    seen: now - 1700e3,
  },
  {
    id: 'a100000000000007', ts: now - 600e3, from: 'pc', kind: 'file', status: 'ok',
    name: '季度复盘-2026Q3.pdf', size: 4213862, mime: 'application/pdf',
  },
  {
    id: 'a100000000000008', ts: now - 120e3, from: 'phone', kind: 'text', status: 'queued',
    src: 'demo', text: '这条还没发出去，等连上自动发送。',
  },
  {
    id: 'a100000000000009', ts: now - 30e3, from: 'pc', kind: 'text', status: 'ok',
    text: '如果链接太长可以试试这个：https://example.com/report/2026-q3 里面有明细。',
  },
];

function serve(res, rel, type) {
  fs.readFile(path.join(ROOT, rel), (err, buf) => {
    if (err) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/stub') {
    // 把页面塞进一个伪造的原生桥，用来验收 App 内才有的下载/保存交互
    fs.readFile(path.join(ROOT, 'src/renderer/mobile/index.html'), 'utf8', (err, html) => {
      if (err) {
        res.writeHead(500);
        res.end('no html');
        return;
      }
      const out = html.replace('<script src="/m/app.js"></script>',
        '<script src="/m/stub.js"></script><script src="/m/app.js"></script>');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(out);
    });
    return;
  }
  if (STATIC[url.pathname]) {
    const [rel, type] = STATIC[url.pathname];
    return serve(res, rel, type);
  }
  if (url.pathname === '/api/history') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ ok: true, app: 'nearsend', host: 'DESKTOP-8K2', messages, theme: 'light' }));
  }
  if (url.pathname === '/api/send/text') {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let text = '';
      try {
        text = JSON.parse(body).text || '';
      } catch {
        text = '';
      }
      const msg = {
        id: Math.random().toString(16).slice(2, 18),
        ts: Date.now(), from: 'phone', kind: 'text', text, status: 'ok', src: 'http',
      };
      messages.push(msg);
      broadcast({ t: 'msg', msg });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: msg.id }));
    });
    return;
  }
  if (url.pathname === '/api/push/pc') {
    // 仅用于调试后台通知：模拟电脑端发一条消息
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let text = '来自电脑的消息';
      try {
        text = JSON.parse(body).text || text;
      } catch {
        /* 用默认文本 */
      }
      const msg = {
        id: Math.random().toString(16).slice(2, 18),
        ts: Date.now(), from: 'pc', kind: 'text', text, status: 'ok',
      };
      messages.push(msg);
      broadcast({ t: 'msg', msg });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true, id: msg.id }));
    });
    return;
  }
  if (url.pathname === '/api/clear') {
    messages.length = 0;
    broadcast({ t: 'clear' });
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end('{"ok":true}');
  }
  if (url.pathname.startsWith('/t/')) {
    return serve(res, 'assets/icon-192.png', 'image/png');
  }
  if (url.pathname.startsWith('/d/')) {
    // 故意做成慢速大文件，方便观察下载进度与通知
    const total = 8 * 1024 * 1024;
    res.writeHead(200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': total,
      'Content-Disposition': 'attachment; filename="demo-big.bin"',
      'Cache-Control': 'no-store',
    });
    const chunk = Buffer.alloc(256 * 1024, 0x41);
    let sent = 0;
    const tick = () => {
      if (sent >= total) {
        res.end();
        return;
      }
      const ok = res.write(chunk);
      sent += chunk.length;
      if (!ok) res.once('drain', () => setTimeout(tick, 60));
      else setTimeout(tick, 60);
    };
    tick();
    return;
  }
  if (url.pathname === '/api/upload/init') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ id: 'b100000000000001', offset: 0 }));
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocket.Server({ server, path: '/ws' });
const clients = new Set();

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  for (const c of clients) {
    if (c.readyState === 1) c.send(payload);
  }
}

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.send(JSON.stringify({ t: 'init', host: 'DESKTOP-8K2', app: 'nearsend', messages }));
  ws.send(JSON.stringify({ t: 'presence', n: 1, devices: ['Android · Chrome'] }));
  ws.on('close', () => clients.delete(ws));
  ws.on('message', (raw) => {
    let p;
    try {
      p = JSON.parse(raw.toString());
    } catch {
      return;
    }
    if (p.t === 'text') {
      const msg = {
        id: Math.random().toString(16).slice(2, 18),
        ts: Date.now(),
        from: 'phone',
        kind: 'text',
        text: p.text,
        status: 'ok',
        src: p.cid,
        reply: p.reply,
      };
      messages.push(msg);
      broadcast({ t: 'msg', msg });
    }
    if (p.t === 'seen') {
      for (const id of p.ids || []) {
        const m = messages.find((x) => x.id === id);
        if (m && m.from === 'pc') {
          m.seen = Date.now();
          broadcast({ t: 'msg:update', id, patch: { seen: Date.now() } });
        }
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('demo chat on http://127.0.0.1:' + PORT);
});
