package com.nearsend.app;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

import org.json.JSONObject;

/**
 * 前台服务：APP 退到后台时维持一条 WS，收到电脑消息就发系统通知。
 * 聊天页在前台时这条连接会被让出来，避免同一设备出现两条连接。
 */
public class LinkService extends Service {

    private static final String ACTION_ENSURE = "com.nearsend.app.svc.ENSURE";
    private static final String ACTION_PAUSE = "com.nearsend.app.svc.PAUSE";
    private static final String ACTION_RESUME = "com.nearsend.app.svc.RESUME";
    private static final String EXTRA_ID = "deviceId";

    private static final int NOTIF_SERVICE = 4101;
    public static final int NOTIF_MSG = 4102;

    static volatile boolean started = false;

    private WsClient ws;
    private String deviceId;
    private boolean receiving;
    private boolean foreground;
    private int retry = 1200;
    private int msgCount;
    private String lastText = "";

    private final Handler h = new Handler(Looper.getMainLooper());
    private final Runnable retryTask = new Runnable() {
        @Override
        public void run() {
            connectIfNeeded();
        }
    };
    private final Runnable healthTask = new Runnable() {
        @Override
        public void run() {
            checkHealth();
            h.postDelayed(this, 25000);
        }
    };

    public static void ensure(Context c, String deviceId) {
        Intent i = new Intent(c, LinkService.class);
        i.setAction(ACTION_ENSURE);
        i.putExtra(EXTRA_ID, deviceId);
        startCompat(c, i);
    }

    public static void pauseReceiving(Context c) {
        if (!started) return;
        Intent i = new Intent(c, LinkService.class);
        i.setAction(ACTION_PAUSE);
        try {
            c.startService(i);
        } catch (Exception ignored) {
        }
    }

    public static void resumeReceiving(Context c, String deviceId) {
        if (!Prefs.backgroundReceive()) return;
        Intent i = new Intent(c, LinkService.class);
        i.setAction(ACTION_RESUME);
        i.putExtra(EXTRA_ID, deviceId);
        try {
            c.startService(i);
        } catch (Exception ignored) {
        }
    }

    public static void stop(Context c) {
        started = false;
        try {
            c.stopService(new Intent(c, LinkService.class));
        } catch (Exception ignored) {
        }
    }

    private static void startCompat(Context c, Intent i) {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) c.startForegroundService(i);
            else c.startService(i);
        } catch (Exception ignored) {
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        String action = intent == null ? null : intent.getAction();
        if (ACTION_ENSURE.equals(action)) {
            deviceId = intent.getStringExtra(EXTRA_ID);
            receiving = true;
            goForeground();
            connectIfNeeded();
        } else if (ACTION_PAUSE.equals(action)) {
            receiving = false;
            closeWs();
            updateForegroundText(getString(R.string.svc_paused));
        } else if (ACTION_RESUME.equals(action)) {
            String id = intent.getStringExtra(EXTRA_ID);
            if (id != null) deviceId = id;
            receiving = true;
            if (!foreground) goForeground();
            connectIfNeeded();
        }
        return START_STICKY;
    }

    private void goForeground() {
        Notification n = buildServiceNotification(getString(R.string.svc_receiving));
        if (Build.VERSION.SDK_INT >= 29) {
            try {
                startForeground(NOTIF_SERVICE, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE);
                foreground = true;
            } catch (Throwable e) {
                android.util.Log.e("NearSend", "fgs with type failed: " + e);
            }
        }
        if (!foreground) {
            try {
                startForeground(NOTIF_SERVICE, n);
                foreground = true;
            } catch (Throwable e) {
                android.util.Log.e("NearSend", "fgs plain failed: " + e);
            }
        }
        if (foreground) {
            started = true;
            h.removeCallbacks(healthTask);
            h.postDelayed(healthTask, 25000);
        }
    }

    private void updateForegroundText(String text) {
        if (!foreground) return;
        try {
            NotificationManagerCompat.from(this).notify(NOTIF_SERVICE,
                    buildServiceNotification(text));
        } catch (Exception ignored) {
        }
    }

    private Notification buildServiceNotification(String text) {
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 0, open, flags());

        Device d = deviceId == null ? null : DeviceStore.get().byId(deviceId);
        String title = d == null ? getString(R.string.app_name) : d.displayName();

        return new NotificationCompat.Builder(this, App.CH_SERVICE)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(text)
                .setOngoing(true)
                .setShowWhen(false)
                .setPriority(NotificationCompat.PRIORITY_MIN)
                .setContentIntent(pi)
                .build();
    }

    private int flags() {
        return Build.VERSION.SDK_INT >= 23
                ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
                : PendingIntent.FLAG_UPDATE_CURRENT;
    }

    // ---------- 长连接 ----------

    private void connectIfNeeded() {
        if (!receiving) return;
        if (deviceId == null || deviceId.isEmpty()) {
            deviceId = DeviceStore.get().backgroundDeviceId();
            if (deviceId == null || deviceId.isEmpty()) return;
        }
        Device d = DeviceStore.get().byId(deviceId);
        if (d == null) return;
        if (ws != null && ws.isOpen()) return;
        if (!Prefs.backgroundReceive()) return;

        closeWs();
        retry = 1200;
        ws = new WsClient();
        ws.connect(d.ip, d.port, "/ws?t=" + d.token, 4000, new WsClient.Listener() {
            @Override
            public void onOpen() {
                retry = 1200;
                updateForegroundText(getString(R.string.svc_receiving));
            }

            @Override
            public void onMessage(String text) {
                handle(text);
            }

            @Override
            public void onClosed(String reason) {
                if (!receiving) return;
                updateForegroundText(getString(R.string.svc_reconnecting));
                h.removeCallbacks(retryTask);
                if (!Prefs.autoReconnect()) return;
                h.postDelayed(retryTask, retry);
                retry = Math.min((int) (retry * 1.8), 15000);
            }
        });
    }

    private void handle(String text) {
        try {
            JSONObject o = new JSONObject(text);
            String t = o.optString("t");
            if ("init".equals(t) || "presence".equals(t)) return;
            if (!"msg".equals(t)) return;
            JSONObject m = o.optJSONObject("msg");
            if (m == null) return;
            if (!"pc".equals(m.optString("from"))) return;
            if (App.chatVisible && deviceId != null && deviceId.equals(App.chatDeviceId)) return;

            String kind = m.optString("kind");
            if ("image".equals(kind) && "ok".equals(m.optString("status"))) {
                Downloader.autoSaveImage(this, DeviceStore.get().byId(deviceId),
                        m.optString("id"), m.optString("name", "image.png"));
            }
            msgCount++;
            if (Prefs.notificationsOn()) pushMessage(m);
        } catch (Exception ignored) {
        }
    }

    private void pushMessage(JSONObject m) {
        Device d = deviceId == null ? null : DeviceStore.get().byId(deviceId);
        String title = d == null ? getString(R.string.app_name) : d.displayName();

        String kind = m.optString("kind");
        String body;
        if ("text".equals(kind)) {
            body = m.optString("text");
        } else if ("image".equals(kind)) {
            body = getString(R.string.notif_image) + " · " + m.optString("name");
        } else {
            body = getString(R.string.notif_file) + " · " + m.optString("name");
        }
        if (!Prefs.notifyPreview()) body = getString(R.string.notif_hidden);
        if (body.length() > 160) body = body.substring(0, 160) + "…";
        if (body.equals(lastText)) return;
        lastText = body;

        Intent open = new Intent(this, ChatActivity.class);
        open.putExtra("deviceId", deviceId);
        open.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(this, 1, open, flags());

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, App.CH_MSG)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
                .setAutoCancel(true)
                .setNumber(msgCount)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setContentIntent(pi);

        if (Prefs.vibrate()) {
            b.setDefaults(NotificationCompat.DEFAULT_ALL);
        } else {
            b.setDefaults(0);
        }

        // 通知栏直接回复
        if (deviceId != null) {
            RemoteInput input = new RemoteInput.Builder(ReplyReceiver.KEY_TEXT)
                    .setLabel(getString(R.string.reply_hint))
                    .build();
            Intent reply = new Intent(this, ReplyReceiver.class);
            reply.putExtra(ReplyReceiver.EXTRA_DEVICE, deviceId);
            int replyFlags = PendingIntent.FLAG_UPDATE_CURRENT;
            if (Build.VERSION.SDK_INT >= 31) replyFlags |= PendingIntent.FLAG_MUTABLE;
            PendingIntent rpi = PendingIntent.getBroadcast(this, 2, reply, replyFlags);
            NotificationCompat.Action action = new NotificationCompat.Action.Builder(
                    R.drawable.ic_reply, getString(R.string.reply), rpi)
                    .addRemoteInput(input)
                    .setAllowGeneratedReplies(true)
                    .build();
            b.addAction(action);
        }

        try {
            NotificationManagerCompat.from(this).notify(NOTIF_MSG, b.build());
        } catch (Exception e) {
            android.util.Log.e("NearSend", "notify failed: " + e);
        }
    }

    private void checkHealth() {
        if (!receiving) return;
        if (ws == null || !ws.isOpen()) {
            connectIfNeeded();
            return;
        }
        long idle = System.currentTimeMillis() - ws.lastRecvAt();
        if (idle > 80000) {
            closeWs();
            connectIfNeeded();
        }
    }

    private void closeWs() {
        h.removeCallbacks(retryTask);
        if (ws != null) {
            try {
                ws.close();
            } catch (Exception ignored) {
            }
            ws = null;
        }
    }

    @Override
    public void onDestroy() {
        started = false;
        receiving = false;
        closeWs();
        h.removeCallbacksAndMessages(null);
        try {
            stopForeground(true);
        } catch (Exception ignored) {
        }
        super.onDestroy();
    }
}
