<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 5：体验面对齐（安装器任务集 + app 窗口；Electron/PTY 决策）

## 需求与授权
- 用户 2026-09-07 上传 ShunCode 安装系列截图 7 张（`1eb1cad`，归档 `review/shuncode-ui/` 19–25）并问「怎么最大化贴合、要不要 Electron、pty 呢」。
- 取证结论：ShunCode = **Code-OSS（VS Code）分支 ⇒ Electron 运行时**（许可页 MIT/Microsoft 原文、224MB 包/1.1GB 装后、界面同构；未拍关于页，高置信推断）；**安装包 = Inno Setup**（向导页中文文案逐字一致），与我方同工具；附加任务集与 VS Code 官方同构（上下文菜单×2/注册编辑器/PATH）。
- 三项决定（ask_user 2026-09-07）：① **Electron 现在不包**（薄包装层留作可点名候选 P5-3）；② **PTY 认默认壳已解决**（code-server 终端=真 PTY；经典壳保持一次性命令，P5-4 需另点名）；③ **P5-1 安装器对齐批全做**。

## 做了什么
- **P5-1（提交 bc2d338）**：`installer/webagent.iss` 双安装模式（dialog）、真许可页 LICENSE+说明页 SECURITY.md、任务 desktopicon/appwindow/ctxmenu/addpath、HKCU 上下文菜单×2 与 OpenWith ProgID（不劫持默认）、PATH 幂等追加+卸载精确摘除+ChangesEnvironment 广播；新 `run-webagent-appwindow.cmd`（探 3000→缺则后台拉起壳→Edge/Chrome --app 无边框窗）；两个 run cmd 支持文件参数取目录；installer/README 附加任务节 + 启动脚本说明同步。
- **P5-2 口径（本提交）**：架构导读 §12 PTY 取舍改「经默认壳解决」+ Electron 决定存档；CHECKLIST_WINDOWS D 节扩 D9–D12（菜单/打开方式、PATH、双模式/许可页、app 窗口）+ 已知未修表 PTY 行翻转；经验库加安装包取证法。

## 候选（需用户点名才动）
- P5-3 Electron 薄包装层：BrowserWindow 指向本机 3000/48271，产品代码零改动，electron-builder 打包。
- P5-4 经典工作台真 PTY：node-pty + xterm.js + WS 通道（中型功能，安全审查面）。

## 验收
真机基线 `review/CHECKLIST_WINDOWS.md` D1–D12（D9–D12 为本阶段新增项）。
