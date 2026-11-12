package com.nearsend.app;

import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * 原生分片上传。给「从其他 App 分享到近传」用——
 * 那条路径不能依赖网页里的 fetch，因为文件是 content:// URI。
 */
public final class Uploader {

    public static final int CHUNK = 4 * 1024 * 1024;

    public interface Progress {
        void on(long sent, long total);
    }

    private Uploader() {
    }

    public static String upload(Device d, File file, String name, String mime,
                                String cid, Progress progress) throws Exception {
        long size = file.length();
        String id = init(d, name, size, mime, cid);
        long offset = 0;
        try {
            while (offset < size) {
                int chunk = (int) Math.min(CHUNK, size - offset);
                offset = put(d, id, file, offset, chunk);
                if (progress != null) progress.on(offset, size);
            }
            finish(d, id);
            return id;
        } catch (Exception e) {
            abort(d, id);
            throw e;
        }
    }

    private static String init(Device d, String name, long size, String mime, String cid)
            throws Exception {
        JSONObject body = new JSONObject();
        body.put("name", name == null ? "file" : name);
        body.put("size", size);
        body.put("mime", mime == null ? "application/octet-stream" : mime);
        body.put("cid", cid == null ? "" : cid);
        JSONObject r = post(d, "/api/upload/init", body, 6000, 8000);
        String id = r.optString("id", "");
        if (id.isEmpty()) throw new IOException("no upload id");
        return id;
    }

    private static long put(Device d, String id, File file, long offset, int length)
            throws Exception {
        HttpURLConnection c = null;
        FileInputStream in = null;
        try {
            URL url = new URL(d.baseUrl() + "/api/upload/" + id + "?off=" + offset + "&t=" + d.token);
            c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("PUT");
            c.setConnectTimeout(8000);
            c.setReadTimeout(120000);
            c.setDoOutput(true);
            c.setFixedLengthStreamingMode(length);
            c.setRequestProperty("Content-Type", "application/octet-stream");
            c.setRequestProperty("User-Agent", "NearSend-Android/1.0");
            OutputStream out = c.getOutputStream();
            in = new FileInputStream(file);
            long skipped = 0;
            while (skipped < offset) {
                long s = in.skip(offset - skipped);
                if (s <= 0) break;
                skipped += s;
            }
            byte[] buf = new byte[64 * 1024];
            int remain = length;
            while (remain > 0) {
                int n = in.read(buf, 0, Math.min(buf.length, remain));
                if (n <= 0) throw new IOException("read eof");
                out.write(buf, 0, n);
                remain -= n;
            }
            out.flush();
            out.close();
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("upload HTTP " + code);
            String text = read(c.getInputStream());
            JSONObject r = new JSONObject(text.isEmpty() ? "{}" : text);
            return r.optLong("offset", offset + length);
        } finally {
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
            }
            if (c != null) c.disconnect();
        }
    }

    private static void finish(Device d, String id) throws Exception {
        post(d, "/api/upload/" + id + "/done", new JSONObject(), 6000, 15000);
    }

    private static void abort(Device d, String id) {
        try {
            HttpURLConnection c = (HttpURLConnection) new URL(
                    d.baseUrl() + "/api/msg/" + id + "?t=" + d.token).openConnection();
            c.setRequestMethod("DELETE");
            c.setConnectTimeout(3000);
            c.setReadTimeout(3000);
            c.getResponseCode();
            c.disconnect();
        } catch (Exception ignored) {
        }
    }

    private static JSONObject post(Device d, String path, JSONObject body,
                                   int connectMs, int readMs) throws Exception {
        HttpURLConnection c = null;
        try {
            URL url = new URL(d.baseUrl() + path + "?t=" + d.token);
            c = (HttpURLConnection) url.openConnection();
            c.setRequestMethod("POST");
            c.setConnectTimeout(connectMs);
            c.setReadTimeout(readMs);
            c.setDoOutput(true);
            c.setRequestProperty("Content-Type", "application/json; charset=utf-8");
            c.setRequestProperty("User-Agent", "NearSend-Android/1.0");
            byte[] raw = body.toString().getBytes(StandardCharsets.UTF_8);
            c.setFixedLengthStreamingMode(raw.length);
            OutputStream os = c.getOutputStream();
            os.write(raw);
            os.flush();
            os.close();
            int code = c.getResponseCode();
            String text = read(code >= 400 ? c.getErrorStream() : c.getInputStream());
            if (code != 200) throw new IOException("HTTP " + code + " " + text);
            return new JSONObject(text.isEmpty() ? "{}" : text);
        } finally {
            if (c != null) c.disconnect();
        }
    }

    private static String read(InputStream in) {
        if (in == null) return "";
        try {
            java.io.ByteArrayOutputStream bo = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[4096];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toString("UTF-8");
        } catch (Exception e) {
            return "";
        } finally {
            try {
                in.close();
            } catch (Exception ignored) {
            }
        }
    }
}
