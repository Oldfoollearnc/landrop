package com.nearsend.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Vibrator;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;

/**
 * 给聊天页用的原生能力桥。
 * 网页运行在 http 上，属于非安全上下文，剪贴板、分享、保存文件都做不了——
 * 这些事交给原生做，网页只负责调用。
 */
public class Bridge {

    private final ChatActivity activity;
    private final Device device;

    Bridge(ChatActivity a, Device d) {
        this.activity = a;
        this.device = d;
    }

    /** 页面加载后可读的配置：主题、字号、是否原生容器。 */
    @JavascriptInterface
    public String config() {
        JSONObject o = new JSONObject();
        try {
            o.put("native", true);
            o.put("theme", activity.isNightTheme() ? "dark" : "light");
            o.put("font", Prefs.chatFont());
            o.put("fontScale", Prefs.chatFontScale());
            o.put("haptics", Prefs.vibrate());
            o.put("preview", Prefs.notifyPreview());
            o.put("version", activity.versionName());
        } catch (Exception ignored) {
        }
        return o.toString();
    }

    @JavascriptInterface
    public void toast(final String msg) {
        if (msg == null) return;
        MainThread.post(new Runnable() {
            @Override
            public void run() {
                Ui.toast(activity, msg);
            }
        });
    }

    @JavascriptInterface
    public void vibrate(int ms) {
        if (!Prefs.vibrate()) return;
        try {
            Vibrator v = (Vibrator) activity.getSystemService(Context.VIBRATOR_SERVICE);
            if (v != null && v.hasVibrator()) {
                v.vibrate(Math.max(5, Math.min(ms, 60)));
            }
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void copy(String text) {
        try {
            ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) return;
            cm.setPrimaryClip(ClipData.newPlainText("NearSend", text == null ? "" : text));
            toast(activity.getString(R.string.copied));
        } catch (Exception e) {
            toast(activity.getString(R.string.err_copy));
        }
    }

    @JavascriptInterface
    public String clipboard() {
        try {
            ClipboardManager cm = (ClipboardManager) activity.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) return "";
            ClipData cd = cm.getPrimaryClip();
            if (cd == null || cd.getItemCount() == 0) return "";
            CharSequence t = cd.getItemAt(0).coerceToText(activity);
            return t == null ? "" : t.toString();
        } catch (Exception e) {
            return "";
        }
    }

    /** 保存聊天里的一条图片 / 文件：返回下载 token（消息 id），供页面轮询进度。 */
    @JavascriptInterface
    public String saveMedia(String id, String name) {
        if (id == null || id.isEmpty()) return "";
        return DirectDownloads.start(activity, device, id, name);
    }

    @JavascriptInterface
    public String downloadStatus(String token) {
        return DirectDownloads.status(token);
    }

    @JavascriptInterface
    public void openDownload(String token) {
        DirectDownloads.open(activity, token);
    }

    @JavascriptInterface
    public void cancelDownload(String token) {
        DirectDownloads.cancel(token);
        toast(activity.getString(R.string.download_canceled));
    }

    @JavascriptInterface
    public void openDownloads() {
        DirectDownloads.openDownloads(activity);
    }

    /** 调起系统分享面板，把聊天里的文件发到别的 App。 */
    @JavascriptInterface
    public void shareMedia(String id, String name, String mime) {
        if (id == null || id.isEmpty()) return;
        Downloader.share(activity, device, id, name, mime);
    }

    @JavascriptInterface
    public void shareText(String text) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_TEXT, text == null ? "" : text);
            activity.startActivity(Intent.createChooser(i,
                    activity.getString(R.string.share_to)));
        } catch (Exception e) {
            toast(activity.getString(R.string.err_share));
        }
    }

    @JavascriptInterface
    public void openUrl(String url) {
        if (url == null) return;
        try {
            Uri u = Uri.parse(url);
            String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
            if (!scheme.equals("http") && !scheme.equals("https")) return;
            activity.startActivity(new Intent(Intent.ACTION_VIEW, u));
        } catch (Exception e) {
            toast(activity.getString(R.string.err_open));
        }
    }

    @JavascriptInterface
    public void openSettings() {
        try {
            activity.startActivity(new Intent(activity, SettingsActivity.class));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void openHelp() {
        try {
            activity.startActivity(new Intent(activity, HelpActivity.class));
        } catch (Exception ignored) {
        }
    }

    @JavascriptInterface
    public void setChrome(String mode) {
        final boolean dark = "dark".equals(mode);
        MainThread.post(new Runnable() {
            @Override
            public void run() {
                activity.setChrome(dark);
            }
        });
    }

    @JavascriptInterface
    public void close() {
        MainThread.post(new Runnable() {
            @Override
            public void run() {
                activity.finish();
            }
        });
    }
}
