package com.nearsend.app;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.graphics.drawable.ColorDrawable;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.text.TextUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.List;

/**
 * 系统分享入口：在相册、文件管理器、其他 App 里选「分享 → 近传」。
 * 选一台电脑，直接分片上传，进度显示在这张小卡片里。
 */
public class ShareActivity extends AppCompatActivity {

    private final List<File> files = new ArrayList<>();
    private final List<String> names = new ArrayList<>();
    private final List<String> mimes = new ArrayList<>();
    private String text = "";

    private FrameLayout root;
    private LinearLayout card;
    private int doneCount;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
        if (getWindow().getAttributes() != null) {
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = getWindow().getAttributes();
            lp.dimAmount = 0.55f;
            getWindow().setAttributes(lp);
        }
        root = new FrameLayout(this);
        root.setBackgroundColor(0x99000000);
        setContentView(root);
        parse(getIntent());
    }

    private void parse(Intent intent) {
        if (intent == null) {
            finish();
            return;
        }
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            String type = intent.getType() == null ? "" : intent.getType();
            Uri stream = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (stream != null && !type.startsWith("text/")) {
                addUri(stream, type);
            } else {
                CharSequence t = intent.getCharSequenceExtra(Intent.EXTRA_TEXT);
                text = t == null ? "" : t.toString();
            }
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> uris = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            String type = intent.getType() == null ? "" : intent.getType();
            if (uris != null) for (Uri u : uris) addUri(u, type);
        }
        if (files.isEmpty() && TextUtils.isEmpty(text)) {
            finish();
            return;
        }
        showPicker();
    }

    private void addUri(Uri uri, String type) {
        try {
            String name = displayName(uri);
            String mime = getContentResolver().getType(uri);
            if (mime == null || mime.isEmpty()) mime = type;
            File dir = new File(getCacheDir(), "incoming");
            if (!dir.exists() && !dir.mkdirs()) return;
            File out = new File(dir, System.currentTimeMillis() + "-" + Downloader.safeName(name));
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) return;
            FileOutputStream os = new FileOutputStream(out);
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) os.write(buf, 0, n);
            os.flush();
            os.close();
            in.close();
            files.add(out);
            names.add(Downloader.safeName(name));
            mimes.add(mime == null ? "" : mime);
        } catch (Exception e) {
            android.util.Log.e("NearSend", "share read failed: " + e);
        }
    }

    private String displayName(Uri uri) {
        Cursor c = null;
        try {
            c = getContentResolver().query(uri, null, null, null, null);
            if (c != null && c.moveToFirst()) {
                int idx = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                if (idx >= 0) {
                    String v = c.getString(idx);
                    if (v != null && !v.isEmpty()) return v;
                }
            }
        } catch (Exception ignored) {
        } finally {
            if (c != null) c.close();
        }
        String last = uri.getLastPathSegment();
        return last == null ? "file" : last;
    }

    // ---------- 选设备 ----------

    private void showPicker() {
        root.removeAllViews();
        card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 22,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 18);
        card.setPadding(p, p, p, Ui.dp(this, 10));

        TextView title = Ui.text(this, getString(R.string.share_title), 17,
                Ui.color(this, R.color.ink), true);
        card.addView(title);
        TextView sub = Ui.text(this, summary(), 12.5f, Ui.color(this, R.color.ink3));
        sub.setSingleLine(true);
        sub.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 6);
        sub.setLayoutParams(slp);
        card.addView(sub);

        List<Device> devices = DeviceStore.get().all();
        if (devices.isEmpty()) {
            TextView empty = Ui.text(this, getString(R.string.share_no_device), 13,
                    Ui.color(this, R.color.ink2));
            empty.setLineSpacing(Ui.dp(this, 4), 1f);
            LinearLayout.LayoutParams elp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            elp.topMargin = Ui.dp(this, 18);
            empty.setLayoutParams(elp);
            card.addView(empty);

            TextView go = primary(getString(R.string.share_go_pair), new Runnable() {
                @Override
                public void run() {
                    startActivity(new Intent(ShareActivity.this, MainActivity.class)
                            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK));
                    finish();
                }
            });
            LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            glp.topMargin = Ui.dp(this, 20);
            go.setLayoutParams(glp);
            card.addView(go);
        } else {
            ScrollView sv = new ScrollView(this);
            sv.setVerticalScrollBarEnabled(false);
            LinearLayout list = new LinearLayout(this);
            list.setOrientation(LinearLayout.VERTICAL);
            sv.addView(list);
            for (final Device d : devices) {
                list.addView(deviceRow(d));
            }
            int rowH = Ui.dp(this, 62);
            int listH = Math.min(devices.size() * rowH + Ui.dp(this, 4), Ui.dp(this, 300));
            LinearLayout.LayoutParams llp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, listH);
            llp.topMargin = Ui.dp(this, 14);
            sv.setLayoutParams(llp);
            card.addView(sv);
        }

        TextView cancel = Ui.text(this, getString(R.string.cancel), 13.5f,
                Ui.color(this, R.color.ink3));
        cancel.setGravity(Gravity.CENTER);
        cancel.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 14));
        cancel.setClickable(true);
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                cleanup();
                finish();
            }
        });
        card.addView(cancel);

        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.gravity = Gravity.CENTER;
        clp.leftMargin = Ui.dp(this, 22);
        clp.rightMargin = Ui.dp(this, 22);
        root.addView(card, clp);
    }

    private View deviceRow(final Device d) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(Ui.dp(this, 12), Ui.dp(this, 12), Ui.dp(this, 12), Ui.dp(this, 12));
        row.setBackgroundResource(R.drawable.pill_ripple_none);
        row.setClickable(true);
        Ui.pressable(row);

        TextView avatar = Ui.text(this, initial(d.displayName()), 15,
                Ui.color(this, R.color.ink2), true);
        avatar.setGravity(Gravity.CENTER);
        int s = Ui.dp(this, 38);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(s, s);
        alp.rightMargin = Ui.dp(this, 12);
        avatar.setLayoutParams(alp);
        avatar.setBackground(Ui.round(this, Ui.color(this, R.color.surface3), 12));
        row.addView(avatar);

        LinearLayout mid = new LinearLayout(this);
        mid.setOrientation(LinearLayout.VERTICAL);
        mid.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        mid.addView(Ui.text(this, d.displayName(), 14.5f, Ui.color(this, R.color.ink), true));
        TextView st = Ui.text(this, d.state == Device.STATE_ONLINE
                ? getString(R.string.online) : getString(R.string.share_will_try), 11.5f,
                Ui.color(this, R.color.ink3));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 3);
        st.setLayoutParams(slp);
        mid.addView(st);
        row.addView(mid);

        TextView send = Ui.text(this, getString(R.string.send), 12.5f,
                Ui.color(this, R.color.accent), true);
        send.setPadding(Ui.dp(this, 10), Ui.dp(this, 6), Ui.dp(this, 6), Ui.dp(this, 6));
        row.addView(send);

        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startSend(d);
            }
        });
        return row;
    }

    private TextView primary(String label, final Runnable click) {
        TextView t = Ui.text(this, label, 14.5f, Ui.color(this, R.color.accentFg), true);
        t.setGravity(Gravity.CENTER);
        t.setBackgroundResource(R.drawable.btn_primary);
        t.setPadding(0, Ui.dp(this, 14), 0, Ui.dp(this, 14));
        t.setClickable(true);
        Ui.pressable(t);
        t.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                click.run();
            }
        });
        return t;
    }

    // ---------- 发送 ----------

    private void startSend(final Device d) {
        showProgress(0);
        doneCount = 0;
        if (!text.isEmpty()) {
            Bg.io(new java.util.concurrent.Callable<String>() {
                @Override
                public String call() {
                    return ApiClient.sendText(d, text, "share" + System.currentTimeMillis());
                }
            }, new Bg.Result<String>() {
                @Override
                public void on(String id) {
                    if (id != null && !id.isEmpty()) finishOk();
                    else fail();
                }
            });
            return;
        }
        sendNext(d, 0);
    }

    private void sendNext(final Device d, final int index) {
        if (index >= files.size()) {
            finishOk();
            return;
        }
        final File f = files.get(index);
        final String name = names.get(index);
        final String mime = mimes.get(index);
        Bg.run(new Runnable() {
            @Override
            public void run() {
                try {
                    Uploader.upload(d, f, name, mime,
                            "share" + System.currentTimeMillis(),
                            new Uploader.Progress() {
                                @Override
                                public void on(long sent, long total) {
                                    final int pct = total <= 0 ? 0
                                            : (int) Math.min(99, sent * 100 / total);
                                    MainThread.post(new Runnable() {
                                        @Override
                                        public void run() {
                                            showProgress(pct);
                                        }
                                    });
                                }
                            });
                    MainThread.post(new Runnable() {
                        @Override
                        public void run() {
                            sendNext(d, index + 1);
                        }
                    });
                } catch (final Exception e) {
                    MainThread.post(new Runnable() {
                        @Override
                        public void run() {
                            fail();
                        }
                    });
                }
            }
        });
    }

    private void showProgress(int pct) {
        root.removeAllViews();
        card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 22,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 20);
        card.setPadding(p, p, p, p);

        card.addView(Ui.text(this, getString(R.string.share_sending), 15,
                Ui.color(this, R.color.ink), true));
        TextView sub = Ui.text(this, summary(), 12.5f, Ui.color(this, R.color.ink3));
        sub.setSingleLine(true);
        sub.setEllipsize(TextUtils.TruncateAt.MIDDLE);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 6);
        sub.setLayoutParams(slp);
        card.addView(sub);

        FrameLayout track = new FrameLayout(this);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Ui.dp(this, 4));
        tlp.topMargin = Ui.dp(this, 18);
        track.setLayoutParams(tlp);
        track.setBackground(Ui.round(this, Ui.color(this, R.color.surface3), 2));
        View fill = new View(this);
        fill.setBackground(Ui.round(this, Ui.color(this, R.color.accent), 2));
        FrameLayout.LayoutParams flp = new FrameLayout.LayoutParams(0,
                ViewGroup.LayoutParams.MATCH_PARENT);
        fill.setLayoutParams(flp);
        track.addView(fill);
        fill.getLayoutParams().width = (int) (Ui.dp(this, 300) * (pct / 100f));
        card.addView(track);

        FrameLayout.LayoutParams clp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.gravity = Gravity.CENTER;
        clp.leftMargin = Ui.dp(this, 26);
        clp.rightMargin = Ui.dp(this, 26);
        root.addView(card, clp);
    }

    private void finishOk() {
        Ui.toast(this, getString(R.string.share_done));
        cleanup();
        finish();
    }

    private void fail() {
        Ui.toast(this, getString(R.string.err_unreachable));
        cleanup();
        finish();
    }

    private void cleanup() {
        for (File f : files) {
            try {
                f.delete();
            } catch (Exception ignored) {
            }
        }
    }

    private String summary() {
        if (!text.isEmpty()) {
            return text.length() > 80 ? text.substring(0, 80) + "…" : text;
        }
        if (files.size() == 1) return names.get(0);
        return getString(R.string.share_count, files.size());
    }

    private String initial(String name) {
        if (name == null || name.isEmpty()) return "?";
        return name.substring(0, 1).toUpperCase();
    }
}
