package com.nearsend.app;

import java.util.concurrent.Callable;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/** 轻量后台线程池：网络/扫描都不在主线程跑。 */
public final class Bg {

    private static final ExecutorService POOL = Executors.newFixedThreadPool(8);

    private Bg() {
    }

    public interface Result<T> {
        void on(T value);
    }

    public static void run(Runnable r) {
        POOL.execute(r);
    }

    public static <T> void io(final Callable<T> task, final Result<T> cb) {
        POOL.execute(new Runnable() {
            @Override
            public void run() {
                T v = null;
                try {
                    v = task.call();
                } catch (Exception ignored) {
                }
                final T out = v;
                if (cb != null) {
                    MainThread.run(new Runnable() {
                        @Override
                        public void run() {
                            cb.on(out);
                        }
                    });
                }
            }
        });
    }

    public static void sleep(long ms) {
        try {
            Thread.sleep(ms);
        } catch (InterruptedException ignored) {
        }
    }
}
