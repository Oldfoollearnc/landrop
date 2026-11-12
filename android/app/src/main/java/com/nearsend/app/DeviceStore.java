package com.nearsend.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Comparator;
import java.util.List;

/** 已配对设备的本地存储。数据量很小，SharedPreferences 足够。 */
public class DeviceStore {

    private static DeviceStore INSTANCE;

    private final SharedPreferences sp;
    private final List<Device> devices = new ArrayList<>();
    private final List<Runnable> listeners = new ArrayList<>();

    private DeviceStore(Context ctx) {
        sp = ctx.getApplicationContext().getSharedPreferences("nearsend", Context.MODE_PRIVATE);
        load();
    }

    public static synchronized void init(Context ctx) {
        if (INSTANCE == null) INSTANCE = new DeviceStore(ctx);
    }

    public static DeviceStore get() {
        return INSTANCE;
    }

    private void load() {
        devices.clear();
        try {
            JSONArray arr = new JSONArray(sp.getString("devices", "[]"));
            for (int i = 0; i < arr.length(); i++) {
                Device d = Device.fromJson(arr.getJSONObject(i));
                if (d.token != null && !d.token.isEmpty() && d.ip != null && !d.ip.isEmpty()) {
                    devices.add(d);
                }
            }
        } catch (Exception ignored) {
        }
        sort();
    }

    private void sort() {
        Collections.sort(devices, new Comparator<Device>() {
            @Override
            public int compare(Device a, Device b) {
                return Long.compare(b.lastSeen, a.lastSeen);
            }
        });
    }

    private void persist() {
        JSONArray arr = new JSONArray();
        for (Device d : devices) arr.put(d.toJson());
        sp.edit().putString("devices", arr.toString()).apply();
    }

    public List<Device> all() {
        return new ArrayList<>(devices);
    }

    public Device primary() {
        return devices.isEmpty() ? null : devices.get(0);
    }

    public Device byId(String id) {
        for (Device d : devices) if (d.id.equals(id)) return d;
        return null;
    }

    public Device byToken(String token) {
        for (Device d : devices) if (d.token.equals(token)) return d;
        return null;
    }

    /** 同一台电脑重新配对时覆盖旧记录（令牌变了就是新记录，但 ip:port 相同的旧记录要清掉） */
    public Device save(Device dev) {
        Device same = byId(dev.id);
        if (same == null) {
            // 令牌不同但地址相同，说明电脑重置过令牌 —— 移除旧记录避免重复条目
            Device stale = null;
            for (Device d : devices) {
                if (d.ip.equals(dev.ip) && d.port == dev.port) {
                    stale = d;
                    break;
                }
            }
            if (stale != null) devices.remove(stale);
            devices.add(dev);
        } else {
            same.ip = dev.ip;
            same.port = dev.port;
            same.token = dev.token;
            if (!same.customName) same.name = dev.name;
            same.paired = true;
            if (dev.lastSeen > 0) same.lastSeen = dev.lastSeen;
        }
        sort();
        persist();
        notifyChanged();
        return same != null ? same : dev;
    }

    public void touch(String id) {
        Device d = byId(id);
        if (d == null) return;
        d.lastSeen = System.currentTimeMillis();
        sort();
        persist();
        notifyChanged();
    }

    /** 在线探测拿到的电脑名，只在用户没手动改过时生效；不触发界面重绘，避免递归 */
    public void applyHostname(String id, String name) {
        Device d = byId(id);
        if (d == null || d.customName || name == null || name.isEmpty()) return;
        if (name.equals(d.name)) return;
        d.name = name;
        persist();
    }

    public void rename(String id, String name) {
        Device d = byId(id);
        if (d == null) return;
        d.name = name;
        d.customName = true;
        persist();
        notifyChanged();
    }

    public void remove(String id) {
        Device d = byId(id);
        if (d != null) {
            devices.remove(d);
            persist();
            notifyChanged();
        }
    }

    public boolean isEmpty() {
        return devices.isEmpty();
    }

    public void addListener(Runnable r) {
        if (!listeners.contains(r)) listeners.add(r);
    }

    public void removeListener(Runnable r) {
        listeners.remove(r);
    }

    private void notifyChanged() {
        for (Runnable r : new ArrayList<>(listeners)) {
            try {
                r.run();
            } catch (Exception ignored) {
            }
        }
    }

    // ---- 全局开关（统一由 Prefs 持有，设置页与后台服务共用同一个真源） ----
    public boolean backgroundReceive() {
        return Prefs.backgroundReceive();
    }

    public void setBackgroundReceive(boolean on) {
        Prefs.setBackgroundReceive(on);
    }

    public String backgroundDeviceId() {
        String id = Prefs.defaultDeviceId();
        if (id != null && !id.isEmpty() && byId(id) != null) return id;
        Device p = primary();
        return p == null ? "" : p.id;
    }

    public void setBackgroundDeviceId(String id) {
        Prefs.setDefaultDeviceId(id);
    }

    public boolean isDefault(String id) {
        return id != null && id.equals(backgroundDeviceId());
    }
}
