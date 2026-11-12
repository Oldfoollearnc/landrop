package com.nearsend.app;

import android.os.Handler;
import android.os.Looper;

public final class MainThread {
    private static final Handler H = new Handler(Looper.getMainLooper());

    private MainThread() {
    }

    public static void run(Runnable r) {
        if (Looper.myLooper() == Looper.getMainLooper()) r.run();
        else H.post(r);
    }

    public static void post(Runnable r) {
        H.post(r);
    }
}
