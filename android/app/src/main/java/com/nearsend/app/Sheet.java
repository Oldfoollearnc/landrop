package com.nearsend.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.ColorDrawable;
import android.util.TypedValue;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowManager;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.TextView;

import java.util.ArrayList;
import java.util.List;

/** 底部操作弹层，替代 BottomSheet（不引 material 依赖）。 */
public final class Sheet {

    public static class Item {
        public String label;
        public int iconRes;
        public boolean danger;
        public Runnable run;

        public Item(String label, int iconRes, boolean danger, Runnable run) {
            this.label = label;
            this.iconRes = iconRes;
            this.danger = danger;
            this.run = run;
        }

        public Item(String label, int iconRes, Runnable run) {
            this(label, iconRes, false, run);
        }
    }

    private Sheet() {
    }

    public static Dialog show(final Activity a, String title, List<Item> items) {
        final Dialog d = new Dialog(a);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);

        final int ink = Ui.color(a, R.color.ink);
        final int ink2 = Ui.color(a, R.color.ink2);
        final int ink3 = Ui.color(a, R.color.ink3);
        final int danger = Ui.color(a, R.color.danger);
        final int line = Ui.color(a, R.color.line);

        LinearLayout root = new LinearLayout(a);
        root.setOrientation(LinearLayout.VERTICAL);
        root.setBackgroundResource(R.drawable.sheet_bg);
        int pad = Ui.dp(a, 8);
        root.setPadding(0, Ui.dp(a, 8), 0, Ui.dp(a, 8) + navBar(a));

        View grip = new View(a);
        LinearLayout.LayoutParams glp = new LinearLayout.LayoutParams(Ui.dp(a, 36), Ui.dp(a, 4));
        glp.gravity = Gravity.CENTER_HORIZONTAL;
        glp.topMargin = Ui.dp(a, 2);
        glp.bottomMargin = Ui.dp(a, 10);
        grip.setLayoutParams(glp);
        grip.setBackground(Ui.round(a, line, 2));
        root.addView(grip);

        if (title != null && !title.isEmpty()) {
            TextView t = Ui.text(a, title, 13, ink3, true);
            t.setPadding(Ui.dp(a, 20), Ui.dp(a, 4), Ui.dp(a, 20), Ui.dp(a, 10));
            root.addView(t);
        }

        for (final Item it : items) {
            LinearLayout row = new LinearLayout(a);
            row.setOrientation(LinearLayout.HORIZONTAL);
            row.setGravity(Gravity.CENTER_VERTICAL);
            row.setPadding(Ui.dp(a, 20), Ui.dp(a, 14), Ui.dp(a, 20), Ui.dp(a, 14));
            row.setBackgroundResource(R.drawable.pill_ripple_none);
            row.setClickable(true);
            row.setFocusable(true);
            row.setOnClickListener(new View.OnClickListener() {
                @Override
                public void onClick(View v) {
                    d.dismiss();
                    if (it.run != null) MainThread.post(it.run);
                }
            });
            if (it.iconRes != 0) {
                ImageView iv = new ImageView(a);
                iv.setImageResource(it.iconRes);
                LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(Ui.dp(a, 20), Ui.dp(a, 20));
                ilp.rightMargin = Ui.dp(a, 14);
                iv.setLayoutParams(ilp);
                if (it.danger) iv.setColorFilter(danger);
                row.addView(iv);
            }
            TextView tv = Ui.text(a, it.label, 15, it.danger ? danger : ink);
            row.addView(tv);
            root.addView(row);
        }

        TextView cancel = Ui.text(a, a.getString(R.string.cancel), 15, ink2);
        cancel.setGravity(Gravity.CENTER);
        cancel.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        cancel.setPadding(0, Ui.dp(a, 16), 0, Ui.dp(a, 16));
        cancel.setBackgroundResource(R.drawable.pill_ripple_none);
        cancel.setClickable(true);
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                d.dismiss();
            }
        });
        LinearLayout.LayoutParams clp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        clp.topMargin = Ui.dp(a, 6);
        cancel.setLayoutParams(clp);
        root.addView(cancel);

        d.setContentView(root);
        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setLayout(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            w.setGravity(Gravity.BOTTOM);
            w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.dimAmount = 0.5f;
            w.setAttributes(lp);
            w.setWindowAnimations(R.style.SheetAnim);
        }
        d.show();
        return d;
    }

    public static Dialog confirm(final Activity a, String message, String okLabel, final Runnable onOk) {
        final Dialog d = new Dialog(a);
        d.requestWindowFeature(Window.FEATURE_NO_TITLE);

        LinearLayout box = new LinearLayout(a);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackground(Ui.roundStroke(a, Ui.color(a, R.color.surface), 20,
                Ui.color(a, R.color.line), 1));
        int p = Ui.dp(a, 22);
        box.setPadding(p, p, p, Ui.dp(a, 14));

        TextView msg = Ui.text(a, message, 14.5f, Ui.color(a, R.color.ink));
        msg.setLineSpacing(Ui.dp(a, 4), 1f);
        box.addView(msg);

        LinearLayout btns = new LinearLayout(a);
        btns.setOrientation(LinearLayout.HORIZONTAL);
        btns.setGravity(Gravity.END);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = Ui.dp(a, 20);
        btns.setLayoutParams(blp);

        TextView cancel = Ui.text(a, a.getString(R.string.cancel), 15, Ui.color(a, R.color.ink2), true);
        cancel.setPadding(Ui.dp(a, 16), Ui.dp(a, 10), Ui.dp(a, 16), Ui.dp(a, 10));
        cancel.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                d.dismiss();
            }
        });
        btns.addView(cancel);

        TextView ok = Ui.text(a, okLabel, 15, Ui.color(a, R.color.danger), true);
        ok.setPadding(Ui.dp(a, 16), Ui.dp(a, 10), Ui.dp(a, 16), Ui.dp(a, 10));
        ok.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                d.dismiss();
                if (onOk != null) MainThread.post(onOk);
            }
        });
        btns.addView(ok);

        box.addView(btns);
        d.setContentView(box);
        Window w = d.getWindow();
        if (w != null) {
            w.setBackgroundDrawable(new ColorDrawable(Color.TRANSPARENT));
            w.setLayout(Ui.dp(a, 300), ViewGroup.LayoutParams.WRAP_CONTENT);
            w.setGravity(Gravity.CENTER);
            w.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND);
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.dimAmount = 0.5f;
            w.setAttributes(lp);
        }
        d.show();
        return d;
    }

    public static int navBar(Activity a) {
        int id = a.getResources().getIdentifier("navigation_bar_height", "dimen", "android");
        return id > 0 ? a.getResources().getDimensionPixelSize(id) : Ui.dp(a, 16);
    }

    public static float sp(Activity a, float v) {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, v, a.getResources().getDisplayMetrics());
    }
}
