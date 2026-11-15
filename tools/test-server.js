'use strict';
// 服务端协议自测：不启动 Electron，只验证 HTTP/WS 约定。
// 用法：node tools/test-server.js
const http = require('http');
const path = require('path');
const { LanServer } = require(path.join(__dirname, '..', 'src', 'main', 'server'));
const { Uploads } = require(path.join(__dirname, '..', 'src', 'main', 'uploads'));
const { Store } = require(path.join(__dirname, '..', 'src', 'main', 'store'));
const { PREFIX } = require(path.join(__dirname, '..', 'src', 'main', 'crypto'));

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
        { id: require('crypto').randomBytes(8).toString('hex'), ts: Date.now(), status: 'ok' },
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
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const buf = Buffer.concat(chunks);
          const text = buf.toString('utf8');
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            json = null;
          }
          resolve({ code: res.statusCode, headers: res.headers, buf, text, json });
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
  const aborts = [];
  let abortAll = 0;
  let uploadSeq = 0;
  const uploads = {
    on() {},
    sweep: () => [],
    init: async () => ({ id: 'a'.repeat(15) + (++uploadSeq).toString(16), offset: 0 }),
    info: () => null,
    write: async () => 0,
    finish: async () => {
      throw new Error('not used');
    },
    abort: async (id) => {
      aborts.push(id);
    },
    abortAll: () => {
      abortAll += 1;
    },
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
  check('history 带电脑名（手机检查连通性时直接取用）',
    r.json && typeof r.json.host === 'string' && r.json.host.length > 0, r.json && r.json.host);

  console.log('PWA 静态资源');
  r = await request(port, 'GET', '/m/manifest.webmanifest');
  check('manifest 无 token 也可读取（浏览器抓取不带 Cookie）', r.code === 200, 'code=' + r.code);
  r = await request(port, 'GET', '/m/app.js');
  check('app.js 仍然要求 token', r.code === 403, 'code=' + r.code);

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
  const uploadId = r.json && r.json.id;

  r = await request(port, 'POST', '/api/upload/init' + T, {
    name: 'evil.txt', size: 1, mime: 'text/plain\r\nX-Evil: 1',
  });
  const evilMsg = core.get(r.json && r.json.id);
  check('upload mime 去掉换行与控制字符', !!evilMsg && !/[\r\n]/.test(evilMsg.mime),
    evilMsg ? JSON.stringify(evilMsg.mime) : 'no msg');

  r = await request(port, 'DELETE', '/api/msg/' + uploadId + T);
  check('删除上传消息会中止上传会话', r.code === 200 && aborts.includes(uploadId),
    'code=' + r.code + ' aborts=' + aborts.join(','));
  abortAll = 0;
  r = await request(port, 'POST', '/api/clear' + T, {});
  check('清空历史会中止所有上传会话', abortAll === 1, 'abortAll=' + abortAll);

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

  console.log('下载 Range / HEAD');
  const partFile = path.join(os.tmpdir(), 'nearsend-range-' + Date.now() + '.bin');
  const partBytes = Buffer.alloc(1000);
  for (let i = 0; i < partBytes.length; i += 1) partBytes[i] = i & 0xff;
  fs.writeFileSync(partFile, partBytes);
  const partId = 'eeeeeeeeeeeeeeee';
  core.publish({
    id: partId, from: 'pc', kind: 'file', name: 'range.bin',
    path: partFile, status: 'ok', size: partBytes.length, mime: 'application/octet-stream',
  });

  r = await request(port, 'GET', '/d/' + partId + T, null, { Range: 'bytes=-100' });
  check('bytes=-100 返回最后 100 字节',
    r.code === 206 && r.buf.length === 100 && r.buf[0] === partBytes[900]
      && r.buf[99] === partBytes[999],
    `code=${r.code} len=${r.buf.length} first=${r.buf[0]}`);
  check('suffix range 的 Content-Range 正确',
    r.headers['content-range'] === 'bytes 900-999/1000', r.headers['content-range']);

  r = await request(port, 'GET', '/d/' + partId + T, null, { Range: 'bytes=900-' });
  check('bytes=900- 返回剩余 100 字节',
    r.code === 206 && r.buf.length === 100 && r.buf[0] === partBytes[900], 'len=' + r.buf.length);

  r = await request(port, 'GET', '/d/' + partId + T, null, { Range: 'bytes=-0' });
  check('bytes=-0 返回 416', r.code === 416, 'code=' + r.code);

  const servedBeforeHead = served.length;
  r = await request(port, 'HEAD', '/d/' + partId + T);
  await new Promise((resolve) => setTimeout(resolve, 300));
  check('HEAD 无响应体', r.code === 200 && r.buf.length === 0, `code=${r.code} len=${r.buf.length}`);
  check('HEAD 不产生下载进度事件', served.length === servedBeforeHead,
    `before=${servedBeforeHead} after=${served.length}`);

  core.get(partId).mime = 'x\r\nBad: 1';
  r = await request(port, 'GET', '/d/' + partId + T);
  check('非法 mime 回退到扩展名，响应头不报错',
    r.code === 200 && /application\/octet-stream/.test(r.headers['content-type'] || ''),
    `code=${r.code} type=${r.headers['content-type']}`);

  fs.unlinkSync(partFile);
  fs.unlinkSync(tmpFile);

  console.log('WebSocket 收发、回执与心跳');
  const WebSocket = require('ws');
  const typingEvents = [];
  server.on('typing', (p) => typingEvents.push(p));
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws${T}`);
  const inbox = [];
  ws.on('message', (raw) => inbox.push(JSON.parse(raw.toString())));
  await new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
  ws.send(JSON.stringify({ t: 'ping', at: 123 }));
  ws.send(JSON.stringify({ t: 'typing', on: true }));
  ws.send(JSON.stringify({ t: 'typing', on: false }));
  ws.send(JSON.stringify({ t: 'text', text: 'ws 消息', cid: 'wcid-1' }));
  ws.send(JSON.stringify({ t: 'text', text: 'ws 消息', cid: 'wcid-1' }));
  await new Promise((r) => setTimeout(r, 400));

  check('心跳有 pong 回应', inbox.some((m) => m.t === 'pong'));
  check('typing 事件转发给电脑端', typingEvents.length === 2
    && typingEvents[0].on === true && typingEvents[1].on === false,
  JSON.stringify(typingEvents));
  const acks = inbox.filter((m) => m.t === 'ack');
  check('每条文字都收到 ack', acks.length === 2, 'acks=' + acks.length);
  check('ack 带回落库后的消息', acks.every((m) => m.msg && m.msg.id && m.msg.kind === 'text'));
  check('重复 cid 只落库一条', core.history().filter((m) => m.src === 'wcid-1').length === 1);
  check('ack 的 id 与落库消息一致', acks.length === 2 && acks[1].id === acks[1].msg.id);

  const recallId = acks[0].id;
  r = await request(port, 'POST', `/api/msg/${recallId}/recall` + T, {});
  check('2 分钟内可撤回自己发送的消息', r.code === 200 && core.get(recallId).recalled === true,
    `code=${r.code}`);
  r = await request(port, 'POST', `/api/msg/${recallId}/recall` + T, {});
  check('撤回后不能再次撤回', r.code === 403, 'code=' + r.code);
  const oldPhone = core.publish({
    id: 'ffffffffffffffff', from: 'phone', kind: 'text', text: 'old',
    status: 'ok', ts: Date.now() - 3 * 60 * 1000,
  });
  r = await request(port, 'POST', `/api/msg/${oldPhone.id}/recall` + T, {});
  check('超过 2 分钟不能撤回', r.code === 403, 'code=' + r.code);
  const pcMsg = core.publish({
    id: 'eeeeeeeeeeeeee01', from: 'pc', kind: 'text', text: 'pc',
    status: 'ok',
  });
  r = await request(port, 'POST', `/api/msg/${pcMsg.id}/recall` + T, {});
  check('手机不能撤回电脑发送的消息', r.code === 403, 'code=' + r.code);

  const victim = acks[1].id;
  ws.send(JSON.stringify({ t: 'delete', id: victim }));
  await new Promise((r2) => setTimeout(r2, 100));
  check('WS 删除消息同样会中止上传会话并落库删除',
    aborts.includes(victim) && !core.get(victim),
    'aborts=' + aborts.join(','));
  ws.close();

  console.log('上传 /done 幂等');
  const upDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nearsend-up-'));
  const up = new Uploads(() => upDir);
  const sess = await up.init({ name: 'dup.txt', size: 4, mime: 'text/plain' });
  await up.write(sess.id, 0, Buffer.from('abcd'));
  const [f1, f2] = await Promise.all([up.finish(sess.id), up.finish(sess.id)]);
  check('并发 /done 返回同一文件', f1.path === f2.path
    && fs.readFileSync(f1.path, 'utf8') === 'abcd', f1.path + ' / ' + f2.path);

  const a = await up.init({ name: 'same.txt', size: 2, mime: 'text/plain' });
  const b = await up.init({ name: 'same.txt', size: 2, mime: 'text/plain' });
  await up.write(a.id, 0, Buffer.from('aa'));
  await up.write(b.id, 0, Buffer.from('bb'));
  const [fa, fb] = await Promise.all([up.finish(a.id), up.finish(b.id)]);
  check('同名文件并发完成不会互相覆盖',
    fa.path !== fb.path
      && fs.readFileSync(fa.path, 'utf8') === 'aa'
      && fs.readFileSync(fb.path, 'utf8') === 'bb',
    fa.path + ' / ' + fb.path);

  const c = await up.init({ name: 'Case.txt', size: 2, mime: 'text/plain' });
  const d = await up.init({ name: 'case.txt', size: 2, mime: 'text/plain' });
  await up.write(c.id, 0, Buffer.from('CC'));
  await up.write(d.id, 0, Buffer.from('dd'));
  const [fc, fd] = await Promise.all([up.finish(c.id), up.finish(d.id)]);
  check('仅大小写不同的同名文件并发完成不会互相覆盖',
    fc.path !== fd.path
      && fs.readFileSync(fc.path, 'utf8') === 'CC'
      && fs.readFileSync(fd.path, 'utf8') === 'dd',
    fc.path + ' / ' + fd.path);
  fs.rmSync(upDir, { recursive: true, force: true });

  console.log('加密记录被临时锁定后的恢复');
  const storeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nearsend-store-'));
  const storeFile = path.join(storeDir, 'messages.jsonl');
  const fakeVault = {
    enabled: true,
    encrypt: (text) => PREFIX + Buffer.from(text, 'utf8').toString('base64'),
    decrypt: (line) => {
      if (!line.startsWith(PREFIX)) return line;
      const text = Buffer.from(line.slice(PREFIX.length), 'base64').toString('utf8');
      if (text.includes('FOREIGN')) throw new Error('wrong key');
      return text;
    },
  };
  const addEvent = JSON.stringify({
    op: 'add',
    msg: { id: 'abcdabcdabcdabcd', ts: Date.now(), from: 'pc', kind: 'text', text: 'restored', status: 'ok' },
  });
  fs.writeFileSync(
    path.join(storeDir, `messages.locked-${Date.now()}.jsonl`),
    fakeVault.encrypt(addEvent) + '\n'
  );
  fs.writeFileSync(
    path.join(storeDir, `messages.locked-${Date.now() + 10}.jsonl`),
    fakeVault.encrypt('FOREIGN') + '\n'
  );
  const st = new Store(storeFile, fakeVault).load();
  check('密钥可用时自动接回 locked 记录',
    st.messages().some((m) => m.text === 'restored'), 'count=' + st.messages().length);
  const left = fs.readdirSync(storeDir).filter((n) => n.startsWith('messages.locked-'));
  check('接回后只留下密钥不匹配的 locked 文件',
    fs.existsSync(storeFile)
      && left.length === 1
      && fs.readFileSync(path.join(storeDir, left[0]), 'utf8').trim() === fakeVault.encrypt('FOREIGN'),
    'left=' + left.join(','));
  fs.rmSync(storeDir, { recursive: true, force: true });

  const clearedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nearsend-cleared-'));
  const clearedFile = path.join(clearedDir, 'messages.jsonl');
  fs.writeFileSync(
    path.join(clearedDir, `messages.locked-${Date.now() - 10000}.jsonl`),
    fakeVault.encrypt(addEvent) + '\n'
  );
  fs.writeFileSync(clearedFile, '');
  const st2 = new Store(clearedFile, fakeVault).load();
  check('清空记录后不会复活更旧的 locked 文件', st2.messages().length === 0,
    'count=' + st2.messages().length);
  fs.rmSync(clearedDir, { recursive: true, force: true });

  server.stop();
  console.log(failures ? `\n${failures} 项失败` : '\n全部通过');
  process.exit(failures ? 1 : 0);
})().catch((err) => {
  console.error('测试异常:', err);
  process.exit(1);
});
