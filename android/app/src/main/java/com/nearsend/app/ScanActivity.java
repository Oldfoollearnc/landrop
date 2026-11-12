package com.nearsend.app;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.os.Bundle;
import android.util.Size;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.google.common.util.concurrent.ListenableFuture;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.PlanarYUVLuminanceSource;
import com.google.zxing.common.HybridBinarizer;

import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class ScanActivity extends AppCompatActivity {

    private static final int REQ_CAM = 401;

    private PreviewView preview;
    private TextView hint;
    private View loading;
    private ExecutorService analyzer;
    private MultiFormatReader reader;
    private ProcessCameraProvider provider;
    private Camera camera;
    private boolean torch;
    private volatile boolean busy;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().setStatusBarColor(Color.TRANSPARENT);
        getWindow().setNavigationBarColor(Color.BLACK);
        Ui.setStatusBarIcons(this, false);

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);

        preview = new PreviewView(this);
        preview.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        root.addView(preview, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        root.addView(new Overlay(this), new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        // 顶部返回
        FrameLayout topBar = new FrameLayout(this);
        FrameLayout.LayoutParams tlp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = Ui.statusBarHeight(this) + Ui.dp(this, 10);
        topBar.setLayoutParams(tlp);

        FrameLayout back = circleButton(R.drawable.ic_back);
        FrameLayout.LayoutParams blp = new FrameLayout.LayoutParams(Ui.dp(this, 40), Ui.dp(this, 40));
        blp.leftMargin = Ui.dp(this, 16);
        back.setLayoutParams(blp);
        back.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                finish();
            }
        });
        topBar.addView(back);
        root.addView(topBar);

        // 提示
        hint = Ui.text(this, getString(R.string.scan_hint), 14, Color.WHITE, true);
        hint.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams hlp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hlp.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        hlp.bottomMargin = Ui.dp(this, 130);
        hint.setLayoutParams(hlp);
        root.addView(hint);

        // 手电筒
        final FrameLayout torchBtn = circleButton(R.drawable.ic_flash);
        FrameLayout.LayoutParams tlp2 = new FrameLayout.LayoutParams(Ui.dp(this, 52), Ui.dp(this, 52));
        tlp2.gravity = Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL;
        tlp2.bottomMargin = Ui.dp(this, 56);
        torchBtn.setLayoutParams(tlp2);
        torchBtn.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                if (camera == null || camera.getCameraInfo() == null
                        || !camera.getCameraInfo().hasFlashUnit()) {
                    Ui.toast(ScanActivity.this, "没有闪光灯");
                    return;
                }
                torch = !torch;
                camera.getCameraControl().enableTorch(torch);
            }
        });
        root.addView(torchBtn);

        // 验证中的遮罩
        loading = buildLoading();
        loading.setVisibility(View.GONE);
        root.addView(loading, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);

        reader = new MultiFormatReader();
        analyzer = Executors.newSingleThreadExecutor();

        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAM);
        } else {
            startCamera();
        }
    }

    private FrameLayout circleButton(int icon) {
        FrameLayout f = new FrameLayout(this);
        f.setBackground(Ui.circle(this, 0x33FFFFFF, 40));
        ImageView iv = new ImageView(this);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(Ui.dp(this, 21), Ui.dp(this, 21));
        lp.gravity = Gravity.CENTER;
        iv.setLayoutParams(lp);
        iv.setImageResource(icon);
        iv.setColorFilter(Color.WHITE);
        f.addView(iv);
        f.setClickable(true);
        Ui.pressable(f);
        return f;
    }

    private View buildLoading() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER);
        box.setBackgroundColor(0xD9000000);

        TextView t = Ui.text(this, "正在验证…", 15, Color.WHITE, true);
        box.addView(t);
        return box;
    }

    // ---------- 相机 ----------

    private void startCamera() {
        final ListenableFuture<ProcessCameraProvider> future = ProcessCameraProvider.getInstance(this);
        future.addListener(new Runnable() {
            @Override
            public void run() {
                try {
                    provider = future.get();
                    bindUseCases();
                } catch (Exception e) {
                    Ui.toast(ScanActivity.this, getString(R.string.err_camera));
                }
            }
        }, ContextCompat.getMainExecutor(this));
    }

    private void bindUseCases() {
        if (provider == null) return;
        provider.unbindAll();

        Preview p = new Preview.Builder().build();
        p.setSurfaceProvider(preview.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
                .setTargetResolution(new Size(1080, 1440))
                .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                .build();
        analysis.setAnalyzer(analyzer, new ImageAnalysis.Analyzer() {
            @Override
            public void analyze(@NonNull ImageProxy image) {
                try {
                    if (!busy) decode(image);
                } catch (Exception ignored) {
                } finally {
                    image.close();
                }
            }
        });

        try {
            camera = provider.bindToLifecycle(this, CameraSelector.DEFAULT_BACK_CAMERA, p, analysis);
        } catch (Exception e) {
            Ui.toast(this, getString(R.string.err_camera));
        }
    }

    private void decode(ImageProxy image) {
        int w = image.getWidth();
        int h = image.getHeight();
        if (w <= 0 || h <= 0) return;
        ImageProxy.PlaneProxy plane = image.getPlanes()[0];
        ByteBuffer buf = plane.getBuffer();
        int rowStride = plane.getRowStride();
        int pixelStride = plane.getPixelStride();
        byte[] gray = new byte[w * h];
        for (int y = 0; y < h; y++) {
            int base = y * rowStride;
            int outBase = y * w;
            for (int x = 0; x < w; x++) {
                int idx = base + x * pixelStride;
                if (idx + 2 >= buf.limit()) break;
                int r = buf.get(idx) & 0xFF;
                int g = buf.get(idx + 1) & 0xFF;
                int bl = buf.get(idx + 2) & 0xFF;
                gray[outBase + x] = (byte) ((r * 77 + g * 151 + bl * 28) >> 8);
            }
        }
        try {
            PlanarYUVLuminanceSource src = new PlanarYUVLuminanceSource(gray, w, h, 0, 0, w, h, false);
            BinaryBitmap bmp = new BinaryBitmap(new HybridBinarizer(src));
            com.google.zxing.Result r = reader.decodeWithState(bmp);
            if (r != null && r.getText() != null) {
                onCode(r.getText());
            }
        } catch (Exception ignored) {
        }
    }

    private void onCode(final String text) {
        if (busy) return;
        Device dev = ApiClient.parse(text);
        if (dev == null) {
            MainThread.run(new Runnable() {
                @Override
                public void run() {
                    hint.setText(R.string.scan_bad);
                }
            });
            return;
        }
        busy = true;
        MainThread.run(new Runnable() {
            @Override
            public void run() {
                loading.setVisibility(View.VISIBLE);
            }
        });

        Bg.io(new java.util.concurrent.Callable<ApiClient.Check>() {
            @Override
            public ApiClient.Check call() {
                return ApiClient.check(dev, 2500);
            }
        }, new Bg.Result<ApiClient.Check>() {
            @Override
            public void on(ApiClient.Check c) {
                if (c != null && c.state == Device.STATE_ONLINE) {
                    if (c.hostname != null) dev.name = c.hostname;
                    dev.lastSeen = System.currentTimeMillis();
                    Device saved = DeviceStore.get().save(dev);
                    DeviceStore.get().setBackgroundDeviceId(saved.id);
                    Intent out = new Intent();
                    out.putExtra("deviceId", saved.id);
                    setResult(Activity.RESULT_OK, out);
                    finish();
                    return;
                }
                busy = false;
                loading.setVisibility(View.GONE);
                String msg = (c != null && c.state == Device.STATE_DENIED)
                        ? getString(R.string.err_token) : getString(R.string.err_unreachable);
                hint.setText(msg);
                // 重置状态，允许继续扫
                MainThread.post(new Runnable() {
                    @Override
                    public void run() {
                        busy = false;
                    }
                });
            }
        });
    }

    @Override
    public void onRequestPermissionsResult(int code, @NonNull String[] perms, @NonNull int[] grants) {
        super.onRequestPermissionsResult(code, perms, grants);
        if (code == REQ_CAM) {
            if (grants.length > 0 && grants[0] == PackageManager.PERMISSION_GRANTED) {
                startCamera();
            } else {
                Ui.toast(this, getString(R.string.err_camera_perm));
                finish();
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (provider != null) {
            try {
                provider.unbindAll();
            } catch (Exception ignored) {
            }
        }
        if (analyzer != null) analyzer.shutdownNow();
        super.onDestroy();
    }

    /** 取景框遮罩：中间镂空 + 四角描边 */
    static class Overlay extends View {
        private final Paint dim = new Paint();
        private final Paint corner = new Paint();
        private final RectF frame = new RectF();

        Overlay(android.content.Context c) {
            super(c);
            dim.setColor(0x99000000);
            corner.setColor(0xFFFFFFFF);
            corner.setStyle(Paint.Style.STROKE);
            corner.setStrokeWidth(Ui.dp(c, 3));
            corner.setStrokeCap(Paint.Cap.ROUND);
            corner.setAntiAlias(true);
        }

        @Override
        protected void onDraw(Canvas canvas) {
            int w = getWidth();
            int h = getHeight();
            float size = Math.min(w, h) * 0.68f;
            float cx = w / 2f;
            float cy = h / 2f - Ui.dp(getContext(), 24);
            frame.set(cx - size / 2, cy - size / 2, cx + size / 2, cy + size / 2);

            canvas.drawRect(0, 0, w, frame.top, dim);
            canvas.drawRect(0, frame.bottom, w, h, dim);
            canvas.drawRect(0, frame.top, frame.left, frame.bottom, dim);
            canvas.drawRect(frame.right, frame.top, w, frame.bottom, dim);

            float r = Ui.dp(getContext(), 26);
            float len = Ui.dp(getContext(), 30);
            Path p = new Path();
            // 左上
            p.moveTo(frame.left, frame.top + len);
            p.lineTo(frame.left, frame.top + r);
            p.quadTo(frame.left, frame.top, frame.left + r, frame.top);
            p.lineTo(frame.left + len, frame.top);
            // 右上
            p.moveTo(frame.right - len, frame.top);
            p.lineTo(frame.right - r, frame.top);
            p.quadTo(frame.right, frame.top, frame.right, frame.top + r);
            p.lineTo(frame.right, frame.top + len);
            // 右下
            p.moveTo(frame.right, frame.bottom - len);
            p.lineTo(frame.right, frame.bottom - r);
            p.quadTo(frame.right, frame.bottom, frame.right - r, frame.bottom);
            p.lineTo(frame.right - len, frame.bottom);
            // 左下
            p.moveTo(frame.left + len, frame.bottom);
            p.lineTo(frame.left + r, frame.bottom);
            p.quadTo(frame.left, frame.bottom, frame.left, frame.bottom - r);
            p.lineTo(frame.left, frame.bottom - len);
            canvas.drawPath(p, corner);
        }
    }
}
