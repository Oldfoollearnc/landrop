package com.nearsend.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

/** 手动添加：粘贴完整地址，或填 IP / 端口 / 令牌。 */
public class ManualPairActivity extends AppCompatActivity {

    private EditText urlInput;
    private EditText ipInput;
    private EditText portInput;
    private EditText tokenInput;
    private TextView submit;
    private TextView status;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Ui.color(this, R.color.bg));
        int mode = getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        Ui.setStatusBarIcons(this, mode != android.content.res.Configuration.UI_MODE_NIGHT_YES);

        build();
    }

    private void build() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.color(this, R.color.bg));

        ScrollView sv = new ScrollView(this);
        sv.setFillViewport(true);
        sv.setVerticalScrollBarEnabled(false);

        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(Ui.dp(this, 20), Ui.statusBarHeight(this) + Ui.dp(this, 12),
                Ui.dp(this, 20), Sheet.navBar(this) + Ui.dp(this, 24));

        // 返回 + 标题
        LinearLayout head = new LinearLayout(this);
        head.setOrientation(LinearLayout.HORIZONTAL);
        head.setGravity(Gravity.CENTER_VERTICAL);

        FrameLayout back = new FrameLayout(this);
        int bs = Ui.dp(this, 36);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(bs, bs);
        blp.rightMargin = Ui.dp(this, 6);
        back.setLayoutParams(blp);
        back.setBackground(Ui.round(this, Ui.color(this, R.color.surface2), 11));
        android.widget.ImageView iv = new android.widget.ImageView(this);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(Ui.dp(this, 18), Ui.dp(this, 18));
        ilp.gravity = Gravity.CENTER;
        iv.setLayoutParams(ilp);
        iv.setImageResource(R.drawable.ic_back);
        back.addView(iv);
        back.setClickable(true);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        head.addView(back);

        TextView title = Ui.text(this, getString(R.string.manual_title), 17,
                Ui.color(this, R.color.ink), true);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        tlp.leftMargin = Ui.dp(this, 8);
        title.setLayoutParams(tlp);
        head.addView(title);
        c.addView(head);

        c.addView(gap(20));
        c.addView(label(getString(R.string.manual_paste_full)));

        urlInput = field("http://192.168.1.5:8899/?t=…", false, true);
        c.addView(urlInput);

        LinearLayout pasteRow = new LinearLayout(this);
        pasteRow.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams prlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        prlp.topMargin = Ui.dp(this, 8);
        pasteRow.setLayoutParams(prlp);

        TextView paste = Ui.text(this, "粘贴", 12.5f, Ui.color(this, R.color.ink2), true);
        paste.setPadding(Ui.dp(this, 12), Ui.dp(this, 7), Ui.dp(this, 12), Ui.dp(this, 7));
        paste.setBackground(Ui.round(this, Ui.color(this, R.color.surface2), 9));
        paste.setClickable(true);
        paste.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                pasteFromClipboard();
            }
        });
        pasteRow.addView(paste);

        status = Ui.text(this, "", 12.5f, Ui.color(this, R.color.ink3));
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
        slp.leftMargin = Ui.dp(this, 10);
        status.setLayoutParams(slp);
        pasteRow.addView(status);
        c.addView(pasteRow);

        c.addView(gap(24));

        LinearLayout div = new LinearLayout(this);
        div.setOrientation(LinearLayout.HORIZONTAL);
        div.setGravity(Gravity.CENTER_VERTICAL);
        View l1 = new View(this);
        l1.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
        l1.setBackgroundColor(Ui.color(this, R.color.line));
        div.addView(l1);
        TextView or = Ui.text(this, "或分开填写", 11.5f, Ui.color(this, R.color.ink3));
        or.setPadding(Ui.dp(this, 12), 0, Ui.dp(this, 12), 0);
        div.addView(or);
        View l2 = new View(this);
        l2.setLayoutParams(new LinearLayout.LayoutParams(0, 1, 1f));
        l2.setBackgroundColor(Ui.color(this, R.color.line));
        div.addView(l2);
        c.addView(div);

        c.addView(gap(18));

        c.addView(label("电脑 IP"));
        ipInput = field("192.168.1.5", false, false);
        c.addView(ipInput);

        c.addView(gap(12));
        c.addView(label("端口"));
        portInput = field(String.valueOf(ApiClient.DEFAULT_PORT), true, false);
        portInput.setText(String.valueOf(ApiClient.DEFAULT_PORT));
        c.addView(portInput);

        c.addView(gap(12));
        c.addView(label("访问令牌"));
        tokenInput = field("从电脑端「复制连接地址」里取 t= 后面的部分", false, false);
        c.addView(tokenInput);

        c.addView(gap(14));
        TextView tip = Ui.text(this, getString(R.string.manual_tip), 11.5f,
                Ui.color(this, R.color.ink3));
        tip.setLineSpacing(Ui.dp(this, 3), 1f);
        c.addView(tip);

        sv.addView(c);

        submit = Ui.text(this, "连接", 15, Ui.color(this, R.color.accentFg), true);
        submit.setGravity(Gravity.CENTER);
        submit.setBackgroundResource(R.drawable.btn_primary);
        submit.setPadding(0, Ui.dp(this, 15), 0, Ui.dp(this, 15));
        submit.setClickable(true);
        Ui.pressable(submit);
        submit.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                submit();
            }
        });
        LinearLayout.LayoutParams subLp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        subLp.topMargin = Ui.dp(this, 26);
        submit.setLayoutParams(subLp);
        c.addView(submit);

        root.addView(sv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
    }

    private TextView label(String s) {
        TextView tv = Ui.text(this, s, 11.5f, Ui.color(this, R.color.ink3), true);
        tv.setLetterSpacing(0.06f);
        tv.setPadding(0, 0, 0, Ui.dp(this, 8));
        return tv;
    }

    private EditText field(String hint, boolean numeric, boolean multiLine) {
        EditText e = new EditText(this);
        e.setHint(hint);
        e.setTextSize(android.util.TypedValue.COMPLEX_UNIT_SP, 14.5f);
        e.setTextColor(Ui.color(this, R.color.ink));
        e.setHintTextColor(Ui.color(this, R.color.ink3));
        e.setBackground(Ui.roundStroke(this, Ui.color(this, R.color.surface2), 13,
                Ui.color(this, R.color.line), 1));
        int p = Ui.dp(this, 13);
        e.setPadding(p, p, p, p);
        e.setSingleLine(!multiLine);
        e.setInputType(numeric ? InputType.TYPE_CLASS_NUMBER
                : (multiLine ? InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_MULTI_LINE
                : InputType.TYPE_CLASS_TEXT));
        e.setIncludeFontPadding(false);
        return e;
    }

    private View gap(int dp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Ui.dp(this, dp)));
        return v;
    }

    private void pasteFromClipboard() {
        try {
            ClipboardManager cm = (ClipboardManager) getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm == null || !cm.hasPrimaryClip()) {
                status.setText("剪贴板是空的");
                return;
            }
            ClipData cd = cm.getPrimaryClip();
            if (cd == null || cd.getItemCount() == 0) return;
            String text = String.valueOf(cd.getItemAt(0).coerceToText(this)).trim();
            urlInput.setText(text);
            Device d = ApiClient.parse(text);
            if (d != null) {
                ipInput.setText(d.ip);
                portInput.setText(String.valueOf(d.port));
                tokenInput.setText(d.token);
                status.setText("已识别 " + d.ip + ":" + d.port);
            } else {
                status.setText("这段文本里没找到连接地址");
            }
        } catch (Exception e) {
            status.setText("读取剪贴板失败");
        }
    }

    private void submit() {
        Device dev = null;

        String urlText = urlInput.getText().toString().trim();
        if (!urlText.isEmpty()) {
            dev = ApiClient.parse(urlText);
            if (dev == null) {
                Ui.toast(this, "连接地址格式不对");
                return;
            }
        }

        if (dev == null) {
            String ip = ipInput.getText().toString().trim();
            String portText = portInput.getText().toString().trim();
            String token = tokenInput.getText().toString().trim();
            if (ip.isEmpty() || token.isEmpty()) {
                Ui.toast(this, "IP 和令牌都要填");
                return;
            }
            int port = ApiClient.DEFAULT_PORT;
            try {
                if (!portText.isEmpty()) port = Integer.parseInt(portText);
            } catch (Exception ignored) {
            }
            if (port < 1 || port > 65535) {
                Ui.toast(this, "端口不对");
                return;
            }
            dev = Device.fromScan(ip, port, token);
        }

        final Device target = dev;
        submit.setEnabled(false);
        submit.setText("正在连接…");
        status.setText("");

        Bg.io(new java.util.concurrent.Callable<ApiClient.Check>() {
            @Override
            public ApiClient.Check call() {
                return ApiClient.check(target, 3000);
            }
        }, new Bg.Result<ApiClient.Check>() {
            @Override
            public void on(ApiClient.Check c) {
                submit.setEnabled(true);
                submit.setText("连接");
                if (c != null && c.state == Device.STATE_ONLINE) {
                    if (c.hostname != null) target.name = c.hostname;
                    target.lastSeen = System.currentTimeMillis();
                    Device saved = DeviceStore.get().save(target);
                    DeviceStore.get().setBackgroundDeviceId(saved.id);
                    Intent out = new Intent();
                    out.putExtra("deviceId", saved.id);
                    setResult(Activity.RESULT_OK, out);
                    finish();
                    return;
                }
                String msg = (c != null && c.state == Device.STATE_DENIED)
                        ? getString(R.string.err_token) : getString(R.string.err_unreachable);
                status.setText(msg);
                Ui.toast(ManualPairActivity.this, msg);
            }
        });
    }
}
