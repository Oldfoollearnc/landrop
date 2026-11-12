package com.nearsend.app;

import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.DownloadListener;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.content.FileProvider;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;

import java.io.File;

/**
 * 聊天页：WebView 装电脑端吐出的移动端页面。
 * 这样聊天交互、图片预览、文件进度天然与网页版一致；
 * 原生只补网页做不到的部分——剪贴板、分享、保存、震动、返回键。
 */
public class ChatActivity extends AppCompatActivity {

    private static final int REQ_FILE = 301;
    private static final int REQ_CAMERA = 302;

    private WebView web;
    private View errorOverlay;
    private View progressBar;
    private Device device;

    private android.webkit.ValueCallback<Uri[]> pendingCallback;
    private Uri pendingCameraUri;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        String id = getIntent().getStringExtra("deviceId");
        device = DeviceStore.get().byId(id);
        if (device == null) {
            finish();
            return;
        }

        getWindow().setStatusBarColor(Ui.color(this, R.color.surface));
        Ui.setStatusBarIcons(this, !isNightTheme());

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Ui.color(this, R.color.surface));

        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        progressBar = new View(this);
        progressBar.setBackgroundColor(Ui.color(this, R.color.accent));
        FrameLayout.LayoutParams plp = new FrameLayout.LayoutParams(0, Ui.dp(this, 2));
        plp.gravity = Gravity.TOP;
        progressBar.setLayoutParams(plp);
        root.addView(progressBar);

        errorOverlay = buildError();
        errorOverlay.setVisibility(View.GONE);
        root.addView(errorOverlay, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
        setupWeb();
        web.loadUrl(device.chatUrl());

        App.chatVisible = true;
        App.chatDeviceId = device.id;
        DeviceStore.get().touch(device.id);

        LinkService.ensure(this, device.id);
    }

    boolean isNightTheme() {
        int mode = getResources().getConfiguration().uiMode
                & android.content.res.Configuration.UI_MODE_NIGHT_MASK;
        return mode == android.content.res.Configuration.UI_MODE_NIGHT_YES;
    }

    String versionName() {
        try {
            return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
        } catch (Exception e) {
            return "1.0.0";
        }
    }

    /** 大图查看时把状态栏压成深色，退出时恢复 */
    void setChrome(boolean dark) {
        try {
            getWindow().setStatusBarColor(dark ? 0xFF060810 : Ui.color(this, R.color.surface));
            Ui.setStatusBarIcons(this, !dark);
        } catch (Exception ignored) {
        }
    }

    private View buildError() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(Ui.color(this, R.color.surface));
        int p = Ui.dp(this, 32);
        box.setPadding(p, p, p, p);

        TextView t = Ui.text(this, getString(R.string.chat_error_title), 16,
                Ui.color(this, R.color.ink), true);
        t.setGravity(Gravity.CENTER);
        box.addView(t);

        TextView s = Ui.text(this, getString(R.string.chat_error_body),
                13, Ui.color(this, R.color.ink2));
        s.setGravity(Gravity.CENTER);
        s.setLineSpacing(Ui.dp(this, 4), 1f);
        LinearLayout.LayoutParams slp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        slp.topMargin = Ui.dp(this, 10);
        slp.leftMargin = Ui.dp(this, 16);
        slp.rightMargin = Ui.dp(this, 16);
        s.setLayoutParams(slp);
        box.addView(s);

        TextView retry = Ui.text(this, getString(R.string.retry), 14.5f,
                Ui.color(this, R.color.accentFg), true);
        retry.setGravity(Gravity.CENTER);
        retry.setBackgroundResource(R.drawable.btn_primary);
        retry.setPadding(Ui.dp(this, 30), Ui.dp(this, 12), Ui.dp(this, 30), Ui.dp(this, 12));
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.topMargin = Ui.dp(this, 22);
        retry.setLayoutParams(rlp);
        retry.setClickable(true);
        Ui.pressable(retry);
        retry.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                errorOverlay.setVisibility(View.GONE);
                web.loadUrl(device.chatUrl());
            }
        });
        box.addView(retry);

        TextView help = Ui.text(this, getString(R.string.chat_error_help), 13,
                Ui.color(this, R.color.ink3));
        help.setPadding(Ui.dp(this, 12), Ui.dp(this, 14), Ui.dp(this, 12), Ui.dp(this, 14));
        help.setClickable(true);
        help.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                startActivity(new Intent(ChatActivity.this, HelpActivity.class));
            }
        });
        LinearLayout.LayoutParams hlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hlp.topMargin = Ui.dp(this, 4);
        help.setLayoutParams(hlp);
        box.addView(help);

        TextView back = Ui.text(this, getString(R.string.back_to_devices), 13.5f,
                Ui.color(this, R.color.ink3));
        back.setPadding(Ui.dp(this, 12), Ui.dp(this, 10), Ui.dp(this, 12), Ui.dp(this, 10));
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = Ui.dp(this, 2);
        back.setLayoutParams(blp);
        box.addView(back);

        return box;
    }

    @SuppressWarnings("SetJavaScriptEnabled")
    private void setupWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setLoadsImagesAutomatically(true);
        s.setBlockNetworkImage(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setCacheMode(WebSettings.LOAD_NO_CACHE);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setSaveFormData(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        }
        s.setUserAgentString(s.getUserAgentString() + " NearSendApp/" + versionName());

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);
        // 主动写入会话 cookie：不依赖服务端 Set-Cookie，规避 WebView 丢弃的情况
        cm.setCookie(device.baseUrl(), "ld=" + device.token + "; Path=/");
        cm.flush();

        web.setBackgroundColor(Ui.color(this, R.color.surface));
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(this, device), "NearSend");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                Uri u = req.getUrl();
                if (u == null) return false;
                String scheme = u.getScheme() == null ? "" : u.getScheme().toLowerCase();
                if (scheme.startsWith("http")) {
                    String path = u.getPath();
                    if (path != null && path.startsWith("/d/")) {
                        Downloader.save(ChatActivity.this, device,
                                idFromPath(path), null, new Downloader.Callback() {
                                    @Override
                                    public void onDone(boolean ok, String message) {
                                        Ui.toast(ChatActivity.this, message);
                                    }
                                });
                        return true;
                    }
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, u));
                } catch (Exception ignored) {
                }
                return true;
            }

            @Override
            public void onReceivedError(WebView v, WebResourceRequest req, WebResourceError err) {
                if (req != null && req.isForMainFrame()) {
                    errorOverlay.setVisibility(View.VISIBLE);
                }
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                super.onPageFinished(v, url);
                pushConfig();
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(android.webkit.ConsoleMessage m) {
                android.util.Log.d("NearSendJS", m.message() + " @" + m.lineNumber());
                return true;
            }

            @Override
            public void onProgressChanged(WebView v, int p) {
                ViewGroup.LayoutParams lp = progressBar.getLayoutParams();
                if (p >= 100) {
                    progressBar.setAlpha(0f);
                } else {
                    progressBar.setAlpha(1f);
                    lp.width = (int) (v.getWidth() * (p / 100f));
                    progressBar.setLayoutParams(lp);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView v, android.webkit.ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                pendingCallback = cb;
                try {
                    if (params.isCaptureEnabled() && hasCamera()) {
                        return takePhoto();
                    }
                    Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    String[] accept = params.getAcceptTypes();
                    String type = "*/*";
                    if (accept != null && accept.length > 0 && accept[0] != null
                            && accept[0].startsWith("image")) {
                        type = "image/*";
                    }
                    i.setType(type);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    startActivityForResult(i, REQ_FILE);
                    return true;
                } catch (Exception e) {
                    pendingCallback = null;
                    return false;
                }
            }
        });

        web.setDownloadListener(new DownloadListener() {
            @Override
            public void onDownloadStart(String url, String ua, String disposition,
                                        String mime, long len) {
                Uri u = Uri.parse(url);
                String name = u.getQueryParameter("name");
                String path = u.getPath();
                if (path != null && path.startsWith("/d/")) {
                    Downloader.save(ChatActivity.this, device, idFromPath(path), name,
                            new Downloader.Callback() {
                                @Override
                                public void onDone(boolean ok, String message) {
                                    Ui.toast(ChatActivity.this, message);
                                }
                            });
                }
            }
        });
    }

    private String idFromPath(String path) {
        String id = path.substring(3);
        int slash = id.indexOf('/');
        return slash > 0 ? id.substring(0, slash) : id;
    }

    /** 把原生主题和字号推给网页；网页优先接受这里的值。 */
    private void pushConfig() {
        String js = "(function(){try{if(window.__nsApplyNative){window.__nsApplyNative("
                + "{theme:'" + (isNightTheme() ? "dark" : "light") + "',"
                + "font:'" + Prefs.chatFont() + "',"
                + "fontScale:" + Prefs.chatFontScale() + ","
                + "haptics:" + Prefs.vibrate() + "});}}catch(e){}})();";
        web.evaluateJavascript(js, null);
    }

    private boolean hasCamera() {
        return getPackageManager().hasSystemFeature(PackageManager.FEATURE_CAMERA_ANY);
    }

    private boolean takePhoto() {
        try {
            File dir = new File(getExternalCacheDir(), "cam");
            if (!dir.exists() && !dir.mkdirs()) return false;
            File f = new File(dir, "shot_" + System.currentTimeMillis() + ".jpg");
            Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".fileprovider", f);
            pendingCameraUri = uri;
            Intent i = new Intent(android.provider.MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(android.provider.MediaStore.EXTRA_OUTPUT, uri);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivityForResult(i, REQ_CAMERA);
            return true;
        } catch (Exception e) {
            pendingCameraUri = null;
            return false;
        }
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE) {
            if (pendingCallback != null) {
                pendingCallback.onReceiveValue(collectUris(res, data));
                pendingCallback = null;
            }
        } else if (req == REQ_CAMERA) {
            if (pendingCallback != null) {
                Uri out = res == RESULT_OK ? pendingCameraUri : null;
                pendingCallback.onReceiveValue(out == null ? null : new Uri[]{out});
                pendingCallback = null;
            }
            pendingCameraUri = null;
        }
    }

    private Uri[] collectUris(int res, Intent data) {
        if (res != RESULT_OK || data == null) return null;
        try {
            android.content.ClipData clip = data.getClipData();
            if (clip != null && clip.getItemCount() > 0) {
                Uri[] out = new Uri[clip.getItemCount()];
                for (int i = 0; i < clip.getItemCount(); i++) {
                    out[i] = clip.getItemAt(i).getUri();
                }
                return out;
            }
            Uri one = data.getData();
            if (one != null) return new Uri[]{one};
            String s = data.getDataString();
            if (s != null && !s.isEmpty()) return new Uri[]{Uri.parse(s)};
        } catch (Exception ignored) {
        }
        return null;
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] perms, @NonNull int[] grants) {
        super.onRequestPermissionsResult(code, perms, grants);
    }

    @Override
    protected void onStart() {
        super.onStart();
        App.chatVisible = true;
        if (device != null) App.chatDeviceId = device.id;
        LinkService.pauseReceiving(this);
        if (web != null) pushConfig();
    }

    @Override
    protected void onResume() {
        super.onResume();
        Ui.setStatusBarIcons(this, !isNightTheme());
        if (web != null) pushConfig();
    }

    @Override
    protected void onStop() {
        super.onStop();
        App.chatVisible = false;
        if (device != null) LinkService.resumeReceiving(this, device.id);
    }

    /** 先让网页关掉自己弹出的层（图片预览、长按菜单、搜索），没有再退出页面。 */
    @Override
    public void onBackPressed() {
        if (hideKeyboardIfShown()) return;
        if (web == null) {
            super.onBackPressed();
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return (window.__nsBack&&window.__nsBack())?'handled':'close';}"
                        + "catch(e){return 'close';}})()",
                new android.webkit.ValueCallback<String>() {
                    @Override
                    public void onReceiveValue(String value) {
                        if (value != null && value.contains("close")) {
                            finish();
                        }
                    }
                });
    }

    /** 输入法弹着的时候，返回键只收键盘，不要退出聊天页 */
    private boolean hideKeyboardIfShown() {
        try {
            WindowInsetsCompat insets = ViewCompat.getRootWindowInsets(getWindow().getDecorView());
            if (insets != null && insets.isVisible(WindowInsetsCompat.Type.ime())) {
                android.view.inputmethod.InputMethodManager imm =
                        (android.view.inputmethod.InputMethodManager)
                                getSystemService(INPUT_METHOD_SERVICE);
                if (imm != null) {
                    imm.hideSoftInputFromWindow(getWindow().getDecorView().getWindowToken(), 0);
                }
                return true;
            }
        } catch (Exception ignored) {
        }
        return false;
    }

    @Override
    protected void onDestroy() {
        App.chatVisible = false;
        if (web != null) {
            try {
                web.stopLoading();
                web.loadUrl("about:blank");
                web.destroy();
            } catch (Exception ignored) {
            }
            web = null;
        }
        super.onDestroy();
    }
}
