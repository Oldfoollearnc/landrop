package com.nearsend.app;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Random;

/**
 * 极简 WebSocket 客户端（RFC 6455）。
 * 局域网纯 ws:// 场景，不需要 TLS / 扩展 / 代理，自己实现比拖一个网络库更轻。
 */
public class WsClient {

    public interface Listener {
        void onOpen();

        void onMessage(String text);

        void onClosed(String reason);
    }

    private static final int OP_TEXT = 0x1;
    private static final int OP_BINARY = 0x2;
    private static final int OP_CLOSE = 0x8;
    private static final int OP_PING = 0x9;
    private static final int OP_PONG = 0xA;

    private Socket socket;
    private InputStream in;
    private OutputStream out;
    private Thread reader;
    private Listener listener;
    private volatile boolean open;
    private volatile long lastRecvAt;
    private final Random rnd = new SecureRandom();

    public boolean isOpen() {
        return open;
    }

    public long lastRecvAt() {
        return lastRecvAt;
    }

    public void connect(final String host, final int port, final String path,
                        final int timeoutMs, final Listener l) {
        this.listener = l;
        Thread t = new Thread(new Runnable() {
            @Override
            public void run() {
                handshake(host, port, path, timeoutMs);
            }
        }, "ws-connect");
        t.setDaemon(true);
        t.start();
    }

    private void handshake(String host, int port, String path, int timeoutMs) {
        try {
            socket = new Socket();
            socket.setTcpNoDelay(true);
            socket.connect(new InetSocketAddress(host, port), timeoutMs);
            socket.setSoTimeout(timeoutMs);
            in = socket.getInputStream();
            out = socket.getOutputStream();

            byte[] nonce = new byte[16];
            rnd.nextBytes(nonce);
            String key = android.util.Base64.encodeToString(nonce, android.util.Base64.NO_WRAP);

            StringBuilder req = new StringBuilder();
            req.append("GET ").append(path).append(" HTTP/1.1\r\n");
            req.append("Host: ").append(host).append(':').append(port).append("\r\n");
            req.append("Upgrade: websocket\r\n");
            req.append("Connection: Upgrade\r\n");
            req.append("Sec-WebSocket-Key: ").append(key).append("\r\n");
            req.append("Sec-WebSocket-Version: 13\r\n");
            req.append("Origin: http://").append(host).append(':').append(port).append("\r\n");
            req.append("User-Agent: LanDrop-Android/1.0\r\n");
            req.append("\r\n");
            out.write(req.toString().getBytes(StandardCharsets.UTF_8));
            out.flush();

            String header = readHeader();
            if (header == null || !header.startsWith("HTTP/1.1 101")) {
                String reason = "handshake failed";
                if (header != null && header.contains("401")) reason = "unauthorized";
                closeQuiet();
                notifyClosed(reason);
                return;
            }

            open = true;
            lastRecvAt = System.currentTimeMillis();
            socket.setSoTimeout(0);
            notifyOpen();
            loop();
        } catch (Exception e) {
            closeQuiet();
            notifyClosed(e.getMessage() == null ? "error" : e.getMessage());
        }
    }

    private String readHeader() throws IOException {
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        int prev = 0;
        int b;
        while ((b = in.read()) != -1) {
            buf.write(b);
            if (buf.size() > 16 * 1024) throw new IOException("header too large");
            if (prev == '\r' && b == '\n') {
                String s = buf.toString("ISO-8859-1");
                if (s.endsWith("\r\n\r\n")) return s;
            }
            prev = b;
        }
        return null;
    }

    private void loop() {
        ByteArrayOutputStream acc = new ByteArrayOutputStream();
        String accOpcode = null;
        try {
            while (open) {
                int b0 = in.read();
                if (b0 < 0) break;
                int b1 = in.read();
                if (b1 < 0) break;

                boolean fin = (b0 & 0x80) != 0;
                int opcode = b0 & 0x0F;
                boolean masked = (b1 & 0x80) != 0;
                long len = b1 & 0x7F;

                if (len == 126) {
                    len = ((long) in.read() << 8) | in.read();
                } else if (len == 127) {
                    len = 0;
                    for (int i = 0; i < 8; i++) len = (len << 8) | in.read();
                }
                if (len < 0 || len > 32L * 1024 * 1024) throw new IOException("frame too large");

                byte[] mask = null;
                if (masked) {
                    mask = new byte[4];
                    readFully(mask);
                }
                byte[] payload = new byte[(int) len];
                readFully(payload);
                if (mask != null) {
                    for (int i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
                }
                lastRecvAt = System.currentTimeMillis();

                if (opcode == OP_PING) {
                    writeFrame(OP_PONG, payload);
                    continue;
                }
                if (opcode == OP_PONG) continue;
                if (opcode == OP_CLOSE) {
                    try {
                        writeFrame(OP_CLOSE, new byte[0]);
                    } catch (Exception ignored) {
                    }
                    break;
                }
                if (opcode == OP_TEXT || opcode == OP_BINARY) {
                    acc.reset();
                    acc.write(payload);
                    accOpcode = opcode == OP_TEXT ? "t" : "b";
                } else if (opcode == 0x0) {
                    acc.write(payload);
                } else {
                    continue;
                }

                if (fin) {
                    String text = new String(acc.toByteArray(), StandardCharsets.UTF_8);
                    acc.reset();
                    if ("t".equals(accOpcode)) notifyMessage(text);
                    accOpcode = null;
                }
            }
            closeQuiet();
            notifyClosed("closed");
        } catch (Exception e) {
            closeQuiet();
            notifyClosed(e.getMessage() == null ? "read error" : e.getMessage());
        }
    }

    private void readFully(byte[] dst) throws IOException {
        int off = 0;
        while (off < dst.length) {
            int n = in.read(dst, off, dst.length - off);
            if (n < 0) throw new IOException("eof");
            off += n;
        }
    }

    public void send(String text) {
        if (!open) return;
        try {
            writeFrame(OP_TEXT, text.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
        }
    }

    private synchronized void writeFrame(int opcode, byte[] payload) throws IOException {
        if (out == null) throw new IOException("closed");
        ByteArrayOutputStream f = new ByteArrayOutputStream();
        f.write(0x80 | opcode);
        int len = payload.length;
        if (len < 126) {
            f.write(0x80 | len);
        } else if (len <= 0xFFFF) {
            f.write(0x80 | 126);
            f.write((len >>> 8) & 0xFF);
            f.write(len & 0xFF);
        } else {
            f.write(0x80 | 127);
            for (int i = 7; i >= 0; i--) f.write((int) (((long) len >>> (8 * i)) & 0xFF));
        }
        byte[] mask = new byte[4];
        rnd.nextBytes(mask);
        f.write(mask);
        byte[] masked = new byte[len];
        for (int i = 0; i < len; i++) masked[i] = (byte) (payload[i] ^ mask[i & 3]);
        f.write(masked);
        out.write(f.toByteArray());
        out.flush();
    }

    public void close() {
        open = false;
        try {
            if (out != null) writeFrame(OP_CLOSE, new byte[0]);
        } catch (Exception ignored) {
        }
        closeQuiet();
    }

    private void closeQuiet() {
        open = false;
        try {
            if (socket != null) socket.close();
        } catch (Exception ignored) {
        }
    }

    private void notifyOpen() {
        final Listener l = listener;
        if (l == null) return;
        MainThread.run(new Runnable() {
            @Override
            public void run() {
                l.onOpen();
            }
        });
    }

    private void notifyMessage(final String text) {
        final Listener l = listener;
        if (l == null) return;
        MainThread.run(new Runnable() {
            @Override
            public void run() {
                l.onMessage(text);
            }
        });
    }

    private void notifyClosed(final String reason) {
        final Listener l = listener;
        if (l == null) return;
        MainThread.run(new Runnable() {
            @Override
            public void run() {
                l.onClosed(reason);
            }
        });
    }
}
