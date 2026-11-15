# 近传 NearSend 2.1.0 · 交付验证记录

验证环境：Windows 11（10.0.26300，x64），Android SDK 34 / JDK 21，Gradle 8.14.3。

## 一、产物

| 文件 | 大小 | SHA-256 |
| --- | --- | --- |
| `NearSend-2.1.0-Setup.exe` | 76,472,423 B | `8ef04275e28fd5122f950ab6636ad1205e5ff0b9c24f5ade7587d71ad8680f6b` |
| `NearSend-2.1.0-Portable.exe` | 76,254,891 B | `3f18649fad9a0f5f47175ae9f9219eb2a78869091e6de47e548812d61e704b61` |
| `NearSend-Android-2.1.0.apk` | 3,667,293 B | `ff8b1a922037b403cd6764fe720b14e84b03449fadd83bde4c4d24b51fff2d54` |
| `NearSend-2.1.0-Setup.exe.blockmap` | 80,760 B | `a33795b42ab73bfa981fc9228f97f922caaed5d0e57d4d7698eaca266ca31c43` |

- Windows：`npm run dist`（electron-builder 24.13.3，NSIS，警告即错误）
- Android：`aapt dump badging` 确认 `versionCode 5` / `versionName 2.1.0`，minSdk 24 / targetSdk 34，
  沿用 `android/keystore/landrop.jks` 签名，已装 2.0.x 可直接覆盖升级。

## 二、自动化测试

### 协议测试 `npm test`

49 项全部通过，覆盖：

- 鉴权、Host 白名单、PWA manifest
- 发文字、同 cid 去重、引用裁剪
- 上传 init、mime 清洗、删除中止上传、清空中止上传
- 下载 Range（含 `bytes=-N`）与 HEAD 不产生假进度
- WebSocket `ack` / `pong` / 输入状态转发
- 2 分钟撤回、超时禁止撤回、不能撤回对方消息
- `/done` 幂等、同名并发上传不覆盖（含大小写差异）
- safeStorage 锁定记录自动恢复、清空后不复活

### 手机端端到端 `npm run test:e2e -- --total 5 --offline`

真实打包后的 `NearSend.exe` + 真实 Chromium，12/12 通过：

- 表情面板可插入表情
- 连发 5 条全部送达，刷新后再发 5 条全部送达
- 服务端每条消息只落库一条
- 2 分钟内撤回成功并显示系统提示
- 同 cid 重发返回 `duplicate` 且只落库一条
- 假连接时消息不假装送达；恢复后自动补发且只落库一条

### 桌面端集成验证

通过 Electron 远程调试驱动真实渲染进程：

- 桌面发送消息 → 主进程撤回 → 气泡变为「你撤回了一条消息」
- 桌面输入 → 手机 WebSocket 收到 `{t:'typing',from:'pc',on:true}`
- 手机发送输入状态 → 桌面显示「手机正在输入」，停止后消失
- 打包后的窗口字体、版本号（2.1.0）、表情面板、设置页均正常

## 三、安装

- 本机从 2.0.0 静默升级 `NearSend-2.1.0-Setup.exe /S`，退出码 0
- 「应用和功能」只剩一条「近传 NearSend 2.1.0」
- 安装目录 `NearSend.exe` 文件版本 2.1.0
- 启动后 `/api/history` 返回 `version: 2.1.0`
- 原有 `%APPDATA%\NearSend` 聊天记录、配置、令牌保留
- 静默安装后自启动 Run 键指向已安装程序
