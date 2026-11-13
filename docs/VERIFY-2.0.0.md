# 近传 NearSend 2.0.0 · 交付验证记录

本文件记录 2.0.0 在交付机上的实测结果，命令与观察值都可复现。所有验证都在 Windows 11（10.0.26300，x64）上完成。

---

## 一、产物

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `NearSend-2.0.0-Setup.exe` | 76,465,350 B | `0483eba39ef80b8028285aec88156fe5bddd13e75df2d7dd77d16b90f4d689b0` |
| `NearSend-2.0.0-Portable.exe` | 76,247,821 B | `bf1ae7ce304dbe45ca9a54949baf611b4c9df5cc00ebed60c77ca11fa3a345f1` |
| `NearSend-Android-2.0.0.apk` | 3,667,295 B | `dbf655e4c7406fd16d8a1283f9a324a452bbfc2e76ace04a84cc47ce8060348b` |

- `npm run dist`（electron-builder 24.13.3 + NSIS，警告即错误）构建通过
- APK：`applicationId com.nearsend.app`，`versionCode 4`，`versionName 2.0.0`，minSdk 24 / targetSdk 34
- APK 签名证书 SHA-256 `b4d8f9b2a8cc32383f9f0d3971056785af433d0650323d07f3d3e90357937b0e`，
  与已发布的 1.0.x 一致，**已装旧版可直接覆盖升级**

---

## 二、自动化测试

### 协议自测 `npm test`

24 项全部通过，覆盖鉴权、Host 白名单、发文字、同 cid 去重、引用、上传、下载进度、
WebSocket `ack` 回执与 `pong` 心跳。

### 端到端回归 `npm run test:e2e -- --total 5 --offline`

用真实无头 Chromium 打开手机页，驱动真实 UI，连接真实服务端：

```
电脑端 http://127.0.0.1:8900 正常
  ok   第一轮 5 条全部送达，没有「待发送」 — pending=0
  ok   刷新页面后 5 条仍然全部送达 — pending=0
  ok   服务端每条消息只落库一条（无重复/无丢失） — counts=1,1,1,1,1,1,1,1,1,1
  ok   同 cid 重发第二次返回 duplicate:true
  ok   duplicate 响应带回已落库的消息体
  ok   重复 cid 只落库一条
  ok   故障注入成功（模拟帧丢失 + HTTP 不通）
  ok   假连接时消息不会假装已送达，停在待发送/发送中 — pending=1
  ok   恢复网络后自动补发成功（无需手动重发） — pending=0
  ok   断网消息补发后只落库一条
10/10 项通过
```

覆盖三个关键场景：

1. **连发 5 条**：全部立即变成「时间 + 单勾」，没有一条停在「待发送」。
2. **刷新页面后再发 5 条**：同样全部送达。这正是上一版最致命的场景——cid 刷新后从 `t1` 重新开始，
   被服务端当成重复消息静默丢弃，气泡永远停在「待发送」。
3. **假连接**：页面内注入故障，让 WebSocket 帧被丢弃、HTTP 兜底也不通（模拟锁屏/切网后
   `readyState` 仍是 1 的假连接）。消息停在「发送中」而不是假装已送达；恢复后触发 `online`，
   自动判死、重连、`flushPending` 补发，最终只落库一条。

DevTools 自带的 offline 模拟只影响 HTTP、不影响已建立的 WebSocket，所以这里用页面级故障注入，
比切换网卡更可控。

截图：`docs/verify-mobile-e2e.png` —— 刷新前后各 5 条，全部是「时间 + 单勾」。

---

## 三、安装向导

从含中文与空格的目录（本仓库 `dist/`）双击启动，向导依次为：

| 页面 | 截图 | 验证点 |
| --- | --- | --- |
| 许可协议 | `docs/verify-installer-license.png` | 标题「近传 NearSend 安装」；EULA 中文正常；页脚「近传 NearSend 2.0.0」 |
| 安装选项 | `docs/verify-installer-mode.png` | 默认「仅为当前用户安装」；全新机器显示「仅为当前用户进行全新安装」 |
| 安装位置 | `docs/verify-installer-dir.png` | 默认 `%LOCALAPPDATA%\Programs\NearSend`，可改 |
| 开机启动 | `docs/verify-installer-autostart.png` | 自定义页，页头「开机启动」；复选框默认勾选 |
| 完成 | `docs/verify-installer-finish.png` | 「运行 近传 NearSend」默认勾选，点击后应用启动 |

---

## 四、升级与覆盖

### 4.1 从旧版就地覆盖（含正在运行的托盘实例）

- 机器原有 NearSend 1.0.2 与旧品牌 LanDrop 1.1.0，两条卸载项、两套快捷方式
- 直接静默运行 `NearSend-2.0.0-Setup.exe /S`：
  - 安装器自动结束运行中的实例（无需手动退出托盘）
  - 旧版经 `uninstallOldVersion` 卸载后覆盖安装
  - 结果：卸载项**只剩一条**「近传 NearSend 2.0.0」，旧桌面/开始菜单快捷方式消失，只剩「近传」
  - `%APPDATA%\NearSend` 中 9 条加密聊天记录与 token 原样保留

### 4.2 应用运行中再次覆盖

```
app procs before: 4
setup /S exit=0
app procs after: 0
DisplayName = 近传 NearSend 2.0.0
Run NearSend = "...\Programs\NearSend\NearSend.exe" --hidden
installer.json = {"autostart":true}
messages.jsonl 行数 = 23（未变）
```

### 4.3 自启动选项的两种场景

| 场景 | 期望 | 实测 |
| --- | --- | --- |
| 升级前已开启自启动 | 保持开启并改写为新路径 | `{"autostart":true}`，Run 键为新路径 |
| 升级前已关闭自启动 | 保持关闭 | `{"autostart":false}`，Run 键不存在 |

程序首次启动读取 `installer.json` 后删除该标记，后续以程序设置为准。

### 4.4 旧品牌清理

- 安装前检测到 `%LOCALAPPDATA%\Programs\LanDrop\Uninstall LanDrop.exe`（注册表 LanDrop 1.1.0）
- 静默安装时无提示直接卸载旧程序
- 结果：LanDrop 卸载项与安装目录均消失；`%APPDATA%\LanDrop` 保留作为迁移源

---

## 五、卸载

运行 `Uninstall NearSend.exe /S` 后 25 秒内：

| 检查项 | 结果 |
| --- | --- |
| 安装目录 `%LOCALAPPDATA%\Programs\NearSend` | 已删除（不再残留空目录） |
| 卸载项 | 已删除 |
| 自启动 Run 值 | 已删除 |
| 桌面/开始菜单快捷方式 | 已删除 |
| `%APPDATA%\NearSend` | 保留，23 条聊天记录 + `messages.key` + `config.json` 均在 |
| 重装后历史 | 聊天记录仍可见 |

---

## 六、安装器稳定性修复（重要）

验证过程中发现 electron-builder 自带的 NSIS 模板在**全新安装**时会偶发
`0xC0000005`（崩溃模块 `System.dll`，安装器启动数秒内退出，概率约 50%）。
已安装过旧版时走覆盖路径，不会触发。

根因在 `multiUser.nsh`：没有注册表安装位置时调用 `SHGetKnownFolderPath`，
再用 System 插件按 1024 个宽字符读取返回的短字符串。

处理方式：在 `preInit`（早于 `multiUserInit`）预置安装位置，绕开该分支；
同时把「无卸载项 = 全新安装」的状态改回，页面上仍显示「全新安装」而不是「即将重新安装/升级」。

验证：从含中文与空格的交付路径连续做 5 次全新安装，**5/5 成功**（修复前 3 次中 2 次崩溃）。

同一轮还修复了：

- 静默安装时自定义页回调把自启动状态覆盖为空 → 现在静默模式保留 `customInit` 的计算结果
- 覆盖升级时旧卸载器误删自启动项 → 现在 `--updated` 模式下不动 Run 键
- 卸载后残留空安装目录 → 卸载器先切到 `%TEMP%` 再删 `$INSTDIR`

---

## 七、桌面端

- 设置 → 关于：版本 **2.0.0**，开机启动开关为开（截图 `docs/verify-desktop-about.png`）
- 托盘常驻、单实例、二维码可扫
- 端口 8899 被占用时顺延（本机为 8900），二维码与连接地址同步变化

---

## 八、复现命令

```bash
npm test                       # 协议自测
npm start                      # 启动桌面端（或安装版）
npm run test:e2e -- --screenshot docs/verify-mobile-e2e.png
npm run dist                   # 重新构建 Setup + Portable
```

安装 / 卸载静默验证：

```bash
"./dist/NearSend-2.0.0-Setup.exe" /S
"$LOCALAPPDATA/Programs/NearSend/Uninstall NearSend.exe" /S
```

---

## 九、说明

- 安装目录与可执行文件仍为 `NearSend`（`NearSend.exe`），这是为了从 1.0.x 就地覆盖升级；
  面向用户的名称已统一为「近传 NearSend」（快捷方式、卸载项、向导标题与页脚、窗口标题）。
- `dist/_archive/` 保存了 LanDrop 1.1.0、NearSend 1.0.0–1.0.2 与旧 APK，避免用户下错版本；
  发布时只上传 2.0.0 的产物。
