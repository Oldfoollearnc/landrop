package com.nearsend.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * 文件落盘：保存到「下载/NearSend」、存进相册、或者调起系统分享。
 * 聊天页通过 Bridge 调用，后台自动保存图片也走这里。
 */
public final class Downloader {

    public static final String FOLDER = "NearSend";

    public interface Callback {
        void onDone(boolean ok, String message);
    }

    private Downloader() {
    }

    // ---------- 对外 ----------

    /** 手动保存：图片进相册，其余进下载目录。 */
    public static void save(final Context ctx, final Device d, final String id,
                            final String name, final Callback cb) {
        Bg.run(new Runnable() {
            @Override
            public void run() {
                boolean ok;
                String msg;
                String resolved = name;
                try {
                    if (resolved == null || resolved.trim().isEmpty()) {
                        resolved = resolveName(d, id);
                    }
                    String safe = safeName(resolved);
                    if (isImage(safe)) {
                        saveTo(ctx, d, id, safe, MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                                Environment.DIRECTORY_PICTURES);
                        msg = ctx.getString(R.string.saved_photo);
                    } else {
                        saveTo(ctx, d, id, safe, MediaStore.Downloads.EXTERNAL_CONTENT_URI,
                                Environment.DIRECTORY_DOWNLOADS);
                        msg = ctx.getString(R.string.saved_file);
                    }
                    ok = true;
                } catch (Exception e) {
                    ok = false;
                    msg = ctx.getString(R.string.err_save);
                    android.util.Log.e("NearSend", "save failed: " + e);
                }
                final boolean okf = ok;
                final String msgf = msg;
                if (cb != null) {
                    MainThread.post(new Runnable() {
                        @Override
                        public void run() {
                            cb.onDone(okf, msgf);
                        }
                    });
                }
            }
        });
    }

    /** 只拿到消息 id 时，用 HEAD 里的 Content-Disposition 补一个像样的文件名。 */
    private static String resolveName(Device d, String id) {
        HttpURLConnection c = null;
        try {
            c = (HttpURLConnection) new URL(d.baseUrl() + "/d/" + id + "?t=" + d.token)
                    .openConnection();
            c.setRequestMethod("HEAD");
            c.setConnectTimeout(4000);
            c.setReadTimeout(4000);
            c.setRequestProperty("User-Agent", "NearSend-Android/1.0");
            String cd = c.getHeaderField("Content-Disposition");
            if (cd != null) {
                java.util.regex.Matcher m = java.util.regex.Pattern
                        .compile("filename\\*=UTF-8''([^;]+)", java.util.regex.Pattern.CASE_INSENSITIVE)
                        .matcher(cd);
                if (m.find()) return java.net.URLDecoder.decode(m.group(1), "UTF-8");
                m = java.util.regex.Pattern.compile("filename=\"?([^\";]+)\"?",
                        java.util.regex.Pattern.CASE_INSENSITIVE).matcher(cd);
                if (m.find()) return m.group(1);
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.disconnect();
        }
        return "nearsend_" + System.currentTimeMillis();
    }

    /** 后台自动保存图片，不打扰用户；失败静默。 */
    public static void autoSaveImage(final Context ctx, final Device d, final String id,
                                     final String name) {
        if (!Prefs.autoSaveImages()) return;
        Bg.run(new Runnable() {
            @Override
            public void run() {
                try {
                    saveTo(ctx, d, id, safeName(name),
                            MediaStore.Images.Media.EXTERNAL_CONTENT_URI,
                            Environment.DIRECTORY_PICTURES);
                } catch (Exception e) {
                    android.util.Log.e("NearSend", "auto save failed: " + e);
                }
            }
        });
    }

    /** 落到缓存再交给系统分享面板。 */
    public static void share(final Activity a, final Device d, final String id,
                             final String name, final String mime) {
        final String safe = safeName(name);
        Bg.run(new Runnable() {
            @Override
            public void run() {
                try {
                    File dir = new File(a.getCacheDir(), "share");
                    if (!dir.exists() && !dir.mkdirs()) throw new IOException("no dir");
                    File out = new File(dir, safe);
                    copyFromServer(d, id, new FileOutputStream(out));
                    final Uri uri = FileProvider.getUriForFile(a,
                            a.getPackageName() + ".fileprovider", out);
                    final String type = mime == null || mime.isEmpty() ? guessMime(safe) : mime;
                    MainThread.post(new Runnable() {
                        @Override
                        public void run() {
                            try {
                                Intent i = new Intent(Intent.ACTION_SEND);
                                i.setType(type);
                                i.putExtra(Intent.EXTRA_STREAM, uri);
                                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                                i.setClipData(android.content.ClipData.newRawUri(safe, uri));
                                a.startActivity(Intent.createChooser(i,
                                        a.getString(R.string.share_to)));
                            } catch (Exception e) {
                                Ui.toast(a, a.getString(R.string.err_share));
                            }
                        }
                    });
                } catch (Exception e) {
                    MainThread.post(new Runnable() {
                        @Override
                        public void run() {
                            Ui.toast(a, a.getString(R.string.err_share));
                        }
                    });
                }
            }
        });
    }

    // ---------- 细节 ----------

    private static void saveTo(Context ctx, Device d, String id, String name,
                               Uri collection, String relativeBase) throws Exception {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, guessMime(name));
            v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                    relativeBase + "/" + FOLDER);
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri target = ctx.getContentResolver().insert(collection, v);
            if (target == null) throw new IOException("no target");
            OutputStream os = ctx.getContentResolver().openOutputStream(target);
            if (os == null) throw new IOException("no stream");
            copyFromServer(d, id, os);
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            ctx.getContentResolver().update(target, done, null, null);
        } else {
            File dir = new File(Environment.getExternalStoragePublicDirectory(relativeBase), FOLDER);
            if (!dir.exists() && !dir.mkdirs()) throw new IOException("no dir");
            File out = uniqueFile(dir, name);
            copyFromServer(d, id, new FileOutputStream(out));
        }
    }

    private static void copyFromServer(Device d, String id, OutputStream out) throws Exception {
        HttpURLConnection c = null;
        InputStream in = null;
        try {
            URL url = new URL(d.baseUrl() + "/d/" + id + "?t=" + d.token);
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(6000);
            c.setReadTimeout(60000);
            c.setRequestProperty("User-Agent", "NearSend-Android/1.0");
            int code = c.getResponseCode();
            if (code != 200) throw new IOException("HTTP " + code);
            in = c.getInputStream();
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
            out.flush();
        } finally {
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
            }
            if (c != null) c.disconnect();
        }
    }

    private static File uniqueFile(File dir, String name) {
        File f = new File(dir, name);
        if (!f.exists()) return f;
        String stem = name;
        String ext = "";
        int dot = name.lastIndexOf('.');
        if (dot > 0) {
            stem = name.substring(0, dot);
            ext = name.substring(dot);
        }
        for (int i = 2; i < 500; i++) {
            f = new File(dir, stem + " (" + i + ")" + ext);
            if (!f.exists()) return f;
        }
        return new File(dir, System.currentTimeMillis() + ext);
    }

    static String safeName(String name) {
        String s = String.valueOf(name == null ? "" : name)
                .replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]", "_").trim();
        if (s.isEmpty()) s = "nearsend_" + System.currentTimeMillis();
        if (s.length() > 120) {
            String ext = "";
            int dot = s.lastIndexOf('.');
            if (dot > 0 && s.length() - dot < 16) ext = s.substring(dot);
            s = s.substring(0, 120 - ext.length()) + ext;
        }
        return s;
    }

    private static boolean isImage(String name) {
        return guessMime(name).startsWith("image/");
    }

    static String guessMime(String name) {
        String n = name == null ? "" : name.toLowerCase();
        if (n.endsWith(".png")) return "image/png";
        if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
        if (n.endsWith(".gif")) return "image/gif";
        if (n.endsWith(".webp")) return "image/webp";
        if (n.endsWith(".heic")) return "image/heic";
        if (n.endsWith(".bmp")) return "image/bmp";
        if (n.endsWith(".mp4")) return "video/mp4";
        if (n.endsWith(".mov")) return "video/quicktime";
        if (n.endsWith(".mp3")) return "audio/mpeg";
        if (n.endsWith(".m4a")) return "audio/mp4";
        if (n.endsWith(".pdf")) return "application/pdf";
        if (n.endsWith(".zip")) return "application/zip";
        if (n.endsWith(".txt")) return "text/plain";
        if (n.endsWith(".apk")) return "application/vnd.android.package-archive";
        return "application/octet-stream";
    }
}
