package com.nearsend.app;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.RemoteInput;

/** 通知栏「直接回复」：把输入的文字发回电脑，不用先打开 App。 */
public class ReplyReceiver extends BroadcastReceiver {

    public static final String KEY_TEXT = "reply_text";
    public static final String EXTRA_DEVICE = "deviceId";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null) return;
        CharSequence text = null;
        try {
            android.os.Bundle results = RemoteInput.getResultsFromIntent(intent);
            if (results != null) text = results.getCharSequence(KEY_TEXT);
        } catch (Exception ignored) {
        }
        if (text == null || text.toString().trim().isEmpty()) return;

        String id = intent.getStringExtra(EXTRA_DEVICE);
        final Device d = id == null ? null : DeviceStore.get().byId(id);
        if (d == null) {
            try {
                NotificationManagerCompat.from(context)
                        .cancel(LinkService.NOTIF_MSG);
            } catch (Exception ignored) {
            }
            return;
        }

        final String body = text.toString().trim();
        Bg.io(new java.util.concurrent.Callable<String>() {
            @Override
            public String call() {
                return ApiClient.sendText(d, body, "reply" + System.currentTimeMillis());
            }
        }, new Bg.Result<String>() {
            @Override
            public void on(String result) {
                try {
                    NotificationManager nm = (NotificationManager)
                            App.I.getSystemService(Context.NOTIFICATION_SERVICE);
                    if (nm != null) nm.cancel(LinkService.NOTIF_MSG);
                } catch (Exception ignored) {
                }
            }
        });
    }
}
