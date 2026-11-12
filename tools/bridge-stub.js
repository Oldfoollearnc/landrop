// 仅用于本地验收：伪造 window.NearSend，让网页以为自己跑在 App 里。
// 不参与打包。配合 tools/demo-chat.js 的 /stub 路由使用。
(function () {
  var state = {}; // token -> {sent, total, done, error}
  var t0 = Date.now();

  window.NearSend = {
    config: function () {
      return JSON.stringify({
        native: true,
        theme: 'light',
        font: 'm',
        fontScale: 1,
        haptics: false,
        version: '1.0.2-stub',
      });
    },
    toast: function () {},
    vibrate: function () {},
    copy: function () {},
    clipboard: function () {
      return '';
    },
    saveMedia: function (id, name) {
      var token = 'tok-' + id;
      state[token] = { sent: 0, total: 24 * 1024 * 1024, started: Date.now(), name: name };
      return token;
    },
    downloadStatus: function (token) {
      var s = state[token];
      if (!s) return JSON.stringify({ state: 'gone' });
      var elapsed = (Date.now() - s.started) / 1000;
      // 大约 6 秒走完，方便截图看到中间态
      var sent = Math.min(s.total, Math.floor((s.total / 6) * elapsed));
      s.sent = sent;
      return JSON.stringify({
        state: sent >= s.total ? 'done' : 'running',
        sent: sent,
        total: s.total,
      });
    },
    openDownload: function () {},
    cancelDownload: function (token) {
      state[token] = null;
    },
    openDownloads: function () {},
    openSettings: function () {},
    openHelp: function () {},
    shareMedia: function () {},
    shareText: function () {},
    openUrl: function () {},
    close: function () {},
    setChrome: function () {},
  };
})();
