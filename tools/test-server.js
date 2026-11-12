'use strict';
// 服务端协议自测：不启动 Electron，只验证 HTTP/WS 约定。
// 用法：node tools/test-server.js
const http = require('http');
const path = require('path');
const { LanServer } = require(path.join(__dirname, '..', 'src', 'main', 'server'));

let failures = 0;
function check(name, ok, extra) {
  if (ok) {
    console.log('  ok   ' + name);
  } else {
    failures += 1;
    console.log('  FAIL ' + name + (extra ? ' — ' + extra : ''));
  }
}

function makeCore() {
  let list = [];
  return {
    version: '1.0.0-test',
    history: () => list.map((m) => ({ ...m })),
    get: (id) => list.find((m) => m.id === id),
    getTheme: () => 'dark',
    getUrl: () => 'http://127.0.0.1/?t=testtoken',
    publish(partial) {
      const msg = Object.assign(
        { id: Math.random().toString(16).slice(2, 18), ts: Date.now(), status: 'ok' },
        partial
      );
      list.push(msg);
      return msg;
    },
    patch(id, changes) {
      const m = list.find((x) => x.id === id);
      if (m) Object.assign(m, changes);
      return m;
    },
    remove(id) {
      const before = list.length;
      list = list.filter((m) => m.id !== id);
      return list.length !== before;
    },
    clear() {
      list = [];
    },
    count: () => list.length,
  };
}

function request(port, method, urlPath, body, headers) {
  return new Promise((resolve, reject) => {
    const raw = body ? Buffer.from(JSON.stringify(body)) : null;
    const req = http.request(
      {
        host: '127.0.0.1',
        port,
        path: urlPath,
        method,
        headers: Object.assign(
          raw ? { 'Content-Type': 'application/json', 'Content-Length': raw.length } : {},
          headers || {}
        ),
      },
      (res) => {
        let text = '';
        res.on('data', (c) => (text += c));
        res.on('end', () => {
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ code: res.statusCode, text, json });
        });
      }
    );
    req.on('error', reject);
    if (raw) req.write(raw);
    req.end();
  });
}

(async () => {
  const core = makeCore();
  const uploads = {
    on() {},
    sweep: () => [],
    init: async () => ({ id: 'a'.repeat(16), offset: 0 }),
    info: () => null,
    write: async () => 0,
    finish: async () => {
      throw new Error('not used');
    },
    abort: async () => {},
  };
  const server = new LanServer({ core, uploads, token: 'testtoken' });
  const port = await server.start(18999);
  const T = '?t=testtoken';

  console.log('鉴权与指纹');
  let r = await request(port, 'GET', '/api/history');
  check('无 token 返回 401', r.code === 401, 'code=' + r.code);
  r = await request(port, 'GET', '/api/history?t=wrong');
  check('错误 token 返回 401', r.code === 401, 'code=' + r.code);
  r = await request(port, 'GET', '/api/history' + T, null, { Host: 'evil.example:' + port });
  check('Host 不在白名单返回 421', r.code === 421, 'code=' + r.code);
  r = await request(port, 'GET', '/api/history' + T);
  check('正确 token 返回 200', r.code === 200, 'code=' + r.code);
  check('history 带 app 标识', r.json && r.json.app === 'nearsend');

  console.log('发文字');
  r = await request(port, 'POST', '/api/send/text' + T, { text: 'hello', cid: 'cid-1' });
  check('发文字返回 200 与 id', r.code === 200 && r.json && r.json.id, JSON.stringify(r.json));
  check('落库一条', core.count() === 1, 'count=' + core.count());
  const first = core.history()[0];
  check('来源为 phone 且带 cid', first.from === 'phone' && first.src === 'cid-1');

  const before = core.count();
  r = await request(port, 'POST', '/api/send/text' + T, { text: 'hello', cid: 'cid-1' });
  check('同 cid 重发被去重', r.json && r.json.duplicate === true && core.count() === before);

  r = await request(port, 'POST', '/api/send/text' + T, { text: '   ' });
  check('空文字返回 400', r.code === 400, 'code=' + r.code);

  console.log('引用与清空');
  r = await request(port, 'POST', '/api/send/text' + T, {
    text: 'reply test',
    cid: 'cid-2',
    reply: { id: 'a100000000000001', from: 'pc', kind: 'text', text: '原消息', evil: '<script>' },
  });
  const replied = core.history().find((m) => m.src === 'cid-2');
  check('引用字段被保留并裁剪', !!replied && !!replied.reply && replied.reply.text === '原消息');
  check('引用里的多余字段被丢弃', replied && replied.reply && replied.reply.evil === undefined);

  r = await request(port, 'POST', '/api/clear' + T, {});
  check('清空返回 ok', r.code === 200 && r.json && r.json.ok === true);
  check('清空后无消息', core.count() === 0, 'count=' + core.count());

  console.log('上传入口');
  r = await request(port, 'POST', '/api/upload/init' + T, { name: 'x.txt', size: 3, mime: 'text/plain' });
  check('upload init 返回 200', r.code === 200, 'code=' + r.code);
  check('upload init 产生一条上传中消息', core.count() === 1 && core.history()[0].status === 'uploading');

  console.log('下载进度事件（/d/）');
  const fs = require('fs');
  const os = require('os');
  const tmpFile = path.join(os.tmpdir(), 'nearsend-test-' + Date.now() + '.bin');
  const size = 1024 * 1024;
  fs.writeFileSync(tmpFile, Buffer.alloc(size, 0x42));
  const fileId = 'dddddddddddddddd';
  const msg = core.publish({
    id: fileId, from: 'pc', kind: 'file', name: 'big.bin',
    path: tmpFile, status: 'ok', size, mime: 'application/octet-stream',
  });
  const served = [];
  server.on('served', (p) => served.push(p));
  const body = await new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path: '/d/' + msg.id + T }, (res) => {
      let n = 0;
      res.on('data', (c) => (n += c.length));
      res.on('end', () => resolve(n));
    }).on('error', reject);
  });
  check('下载字节数完整', body === size, 'got ' + body);
  await new Promise((r) => setTimeout(r, 200));
  check('收到进度事件', served.length >= 2, 'events=' + served.length);
  const last = served[served.length - 1];
  check('末次事件标记完成', !!last && last.done === true && last.total === size, JSON.stringify(last));
  fs.unlinkSync(tmpFile);

  server.stop();
  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('测试异常:', err);
  process.exit(1);
});
