package com.nearsend.app;

import android.app.Activity;
import android.content.Intent;
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

/** 首次启动的一次性引导：三件事说清就结束，不做过场动画堆砌。 */
public class OnboardingActivity extends AppCompatActivity {

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

        LinearLayout c = new LinearLayout(this);
        c.setOrientation(LinearLayout.VERTICAL);
        c.setPadding(Ui.dp(this, 26), Ui.statusBarHeight(this) + Ui.dp(this, 46),
                Ui.dp(this, 26), Sheet.navBar(this) + Ui.dp(this, 30));

        // 标记
        FrameLayout mark = new FrameLayout(this);
        int ms = Ui.dp(this, 72);
        LinearLayout.LayoutParams mlp = new LinearLayout.LayoutParams(ms, ms);
        mark.setLayoutParams(mlp);
        mark.setBackground(Ui.round(this, Ui.color(this, R.color.accent), 22));
        ImageView iv = new ImageView(this);
        FrameLayout.LayoutParams ilp = new FrameLayout.LayoutParams(Ui.dp(this, 38), Ui.dp(this, 38));
        ilp.gravity = Gravity.CENTER;
        iv.setLayoutParams(ilp);
        iv.setImageResource(R.drawable.ic_brand);
        mark.addView(iv);
        c.addView(mark);

        TextView name = Ui.text(this, getString(R.string.app_name), 30,
                Ui.color(this, R.color.ink), true);
        name.setLetterSpacing(0.02f);
        LinearLayout.LayoutParams nlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        nlp.topMargin = Ui.dp(this, 22);
        name.setLayoutParams(nlp);
        c.addView(name);

        TextView tag = Ui.text(this, getString(R.string.onboard_tagline), 14,
                Ui.color(this, R.color.ink2));
        tag.setLineSpacing(Ui.dp(this, 4), 1f);
        LinearLayout.LayoutParams tlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        tlp.topMargin = Ui.dp(this, 10);
        tag.setLayoutParams(tlp);
        c.addView(tag);

        c.addView(gap(34));
        c.addView(feature(R.drawable.ic_bolt, R.string.onboard_1_t, R.string.onboard_1_b));
        c.addView(feature(R.drawable.ic_shield, R.string.onboard_2_t, R.string.onboard_2_b));
        c.addView(feature(R.drawable.ic_layers, R.string.onboard_3_t, R.string.onboard_3_b));

        c.addView(gap(34));

        TextView primary = Ui.text(this, getString(R.string.pair_scan), 15,
                Ui.color(this, R.color.accentFg), true);
        primary.setGravity(Gravity.CENTER);
        primary.setBackgroundResource(R.drawable.btn_primary);
        primary.setPadding(0, Ui.dp(this, 16), 0, Ui.dp(this, 16));
        primary.setClickable(true);
        Ui.pressable(primary);
        primary.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                done(true);
            }
        });
        c.addView(primary);

        TextView skip = Ui.text(this, getString(R.string.onboard_skip), 13.5f,
                Ui.color(this, R.color.ink3));
        skip.setGravity(Gravity.CENTER);
        skip.setPadding(0, Ui.dp(this, 16), 0, Ui.dp(this, 16));
        skip.setClickable(true);
        skip.setOnClickListener(new View.OnClickListener() {
            @Override
            public void onClick(View v) {
                done(false);
            }
        });
        c.addView(skip);

        sv.addView(c);
        root.addView(sv, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
    }

    private View feature(int iconRes, int titleRes, int bodyRes) {
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.HORIZONTAL);
        LinearLayout.LayoutParams rlp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rlp.bottomMargin = Ui.dp(this, 20);
        row.setLayoutParams(rlp);

        FrameLayout icon = new FrameLayout(this);
        int s = Ui.dp(this, 38);
        LinearLayout.LayoutParams ilp = new LinearLayout.LayoutParams(s, s);
        ilp.rightMargin = Ui.dp(this, 14);
        icon.setLayoutParams(ilp);
        icon.setBackground(Ui.round(this, Ui.color(this, R.color.surface2), 12));
        ImageView iv = new ImageView(this);
        FrameLayout.LayoutParams vlp = new FrameLayout.LayoutParams(Ui.dp(this, 19), Ui.dp(this, 19));
        vlp.gravity = Gravity.CENTER;
        iv.setLayoutParams(vlp);
        iv.setImageResource(iconRes);
        icon.addView(iv);
        row.addView(icon);

        LinearLayout texts = new LinearLayout(this);
        texts.setOrientation(LinearLayout.VERTICAL);
        texts.setLayoutParams(new LinearLayout.LayoutParams(0,
                ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        texts.addView(Ui.text(this, getString(titleRes), 14.5f,
                Ui.color(this, R.color.ink), true));
        TextView body = Ui.text(this, getString(bodyRes), 12.5f,
                Ui.color(this, R.color.ink3));
        body.setLineSpacing(Ui.dp(this, 3), 1f);
        LinearLayout.LayoutParams blp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        blp.topMargin = Ui.dp(this, 4);
        body.setLayoutParams(blp);
        texts.addView(body);
        row.addView(texts);
        return row;
    }

    private void done(boolean scan) {
        Prefs.setOnboardingDone(true);
        if (scan) {
            Intent out = new Intent();
            out.putExtra("scan", true);
            setResult(Activity.RESULT_OK, out);
        }
        finish();
    }

    @Override
    public void onBackPressed() {
        done(false);
    }

    private View gap(int dp) {
        View v = new View(this);
        v.setLayoutParams(new LinearLayout.LayoutParams(1, Ui.dp(this, dp)));
        return v;
    }
}
