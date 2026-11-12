package com.nearsend.app;

import android.os.SystemClock;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URL;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/** 与电脑端 HTTP / WebSocket 打交道的全部网络逻辑。 */
public final class ApiClient {

    public static final int DEFAULT_PORT = 8899;
    public static final int PORT_LAST = 8910;

    private ApiClient() {
    }

    public static class Found {
        public final String ip;
        public final int port;

        Found(String ip, int port) {
            this.ip = ip;
            this.port = port;
        }
    }

    public static class Check {
        public int state = Device.STATE_OFFLINE;
        public String hostname;
        public String error = "";
    }

    // ---------- 底层 ----------

    private static HttpURLConnection open(String url, int connectMs, int readMs) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(connectMs);
        c.setReadTimeout(readMs);
        c.setInstanceFollowRedirects(false);
        c.setUseCaches(false);
        c.setRequestProperty("User-Agent", "LanDrop-Android/1.0");
        c.setRequestProperty("Accept", "*/*");
        return c;
    }

    private static String readAll(InputStream is, int max) {
        if (is == null) return "";
        try {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            int total = 0;
            while ((n = is.read(buf)) > 0) {
                bo.write(buf, 0, n);
                total += n;
                if (total >= max) break;
            }
            return bo.toString("UTF-8");
        } catch (Exception e) {
            return "";
        } finally {
            try {
                is.close();
            } catch (Exception ignored) {
            }
        }
    }

    public static boolean tcpAlive(String ip, int port, int timeoutMs) {
        Socket s = new Socket();
        try {
            s.connect(new InetSocketAddress(ip, port), timeoutMs);
            return true;
        } catch (Exception e) {
            return false;
        } finally {
            try {
                s.close();
            } catch (Exception ignored) {
            }
        }
    }

    /** 端口上是不是一个 LanDrop。用未授权时 /api/history 的固定 401 指纹判断。 */
    public static Found probe(String ip, int port) {
        if (!tcpAlive(ip, port, 240)) return null;
        HttpURLConnection c = null;
        try {
            c = open("http://" + ip + ":" + port + "/api/history", 700, 900);
            int code = c.getResponseCode();
            String body = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream(), 4096);
            boolean lanDrop = (code == 401 && body.contains("unauthorized"))
                    || (code == 200 && body.contains("\"messages\""));
            return lanDrop ? new Found(ip, port) : null;
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** 校验令牌是否还有效，并顺手把主机名带回来。 */
    public static Check check(Device d, int timeoutMs) {
        Check out = new Check();
        HttpURLConnection c = null;
        try {
            c = open(d.baseUrl() + "/api/history?t=" + d.token, timeoutMs, timeoutMs);
            int code = c.getResponseCode();
            if (code == 401) {
                out.state = Device.STATE_DENIED;
                out.error = "unauthorized";
                return out;
            }
            if (code != 200) {
                out.state = Device.STATE_OFFLINE;
                out.error = "HTTP " + code;
                return out;
            }
            String body = readAll(c.getInputStream(), 8192);
            if (!body.contains("\"messages\"")) {
                out.state = Device.STATE_OFFLINE;
                out.error = "not landrop";
                return out;
            }
            out.state = Device.STATE_ONLINE;
        } catch (Exception e) {
            out.state = Device.STATE_OFFLINE;
            out.error = e.getMessage() == null ? "无法连接" : e.getMessage();
            return out;
        } finally {
            if (c != null) c.disconnect();
        }
        out.hostname = hostname(d, Math.min(timeoutMs, 2200));
        return out;
    }

    /** 连一次 WS 只为拿 init.host（电脑名）。必须在后台线程调用。 */
    public static String hostname(Device d, int timeoutMs) {
        final CountDownLatch latch = new CountDownLatch(1);
        final String[] name = {null};
        final WsClient ws = new WsClient();
        ws.connect(d.ip, d.port, "/ws?t=" + d.token, timeoutMs, new WsClient.Listener() {
            @Override
            public void onOpen() {
            }

            @Override
            public void onMessage(String text) {
                try {
                    JSONObject o = new JSONObject(text);
                    if ("init".equals(o.optString("t"))) {
                        String h = o.optString("host", "");
                        if (!h.isEmpty()) name[0] = h;
                        latch.countDown();
                    }
                } catch (Exception ignored) {
                }
            }

            @Override
            public void onClosed(String reason) {
                latch.countDown();
            }
        });
        try {
            latch.await(timeoutMs + 600L, TimeUnit.MILLISECONDS);
        } catch (InterruptedException ignored) {
        }
        ws.close();
        return name[0];
    }

    /** 解析扫码 / 粘贴得到的连接地址。 */
    public static Device parse(String raw) {
        String s = raw == null ? "" : raw.trim();
        if (s.isEmpty()) return null;
        // 去掉可能的包裹字符
        s = s.replace("\uFEFF", "").trim();
        if (!s.contains("://")) s = "http://" + s;
        try {
            URL u = new URL(s);
            String host = u.getHost();
            if (host == null || host.isEmpty()) return null;
            int port = u.getPort() > 0 ? u.getPort() : DEFAULT_PORT;
            String token = null;
            String q = u.getQuery();
            if (q != null) {
                for (String kv : q.split("&")) {
                    int i = kv.indexOf('=');
                    if (i > 0 && "t".equals(kv.substring(0, i))) {
                        token = kv.substring(i + 1);
                        break;
                    }
                }
            }
            if (token == null || token.length() < 8 || token.length() > 128) return null;
            return Device.fromScan(host, port, token);
        } catch (Exception e) {
            return null;
        }
    }

    public static boolean looksLikeUrl(String raw) {
        return parse(raw) != null;
    }

    public static long now() {
        return SystemClock.elapsedRealtime();
    }

    // ---------- 手机端主动发起的小接口 ----------

    private static org.json.JSONObject postJson(Device d, String path, org.json.JSONObject body,
                                                int connectMs, int readMs) {
        HttpURLConnection c = null;
        try {
            c = open(d.baseUrl() + path + "?t=" + d.token, connectMs, readMs);
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            byte[] raw = body == null ? new byte[]{'{', '}'} : body.toString().getBytes("UTF-8");
            c.setFixedLengthStreamingMode(raw.length);
            java.io.OutputStream os = c.getOutputStream();
            os.write(raw);
            os.flush();
            os.close();
            int code = c.getResponseCode();
            String text = readAll(code >= 400 ? c.getErrorStream() : c.getInputStream(), 8192);
            if (code != 200) return null;
            return new org.json.JSONObject(text.isEmpty() ? "{}" : text);
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.disconnect();
        }
    }

    /** 直接发一条文字消息（通知快捷回复、系统分享都会走这里）。 */
    public static String sendText(Device d, String text, String cid) {
        try {
            org.json.JSONObject body = new org.json.JSONObject();
            body.put("text", text);
            if (cid != null) body.put("cid", cid);
            org.json.JSONObject r = postJson(d, "/api/send/text", body, 4000, 6000);
            return r == null ? null : r.optString("id", "");
        } catch (Exception e) {
            return null;
        }
    }

    /** 清空电脑端的聊天记录（不删除已接收的文件）。 */
    public static boolean clearHistory(Device d) {
        org.json.JSONObject r = postJson(d, "/api/clear", new org.json.JSONObject(), 4000, 8000);
        return r != null && r.optBoolean("ok", false);
    }
}
