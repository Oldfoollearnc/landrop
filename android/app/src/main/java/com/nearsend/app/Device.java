package com.nearsend.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/** 一台已配对（或已发现）的电脑。 */
public class Device {
    public String id;
    public String name;
    public String ip;
    public int port;
    public String token;
    public long lastSeen;
    public boolean customName;
    public boolean paired;

    // 运行时状态，不持久化
    public transient int state = STATE_OFFLINE;
    public transient String lastError = "";

    public static final int STATE_OFFLINE = 0;
    public static final int STATE_PROBING = 1;
    public static final int STATE_ONLINE = 2;
    public static final int STATE_DENIED = 3;   // 令牌失效，需要重新配对

    public static Device fromScan(String ip, int port, String token) {
        Device d = new Device();
        d.ip = ip;
        d.port = port;
        d.token = token;
        d.id = idOf(token);
        d.name = ip;
        d.paired = true;
        d.customName = false;
        return d;
    }

    /** 令牌不变 = 同一台电脑；IP 变了也只更新 IP，不会重复出现 */
    public static String idOf(String token) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] h = md.digest(String.valueOf(token).getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < 8; i++) sb.append(String.format("%02x", h[i]));
            return sb.toString();
        } catch (Exception e) {
            return Integer.toHexString(String.valueOf(token).hashCode());
        }
    }

    public String baseUrl() {
        return "http://" + ip + ":" + port;
    }

    public String chatUrl() {
        return baseUrl() + "/?t=" + token;
    }

    public String displayName() {
        if (name != null && !name.isEmpty()) return name;
        return ip;
    }

    public String subtitle() {
        return ip + ":" + port;
    }

    public JSONObject toJson() {
        JSONObject o = new JSONObject();
        try {
            o.put("id", id);
            o.put("name", name);
            o.put("ip", ip);
            o.put("port", port);
            o.put("token", token);
            o.put("lastSeen", lastSeen);
            o.put("customName", customName);
            o.put("paired", paired);
        } catch (JSONException ignored) {
        }
        return o;
    }

    public static Device fromJson(JSONObject o) {
        Device d = new Device();
        d.id = o.optString("id");
        d.name = o.optString("name");
        d.ip = o.optString("ip");
        d.port = o.optInt("port", 8899);
        d.token = o.optString("token");
        d.lastSeen = o.optLong("lastSeen", 0);
        d.customName = o.optBoolean("customName", false);
        d.paired = o.optBoolean("paired", true);
        if (d.id == null || d.id.isEmpty()) d.id = idOf(d.token);
        return d;
    }

    public Device copy() {
        Device d = new Device();
        d.id = id;
        d.name = name;
        d.ip = ip;
        d.port = port;
        d.token = token;
        d.lastSeen = lastSeen;
        d.customName = customName;
        d.paired = paired;
        return d;
    }
}
