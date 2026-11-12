package com.nearsend.app;

import android.content.Context;
import android.content.SharedPreferences;

/**
 * 手机端的全部用户偏好。
 * 设备列表仍在 DeviceStore 里，这里只放「设置」页会改到的开关与选项。
 */
public final class Prefs {

    public static final String THEME_SYSTEM = "system";
    public static final String THEME_LIGHT = "light";
    public static final String THEME_DARK = "dark";

    public static final String FONT_S = "s";
    public static final String FONT_M = "m";
    public static final String FONT_L = "l";
    public static final String FONT_XL = "xl";

    private static SharedPreferences sp;

    private Prefs() {
    }

    public static void init(Context c) {
        if (sp == null) {
            sp = c.getApplicationContext().getSharedPreferences("nearsend", Context.MODE_PRIVATE);
        }
    }

    private static SharedPreferences p() {
        return sp;
    }

    private static boolean flag(String key, boolean fallback) {
        return sp == null ? fallback : sp.getBoolean(key, fallback);
    }

    private static String str(String key, String fallback) {
        if (sp == null) return fallback;
        String v = sp.getString(key, fallback);
        return v == null ? fallback : v;
    }

    private static void put(String key, String value) {
        if (sp != null) sp.edit().putString(key, value).apply();
    }

    private static void put(String key, boolean value) {
        if (sp != null) sp.edit().putBoolean(key, value).apply();
    }

    // ---------- 外观 ----------

    public static String theme() {
        String v = str("theme", THEME_SYSTEM);
        if (!THEME_LIGHT.equals(v) && !THEME_DARK.equals(v)) return THEME_SYSTEM;
        return v;
    }

    public static void setTheme(String v) {
        put("theme", v == null ? THEME_SYSTEM : v);
    }

    public static String chatFont() {
        String v = str("chatFont", FONT_M);
        if (FONT_S.equals(v) || FONT_L.equals(v) || FONT_XL.equals(v)) return v;
        return FONT_M;
    }

    public static void setChatFont(String v) {
        put("chatFont", v == null ? FONT_M : v);
    }

    public static float chatFontScale() {
        switch (chatFont()) {
            case FONT_S:
                return 0.9f;
            case FONT_L:
                return 1.1f;
            case FONT_XL:
                return 1.22f;
            default:
                return 1f;
        }
    }

    // ---------- 连接 ----------

    public static boolean backgroundReceive() {
        return flag("bgReceive", true);
    }

    public static void setBackgroundReceive(boolean on) {
        put("bgReceive", on);
    }

    public static boolean autoReconnect() {
        return flag("autoReconnect", true);
    }

    public static void setAutoReconnect(boolean on) {
        put("autoReconnect", on);
    }

    public static String defaultDeviceId() {
        return str("defaultDevice", "");
    }

    public static void setDefaultDeviceId(String id) {
        put("defaultDevice", id == null ? "" : id);
    }

    // ---------- 通知 ----------

    public static boolean notificationsOn() {
        return flag("notify", true);
    }

    public static void setNotificationsOn(boolean on) {
        put("notify", on);
    }

    public static boolean notifyPreview() {
        return flag("notifyPreview", true);
    }

    public static void setNotifyPreview(boolean on) {
        put("notifyPreview", on);
    }

    public static boolean vibrate() {
        return flag("vibrate", true);
    }

    public static void setVibrate(boolean on) {
        put("vibrate", on);
    }

    // ---------- 传输 ----------

    public static boolean autoSaveImages() {
        return flag("autoSaveImages", false);
    }

    public static void setAutoSaveImages(boolean on) {
        put("autoSaveImages", on);
    }

    // ---------- 引导 ----------

    public static boolean onboardingDone() {
        return flag("onboardingDone", false);
    }

    public static void setOnboardingDone(boolean done) {
        put("onboardingDone", done);
    }
}
