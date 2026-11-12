package com.nearsend.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.ConnectivityManager;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * 帮助与诊断。
 * 局域网工具最常见的失败原因不是程序坏了，而是防火墙、AP 隔离、跨网段——
 * 把这些检查项直接做成可执行的自检，比让用户去猜有用得多。
 */
public class HelpActivity extends AppCompatActivity {

    private LinearLayout content;
    private LinearLayout diagBox;
    private TextView retryLabel;
    private boolean running;
    private String lastReport = "";

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Ui.color(this, R.color.bg));
        int mode = getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        Ui.setStatusBarIcons(this, mode != android.content.res.Configuration.UI_MODE_NIGHT_YES);

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

        build();
        runDiagnostics();
    }

    // ---------- 界面 ----------

    private void build() {
        content.removeAllViews();
        content.addView(header());
        content.addView(gap(18));

        // 自检
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 18,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 16);
        card.setPadding(p, p, p, Ui.dp(this, 6));

        LinearLayout titleRow = new LinearLayout(this);
        titleRow.setOrientation(LinearLayout.HORIZONTAL);
        titleRow.setGravity(Gravity.CENTER_VERTICAL);
        TextView title = Ui.text(this, getString(R.string.help_diag_title), 15,
                Ui.color(this, R.color.ink), true);
        title.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        titleRow.addView(title);

        retryLabel = Ui.text(this, getString(R.string.help_retry), 12.5f,
                Ui.color(this, R.color.accent), true);
        retryLabel.setPadding(Ui.dp(this, 10), Ui.dp(this, 6), Ui.dp(this, 2), Ui.dp(this, 6));
        retryLabel.setClickable(true);
        retryLabel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                runDiagnostics();
            }
        });
        titleRow.addView(retryLabel);
        card.addView(titleRow);

        TextView note = Ui.text(this, getString(R.string.help_diag_note), 11.5f,
                Ui.color(this, R.color.ink3));
        note.setLineSpacing(Ui.dp(this, 3), 1f);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = Ui.dp(this, 6);
        note.setLayoutParams(nlp);
        card.addView(note);

        diagBox = new LinearLayout(this);
        diagBox.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams dlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        dlp.topMargin = Ui.dp(this, 10);
        diagBox.setLayoutParams(dlp);
        card.addView(diagBox);

        TextView copy = Ui.text(this, getString(R.string.help_copy), 12.5f,
                Ui.color(this, R.color.ink2), true);
        copy.setPadding(0, Ui.dp(this, 12), 0, Ui.dp(this, 12));
        copy.setClickable(true);
        copy.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                copyReport();
            }
        });
        card.addView(copy);

        content.addView(card);
        content.addView(gap(20));

        // 配对步骤
        content.addView(section(getString(R.string.help_how_title)));
        content.addView(stepCard());
        content.addView(gap(20));

        // 常见问题
        content.addView(section(getString(R.string.help_faq_title)));
        LinearLayout faq = new LinearLayout(this);
        faq.setOrientation(LinearLayout.VERTICAL);
        faq.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 18,
                Ui.color(this, R.color.line), 1));
        faq.setPadding(Ui.dp(this, 16), Ui.dp(this, 4), Ui.dp(this, 16), Ui.dp(this, 8));
        addFaq(faq, R.string.faq_1_q, R.string.faq_1_a);
        addFaq(faq, R.string.faq_2_q, R.string.faq_2_a);
        addFaq(faq, R.string.faq_3_q, R.string.faq_3_a);
        addFaq(faq, R.string.faq_4_q, R.string.faq_4_a);
        addFaq(faq, R.string.faq_5_q, R.string.faq_5_a);
        addFaq(faq, R.string.faq_6_q, R.string.faq_6_a);
        content.addView(faq);

        TextView ver = Ui.text(this, getString(R.string.help_footer), 11.5f,
                Ui.color(this, R.color.ink3));
        ver.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams vlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        vlp.topMargin = Ui.dp(this, 24);
        ver.setLayoutParams(vlp);
        content.addView(ver);
    }

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

        TextView title = Ui.text(this, getString(R.string.help_title), 20,
                Ui.color(this, R.color.ink), true);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = Ui.dp(this, 12);
        title.setLayoutParams(tlp);
        head.addView(title);
        return head;
    }

    private TextView section(String s) {
        TextView tv = Ui.text(this, s, 11.5f, Ui.color(this, R.color.ink3), true);
        tv.setLetterSpacing(0.08f);
        tv.setPadding(Ui.dp(this, 6), 0, 0, Ui.dp(this, 9));
        return tv;
    }

    private View stepCard() {
        LinearLayout card = new LinearLayout(this);
        card.setOrientation(LinearLayout.VERTICAL);
        card.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface), 18,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 16);
        card.setPadding(p, p, p, p);
        String[] steps = getResources().getStringArray(R.array.help_steps);
        for (int i = 0; i < steps.length; i++) {
            LinearLayout row = new LinearLayout(this);
            row.setOrientation(LinearLayout.HORIZONTAL);
            if (i > 0) {
                LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
                rlp.topMargin = Ui.dp(this, 12);
                row.setLayoutParams(rlp);
            }
            TextView num = Ui.text(this, String.valueOf(i + 1), 11.5f,
                    Ui.color(this, R.color.ink2), true);
            num.setGravity(Gravity.CENTER);
            int ns = Ui.dp(this, 20);
            num.setLayoutParams(new LinearLayout.LayoutParams(ns, ns));
            num.setBackground(Ui.round(this, Ui.color(this, R.color.surface3), 999));
            row.addView(num);

            TextView t = Ui.text(this, steps[i], 13, Ui.color(this, R.color.ink2));
            t.setLineSpacing(Ui.dp(this, 3), 1f);
            LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0,
                    ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
            tlp.leftMargin = Ui.dp(this, 10);
            t.setLayoutParams(tlp);
            row.addView(t);
            card.addView(row);
        }
        return card;
    }

    private void addFaq(LinearLayout parent, int qRes, int aRes) {
        final TextView answer = Ui.text(this, getString(aRes), 12.5f,
                Ui.color(this, R.color.ink3));
        answer.setLineSpacing(Ui.dp(this, 4), 1f);
        answer.setVisibility(View.GONE);
        LinearLayout.LayoutParams alp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        alp.bottomMargin = Ui.dp(this, 4);
        answer.setLayoutParams(alp);

        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, Ui.dp(this, 12), 0, Ui.dp(this, 12));
        row.setClickable(true);
        row.setBackgroundResource(R.drawable.pill_ripple_none);

        TextView q = Ui.text(this, getString(qRes), 13.5f, Ui.color(this, R.color.ink));
        q.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(q);

        final ImageView chev = new ImageView(this);
        chev.setLayoutParams(new LinearLayout.LayoutParams(Ui.dp(this, 16), Ui.dp(this, 16)));
        chev.setImageResource(R.drawable.ic_chevron_down);
        chev.setAlpha(0.6f);
        row.addView(chev);

        final TextView ans = answer;
        row.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                boolean show = ans.getVisibility() != View.VISIBLE;
                ans.setVisibility(show ? View.VISIBLE : View.GONE);
                chev.animate().rotation(show ? 180 : 0).setDuration(160).start();
            }
        });
        parent.addView(row);
        parent.addView(answer);
    }

    // ---------- 诊断 ----------

    private void runDiagnostics() {
        if (running) return;
        running = true;
        retryLabel.setText(getString(R.string.help_checking));
        diagBox.removeAllViews();
        addDiag(getString(R.string.diag_network), networkLabel(), 0);
        addDiag(getString(R.string.diag_phone_ip), localIp(), 0);

        final Device d = defaultDevice();
        if (d == null) {
            addDiag(getString(R.string.diag_device), getString(R.string.err_no_device), -1);
            running = false;
            retryLabel.setText(getString(R.string.help_retry));
            lastReport = report(d, null);
            return;
        }
        addDiag(getString(R.string.diag_device), d.displayName() + " · " + d.ip + ":" + d.port, 0);

        final long start = System.currentTimeMillis();
        Bg.io(new java.util.concurrent.Callable<ApiClient.Check>() {
            @Override
            public ApiClient.Check call() {
                return ApiClient.check(d, 2500);
            }
        }, new Bg.Result<ApiClient.Check>() {
            @Override
            public void on(ApiClient.Check c) {
                running = false;
                retryLabel.setText(getString(R.string.help_retry));
                diagBox.removeAllViews();
                long ms = System.currentTimeMillis() - start;
                addDiag(getString(R.string.diag_network), networkLabel(), 0);
                addDiag(getString(R.string.diag_phone_ip), localIp(), 0);
                addDiag(getString(R.string.diag_device),
                        d.displayName() + " · " + d.ip + ":" + d.port, 0);

                if (c == null) {
                    addDiag(getString(R.string.diag_tcp), getString(R.string.diag_fail), -1);
                    addDiag(getString(R.string.diag_token), "—", 0);
                } else if (c.state == Device.STATE_ONLINE) {
                    addDiag(getString(R.string.diag_tcp), getString(R.string.diag_ok) + " · " + ms + " ms", 1);
                    addDiag(getString(R.string.diag_token), getString(R.string.diag_ok), 1);
                    if (c.hostname != null && !c.hostname.isEmpty()) {
                        addDiag(getString(R.string.diag_pc_name), c.hostname, 0);
                    }
                } else if (c.state == Device.STATE_DENIED) {
                    addDiag(getString(R.string.diag_tcp), getString(R.string.diag_ok), 1);
                    addDiag(getString(R.string.diag_token), getString(R.string.diag_bad_token), -1);
                } else {
                    addDiag(getString(R.string.diag_tcp), getString(R.string.diag_fail), -1);
                    addDiag(getString(R.string.diag_token), "—", 0);
                }
                lastReport = report(d, c);
            }
        });
    }

    private void addDiag(String label, String value, int state) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setPadding(0, Ui.dp(this, 7), 0, Ui.dp(this, 7));

        TextView l = Ui.text(this, label, 12.5f, Ui.color(this, R.color.ink3));
        l.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        row.addView(l);

        TextView v = Ui.text(this, value, 12.5f,
                state == 1 ? Ui.color(this, R.color.ok)
                        : state == -1 ? Ui.color(this, R.color.danger)
                        : Ui.color(this, R.color.ink2), true);
        v.setGravity(Gravity.END);
        v.setMaxWidth(Ui.dp(this, 200));
        row.addView(v);
        diagBox.addView(row);
    }

    private String report(Device d, ApiClient.Check c) {
        StringBuilder sb = new StringBuilder();
        sb.append(getString(R.string.app_name)).append(' ').append(versionName()).append('\n');
        sb.append(getString(R.string.diag_network)).append(": ").append(networkLabel()).append('\n');
        sb.append(getString(R.string.diag_phone_ip)).append(": ").append(localIp()).append('\n');
        if (d != null) {
            sb.append(getString(R.string.diag_device)).append(": ")
                    .append(d.displayName()).append(" · ").append(d.ip).append(':').append(d.port).append('\n');
            sb.append(getString(R.string.diag_state)).append(": ")
                    .append(c == null ? "timeout" : c.state).append('\n');
            if (c != null && c.hostname != null) {
                sb.append(getString(R.string.diag_pc_name)).append(": ").append(c.hostname).append('\n');
            }
        }
        return sb.toString();
    }

    private void copyReport() {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null) return;
            cm.setPrimaryClip(ClipData.newPlainText("diagnostics",
                    lastReport.isEmpty() ? report(defaultDevice(), null) : lastReport));
            Ui.toast(this, getString(R.string.help_copied));
        } catch (Exception e) {
            Ui.toast(this, getString(R.string.err_copy));
        }
    }

    private Device defaultDevice() {
        String id = DeviceStore.get().backgroundDeviceId();
        Device d = id.isEmpty() ? null : DeviceStore.get().byId(id);
        return d != null ? d : DeviceStore.get().primary();
    }

    private String networkLabel() {
        try {
            ConnectivityManager cm = (ConnectivityManager) getSystemService(Context.CONNECTIVITY_SERVICE);
            if (cm != null) {
                Network n = cm.getActiveNetwork();
                NetworkCapabilities cap = n == null ? null : cm.getNetworkCapabilities(n);
                if (cap != null) {
                    if (cap.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                        return getString(R.string.diag_wifi);
                    }
                    if (cap.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                        return getString(R.string.diag_cellular);
                    }
                    if (cap.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                        return getString(R.string.diag_ethernet);
                    }
                }
            }
        } catch (Exception ignored) {
        }
        return getString(R.string.diag_offline);
    }

    private String localIp() {
        try {
            List<NetworkInterface> all = Collections.list(NetworkInterface.getNetworkInterfaces());
            List<String> wifi = new ArrayList<>();
            List<String> other = new ArrayList<>();
            for (NetworkInterface ni : all) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress a : Collections.list(ni.getInetAddresses())) {
                    if (!(a instanceof Inet4Address) || a.isLoopbackAddress()) continue;
                    String name = ni.getName() == null ? "" : ni.getName();
                    if (name.startsWith("wlan") || name.startsWith("ap") || name.startsWith("eth")) {
                        wifi.add(a.getHostAddress());
                    } else {
                        other.add(a.getHostAddress());
                    }
                }
            }
            if (!wifi.isEmpty()) return wifi.get(0);
            if (!other.isEmpty()) return other.get(0);
        } catch (Exception ignored) {
        }
        return "—";
    }

    private String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    private View gap(int dp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Ui.dp(this, dp)));
        return v;
    }
}
