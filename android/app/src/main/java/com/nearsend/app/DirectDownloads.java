package com.nearsend.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import androidx.core.app.NotificationCompat;
import androidx.core.content.FileProvider;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 自己实现的下载器。
 * 原本用系统 DownloadManager，但在部分机型上它会一直停在 PENDING（电量/网络策略），
 * 表现就是「下载中 0%」再也不动。这里改成应用内线程下载：
 * 进度由我们统计，通知由我们发，失败能拿到具体原因。
 */
public final class DirectDownloads {

    public static final int STATE_RUNNING = 1;
    public static final int STATE_DONE = 2;
    public static final int STATE_FAILED = 3;

    private static final int NOTIF_PROGRESS = 4401;
    private static final int NOTIF_DONE = 4402;

    private static final Map<String, Task> MAP = new ConcurrentHashMap<>();

    private DirectDownloads() {
    }

    public static final class Task {
        String id;
        String name;
        String mime;
        long total;
        long sent;
        int state = STATE_RUNNING;
        String error = "";
        Uri uri;
        volatile boolean cancel;
        long lastNotify;
    }

    /** 返回给网页的 token（就是消息 id），后续用它查进度 */
    public static String start(Context ctx, Device d, String msgId, String name) {
        final Context app = ctx.getApplicationContext();
        final Task t = new Task();
        t.id = msgId;
        t.name = safe(name);
        t.mime = Downloader.guessMime(t.name);
        MAP.put(msgId, t);
        final Device dev = d;
        Thread th = new Thread(new Runnable() {
            @Override
            public void run() {
                download(app, dev, t);
            }
        }, "ns-download");
        th.setDaemon(true);
        th.start();
        return msgId;
    }

    public static String status(String token) {
        Task t = MAP.get(token);
        JSONObject o = new JSONObject();
        try {
            if (t == null) {
                o.put("state", "gone");
                return o.toString();
            }
            o.put("state", t.state == STATE_DONE ? "done" : t.state == STATE_FAILED ? "failed" : "running");
            o.put("sent", t.sent);
            o.put("total", t.total);
            if (!t.error.isEmpty()) o.put("error", t.error);
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    public static void cancel(String token) {
        Task t = MAP.get(token);
        if (t == null) return;
        t.cancel = true;
        cancelNotif(App.I);
    }

    public static void open(Context ctx, String token) {
        Task t = MAP.get(token);
        try {
            if (t == null || t.uri == null) {
                openDownloads(ctx);
                return;
            }
            Intent i = new Intent(Intent.ACTION_VIEW);
            i.setDataAndType(t.uri, t.mime == null || t.mime.isEmpty() ? "*/*" : t.mime);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
        } catch (Exception e) {
            openDownloads(ctx);
        }
    }

    public static void openDownloads(Context ctx) {
        try {
            ctx.startActivity(new Intent(android.app.DownloadManager.ACTION_VIEW_DOWNLOADS)
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
        } catch (Exception e) {
            Ui.toast(ctx, ctx.getString(R.string.downloads_open_fail));
        }
    }

    // ---------- 实际下载 ----------

    private static void download(Context ctx, Device d, Task t) {
        HttpURLConnection c = null;
        InputStream in = null;
        OutputStream out = null;
        Uri target = null;
        File fileTarget = null;
        try {
            URL url = new URL(d.baseUrl() + "/d/" + t.id + "?t=" + d.token);
            c = (HttpURLConnection) url.openConnection();
            c.setConnectTimeout(8000);
            c.setReadTimeout(30000);
            c.setRequestProperty("User-Agent", "NearSend-Android/1.0");
            int code = c.getResponseCode();
            if (code != 200 && code != 206) throw new IOException("HTTP " + code);
            long len = c.getContentLengthLong();
            t.total = len > 0 ? len : 0;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                boolean image = t.mime.startsWith("image/");
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, t.name);
                v.put(MediaStore.MediaColumns.MIME_TYPE, t.mime);
                v.put(MediaStore.MediaColumns.RELATIVE_PATH,
                        (image ? Environment.DIRECTORY_PICTURES : Environment.DIRECTORY_DOWNLOADS)
                                + "/" + Downloader.FOLDER);
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri collection = image
                        ? MediaStore.Images.Media.EXTERNAL_CONTENT_URI
                        : MediaStore.Downloads.EXTERNAL_CONTENT_URI;
                target = ctx.getContentResolver().insert(collection, v);
                if (target == null) throw new IOException("无法创建文件");
                out = ctx.getContentResolver().openOutputStream(target);
            } else {
                File dir = new File(ctx.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                        Downloader.FOLDER);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("无法创建目录");
                fileTarget = unique(dir, t.name);
                out = new FileOutputStream(fileTarget);
            }
            if (out == null) throw new IOException("无法写入");

            in = c.getInputStream();
            byte[] buf = new byte[128 * 1024];
            int n;
            long lastNotif = 0;
            while ((n = in.read(buf)) > 0) {
                if (t.cancel) throw new IOException("已取消");
                out.write(buf, 0, n);
                t.sent += n;
                long now = System.currentTimeMillis();
                if (now - lastNotif > 500) {
                    lastNotif = now;
                    notifyProgress(ctx, t);
                }
            }
            out.flush();
            out.close();
            out = null;

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && target != null) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                ctx.getContentResolver().update(target, done, null, null);
                t.uri = target;
            } else if (fileTarget != null) {
                t.uri = FileProvider.getUriForFile(ctx,
                        ctx.getPackageName() + ".fileprovider", fileTarget);
            }
            t.state = STATE_DONE;
            notifyDone(ctx, t);
            Ui.toast(ctx, ctx.getString(R.string.download_done));
        } catch (Exception e) {
            t.state = STATE_FAILED;
            t.error = e.getMessage() == null ? "下载失败" : e.getMessage();
            android.util.Log.e("NearSend", "download failed: " + e);
            if (t.cancel) {
                // 取消时把半截文件删掉
                try {
                    if (target != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        ctx.getContentResolver().delete(target, null, null);
                    } else if (fileTarget != null) {
                        fileTarget.delete();
                    }
                } catch (Exception ignored) {
                }
            } else {
                notifyFailed(ctx, t);
            }
        } finally {
            try {
                if (in != null) in.close();
            } catch (Exception ignored) {
            }
            try {
                if (out != null) out.close();
            } catch (Exception ignored) {
            }
            if (c != null) c.disconnect();
        }
    }

    // ---------- 通知 ----------

    private static void notifyProgress(Context ctx, Task t) {
        try {
            int pct = t.total > 0 ? (int) Math.min(100, t.sent * 100 / t.total) : 0;
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, App.CH_TRANSFER)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(t.name)
                    .setContentText(ctx.getString(R.string.downloading) + " " + pct + "%")
                    .setProgress(100, pct, t.total <= 0)
                    .setOngoing(true)
                    .setOnlyAlertOnce(true)
                    .setPriority(NotificationCompat.PRIORITY_LOW);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_PROGRESS, b.build());
        } catch (Exception ignored) {
        }
    }

    private static void notifyDone(Context ctx, Task t) {
        cancelNotif(ctx);
        try {
            Intent open = new Intent(ctx, MainActivity.class);
            open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            PendingIntent pi = PendingIntent.getActivity(ctx, 0, open, flags());
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, App.CH_MSG)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(ctx.getString(R.string.download_done))
                    .setContentText(t.name)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_HIGH)
                    .setContentIntent(pi);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_DONE, b.build());
        } catch (Exception ignored) {
        }
    }

    private static void notifyFailed(Context ctx, Task t) {
        cancelNotif(ctx);
        try {
            NotificationCompat.Builder b = new NotificationCompat.Builder(ctx, App.CH_MSG)
                    .setSmallIcon(R.drawable.ic_notification)
                    .setContentTitle(ctx.getString(R.string.download_failed))
                    .setContentText(t.name + " · " + t.error)
                    .setAutoCancel(true)
                    .setPriority(NotificationCompat.PRIORITY_DEFAULT);
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIF_DONE, b.build());
        } catch (Exception ignored) {
        }
    }

    private static void cancelNotif(Context ctx) {
        try {
            NotificationManager nm = (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NOTIF_PROGRESS);
        } catch (Exception ignored) {
        }
    }

    private static int flags() {
        return Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    // ---------- 小工具 ----------

    private static String safe(String name) {
        return Downloader.safeName(name);
    }

    private static File unique(File dir, String name) {
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
}
