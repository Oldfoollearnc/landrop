package com.nearsend.app;

import android.Manifest;
import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.os.Bundle;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public class MainActivity extends AppCompatActivity {

    private static final int REQ_SCAN = 101;
    private static final int REQ_MANUAL = 102;
    private static final int REQ_ONBOARD = 103;

    private ScrollView scroll;
    private LinearLayout content;
    private LinearLayout deviceBox;
    private LinearLayout nearbyBox;
    private LinearLayout deviceSection;
    private LinearLayout nearSection;
    private View emptyWrap;
    private TextView nearbyState;
    private TextView summaryView;
    private View scanFill;
    private FrameLayout scanTrack;

    private Discovery discovery;
    private final List<ApiClient.Found> nearby = new ArrayList<>();
    private boolean scanning;
    private int scanDone;
    private int scanTotal;
    private long lastScanAt;

    private boolean night;

    private final Runnable onStoreChanged = new Runnable() {
        @Override
        public void run() {
            render();
        }
    };

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        night = isNight();
        getWindow().setStatusBarColor(Ui.color(this, R.color.bg));
        Ui.setStatusBarIcons(this, !night);
        buildUi();
        DeviceStore.get().addListener(onStoreChanged);
        askNotification();
        if (!Prefs.onboardingDone()) {
            startActivityForResult(new Intent(this, OnboardingActivity.class), REQ_ONBOARD);
        }
        render();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent != null && intent.getBooleanExtra("scan", false)) {
            openScan();
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        App.chatVisible = false;
        App.chatDeviceId = "";
        refreshStates();
        startScanIfStale();
        render();
    }

    @Override
    protected void onDestroy() {
        DeviceStore.get().removeListener(onStoreChanged);
        stopScan();
        super.onDestroy();
    }

    private boolean isNight() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    private void askNotification() {
        if (Build.VERSION.SDK_INT >= 33
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 900);
        }
    }

    // ---------- UI ----------

    private void buildUi() {
        int bg = Ui.color(this, R.color.bg);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(bg);

        scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setVerticalScrollBarEnabled(false);
        scroll.setClipToPadding(false);

        content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL);
        content.setPadding(Ui.dp(this, 20), Ui.statusBarHeight(this) + Ui.dp(this, 18),
                Ui.dp(this, 20), Ui.dp(this, 150));

        content.addView(buildHeader());
        content.addView(gap(22));

        emptyWrap = buildEmpty();
        content.addView(emptyWrap);

        // 我的电脑
        deviceSection = new LinearLayout(this);
        deviceSection.setOrientation(LinearLayout.VERTICAL);
        deviceSection.addView(sectionLabel(getString(R.string.devices)));
        deviceBox = new LinearLayout(this);
        deviceBox.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dlp.topMargin = Ui.dp(this, 12);
        deviceBox.setLayoutParams(dlp);
        deviceSection.addView(deviceBox);
        content.addView(deviceSection);

        content.addView(gap(22));

        // 附近发现
        nearSection = new LinearLayout(this);
        nearSection.setOrientation(LinearLayout.VERTICAL);

        LinearLayout nearHead = new LinearLayout(this);
        nearHead.setOrientation(LinearLayout.HORIZONTAL);
        nearHead.setGravity(Gravity.CENTER_VERTICAL);

        TextView nl = sectionLabel(getString(R.string.nearby));
        LinearLayout.LayoutParams nllp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        nl.setLayoutParams(nllp);
        nearHead.addView(nl);

        nearbyState = Ui.text(this, "", 11.5f, Ui.color(this, R.color.ink3));
        nearHead.addView(nearbyState);
        nearSection.addView(nearHead);

        scanTrack = new FrameLayout(this);
        LinearLayout.LayoutParams trlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 2));
        trlp.topMargin = Ui.dp(this, 10);
        trlp.bottomMargin = Ui.dp(this, 12);
        scanTrack.setLayoutParams(trlp);
        scanTrack.setBackground(Ui.round(this, Ui.color(this, R.color.line), 1));
        scanFill = new View(this);
        scanFill.setLayoutParams(new FrameLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT));
        scanFill.setBackground(Ui.round(this, Ui.color(this, R.color.accent), 1));
        scanTrack.addView(scanFill);
        nearSection.addView(scanTrack);

        nearbyBox = new LinearLayout(this);
        nearbyBox.setOrientation(LinearLayout.VERTICAL);
        nearSection.addView(nearbyBox);
        content.addView(nearSection);

        content.addView(gap(18));
        TextView note = Ui.text(this, getString(R.string.home_footer), 11.5f,
                Ui.color(this, R.color.ink3));
        note.setLineSpacing(Ui.dp(this, 3), 1f);
        content.addView(note);

        scroll.addView(content);
        root.addView(scroll, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // 底部操作
        root.addView(buildBottom(), bottomParams());

        setContentView(root);
    }

    private FrameLayout.LayoutParams bottomParams() {
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.gravity = Gravity.BOTTOM;
        return lp;
    }

    private View buildHeader() {
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout mark = new FrameLayout(this);
        int ms = Ui.dp(this, 44);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(ms, ms);
        mlp.rightMargin = Ui.dp(this, 12);
        mark.setLayoutParams(mlp);
        mark.setBackground(Ui.round(this, Ui.color(this, R.color.accent), 14));
        ImageView icon = new ImageView(this);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(Ui.dp(this, 23), Ui.dp(this, 23));
        ilp.gravity = Gravity.CENTER;
        icon.setLayoutParams(ilp);
        icon.setImageResource(R.drawable.ic_brand);
        mark.addView(icon);
        head.addView(mark);

        LinearLayout titles = new LinearLayout(this);
        titles.setOrientation(LinearLayout.VERTICAL);
        titles.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView title = Ui.text(this, getString(R.string.app_name), 22,
                Ui.color(this, R.color.ink), true);
        title.setLetterSpacing(0.01f);
        titles.addView(title);

        summaryView = Ui.text(this, getString(R.string.tagline), 12,
                Ui.color(this, R.color.ink3));
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        glp.topMargin = Ui.dp(this, 4);
        summaryView.setLayoutParams(glp);
        titles.addView(summaryView);
        head.addView(titles);

        head.addView(iconSquare(R.drawable.ic_settings, 40, 13, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(MainActivity.this, SettingsActivity.class));
            }
        }));
        head.addView(iconSquare(R.drawable.ic_scan, 44, 15, new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openScan();
            }
        }));
        return head;
    }

    private View buildEmpty() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = Ui.dp(this, 4);
        box.setLayoutParams(lp);
        box.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 20,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 20);
        box.setPadding(p, p, p, p);

        TextView t = Ui.text(this, getString(R.string.empty_title), 16,
                Ui.color(this, R.color.ink), true);
        box.addView(t);

        TextView b = Ui.text(this, getString(R.string.empty_body), 12.5f,
                Ui.color(this, R.color.ink2));
        b.setLineSpacing(Ui.dp(this, 4), 1f);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = Ui.dp(this, 8);
        b.setLayoutParams(blp);
        box.addView(b);

        TextView help = Ui.text(this, getString(R.string.empty_help), 12, 
                Ui.color(this, R.color.accent), true);
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hlp.topMargin = Ui.dp(this, 14);
        help.setLayoutParams(hlp);
        help.setPadding(0, Ui.dp(this, 4), 0, Ui.dp(this, 4));
        help.setClickable(true);
        help.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(MainActivity.this, HelpActivity.class));
            }
        });
        box.addView(help);
        return box;
    }

    private View buildBottom() {
        LinearLayout wrap = new LinearLayout(this);
        wrap.setOrientation(LinearLayout.VERTICAL);

        View fade = new View(this);
        GradientDrawable g = new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,
                new int[]{Color.TRANSPARENT, Ui.color(this, R.color.bg)});
        fade.setBackground(g);
        wrap.addView(fade, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 28)));

        LinearLayout bar = new LinearLayout(this);
        bar.setOrientation(LinearLayout.VERTICAL);
        bar.setBackgroundColor(Ui.color(this, R.color.bg));
        bar.setPadding(Ui.dp(this, 20), Ui.dp(this, 4), Ui.dp(this, 20),
                Sheet.navBar(this) + Ui.dp(this, 12));

        TextView primary = Ui.text(this, getString(R.string.pair_scan), 15,
                Ui.color(this, R.color.accentFg), true);
        primary.setGravity(Gravity.CENTER);
        primary.setBackgroundResource(R.drawable.btn_primary);
        primary.setPadding(0, Ui.dp(this, 15), 0, Ui.dp(this, 15));
        primary.setClickable(true);
        Ui.pressable(primary);
        primary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                openScan();
            }
        });
        bar.addView(primary);

        TextView manual = Ui.text(this, getString(R.string.pair_manual), 14,
                Ui.color(this, R.color.ink2), true);
        manual.setGravity(Gravity.CENTER);
        manual.setBackgroundResource(R.drawable.btn_ghost);
        manual.setPadding(0, Ui.dp(this, 13), 0, Ui.dp(this, 13));
        manual.setClickable(true);
        Ui.pressable(manual);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        mlp.topMargin = Ui.dp(this, 9);
        manual.setLayoutParams(mlp);
        manual.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivityForResult(new Intent(MainActivity.this, ManualPairActivity.class), REQ_MANUAL);
            }
        });
        bar.addView(manual);

        wrap.addView(bar);
        return wrap;
    }

    private TextView sectionLabel(String s) {
        TextView tv = Ui.text(this, s, 11.5f, Ui.color(this, R.color.ink3), true);
        tv.setLetterSpacing(0.09f);
        return tv;
    }

    private FrameLayout iconSquare(int iconRes, int sizeDp, float radiusDp, View.OnClickListener l) {
        FrameLayout f = new FrameLayout(this);
        f.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface2), radiusDp,
                Ui.color(this, R.color.line), 1));
        ImageView iv = new ImageView(this);
        int icon = Math.round(sizeDp * 0.47f);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Ui.dp(this, icon), Ui.dp(this, icon));
        lp.gravity = Gravity.CENTER;
        iv.setLayoutParams(lp);
        iv.setImageResource(iconRes);
        f.addView(iv);
        LinearLayout.LayoutParams flp = new LinearLayout.LayoutParams(Ui.dp(this, sizeDp),
                Ui.dp(this, sizeDp));
        flp.leftMargin = Ui.dp(this, 8);
        f.setLayoutParams(flp);
        f.setClickable(true);
        Ui.pressable(f);
        f.setOnClickListener(l);
        return f;
    }

    private View gap(int dp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Ui.dp(this, dp)));
        return v;
    }

    // ---------- 渲染 ----------

    private void render() {
        int keep = scroll != null ? scroll.getScrollY() : 0;

        List<Device> list = DeviceStore.get().all();
        List<ApiClient.Found> unpaired = new ArrayList<>();
        for (ApiClient.Found f : nearby) {
            if (!isPaired(f)) unpaired.add(f);
        }

        boolean noDevice = list.isEmpty();
        // 扫描期间也保留空状态卡片，否则页面上只剩一条进度条
        boolean emptyState = noDevice && unpaired.isEmpty();
        // 没扫到东西时不占位置：附近发现只在扫描中或有结果时出现
        boolean hideNear = unpaired.isEmpty() && !scanning;

        emptyWrap.setVisibility(emptyState ? View.VISIBLE : View.GONE);
        deviceSection.setVisibility(noDevice ? View.GONE : View.VISIBLE);
        nearSection.setVisibility(hideNear ? View.GONE : View.VISIBLE);

        summaryView.setText(summary(list));

        deviceBox.removeAllViews();
        for (Device d : list) {
            deviceBox.addView(deviceCard(d));
            deviceBox.addView(gap(10));
        }

        nearbyBox.removeAllViews();
        for (ApiClient.Found f : unpaired) {
            nearbyBox.addView(foundCard(f));
            nearbyBox.addView(gap(10));
        }
        if (scanning) {
            nearbyBox.addView(nearbyHint(true));
        } else if (unpaired.isEmpty() && !noDevice) {
            nearbyBox.addView(nearbyHint(false));
        }

        scanTrack.setVisibility(scanning ? View.VISIBLE : View.GONE);

        if (scanning) {
            nearbyState.setText(scanTotal > 0 ? scanDone + "/" + scanTotal : getString(R.string.nearby_searching));
            progress(scanDone, scanTotal);
        } else {
            nearbyState.setText(unpaired.isEmpty() ? "" : getString(R.string.nearby_count, unpaired.size()));
        }

        if (scroll != null) scroll.scrollTo(0, keep);
    }

    private String summary(List<Device> list) {
        if (list.isEmpty()) return getString(R.string.tagline);
        int online = 0;
        for (Device d : list) if (d.state == Device.STATE_ONLINE) online++;
        if (online > 0) return getString(R.string.summary_online, online, list.size());
        return getString(R.string.summary_count, list.size());
    }

    private void progress(int done, int total) {
        if (scanFill == null) return;
        View parent = (View) scanFill.getParent();
        int w = parent == null ? 0 : parent.getWidth();
        if (w <= 0) return;
        float ratio = total <= 0 ? 0f : Math.min(1f, done / (float) total);
        ViewGroup.LayoutParams lp = scanFill.getLayoutParams();
        lp.width = Math.round(w * ratio);
        scanFill.setLayoutParams(lp);
    }

    private boolean isPaired(ApiClient.Found f) {
        for (Device d : DeviceStore.get().all()) {
            if (d.ip.equals(f.ip) && d.port == f.port) return true;
        }
        return false;
    }

    private View deviceCard(final Device d) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setBackgroundResource(R.drawable.card_ripple);
        int p = Ui.dp(this, 14);
        card.setPadding(p, p, Ui.dp(this, 12), p);
        card.setClickable(true);
        card.setFocusable(true);
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        card.setLayoutParams(clp);
        Ui.pressable(card);

        card.addView(avatar(d.displayName(), d.state, d.id));

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        mlp.leftMargin = Ui.dp(this, 13);
        mid.setLayoutParams(mlp);

        LinearLayout nameRow = new LinearLayout(this);
        nameRow.setOrientation(LinearLayout.HORIZONTAL);
        nameRow.setGravity(Gravity.CENTER_VERTICAL);

        TextView name = Ui.text(this, d.displayName(), 15.5f, Ui.color(this, R.color.ink), true);
        name.setSingleLine(true);
        name.setEllipsize(TextUtils.TruncateAt.END);
        name.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        nameRow.addView(name);

        if (DeviceStore.get().isDefault(d.id)) {
            TextView badge = Ui.text(this, getString(R.string.badge_default), 9.5f,
                    Ui.color(this, R.color.ink2), true);
            badge.setLetterSpacing(0.04f);
            badge.setPadding(Ui.dp(this, 7), Ui.dp(this, 3), Ui.dp(this, 7), Ui.dp(this, 3));
            badge.setBackground(Ui.round(this, Ui.color(this, R.color.surface3), 7));
            nameRow.addView(badge);
        }
        mid.addView(nameRow);

        LinearLayout st = new LinearLayout(this);
        st.setOrientation(LinearLayout.HORIZONTAL);
        st.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 6);
        st.setLayoutParams(slp);

        View dot = new View(this);
        int ds = Ui.dp(this, 6);
        LinearLayout.LayoutParams dlp2 = new LinearLayout.LayoutParams(ds, ds);
        dlp2.rightMargin = Ui.dp(this, 7);
        dot.setLayoutParams(dlp2);
        GradientDrawable gd = new GradientDrawable();
        gd.setShape(GradientDrawable.OVAL);
        gd.setColor(Ui.stateColor(this, d.state));
        dot.setBackground(gd);
        st.addView(dot);

        TextView status = Ui.text(this, statusText(d), 12.5f, Ui.color(this, R.color.ink3));
        status.setSingleLine(true);
        status.setEllipsize(TextUtils.TruncateAt.END);
        st.addView(status);
        mid.addView(st);
        card.addView(mid);

        ImageView chev = new ImageView(this);
        LinearLayout.LayoutParams chlp = new LinearLayout.LayoutParams(Ui.dp(this, 18), Ui.dp(this, 18));
        chlp.leftMargin = Ui.dp(this, 4);
        chev.setLayoutParams(chlp);
        chev.setImageResource(R.drawable.ic_chevron);
        chev.setAlpha(d.state == Device.STATE_OFFLINE ? 0.5f : 1f);
        card.addView(chev);

        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (d.state == Device.STATE_DENIED) {
                    promptRepair(d);
                } else if (d.state == Device.STATE_ONLINE) {
                    openChat(d);
                } else {
                    connect(d);
                }
            }
        });

        card.setOnLongClickListener(new View.OnLongClickListener() {
            @Override
            public boolean onLongClick(View v) {
                menu(d);
                return true;
            }
        });
        return card;
    }

    private View foundCard(final ApiClient.Found f) {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.HORIZONTAL);
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setBackgroundResource(R.drawable.card_ripple);
        int p = Ui.dp(this, 14);
        card.setPadding(p, p, Ui.dp(this, 14), p);
        card.setClickable(true);

        LinearLayout av = new LinearLayout(this);
        int s = Ui.dp(this, 44);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(s, s);
        alp.rightMargin = Ui.dp(this, 13);
        av.setLayoutParams(alp);
        av.setGravity(Gravity.CENTER);
        av.setBackground(Ui.round(this, Ui.color(this, R.color.surface3), 14));
        ImageView icon = new ImageView(this);
        icon.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 20), Ui.dp(this, 20)));
        icon.setImageResource(R.drawable.ic_laptop);
        icon.setAlpha(0.8f);
        av.addView(icon);
        card.addView(av);

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        TextView name = Ui.text(this, f.ip + ":" + f.port, 14.5f, Ui.color(this, R.color.ink), true);
        mid.addView(name);
        TextView sub = Ui.text(this, getString(R.string.nearby_unpaired), 12,
                Ui.color(this, R.color.ink3));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 6);
        sub.setLayoutParams(slp);
        mid.addView(sub);
        card.addView(mid);

        TextView badge = Ui.text(this, getString(R.string.pair), 12,
                Ui.color(this, R.color.ink2), true);
        badge.setPadding(Ui.dp(this, 11), Ui.dp(this, 6), Ui.dp(this, 11), Ui.dp(this, 6));
        badge.setBackground(Ui.round(this, Ui.color(this, R.color.surface3), 9));
        card.addView(badge);

        card.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                tipPair(f);
            }
        });
        return card;
    }

    private View nearbyHint(boolean scanningNow) {
        TextView tv = Ui.text(this, scanningNow ? getString(R.string.nearby_hint)
                : getString(R.string.nearby_none), 12.5f, Ui.color(this, R.color.ink3));
        tv.setLineSpacing(Ui.dp(this, 4), 1f);
        tv.setPadding(Ui.dp(this, 2), Ui.dp(this, 2), Ui.dp(this, 2), Ui.dp(this, 2));
        return tv;
    }

    private View avatar(String name, int state, String id) {
        TextView tv = new TextView(this);
        int s = Ui.dp(this, 46);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(s, s);
        lp.rightMargin = Ui.dp(this, 13);
        tv.setLayoutParams(lp);
        tv.setGravity(Gravity.CENTER);
        int tint = Ui.color(this, R.color.surface3);
        tv.setBackground(Ui.round(this, tint, 15));
        tv.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 16);
        tv.setTextColor(Ui.color(this, R.color.ink2));
        tv.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        String c = "";
        if (name != null && !name.isEmpty()) c = name.substring(0, 1).toUpperCase();
        tv.setText(c);
        if (state == Device.STATE_ONLINE) {
            tv.setTextColor(Ui.color(this, R.color.ink));
        }
        return tv;
    }

    private String statusText(Device d) {
        switch (d.state) {
            case Device.STATE_ONLINE:
                return getString(R.string.online) + " · " + d.ip + ":" + d.port;
            case Device.STATE_PROBING:
                return getString(R.string.connecting);
            case Device.STATE_DENIED:
                return getString(R.string.unauthorized);
            default:
                return getString(R.string.offline) + " · " + relative(d.lastSeen);
        }
    }

    private String relative(long ts) {
        if (ts <= 0) return getString(R.string.never_connected);
        long diff = System.currentTimeMillis() - ts;
        if (diff < 60 * 1000) return getString(R.string.just_now);
        if (diff < 60 * 60 * 1000) return getString(R.string.minutes_ago, diff / 60000);
        if (diff < 24 * 60 * 60 * 1000) return getString(R.string.hours_ago, diff / 3600000);
        if (diff < 30L * 24 * 60 * 60 * 1000) return getString(R.string.days_ago, diff / 86400000L);
        return getString(R.string.long_ago);
    }

    // ---------- 行为 ----------

    private void menu(final Device d) {
        final boolean isDefault = DeviceStore.get().isDefault(d.id);
        List<Sheet.Item> items = new ArrayList<>();
        items.add(new Sheet.Item(getString(R.string.open_chat), R.drawable.ic_link,
                new Runnable() {
                    @Override
                    public void run() {
                        if (d.state == Device.STATE_ONLINE) openChat(d);
                        else connect(d);
                    }
                }));
        items.add(new Sheet.Item(getString(R.string.rename), R.drawable.ic_pencil, new Runnable() {
            @Override
            public void run() {
                rename(d);
            }
        }));
        items.add(new Sheet.Item(isDefault ? getString(R.string.unset_default)
                : getString(R.string.set_default), R.drawable.ic_star, new Runnable() {
            @Override
            public void run() {
                if (isDefault) {
                    Prefs.setDefaultDeviceId("");
                    Ui.toast(MainActivity.this, getString(R.string.default_cleared));
                } else {
                    Prefs.setDefaultDeviceId(d.id);
                    DeviceStore.get().setBackgroundDeviceId(d.id);
                    Ui.toast(MainActivity.this, getString(R.string.default_set, d.displayName()));
                }
                render();
            }
        }));
        items.add(new Sheet.Item(getString(R.string.copy_address), R.drawable.ic_copy,
                new Runnable() {
                    @Override
                    public void run() {
                        try {
                            android.content.ClipboardManager cm = (android.content.ClipboardManager)
                                    getSystemService(Context.CLIPBOARD_SERVICE);
                            if (cm != null) {
                                cm.setPrimaryClip(android.content.ClipData.newPlainText(
                                        "NearSend", d.chatUrl()));
                                Ui.toast(MainActivity.this, getString(R.string.copied));
                            }
                        } catch (Exception ignored) {
                        }
                    }
                }));
        items.add(new Sheet.Item(getString(R.string.forget), R.drawable.ic_trash, true, new Runnable() {
            @Override
            public void run() {
                Sheet.confirm(MainActivity.this, getString(R.string.forget_confirm),
                        getString(R.string.forget), new Runnable() {
                            @Override
                            public void run() {
                                DeviceStore.get().remove(d.id);
                                if (DeviceStore.get().isEmpty()) {
                                    Prefs.setDefaultDeviceId("");
                                    LinkService.stop(MainActivity.this);
                                }
                                render();
                            }
                        });
            }
        }));
        Sheet.show(this, d.displayName() + " · " + d.ip, items);
    }

    private void rename(final Device d) {
        final android.widget.EditText input = new android.widget.EditText(this);
        input.setText(d.customName ? d.name : "");
        input.setHint(d.displayName());
        input.setSingleLine(true);
        input.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 15);
        input.setTextColor(Ui.color(this, R.color.ink));
        input.setHintTextColor(Ui.color(this, R.color.ink3));
        input.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface2), 12,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 12);
        input.setPadding(p, p, p, p);

        new androidx.appcompat.app.AlertDialog.Builder(this)
                .setTitle(R.string.rename)
                .setView(input)
                .setNegativeButton(R.string.cancel, null)
                .setPositiveButton(R.string.ok, new android.content.DialogInterface.OnClickListener() {
                    @Override
                    public void onClick(android.content.DialogInterface di, int which) {
                        String v = input.getText().toString().trim();
                        if (!v.isEmpty()) DeviceStore.get().rename(d.id, v);
                        render();
                    }
                })
                .show();
    }

    private void promptRepair(final Device d) {
        Sheet.show(this, getString(R.string.unauthorized), Collections.singletonList(
                new Sheet.Item(getString(R.string.pair_scan), R.drawable.ic_scan, new Runnable() {
                    @Override
                    public void run() {
                        openScan();
                    }
                })));
    }

    private void tipPair(final ApiClient.Found f) {
        Sheet.show(this, f.ip + ":" + f.port, java.util.Arrays.asList(
                new Sheet.Item(getString(R.string.scan_qr), R.drawable.ic_scan, new Runnable() {
                    @Override
                    public void run() {
                        openScan();
                    }
                }),
                new Sheet.Item(getString(R.string.manual_token), R.drawable.ic_link, new Runnable() {
                    @Override
                    public void run() {
                        startActivityForResult(new Intent(MainActivity.this, ManualPairActivity.class), REQ_MANUAL);
                    }
                })));
    }

    private void openScan() {
        startActivityForResult(new Intent(this, ScanActivity.class), REQ_SCAN);
    }

    private void openChat(Device d) {
        DeviceStore.get().touch(d.id);
        DeviceStore.get().setBackgroundDeviceId(d.id);
        Intent i = new Intent(this, ChatActivity.class);
        i.putExtra("deviceId", d.id);
        startActivity(i);
    }

    private void connect(final Device d) {
        d.state = Device.STATE_PROBING;
        render();
        Bg.io(new java.util.concurrent.Callable<ApiClient.Check>() {
            @Override
            public ApiClient.Check call() {
                return ApiClient.check(d, 2000);
            }
        }, new Bg.Result<ApiClient.Check>() {
            @Override
            public void on(ApiClient.Check c) {
                if (c == null) {
                    d.state = Device.STATE_OFFLINE;
                    Ui.toast(MainActivity.this, getString(R.string.err_unreachable));
                    render();
                    return;
                }
                d.state = c.state;
                if (c.hostname != null && !d.customName) {
                    d.name = c.hostname;
                    DeviceStore.get().applyHostname(d.id, c.hostname);
                }
                render();
                if (c.state == Device.STATE_ONLINE) {
                    openChat(d);
                } else if (c.state == Device.STATE_DENIED) {
                    promptRepair(d);
                } else {
                    Ui.toast(MainActivity.this, getString(R.string.err_unreachable));
                }
            }
        });
    }

    private void refreshStates() {
        if (!Prefs.autoReconnect()) return;
        for (final Device d : DeviceStore.get().all()) {
            d.state = Device.STATE_PROBING;
            Bg.io(new java.util.concurrent.Callable<ApiClient.Check>() {
                @Override
                public ApiClient.Check call() {
                    return ApiClient.check(d, 1600);
                }
            }, new Bg.Result<ApiClient.Check>() {
                @Override
                public void on(ApiClient.Check c) {
                    if (c == null) return;
                    d.state = c.state;
                    if (c.hostname != null && !d.customName) {
                        d.name = c.hostname;
                        DeviceStore.get().applyHostname(d.id, c.hostname);
                    }
                    render();
                }
            });
        }
        render();
    }

    private void startScanIfStale() {
        long now = System.currentTimeMillis();
        if (now - lastScanAt < 30000L) return;
        lastScanAt = now;
        startScan();
    }

    private void startScan() {
        stopScan();
        scanning = true;
        scanDone = 0;
        scanTotal = 0;
        nearby.clear();
        discovery = new Discovery();
        discovery.scan(DeviceStore.get().all(), new Discovery.Listener() {
            @Override
            public void onProgress(int done, int total) {
                scanDone = done;
                scanTotal = total;
                if (scanning) {
                    nearbyState.setText(done + "/" + total);
                    progress(done, total);
                }
            }

            @Override
            public void onFound(ApiClient.Found found) {
                nearby.add(found);
                render();
            }

            @Override
            public void onDone(List<ApiClient.Found> all) {
                scanning = false;
                render();
            }
        });
        render();
    }

    private void stopScan() {
        if (discovery != null) {
            discovery.cancel();
            discovery = null;
        }
        scanning = false;
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_ONBOARD) {
            if (res == Activity.RESULT_OK && data != null && data.getBooleanExtra("scan", false)) {
                openScan();
            }
            return;
        }
        if (res != Activity.RESULT_OK || data == null) {
            if (req == REQ_SCAN && res == Activity.RESULT_CANCELED) scanning = false;
            return;
        }
        String id = data.getStringExtra("deviceId");
        if (id != null) {
            Device d = DeviceStore.get().byId(id);
            if (d != null) {
                scanning = false;
                openChat(d);
            }
        }
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] perms, @NonNull int[] grants) {
        super.onRequestPermissionsResult(code, perms, grants);
    }
}
