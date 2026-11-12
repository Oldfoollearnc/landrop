package com.nearsend.app;

import android.Manifest;
import android.app.DownloadManager;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.Settings;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.NotificationManagerCompat;

import java.util.ArrayList;
import java.util.List;

/**
 * 完整的设置页。这里是旧版最缺的一块：
 * 以前只有一个「后台接收」开关和一段关于文字，现在把外观、连接、通知、传输、数据都收进来。
 */
public class SettingsActivity extends AppCompatActivity {

    private LinearLayout content;
    private final Runnable onStoreChanged = new Runnable() {
        @Override
        public void run() {
            rebuild();
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Ui.color(this, R.color.bg));
        Ui.setStatusBarIcons(this, !isNight());
        buildShell();
        DeviceStore.get().addListener(onStoreChanged);
        rebuild();
    }

    @Override
    protected void onResume() {
        super.onResume();
        rebuild();
    }

    @Override
    protected void onDestroy() {
        DeviceStore.get().removeListener(onStoreChanged);
        super.onDestroy();
    }

    private boolean isNight() {
        int mode = getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    // ---------- 骨架 ----------

    private void buildShell() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.color(this, R.color.bg));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setVerticalScrollBarEnabled(false);
        sv.setClipToPadding(false);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this, 16), Ui.statusBarHeight(this) + Ui.dp(this, 10),
                Ui.dp(this, 16), Sheet.navBar(this) + Ui.dp(this, 28));
        sv.addView(content);

        root.addView(sv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private void rebuild() {
        if (content == null) return;
        content.removeAllViews();
        content.addView(header());
        content.addView(gap(18));

        content.addView(brandCard());
        content.addView(gap(20));

        // 外观
        Group look = group(R.string.set_group_look);
        look.add(themeRow());
        look.add(divider());
        look.add(fontRow());
        content.addView(look.wrap);
        content.addView(gap(16));

        // 连接
        Group link = group(R.string.set_group_connect);
        link.add(defaultDeviceRow());
        link.add(divider());
        link.add(toggleRow(R.string.set_bg_receive, R.string.set_bg_receive_note,
                Prefs.backgroundReceive(), new Controls.OnChange() {
                    @Override
                    public void on(boolean checked) {
                        Prefs.setBackgroundReceive(checked);
                        if (checked) {
                            String id = DeviceStore.get().backgroundDeviceId();
                            if (!id.isEmpty()) LinkService.ensure(SettingsActivity.this, id);
                        } else {
                            LinkService.stop(SettingsActivity.this);
                        }
                        Ui.toast(SettingsActivity.this, checked
                                ? getString(R.string.set_bg_on) : getString(R.string.set_bg_off));
                    }
                }));
        link.add(divider());
        link.add(toggleRow(R.string.set_auto_reconnect, R.string.set_auto_reconnect_note,
                Prefs.autoReconnect(), new Controls.OnChange() {
                    @Override
                    public void on(boolean checked) {
                        Prefs.setAutoReconnect(checked);
                    }
                }));
        content.addView(link.wrap);
        content.addView(gap(16));

        // 通知
        Group notif = group(R.string.set_group_notify);
        notif.add(notifyRow());
        notif.add(divider());
        notif.add(toggleRow(R.string.set_preview, R.string.set_preview_note,
                Prefs.notifyPreview(), new Controls.OnChange() {
                    @Override
                    public void on(boolean checked) {
                        Prefs.setNotifyPreview(checked);
                    }
                }));
        notif.add(divider());
        notif.add(toggleRow(R.string.set_vibrate, R.string.set_vibrate_note,
                Prefs.vibrate(), new Controls.OnChange() {
                    @Override
                    public void on(boolean checked) {
                        Prefs.setVibrate(checked);
                    }
                }));
        content.addView(notif.wrap);
        content.addView(gap(16));

        // 传输
        Group transfer = group(R.string.set_group_transfer);
        transfer.add(toggleRow(R.string.set_auto_save, R.string.set_auto_save_note,
                Prefs.autoSaveImages(), new Controls.OnChange() {
                    @Override
                    public void on(boolean checked) {
                        Prefs.setAutoSaveImages(checked);
                        Ui.toast(SettingsActivity.this, getString(checked
                                ? R.string.set_auto_save_on : R.string.set_auto_save_off));
                    }
                }));
        transfer.add(divider());
        transfer.add(actionRow(getString(R.string.set_save_dir), getString(R.string.set_save_dir_value),
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            startActivity(new Intent(DownloadManager.ACTION_VIEW_DOWNLOADS));
                        } catch (Exception e) {
                            Ui.toast(SettingsActivity.this, getString(R.string.set_save_dir_fail));
                        }
                    }
                }));
        transfer.add(divider());
        transfer.add(actionRow(getString(R.string.downloads), getString(R.string.downloads_note),
                new Runnable() {
                    @Override
                    public void run() {
                        Downloader.openDownloads(SettingsActivity.this);
                    }
                }));
        content.addView(transfer.wrap);
        content.addView(gap(16));

        // 数据
        Group data = group(R.string.set_group_data);
        data.add(actionRow(getString(R.string.set_clear_remote),
                getString(R.string.set_clear_remote_note), new Runnable() {
                    @Override
                    public void run() {
                        confirmClearRemote();
                    }
                }));
        data.add(divider());
        data.add(actionRow(getString(R.string.set_forget_all),
                getString(R.string.set_forget_all_note), new Runnable() {
                    @Override
                    public void run() {
                        confirmForgetAll();
                    }
                }));
        data.add(divider());
        data.add(actionRow(getString(R.string.set_privacy),
                getString(R.string.set_privacy_note), new Runnable() {
                    @Override
                    public void run() {
                        showPrivacy();
                    }
                }));
        content.addView(data.wrap);
        content.addView(gap(16));

        // 支持
        Group support = group(R.string.set_group_support);
        support.add(actionRow(getString(R.string.set_help), getString(R.string.set_help_note),
                new Runnable() {
                    @Override
                    public void run() {
                        startActivity(new Intent(SettingsActivity.this, HelpActivity.class));
                    }
                }));
        support.add(divider());
        support.add(infoRow(getString(R.string.set_version), versionName()));
        support.add(divider());
        support.add(infoRow(getString(R.string.set_license), "MIT"));
        content.addView(support.wrap);

        TextView foot = Ui.text(this, getString(R.string.set_footer), 11.5f,
                Ui.color(this, R.color.ink3));
        foot.setGravity(Gravity.CENTER);
        foot.setLineSpacing(Ui.dp(this, 3), 1f);
        LinearLayout.LayoutParams flp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        flp.topMargin = Ui.dp(this, 26);
        foot.setLayoutParams(flp);
        content.addView(foot);
    }

    // ---------- 顶部 ----------

    private View header() {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout back = new FrameLayout(this);
        int s = Ui.dp(this, 38);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(s, s);
        back.setLayoutParams(blp);
        back.setBackground(Ui.round(this, Ui.color(this, R.color.surface2), 12));
        ImageView iv = new ImageView(this);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(Ui.dp(this, 18), Ui.dp(this, 18));
        ilp.gravity = Gravity.CENTER;
        iv.setLayoutParams(ilp);
        iv.setImageResource(R.drawable.ic_back);
        back.addView(iv);
        back.setClickable(true);
        Ui.pressable(back);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        head.addView(back);

        TextView title = Ui.text(this, getString(R.string.settings), 20,
                Ui.color(this, R.color.ink), true);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = Ui.dp(this, 12);
        title.setLayoutParams(tlp);
        head.addView(title);
        return head;
    }

    private View brandCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 20,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 16);
        card.setPadding(p, p, p, p);

        LinearLayout mark = new LinearLayout(this);
        mark.setGravity(Gravity.CENTER);
        mark.setBackground(Ui.round(this, Ui.color(this, R.color.accent), 15));
        int ms = Ui.dp(this, 46);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(ms, ms);
        mlp.rightMargin = Ui.dp(this, 14);
        mark.setLayoutParams(mlp);
        ImageView icon = new ImageView(this);
        icon.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 24), Ui.dp(this, 24)));
        icon.setImageResource(R.drawable.ic_brand);
        mark.addView(icon);
        card.addView(mark);

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        mid.addView(Ui.text(this, getString(R.string.app_name), 16,
                Ui.color(this, R.color.ink), true));
        TextView sub = Ui.text(this, getString(R.string.brand_sub), 12,
                Ui.color(this, R.color.ink3));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 4);
        sub.setLayoutParams(slp);
        mid.addView(sub);
        card.addView(mid);
        return card;
    }

    // ---------- 行 ----------

    private static final class Group {
        final LinearLayout wrap;
        final LinearLayout card;

        Group(LinearLayout wrap, LinearLayout card) {
            this.wrap = wrap;
            this.card = card;
        }

        void add(View v) {
            card.addView(v);
        }
    }

    private Group group(int titleRes) {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);
        TextView t = Ui.text(this, getString(titleRes), 11.5f,
                Ui.color(this, R.color.ink3), true);
        t.setLetterSpacing(0.08f);
        t.setPadding(Ui.dp(this, 6), 0, 0, Ui.dp(this, 9));
        wrap.addView(t);

        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 18,
                Ui.color(this, R.color.line), 1));
        card.setPadding(0, Ui.dp(this, 2), 0, Ui.dp(this, 2));
        wrap.addView(card);
        return new Group(wrap, card);
    }

    private View divider() {
        View v = new View(this);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, Ui.dp(this, 0.7f)));
        lp.leftMargin = Ui.dp(this, 16);
        lp.rightMargin = Ui.dp(this, 16);
        v.setLayoutParams(lp);
        v.setBackgroundColor(Ui.color(this, R.color.line));
        return v;
    }

    private View rowShell(String label, String sub) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Ui.dp(this, 16), Ui.dp(this, 13), Ui.dp(this, 16), Ui.dp(this, 13));

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        texts.addView(Ui.text(this, label, 14.5f, Ui.color(this, R.color.ink)));
        if (sub != null && !sub.isEmpty()) {
            TextView s = Ui.text(this, sub, 11.5f, Ui.color(this, R.color.ink3));
            s.setLineSpacing(Ui.dp(this, 2), 1f);
            LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            slp.topMargin = Ui.dp(this, 4);
            s.setLayoutParams(slp);
            texts.addView(s);
        }
        row.addView(texts);
        row.setTag(texts);
        return row;
    }

    private View toggleRow(int label, int note, boolean checked, Controls.OnChange change) {
        View row = rowShell(getString(label), note == 0 ? null : getString(note));
        final Controls.Toggle t = new Controls.Toggle(this);
        t.setChecked(checked);
        t.setListener(change);
        ((LinearLayout) row).addView(t);
        return row;
    }

    private View navRow(String label, String value, final Runnable click) {
        View row = rowShell(label, null);
        final TextView v = Ui.text(this, value, 12.5f, Ui.color(this, R.color.ink3));
        v.setGravity(Gravity.CENTER_VERTICAL);
        v.setSingleLine(true);
        v.setEllipsize(TextUtils.TruncateAt.END);
        v.setMaxWidth(Ui.dp(this, 170));
        ((LinearLayout) row).addView(v);
        ImageView chev = new ImageView(this);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(Ui.dp(this, 16), Ui.dp(this, 16));
        clp.leftMargin = Ui.dp(this, 6);
        chev.setLayoutParams(clp);
        chev.setImageResource(R.drawable.ic_chevron);
        chev.setAlpha(0.7f);
        ((LinearLayout) row).addView(chev);
        row.setClickable(true);
        row.setFocusable(true);
        row.setBackgroundResource(R.drawable.pill_ripple_none);
        Ui.pressable(row);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v2) {
                click.run();
            }
        });
        return row;
    }

    private View infoRow(String label, String value) {
        View row = rowShell(label, null);
        TextView v = Ui.text(this, value, 12.5f, Ui.color(this, R.color.ink3));
        ((LinearLayout) row).addView(v);
        return row;
    }

    /** 带说明文字的操作行，右侧只有一个箭头 */
    private View actionRow(String label, String sub, final Runnable click) {
        View row = rowShell(label, sub);
        ImageView chev = new ImageView(this);
        chev.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 16), Ui.dp(this, 16)));
        chev.setImageResource(R.drawable.ic_chevron);
        chev.setAlpha(0.7f);
        ((LinearLayout) row).addView(chev);
        row.setClickable(true);
        row.setFocusable(true);
        row.setBackgroundResource(R.drawable.pill_ripple_none);
        Ui.pressable(row);
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                click.run();
            }
        });
        return row;
    }

    private View themeRow() {
        View row = rowShell(getString(R.string.set_theme), getString(R.string.set_theme_note));
        String[] labels = {getString(R.string.theme_system_short),
                getString(R.string.theme_light), getString(R.string.theme_dark)};
        int idx = 0;
        if (Prefs.THEME_LIGHT.equals(Prefs.theme())) idx = 1;
        else if (Prefs.THEME_DARK.equals(Prefs.theme())) idx = 2;
        final String[] values = {Prefs.THEME_SYSTEM, Prefs.THEME_LIGHT, Prefs.THEME_DARK};
        Controls.Segmented seg = new Controls.Segmented(this, labels, idx, new Controls.OnPick() {
            @Override
            public void on(int index) {
                Prefs.setTheme(values[index]);
                App.applyNightMode(values[index]);
            }
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                Ui.dp(this, 182), ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.leftMargin = Ui.dp(this, 10);
        seg.setLayoutParams(slp);
        ((LinearLayout) row).addView(seg);
        return row;
    }

    private View fontRow() {
        View row = rowShell(getString(R.string.set_font), getString(R.string.set_font_note));
        String[] labels = {"小", "标准", "大", "特大"};
        final String[] values = {Prefs.FONT_S, Prefs.FONT_M, Prefs.FONT_L, Prefs.FONT_XL};
        int idx = 1;
        for (int i = 0; i < values.length; i++) {
            if (values[i].equals(Prefs.chatFont())) idx = i;
        }
        Controls.Segmented seg = new Controls.Segmented(this, labels, idx, new Controls.OnPick() {
            @Override
            public void on(int index) {
                Prefs.setChatFont(values[index]);
            }
        });
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                Ui.dp(this, 188), ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.leftMargin = Ui.dp(this, 6);
        seg.setLayoutParams(slp);
        ((LinearLayout) row).addView(seg);
        return row;
    }

    private View notifyRow() {
        final boolean allowed = notificationsAllowed();
        View row = rowShell(getString(R.string.set_notify),
                getString(allowed ? R.string.set_notify_note : R.string.set_notify_blocked));
        final Controls.Toggle t = new Controls.Toggle(this);
        t.setChecked(Prefs.notificationsOn() && allowed);
        t.setListener(new Controls.OnChange() {
            @Override
            public void on(boolean checked) {
                if (checked && !allowed) {
                    openNotificationSettings();
                    t.setChecked(false);
                    return;
                }
                Prefs.setNotificationsOn(checked);
            }
        });
        ((LinearLayout) row).addView(t);
        return row;
    }

    // ---------- 设备 ----------

    private View defaultDeviceRow() {
        Device d = null;
        String id = DeviceStore.get().backgroundDeviceId();
        if (!id.isEmpty()) d = DeviceStore.get().byId(id);
        String value = d == null ? getString(R.string.set_default_none) : d.displayName();
        return navRow(getString(R.string.set_default_device), value, new Runnable() {
            @Override
            public void run() {
                pickDefaultDevice();
            }
        });
    }

    private void pickDefaultDevice() {
        final List<Device> list = DeviceStore.get().all();
        List<Sheet.Item> items = new ArrayList<>();
        items.add(new Sheet.Item(getString(R.string.set_default_auto), R.drawable.ic_refresh,
                new Runnable() {
                    @Override
                    public void run() {
                        Prefs.setDefaultDeviceId("");
                        rebuild();
                    }
                }));
        for (final Device d : list) {
            String label = d.displayName();
            if (DeviceStore.get().isDefault(d.id)) label = label + " · " + getString(R.string.set_current);
            items.add(new Sheet.Item(label, R.drawable.ic_link, new Runnable() {
                @Override
                public void run() {
                    Prefs.setDefaultDeviceId(d.id);
                    DeviceStore.get().setBackgroundDeviceId(d.id);
                    rebuild();
                }
            }));
        }
        Sheet.show(this, getString(R.string.set_default_device), items);
    }

    // ---------- 操作 ----------

    private void confirmClearRemote() {
        final Device d = primaryDevice();
        if (d == null) {
            Ui.toast(this, getString(R.string.err_no_device));
            return;
        }
        Sheet.confirm(this, getString(R.string.set_clear_remote_confirm),
                getString(R.string.set_clear_remote), new Runnable() {
                    @Override
                    public void run() {
                        final Dialog2 dlg = new Dialog2();
                        Bg.io(new java.util.concurrent.Callable<Boolean>() {
                            @Override
                            public Boolean call() {
                                return ApiClient.clearHistory(d);
                            }
                        }, new Bg.Result<Boolean>() {
                            @Override
                            public void on(Boolean ok) {
                                dlg.dismiss();
                                Ui.toast(SettingsActivity.this, getString(Boolean.TRUE.equals(ok)
                                        ? R.string.set_clear_remote_done : R.string.err_unreachable));
                            }
                        });
                    }
                });
    }

    private void confirmForgetAll() {
        if (DeviceStore.get().isEmpty()) {
            Ui.toast(this, getString(R.string.err_no_device));
            return;
        }
        Sheet.confirm(this, getString(R.string.set_forget_all_confirm),
                getString(R.string.set_forget_all), new Runnable() {
                    @Override
                    public void run() {
                        for (Device d : DeviceStore.get().all()) DeviceStore.get().remove(d.id);
                        Prefs.setDefaultDeviceId("");
                        LinkService.stop(SettingsActivity.this);
                        rebuild();
                        Ui.toast(SettingsActivity.this, getString(R.string.set_forget_all_done));
                    }
                });
    }

    private void showPrivacy() {
        androidx.appcompat.app.AlertDialog dlg = new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle(R.string.set_privacy)
                .setMessage(R.string.set_privacy_body)
                .setPositiveButton(R.string.ok, null)
                .create();
        dlg.show();
        if (dlg.getWindow() != null) {
            dlg.getWindow().setBackgroundDrawable(new android.graphics.drawable.InsetDrawable(
                    Ui.round(this, Ui.color(this, R.color.surface), 20), Ui.dp(this, 24)));
        }
    }

    private Device primaryDevice() {
        String id = DeviceStore.get().backgroundDeviceId();
        Device d = id.isEmpty() ? null : DeviceStore.get().byId(id);
        return d != null ? d : DeviceStore.get().primary();
    }

    // ---------- 小工具 ----------

    private String versionName() {
        try {
            PackageInfo pi = getPackageManager().getPackageInfo(getPackageName(), 0);
            return pi.versionName == null ? "1.0.0" : pi.versionName;
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    private boolean notificationsAllowed() {
        try {
            return NotificationManagerCompat.from(this).areNotificationsEnabled();
        } catch (Exception e) {
            return true;
        }
    }

    private void openNotificationSettings() {
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
            startActivity(i);
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                i.setData(Uri.fromParts("package", getPackageName(), null));
                startActivity(i);
            } catch (Exception ignored) {
                Ui.toast(this, getString(R.string.set_notify_blocked));
            }
        }
    }

    private View gap(int dp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Ui.dp(this, dp)));
        return v;
    }

    /** 轻量「处理中」遮罩，避免为一次网络请求引入 ProgressDialog */
    private class Dialog2 {
        private final android.app.Dialog d;

        Dialog2() {
            d = new android.app.Dialog(SettingsActivity.this);
            d.requestWindowFeature(android.view.Window.FEATURE_NO_TITLE);
            LinearLayout box = new LinearLayout(SettingsActivity.this);
            box.setBackground(Ui.round(SettingsActivity.this,
                    Ui.color(SettingsActivity.this, R.color.surface), 16));
            int p = Ui.dp(SettingsActivity.this, 20);
            box.setPadding(p, p, p, p);
            box.addView(Ui.text(SettingsActivity.this, getString(R.string.set_clearing),
                    14, Ui.color(SettingsActivity.this, R.color.ink2)));
            d.setContentView(box);
            if (d.getWindow() != null) {
                d.getWindow().setBackgroundDrawable(new android.graphics.drawable.ColorDrawable(0));
                d.getWindow().setLayout(Ui.dp(SettingsActivity.this, 200),
                        ViewGroup.LayoutParams.WRAP_CONTENT);
                d.getWindow().setGravity(Gravity.CENTER);
                d.getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_DIM_BEHIND);
                android.view.WindowManager.LayoutParams lp = d.getWindow().getAttributes();
                lp.dimAmount = 0.4f;
                d.getWindow().setAttributes(lp);
            }
            d.show();
        }

        void dismiss() {
            try {
                d.dismiss();
            } catch (Exception ignored) {
            }
        }
    }
}
