# 新窗口任务书 · 近传 NearSend 2.0.0 收尾

> 用法：把本文件从「一、任务」到「十、提交信息」整段复制，作为新会话的第一条消息发送。
> 仓库路径：`C:\Users\Administrator\Desktop\局域网传信 手机与电脑传输信息 支持图片 文字`

---

## 一、任务

把「近传 NearSend」从 1.0.2 收尾成一个可交付的双端产品（版本 2.0.0）。上一轮已经定位并修好了三个真实缺陷、重写了安装包，**代码改动已完成且构建通过**，剩下的是「装到本机验证 → 手机端收尾 → 发布」。

你的工作不是重做，而是：

1. 验证 2.0.0 安装包的升级/卸载行为（最重要，上一轮被打断没验证）
2. 端到端验证「已连接却发不出去」确已修复
3. 决定 Android 端怎么办（源码已丢失，见第七节）
4. 清理 dist 旧包、打 tag、发 GitHub Release

---

## 二、环境

| 项 | 值 |
|---|---|
| 工作目录 | `C:\Users\Administrator\Desktop\局域网传信 手机与电脑传输信息 支持图片 文字` |
| Node / npm | v24.16.0 / 11.13.0 |
| Electron | 28.3.3（已装） |
| electron-builder | 24.13.3（已装，NSIS 与 winCodeSign 缓存已在 `%LOCALAPPDATA%\electron-builder\Cache`，可离线构建） |
| Java | OpenJDK 11.0.16 |
| Android SDK | `D:\Android\android-sdk`（platforms 33/34/35/36，build-tools 32/34/35/37，adb 可用） |
| Gradle | 不在 PATH，但 `~/.gradle/wrapper/dists/gradle-8.14.3` 与 modules-2 缓存已在 |
| 权限 | 文件 danger-full-access；审批策略 never-ask（**不要请求提权，会被直接拒绝**） |

工具坑（会浪费大量时间，务必先读）：

- 文件操作走 `ops_*` 工具，不要用 shell 的 cat/ls 做文件读写
- `ops_glob` 的 `data.items` 是**路径字符串数组**，不是对象数组
- 原生 `glob` 工具的参数 `pattern` 是 **string**，不是数组（写成数组会报 invalid arguments）
- `ops_load_sdk` 加载的工具**下一次调用**才生效
- 用模板字符串写 NSIS 脚本时，`${If} / ${VERSION}` 等必须写成 `\${...}`，否则 JS 先报 "xxx is not defined"

---

## 三、产品架构（必须理解，否则会修错地方）

```
Electron 主进程 src/main/main.js
 ├─ 托盘常驻、无边框窗口（小窗 380×540 / 大窗 1120×780）
 ├─ server.js   HTTP + WebSocket，监听 0.0.0.0:8899（占用则顺延）
 │    ├─ token 鉴权（query ?t= 或 cookie ld）
 │    ├─ Host 白名单校验（非本机网卡地址直接 421）
 │    └─ /api/history /api/send/text /api/upload/* /d/:id /t/:id /ws
 ├─ renderer/desktop  电脑端界面
 └─ renderer/mobile   手机端界面  ← 关键
```

**手机端 UI 不是 App 内置的，而是电脑端实时下发的 `src/renderer/mobile/*`。**
Android APK 只是一个 WebView 壳 + 原生桥（`window.NearSend`：剪贴板、保存相册、系统分享、震动、通知回复）。

结论：**改 `src/renderer/mobile/app.js` 等于同时改了网页版和已安装 APK 的行为，手机不用重装。** 这条在写发布说明时要用到。

---

## 四、上一轮定位的三个根因（证据）

用户症状：「明明显示已连接，消息发不出去，气泡一直停在『待发送』」。

1. **cid 跨会话重复（主因）**
   `src/renderer/mobile/app.js` 原代码：
   ```js
   let seq = 0;
   const nextCid = (kind) => \`\${myId}.\${kind}\${++seq}\`;
   ```
   `myId` 存在 localStorage 长期不变，`seq` 每次刷新页面/重开 App 归零 →
   刷新后第一条消息又是 `设备id.t1` → 服务端 `seenCid()` 判为重复 → **静默 return，不落库不广播**
   → 手机等不到回显 → 气泡永远「待发送」。

2. **没有回执、没有超时**
   原来只靠服务端广播回显来把气泡改成已发送，没有任何兜底。

3. **假连接**
   手机锁屏/切网/进后台后，WebSocket 常常 `readyState === 1`、`send()` 不报错，但帧到不了电脑。

---

## 五、已完成的改动（不要重做，只需验证）

### 5.1 服务端 `src/main/server.js`

- 新增 `findBySrc(cid)`：按 cid 找回已落库的文字消息
- `onClientMessage` 的 `text` 分支：先 `seenCid`，再 `findBySrc`；若命中重复，**回送 `{t:'msg'}` + `{t:'ack', duplicate:true}`**，不再静默丢弃
- 每条文字成功落库后回 `{t:'ack', cid, id, msg}`（带完整 msg，手机可直接替换本地气泡）
- 新增 `{t:'ping'}` → `{t:'pong'}`
- `POST /api/send/text` 重复 cid 时返回 `{ok, duplicate, id, msg}`；成功时也返回 `msg`

### 5.2 手机端 `src/renderer/mobile/app.js`

- `nextCid` 改为 `设备id.启动随机片段.类型序号`（`bootTag`），跨刷新不再碰撞
- 新增 `deliver(cid)`：发 WS + 6 秒 ack 超时计时器
- 新增 `onNoAck(cid)`：超时后改用 `POST /api/send/text` 兜底；HTTP 也失败则判定假连接、`dropSocket()` 重连
- 新增 `resolveLocal(cid, msg)`：清 pending、删本地行、插入正式消息
- 新增 `failText(cid)` / `retryText(m)`：3 次仍失败显示「未送达」，**点气泡就地重发**
- 新增 `startHeartbeat()` / `dropSocket()`：15 秒 ping，45 秒无入站判死并重连
- `visibilitychange`（回前台）、`online`（网络恢复）立即验活
- `onSocket` 处理 `ack` / `pong`

### 5.3 协议自测 `tools/test-server.js`

新增 WebSocket 段：pong 回应、每条文字有 ack、ack 带 msg、重复 cid 只落库一条、ack id 与落库 id 一致。

运行：`npm test` —— **上一轮已全绿（20+ 项）**。

### 5.4 版本与安装包

- `package.json`：version **2.0.0**（必须高于 LanDrop 的 1.1.0），新增 `npm test` / `dist:setup`
- `electron-builder.yml`：`oneClick:false`、`allowToChangeInstallationDirectory:true`、许可协议、桌面/开始菜单快捷方式、`differentialPackage`、自定义 nsh
- `assets/installer.nsh` 重写，四处关键修正：
  1. `VersionCompare` 返回值用反了（**1 = 已安装更高，2 = 更低，0 = 相同**）。旧脚本把 1 当"更新"、2 当"降级"，所以装旧版反而提示降级。现在：安装包更新 → 直接装；相同 → 视为修复安装；只有安装包确实更旧才提示"装回旧版"
  2. 检测旧品牌 LanDrop（`%LOCALAPPDATA%\Programs\LanDrop`、`Program Files(x86)\LanDrop`），静默卸载后再装，一台机器只留一个
  3. 检测逻辑必须**内联在 `customInit`**，不能写成独立 `Function`（卸载器那一遍编译会报 warning 6010 未引用）
  4. 变量用 `Var /GLOBAL` 声明在宏内（放文件顶层会报 warning 6001 未引用）
- `assets/license_zh.txt` 新增（EULA）
- `CHANGELOG.md` 新增 v2.0.0 条目；`README.md` 安装章节重写；新增 `docs/UPGRADE.md`（解释"为什么有两个版本""为什么提示降级"）

### 5.5 构建结果（已验证）

```
dist/NearSend-2.0.0-Setup.exe        76,468,039 B
dist/NearSend-2.0.0-Portable.exe     76,245,620 B
dist/NearSend-2.0.0-Setup.exe.blockmap
dist/latest.yml                      version: 2.0.0 ✅
```

`npx electron-builder --win nsis portable` **在严格模式（警告即错误）下通过**。

---

## 六、机器当前状态（重要，别被误导）

- 「应用和功能」里仍是 **NearSend 1.0.2**（旧版），`%LOCALAPPDATA%\Programs\NearSend` 是旧文件
- 有 **5 个 NearSend.exe 进程在跑**（1 主进程 + 渲染/GPU，托盘常驻）
- 那次 2.0.0 静默安装**被中断，没有生效**，必须重测
- 工作区未提交：`M CHANGELOG.md README.md assets/installer.nsh electron-builder.yml package.json src/main/server.js src/renderer/mobile/app.js tools/test-server.js`，新增 `assets/license_zh.txt docs/UPGRADE.md`
- 根目录有临时日志 `build.log / build-portable.log / build-default.log`，收尾时删掉

---

## 七、待办（按优先级）

### P0-1 升级安装验证（未完成，最关键）

⚠️ **已知风险**：本程序是托盘常驻应用，升级时旧实例正在运行会锁住 `NearSend.exe`，
导致安装覆盖失败。`installer.nsh` 目前只 taskkill 了 `LanDrop.exe`，**没有杀 `NearSend.exe`**。
先补这一条再测：

```nsis
; 在 customInit 开头（安装文件被复制之前）加
nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /f /im NearSend.exe'
Pop $0
Sleep 600
```

步骤：

```bash
# 1. 结束旧实例
taskkill //f //im NearSend.exe

# 2. 静默安装（引号包路径，别用 && 串联，安装器返回码会中断链）
"./dist/NearSend-2.0.0-Setup.exe" /S
sleep 15

# 3. 校验
ls "$LOCALAPPDATA/Programs/NearSend" | head
reg query "HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall" /s /f "NearSend" | grep -i -E "DisplayName|DisplayVersion"
#   期望：DisplayVersion = 2.0.0，且只有一条近传条目
ls "$USERPROFILE/Desktop" | grep -i 近传
```

验收：

- [ ] 卸载项版本 = 2.0.0，且**只有一条**
- [ ] 目录里 `NearSend.exe` 时间戳是新的
- [ ] 桌面/开始菜单出现「近传」
- [ ] 启动后托盘只有 1 个图标，小窗出二维码
- [ ] 设置页版本号显示 2.0.0

### P0-2 旧品牌清理验证

```bash
# 造一个假 LanDrop 目录 + 假卸载器，验证安装器会先清理
mkdir -p "$LOCALAPPDATA/Programs/LanDrop"
# 放一个能自我删除的 Uninstall LanDrop.exe（或任意 exe，观察是否被调用）
```

验收：安装时弹出「检测到旧版本 LanDrop」确认框；静默安装时无提示直接清理；装完 `LanDrop` 目录消失。

### P0-3 卸载验证

```bash
printf '{"token":"keepme"}' > "$APPDATA/NearSend/config.json"   # 先造假数据
"$LOCALAPPDATA/Programs/NearSend/Uninstall NearSend.exe" /S
sleep 10
ls "$APPDATA/NearSend"   # 期望：仍然存在（deleteAppDataOnUninstall:false）
```

### P1 端到端验证「发得出去了」

最低成本方案（不需要手机）：

1. `npm start` 启动桌面端，记下窗口里二维码里的 `?t=` token 与端口
2. 用 Playwright/Puppeteer（若未安装，可用 Electron 自带 Chromium 的 `--remote-debugging-port`）打开
   `http://127.0.0.1:8899/?t=<token>`，模拟手机页面
3. 关键回归用例：
   - 连发 3 条 → 都应立即变成 时间+单勾，**不出现「待发送」**
   - **刷新页面再发 3 条** → 同样成功（这正是原来 cid 冲突的场景）
   - 断网：`page.evaluate(() => ws.close())` 后发消息 → 显示「待发送」→ 等重连 → 自动补发成功
   - 重复发送同一 cid（`fetch('/api/send/text', {body:{text,cid}})` 两次）→ 只落库一条，且第二次返回 `duplicate:true` 并带 `msg`
4. 电脑端应实时出现这些消息，托盘气泡正常

### P2 Android 端（需要决策）

**现状**：`android/` 目录只有 README。不只是在 git 里没有——历史上**从未提交过** Android 工程源码（`git ls-tree -r v1.0.2 -- android` 为空），
签名库 `android/keystore/landrop.jks` 也不在磁盘上（已被 `.gitignore` 排除且文件不存在）。
`dist/NearSend-Android-1.0.2.apk` 是唯一产物。

两条路线，建议先问用户选哪条：

- **A（推荐，零风险）**：不重发 APK。手机端 UI 由电脑端下发，2.0.0 的修复已自动生效。
  发布说明里写清「无需重装 App」，只更新电脑端。
- **B（工作量大）**：重建 Android 工程（WebView 壳 + `window.NearSend` 桥 + 系统分享 + 通知栏回复 + 应用内下载），
  用 SDK 里已缓存的 Gradle 8.14.3 构建。
  ⚠️ 因为原签名库已丢，新 APK 签名不同，**用户必须先卸载旧 App 才能装**，
  这是产品体验上的倒退，必须在发布说明里提前告知。

### P3 发布

1. 清理 `dist/` 里的历史包，避免用户又下错版本（这正是"电脑上两个版本"的直接诱因）：
   `LanDrop-1.1.0-*`、`NearSend-1.0.0/1.0.1/1.0.2-*`、`NearSend-1.0.2-win-x64.zip`
   —— 建议移到 `dist/_archive/` 而不是直接删
2. `git add -A && git commit`（信息见第十节），`git tag v2.0.0`
3. `git push origin main --tags`
4. GitHub Release `v2.0.0` 上传：Setup.exe、Portable.exe、blockmap、latest.yml
5. **收编旧发布页**：给 `v1.1.0`、`v1.0.2` 等旧 Release 标注 deprecated 或直接删除资产，
   发布说明第一行写「请只下载 v2.0.0，旧版本会导致电脑上出现两个近传」

### P4 文档收尾

- `README.md` 里 Android 版本号仍是 1.0.2（属实，若走路线 A）
- `docs/UPGRADE.md` 校对一遍
- 删除根目录 `build*.log`

---

## 八、已知坑（照着避）

| 坑 | 说明 |
|---|---|
| NSIS warning 6010 | `Function` 定义了但未调用 → 卸载器那一遍编译报错。检测逻辑必须内联在宏里 |
| NSIS warning 6001 | `Var` 放文件顶层但在某些编译遍未使用。要用 `Var /GLOBAL` 放在宏内 |
| electron-builder 严格模式 | 默认把 makensis 警告当错误，**不要**在配置里写 `warningsAsErrors: false` 绕过 |
| 模板字符串 `${}` | 写 nsh 内容时必须转义，否则 JS 抛 ReferenceError 且文件写不进去 |
| 安装器返回码 | 用 `&&` 串联命令时安装器非 0 返回会中断后续校验，用 `;` 或分行 |
| 托盘应用锁文件 | 升级前必须 taskkill，否则覆盖失败（见 P0-1） |
| 端口占用 | 8899 被旧实例占用时新实例会顺延到 8900，二维码地址随之变化 |
| 数据目录 | `%APPDATA%\NearSend`（配置、加密聊天记录、Local State）；旧品牌 `%APPDATA%\LanDrop` 会由程序启动时迁移 |

---

## 九、验收标准（全部满足才算完成）

- [ ] 本机「应用和功能」只有一条「近传 NearSend 2.0.0」
- [ ] 桌面上双击图标能启动，托盘常驻，二维码可扫
- [ ] 手机页面连发 5 条 + 刷新后再发 5 条，**没有一条停在「待发送」**
- [ ] 断网发消息 → 重连后自动补发，且不重复
- [ ] 卸载后 `%APPDATA%\NearSend` 仍在，重装后聊天记录可见
- [ ] `npm test` 全绿
- [ ] `npx electron-builder --win nsis portable` 严格模式通过
- [ ] GitHub Release 只挂 2.0.0 的产物

---

## 十、提交信息（可直接用）

```
fix: 修好已连接却发不出去，安装包改为完整升级流程 (v2.0.0)

- 手机端 cid 增加启动随机片段，修掉刷新后 cid 冲突被服务端静默去重、
  气泡永远停在「待发送」的问题
- 文字消息增加 ack 回执与 6 秒超时，超时自动走 HTTP 补发；3 次失败显示
  「未送达」，点气泡重发
- 增加 15 秒应用层心跳与 45 秒判活，识别锁屏/切网后的假连接
- 服务端 duplicate cid 不再静默丢弃，回送原消息与 ack
- 修正 installer.nsh 中 VersionCompare 返回值用反导致误报「降级」
- 安装包改为完整向导（许可协议/安装位置/快捷方式），并自动卸载旧品牌 LanDrop
- 版本号提升到 2.0.0，高于 LanDrop 1.1.0
```

---

## 十一、截图里另外三条需求（**不属于近传**，需向用户确认）

用户发的截图里有三条待办，看起来属于另一个「设备测试」项目（气密性测试 / 取退针 / 安全位置 / 模块列表），
不要在本仓库里实现，先问清楚归属：

1. 这个提示框增加展示信息，展示当前提示是多久前的提示，如「3 秒前」
2. 3 取退针测试中，气密性测试还是取退针测试，我点击停止时会有一个提示，询问我是否要进行重置状态，
   这里有个安全位置没有展示出安全位置是移动到哪里，具体会怎么做都没写出来
3. 传输记录窗体，列名 ID 左侧增加一列设备名，显示是模块列表中的描述内容
