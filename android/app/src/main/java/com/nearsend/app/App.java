package com.nearsend.app;

import android.app.Activity;
import android.app.Application;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.os.Build;
import android.os.Bundle;

import androidx.appcompat.app.AppCompatDelegate;

public class App extends Application implements Application.ActivityLifecycleCallbacks {

    public static final String CH_MSG = "msg";
    public static final String CH_SERVICE = "service";
    public static final String CH_TRANSFER = "transfer";

    public static App I;

    /** 聊天页当前是否在前台、显示的是哪台设备（用于决定要不要弹通知） */
    public static volatile boolean chatVisible = false;
    public static volatile String chatDeviceId = "";

    private int started;

    @Override
    public void onCreate() {
        super.onCreate();
        I = this;
        Prefs.init(this);
        applyNightMode(Prefs.theme());
        DeviceStore.init(this);
        createChannels();
        registerActivityLifecycleCallbacks(this);
    }

    /** 跟随系统 / 强制浅色 / 强制深色，AppCompat 会负责重建已打开的界面 */
    public static void applyNightMode(String mode) {
        int value = AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM;
        if (Prefs.THEME_LIGHT.equals(mode)) value = AppCompatDelegate.MODE_NIGHT_NO;
        else if (Prefs.THEME_DARK.equals(mode)) value = AppCompatDelegate.MODE_NIGHT_YES;
        AppCompatDelegate.setDefaultNightMode(value);
    }

    private void createChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm == null) return;

        NotificationChannel msg = new NotificationChannel(CH_MSG, getString(R.string.notif_channel),
                NotificationManager.IMPORTANCE_HIGH);
        msg.setDescription(getString(R.string.notif_channel_desc));
        msg.enableVibration(true);
        msg.setShowBadge(true);
        nm.createNotificationChannel(msg);

        NotificationChannel svc = new NotificationChannel(CH_SERVICE, getString(R.string.notif_service_channel),
                NotificationManager.IMPORTANCE_MIN);
        svc.setDescription(getString(R.string.notif_service_desc));
        svc.setShowBadge(false);
        nm.createNotificationChannel(svc);

        NotificationChannel transfer = new NotificationChannel(CH_TRANSFER,
                getString(R.string.notif_transfer_channel), NotificationManager.IMPORTANCE_LOW);
        transfer.setDescription(getString(R.string.notif_transfer_desc));
        transfer.setShowBadge(false);
        nm.createNotificationChannel(transfer);
    }

    // ---------- 前后台切换 ----------

    @Override
    public void onActivityStarted(Activity a) {
        started++;
        if (started == 1) LinkService.pauseReceiving(this);
    }

    @Override
    public void onActivityStopped(Activity a) {
        started--;
        if (started > 0) return;
        started = 0;
        chatVisible = false;
        if (!Prefs.backgroundReceive()) return;
        String id = DeviceStore.get().backgroundDeviceId();
        if (id != null && !id.isEmpty()) LinkService.resumeReceiving(this, id);
    }

    @Override
    public void onActivityCreated(Activity a, Bundle b) {
    }

    @Override
    public void onActivityResumed(Activity a) {
    }

    @Override
    public void onActivityPaused(Activity a) {
    }

    @Override
    public void onActivitySaveInstanceState(Activity a, Bundle b) {
    }

    @Override
    public void onActivityDestroyed(Activity a) {
    }
}
