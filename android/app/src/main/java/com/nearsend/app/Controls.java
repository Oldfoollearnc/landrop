package com.nearsend.app;

import android.content.Context;
import android.graphics.Typeface;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.animation.DecelerateInterpolator;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;

/** 设置页用的自绘控件：拨动开关与分段选择。不依赖 material 库。 */
public final class Controls {

    private Controls() {
    }

    public interface OnChange {
        void on(boolean checked);
    }

    public interface OnPick {
        void on(int index);
    }

    /** iOS 风格的拨动开关，点击区域比视觉尺寸大一圈。 */
    public static class Toggle extends FrameLayout {
        private final int trackOff;
        private final int trackOn;
        private final View track;
        private final View knob;
        private boolean checked;
        private OnChange listener;

        public Toggle(Context c) {
            super(c);
            int w = Ui.dp(c, 46);
            int h = Ui.dp(c, 28);
            int k = Ui.dp(c, 22);
            trackOff = Ui.color(c, R.color.line2);
            trackOn = Ui.color(c, R.color.accent);

            setClipChildren(false);
            setClickable(true);
            setFocusable(true);

            track = new View(c);
            track.setBackground(Ui.round(c, trackOff, 999));
            addView(track, new LayoutParams(w, h, Gravity.CENTER_VERTICAL));

            knob = new View(c);
            knob.setBackground(Ui.roundStroke(c, 0xFFFFFFFF, 999, 0x14000000, 0.5f));
            knob.setElevation(Ui.dp(c, 1.5f));
            FrameLayout.LayoutParams klp = new LayoutParams(k, k, Gravity.CENTER_VERTICAL);
            klp.leftMargin = Ui.dp(c, 3);
            addView(knob, klp);

            Ui.pressable(this);
            setOnClickListener(new OnClickListener() {
                @Override
                public void onClick(View v) {
                    setChecked(!checked, true);
                }
            });
        }

        public boolean isChecked() {
            return checked;
        }

        public void setListener(OnChange l) {
            listener = l;
        }

        public void setChecked(boolean on) {
            setChecked(on, false);
        }

        public void setChecked(boolean on, boolean fromUser) {
            checked = on;
            int travel = getWidth() > 0
                    ? getWidth() - Ui.dp(getContext(), 28)
                    : Ui.dp(getContext(), 18);
            knob.animate().translationX(on ? travel : 0)
                    .setDuration(fromUser ? 180 : 0)
                    .setInterpolator(new DecelerateInterpolator()).start();
            track.setBackground(Ui.round(getContext(), on ? trackOn : trackOff, 999));
            knob.setBackground(Ui.roundStroke(getContext(), 0xFFFFFFFF, 999,
                    on ? 0x00000000 : 0x14000000, 0.5f));
            if (fromUser && listener != null) listener.on(on);
        }
    }

    /** 分段选择器：主题、字号这类少量互斥选项。 */
    public static class Segmented extends LinearLayout {
        private final TextView[] cells;
        private int selected;
        private OnPick listener;
        private final int padding;

        public Segmented(Context c, String[] labels, int index, OnPick pick) {
            super(c);
            setOrientation(HORIZONTAL);
            padding = Ui.dp(c, 3);
            setPadding(padding, padding, padding, padding);
            setBackground(Ui.round(c, Ui.color(c, R.color.surface2), 12));
            cells = new TextView[labels.length];
            listener = pick;
            selected = Math.max(0, Math.min(index, labels.length - 1));

            for (int i = 0; i < labels.length; i++) {
                final int at = i;
                TextView tv = Ui.text(c, labels[i], 13, Ui.color(c, R.color.ink2), true);
                tv.setGravity(Gravity.CENTER);
                tv.setPadding(Ui.dp(c, 4), Ui.dp(c, 8), Ui.dp(c, 4), Ui.dp(c, 8));
                tv.setBackground(Ui.round(c, 0x00000000, 9));
                tv.setClickable(true);
                LayoutParams lp = new LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f);
                tv.setLayoutParams(lp);
                tv.setOnClickListener(new OnClickListener() {
                    @Override
                    public void onClick(View v) {
                        if (at == selected) return;
                        selected = at;
                        paint();
                        if (listener != null) listener.on(at);
                    }
                });
                cells[i] = tv;
                addView(tv);
            }
            paint();
        }

        private void paint() {
            for (int i = 0; i < cells.length; i++) {
                boolean on = i == selected;
                cells[i].setTextColor(Ui.color(getContext(), on ? R.color.ink : R.color.ink3));
                cells[i].setBackground(on
                        ? Ui.roundStroke(getContext(), Ui.color(getContext(), R.color.surface), 9,
                        Ui.color(getContext(), R.color.line), 0.8f)
                        : Ui.round(getContext(), 0x00000000, 9));
                cells[i].setTypeface(Typeface.create(
                        on ? "sans-serif-medium" : "sans-serif", Typeface.NORMAL));
            }
        }
    }
}
