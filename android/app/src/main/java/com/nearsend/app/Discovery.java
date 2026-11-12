package com.nearsend.app;

import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Enumeration;
import java.util.List;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * 局域网扫描发现。
 * 先按 /24 网段并发探默认端口 8899（绝大多数人不会改端口），命中后确认是不是 LanDrop。
 * 已配对设备额外扫整段端口，改过端口也能找回来。
 */
public class Discovery {

    public interface Listener {
        void onProgress(int done, int total);

        void onFound(ApiClient.Found found);

        void onDone(List<ApiClient.Found> all);
    }

    private volatile boolean cancelled;
    private final List<ApiClient.Found> found = Collections.synchronizedList(new ArrayList<ApiClient.Found>());

    public void cancel() {
        cancelled = true;
    }

    public boolean isCancelled() {
        return cancelled;
    }

    /** 本机在局域网里的 IPv4 地址，优先 wlan。 */
    public static String localIp() {
        String fallback = null;
        try {
            Enumeration<NetworkInterface> ifs = NetworkInterface.getNetworkInterfaces();
            while (ifs.hasMoreElements()) {
                NetworkInterface ni = ifs.nextElement();
                if (!ni.isUp() || ni.isLoopback()) continue;
                String name = ni.getName() == null ? "" : ni.getName().toLowerCase();
                if (name.startsWith("tun") || name.startsWith("tap") || name.startsWith("rmnet")
                        || name.startsWith("dummy") || name.contains("p2p")) {
                    continue;
                }
                Enumeration<InetAddress> addrs = ni.getInetAddresses();
                while (addrs.hasMoreElements()) {
                    InetAddress a = addrs.nextElement();
                    if (!(a instanceof Inet4Address)) continue;
                    String ip = a.getHostAddress();
                    if (ip == null || ip.startsWith("169.254.") || ip.startsWith("127.")) continue;
                    if (name.startsWith("wlan") || name.startsWith("ap")) return ip;
                    if (fallback == null) fallback = ip;
                }
            }
        } catch (Exception ignored) {
        }
        return fallback;
    }

    public static String subnetPrefix(String ip) {
        if (ip == null) return null;
        int idx = ip.lastIndexOf('.');
        if (idx <= 0) return null;
        return ip.substring(0, idx);
    }

    public void scan(final List<Device> known, final Listener listener) {
        Bg.run(new Runnable() {
            @Override
            public void run() {
                try {
                    doScan(known, listener);
                } catch (Exception e) {
                    MainThread.run(new Runnable() {
                        @Override
                        public void run() {
                            listener.onDone(found);
                        }
                    });
                }
            }
        });
    }

    private void doScan(List<Device> known, final Listener listener) {
        String myIp = localIp();
        String prefix = subnetPrefix(myIp);
        List<String> hosts = new ArrayList<>();
        if (prefix != null) {
            for (int i = 1; i <= 254; i++) hosts.add(prefix + "." + i);
        }
        final int total = Math.max(1, hosts.size());

        // 1) 先按已知设备的地址优先确认，体验上是“秒回”
        if (known != null) {
            for (Device d : known) {
                if (cancelled) break;
                if (probeHost(d.ip, d.port, listener)) {
                    // 已知设备已经确认过，从通用扫描里剔除，省一次探测
                    hosts.remove(d.ip);
                }
            }
        }

        // 2) 全网段扫默认端口
        final AtomicInteger done = new AtomicInteger(0);
        int threads = Math.min(48, Math.max(8, hosts.size()));
        ExecutorService pool = Executors.newFixedThreadPool(threads);
        final CountDownLatch latch = new CountDownLatch(hosts.size());
        for (final String host : hosts) {
            pool.execute(new Runnable() {
                @Override
                public void run() {
                    try {
                        if (!cancelled && ApiClient.tcpAlive(host, ApiClient.DEFAULT_PORT, 200)) {
                            probeHost(host, ApiClient.DEFAULT_PORT, listener);
                        }
                    } finally {
                        int d = done.incrementAndGet();
                        notifyProgress(listener, d, total);
                        latch.countDown();
                    }
                }
            });
        }
        try {
            latch.await(25, TimeUnit.SECONDS);
        } catch (InterruptedException ignored) {
        }
        pool.shutdownNow();

        MainThread.run(new Runnable() {
            @Override
            public void run() {
                listener.onDone(new ArrayList<>(found));
            }
        });
    }

    /** 返回是否命中 */
    private boolean probeHost(String ip, int port, final Listener listener) {
        if (cancelled) return false;
        ApiClient.Found f = ApiClient.probe(ip, port);
        if (f == null) return false;
        for (ApiClient.Found old : found) {
            if (old.ip.equals(f.ip) && old.port == f.port) return true;
        }
        found.add(f);
        MainThread.run(new Runnable() {
            @Override
            public void run() {
                if (!cancelled) listener.onFound(f);
            }
        });
        return true;
    }

    private void notifyProgress(final Listener listener, final int done, final int total) {
        if (done % 8 != 0 && done != total) return;
        MainThread.run(new Runnable() {
            @Override
            public void run() {
                if (!cancelled) listener.onProgress(done, total);
            }
        });
    }
}
