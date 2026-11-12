package com.nearsend.app;

import android.content.Context;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Build;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.ContextCompat;

/** 手写 UI 的公共工具，保持与电脑端一致的间距/圆角/字级。 */
public final class Ui {

    private Ui() {
    }

    public static int dp(Context c, float v) {
        return Math.round(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v,
                c.getResources().getDisplayMetrics()));
    }

    public static int color(Context c, int res) {
        return ContextCompat.getColor(c, res);
    }

    public static TextView text(Context c, CharSequence s, float sp, int color) {
        return text(c, s, sp, color, false);
    }

    public static TextView text(Context c, CharSequence s, float sp, int color, boolean medium) {
        TextView tv = new TextView(c);
        tv.setText(s);
        tv.setTextSize(TypedValue.COMPLEX_UNIT_SP, sp);
        tv.setTextColor(color);
        tv.setIncludeFontPadding(false);
        if (medium) tv.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        return tv;
    }

    public static GradientDrawable round(Context c, int color, float radius) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.RECTANGLE);
        d.setColor(color);
        d.setCornerRadius(dp(c, radius));
        return d;
    }

    public static GradientDrawable roundStroke(Context c, int color, float radius, int strokeColor, float stroke) {
        GradientDrawable d = round(c, color, radius);
        d.setStroke(dp(c, stroke), strokeColor);
        return d;
    }

    public static GradientDrawable circle(Context c, int color, int sizeDp) {
        GradientDrawable d = new GradientDrawable();
        d.setShape(GradientDrawable.OVAL);
        d.setColor(color);
        d.setSize(dp(c, sizeDp), dp(c, sizeDp));
        return d;
    }

    public static View spacer(Context c, int h) {
        View v = new View(c);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, dp(c, h)));
        return v;
    }

    public static View divider(Context c) {
        View v = new View(c);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, Math.max(1, dp(c, 0.7f)));
        v.setLayoutParams(lp);
        v.setBackgroundColor(color(c, R.color.line));
        return v;
    }

    /** 微交互：按下缩到 0.97，松手弹回。不拦截点击。 */
    public static void pressable(View v) {
        v.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View view, MotionEvent e) {
                switch (e.getActionMasked()) {
                    case MotionEvent.ACTION_DOWN:
                        view.animate().scaleX(0.97f).scaleY(0.97f)
                                .setDuration(90).setInterpolator(new DecelerateInterpolator()).start();
                        break;
                    case MotionEvent.ACTION_UP:
                    case MotionEvent.ACTION_CANCEL:
                        view.animate().scaleX(1f).scaleY(1f).setDuration(150).start();
                        break;
                }
                return false;
            }
        });
    }

    private static Toast toast;

    public static void toast(Context c, String msg) {
        try {
            if (toast != null) toast.cancel();
            Context app = c.getApplicationContext();
            LinearLayout box = new LinearLayout(app);
            box.setBackground(round(app, color(app, R.color.surface3), 12));
            int px = dp(app, 14);
            box.setPadding(px, dp(app, 9), px, dp(app, 9));
            TextView tv = text(app, msg, 13, color(app, R.color.ink));
            box.addView(tv);
            toast = new Toast(app);
            toast.setDuration(Toast.LENGTH_SHORT);
            toast.setView(box);
            toast.setGravity(Gravity.BOTTOM, 0, dp(app, 96));
            toast.show();
        } catch (Exception ignored) {
        }
    }

    /** 状态点：在线绿 / 探测中琥珀 / 令牌失效红 / 离线灰 */
    public static int stateColor(Context c, int state) {
        switch (state) {
            case Device.STATE_ONLINE:
                return color(c, R.color.ok);
            case Device.STATE_PROBING:
                return color(c, R.color.warn);
            case Device.STATE_DENIED:
                return color(c, R.color.danger);
            default:
                return color(c, R.color.ink3);
        }
    }

    public static View dot(Context c, int colorRes, int sizeDp) {
        View v = new View(c);
        int s = dp(c, sizeDp);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(s, s);
        v.setLayoutParams(lp);
        v.setBackground(circle(c, color(c, colorRes), sizeDp));
        return v;
    }

    public static int statusBarHeight(Context c) {
        int id = c.getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (id > 0) return c.getResources().getDimensionPixelSize(id);
        return dp(c, 24);
    }

    public static void setStatusBarIcons(android.app.Activity a, boolean darkIcons) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            View decor = a.getWindow().getDecorView();
            int flags = decor.getSystemUiVisibility();
            if (darkIcons) flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            else flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            decor.setSystemUiVisibility(flags);
        }
    }

    public static FrameLayout.LayoutParams lpMatch(int heightDp, Context c) {
        return new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(c, heightDp));
    }

    public static int alpha(int color, float a) {
        return Color.argb(Math.round(255 * a), Color.red(color), Color.green(color), Color.blue(color));
    }
}
