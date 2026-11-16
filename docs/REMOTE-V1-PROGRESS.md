# 近传远程工位 · 执行进度

> 截止：2026-11-17 07:40。每轮结束更新本文件；下一轮从“当前步骤”继续。
> 目标：一个 Windows 内部商用桌面端：设备控制台 + 真实局域网屏幕/输入 + 保留现有群聊 + 同事私聊 + 设置/审计/诊断 + 介绍页/发布页。

## 当前状态（2026-11-17 01:30）

### 已完成

- [x] 时间/仓库/环境核对（Electron 28、Node 24、csc 可用）
- [x] 采集验证：`desktopCapturer.getSources` 可抓屏
- [x] 输入验证：C# `assets/remote-input.exe` 可编译/注入
- [x] `src/main/remote.js`：UDP 发现、WS 会话、6 位码配对、屏幕帧、键鼠注入、剪贴板、文件发送、私聊 UDP
- [x] `src/renderer/workspace/`：统一工作台 UI（设备/会话/消息/授权/审计/诊断/设置）
- [x] 本机被控面板：授权码、IP/端口、当前会话、暂停/刷新/结束
- [x] 真实本机预览：屏幕帧、键鼠、文件发送通过（打包版验证）
- [x] 群聊窗口保留，工作台“打开团队群聊”入口
- [x] 工作台主题同步（浅色/深色）与群聊主题注入
- [x] 文件发送到被控端 `下载/NearSend`，进度事件与审计
- [x] `site/index.html`、`site/release.html`、`site/styles.css`、`site/img/`
- [x] `npm run dist:dir` 打包通过，helper 已 asarUnpack

### 仍需完成（按优先级）

- [ ] 打包完整安装包 `npm run dist`（NSIS + Portable），记录产物
- [ ] 远程文件接收/回传方向、会话录制（时间不足则保留发布页“后续”）
- [ ] 管理员临时授权（8h/无人值守关）从 UI 到 Agent 的权限校验（当前 6 位码即授权）
- [ ] 锁屏/UAC 安全桌面（需 Windows 服务，当前明确为限制）
- [ ] WebRTC/2K60（当前 WS+JPEG；发布页已注明）
- [ ] 工作台窗口记忆/开机启动/更新检查接入现有 config
- [ ] 群聊窗口暗色残留的视觉刷新（CDP 验证页面为浅色；疑似旧窗口 surface）
- [ ] README 根目录 3.0 说明、CHANGELOG、进度文件（已写）
- [ ] 最终截图（真实工作台/会话/被控）替换 `site/img` 中的原型图
- [ ] git commit、合并、push origin

## 检查点 2026-11-17 01:50

- [x] 统一工作台/本机被控/真实屏幕与键鼠/文件发送/私聊/群聊入口
- [x] 工作台主题同步、设置开关持久化、诊断/审计真实数据
- [x] 打包 `dist/NearSend-3.0.0-Setup.exe`、`NearSend-3.0.0-Portable.exe`
- [x] 打包版本机预览 + 文件传输通过
- [x] 群聊测试 `npm test` 全部通过
- [x] 介绍页/发布页 `site/`
- [x] 3.0 检查点提交并 push（1524812）
- [x] 最终重新打包（`dist/NearSend-3.0.0-Setup.exe` / Portable，01:52；包含指针映射/超时/显示数量/设置持久化）
- [x] Portable 启动验证（版本 3.0.0）
- [x] 最终 commit + push（main `146acd5`；GitHub Release `v3.0.0` 已发布）
- [ ] 如需继续：真实锁屏/UAC、WebRTC、管理员 Grant、录制、文件反向

## 推送状态

- 已推送：`main` 最新 `146acd5`（3.0）
- GitHub Release：https://github.com/Oldfoollearnc/landrop/releases/tag/v3.0.0
- 资产：`NearSend-3.0.0-Setup.exe`、`NearSend-3.0.0-Portable.exe`、`SHA256SUMS.txt`
- 安装包本地：`dist/NearSend-3.0.0-Setup.exe`、`dist/NearSend-3.0.0-Portable.exe`

## 检查点 2026-11-17 03:05

- [x] 录屏：控制端本地 WebM，隐藏录制画布；保存对话框落盘；默认关闭
- [x] 管理员临时支持：8 小时、无人值守/剪贴板/文件/录制关闭；到期自动结束
- [x] 工位端授权列表：显示控制端/角色/到期，支持撤销；撤销立即断开
- [x] 文件双向：控制端→工位端、工位端→控制端
- [x] 录制状态同步到工位端“录制中”
- [x] 重连竞态修复：旧会话 ended 不再误关新会话
- [x] 角色权限持久化到本机设备对象，合并远端状态后仍生效
- [ ] 最终重打包 + Release 资产覆盖 + commit/push
- [ ] 仍需后续：安全桌面、WebRTC/2K60、完整远程文件浏览器、录制保留策略

## 检查点 2026-11-17 03:40

- [x] 设备历史：已发现工位持久化，离线仍显示，可移除
- [x] 审计持久化 `remote-audit.json`；重启后保留
- [x] 会话历史 localStorage 持久化
- [x] 授权页接真实数据：本机授权控制端、当前获得授权、撤销/结束会话
- [x] 设置页清理未实现入口，标明“内测版暂未开放”；关于/更新显示真实 3.0.0
- [x] 8fps 采集（FRAME_MS=120）
- [x] 诊断包/发布页/本机数据目录入口
- [ ] 最终重打包 + Release 资产覆盖 + 文档/远端同步
- [ ] 后续：安全桌面、WebRTC/2K60、完整远程文件浏览器、录制保留策略

## 检查点 2026-11-17 04:05

- [x] 原生 GDI 采集 helper `assets/remote-capture.exe`：1080p 约 13–15fps，2K 约 10–12fps，720p 约 20fps
- [x] 绘制远端鼠标指针；多屏按 display_id/索引切换
- [x] 采集 helper 随包 asarUnpack；桌面采集作为回退
- [x] 质量/屏幕切换会重启采集 helper
- [x] 高 DPI 输入映射：`dipToScreenPoint` 转物理像素
- [x] 手动 `IP:端口` 直连（广播被禁用时）+ 手动设备持久化
- [x] 实时 RTT（WS ping/pong）与实时帧率 HUD
- [x] 已授权控制端免码重连；撤销后自动要求重新输入 6 位码
- [x] 文件接收重名自动加序号；管理员/受限授权不会自动推送剪贴板
- [x] 架构/端口/安全边界文档 `docs/REMOTE-V1-ARCHITECTURE.md`
- [ ] 最终重打包 + Release 资产覆盖 + 文档/远端同步
- [ ] 后续：安全桌面、WebRTC/2K60、完整远程文件浏览器、录制保留策略

## 最终状态 2026-11-17 04:10

- 安装包：`dist/NearSend-3.0.0-Setup.exe` / `NearSend-3.0.0-Portable.exe`
- SHA256：
  - `fc48395220d81ac2f2d2b738fcfa69df3ccf348cc9ebab49127ce0a007943241  NearSend-3.0.0-Setup.exe`
  - `d739a6218189b3911b03eb36c09d6dc9a2de48efd34864a12784bab2aaf60435  NearSend-3.0.0-Portable.exe`
- GitHub Release：https://github.com/Oldfoollearnc/landrop/releases/tag/v3.0.0
- 远端 main 由 GitHub API 同步；本地分支另有提交，内容一致。
- 打包版验证：GDI 采集约 14fps、真实 RTT/帧率 HUD、屏幕帧、键鼠注入、6 位码、手动 IP、双向文件、录制、管理员 Grant/撤销、审计持久化。
- 未完成/明确限制：安全桌面、WebRTC/2K60、完整远程文件浏览器、组织级审批/集中审计、录制保留策略。

## 关键决策

- 统一桌面端：工作台窗口为主；现有聊天窗口保留为“团队群聊”，从工作台一键打开。
- 群聊：保留现有单房间群聊（手机端不变）；私聊为“同事私聊（按设备）”，走 UDP 直连，不引入中心账号。
- 远程：V1 使用 JPEG 帧 + Windows SendInput；WebRTC/2K60 后续替换传输层。
- 授权：V1 以 6 位码首次配对、控制端 ID 记住；管理员 8h/无人值守关的完整 Grant 模型仍待补齐。
- 录制：默认关闭；真实录制未接入，UI 不默认出现。
- 无 Hub：诊断只检查本机与已发现设备，不做全网 20 路监控。

## 可恢复命令

```powershell
cd "C:\Users\Administrator\Desktop\局域网传信 手机与电脑传输信息 支持图片 文字"
npm start
npm run dist:dir   # 快速验证打包
npm run dist       # 完整 NSIS + Portable
```

## 验证记录

- 本机预览：点击“连接”看到真实桌面帧；鼠标点击可注入。
- 文件：`window.workspace.remote.sendFilePath('.../test.txt')` → `C:\Users\Administrator\Documents\Downloads\NearSend\test.txt` 内容正确。
- 打包版：`dist/win-unpacked/NearSend.exe` 可启动，版本 3.0.0，helper 路径 `resources/app.asar.unpacked/assets/remote-input.exe` 存在。
- 群聊：工作台“消息 → 打开团队群聊”打开原 2.2.0 群聊；CDP 检查 chat `data-theme=light`。

## 风险/备注

- 真实锁屏/UAC 安全桌面需要 Windows 服务，当前用户态进程做不到。
- WS + JPEG 不是 2K60/WebRTC；弱网画质/帧率有限。
- 单实例锁阻止本机开两个实例；本机预览用自连接解决。
- 前端“管理员临时授权”页面仍是设计/占位，真实权限校验以 6 位码配对为主；发布页不得宣称完整 Grant。
