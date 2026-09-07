# installer/ — Windows 安装器（第四阶段 S4-1）

**定位：** 用户点名的「Windows 安装包」。Inno Setup 6 脚本，编译出单文件 `webagent-setup-<版本>.exe`。**不是 Electron**（任务书红线：不做 Electron exe 当产品壳；安装器 exe 只是安装载体）。

## 装什么 / 不装什么
- **装**：仓库全部源文件与文档（`.git`、`node_modules`、`.cache`、`.local`、`code-server-app`、`bin/code-server-runtime/*`（保留其 package.json）、日志、压缩包、`workspace/*`（只带骨架 README）、`manager/privacy.md`、`installer/output/*` 均排除）。
- **不捆绑 Node**：安装时检测 PATH/注册表，缺则提示先装 Node LTS 或跑 `check-env.cmd`（不拦安装）。
- **code-server 首跑自下载**：沿用仓库既定 gitignore 规则（`run-webagent-vscode.cmd` 第一次运行从 npm 拉 4.135.0）。
- **卸载**：清运行时产物（node_modules、code-server-runtime、code-server-app、.cache、.local）；**workspace 是用户的仓库，卸载不碰**。

## 默认壳
桌面与开始菜单主图标 → `run-webagent-vscode.cmd`（Code-OSS / VS Code 复刻壳，用户点名）；开始菜单另给「经典工作台（备用）」→ `run-webagent.cmd`。装完勾选「立即启动」进 VS Code 壳。

## 附加任务（P5-1 安装器对齐，对照 review/shuncode-ui/ 19–25 安装系列）
ShunCode 安装包同为 Inno Setup、任务集与 VS Code 官方同构；本安装器对齐如下（默认全勾选）：
- **桌面快捷方式（VS Code 壳）**：`desktopicon` 任务控制（开始菜单主图标不受任务影响，始终创建）。
- **app 窗口快捷方式**：`appwindow` → `run-webagent-appwindow.cmd`：探 3000 口，无主程序则后台最小化拉起 VS Code 壳，再用 Edge/Chrome `--app=http://127.0.0.1:3000` 开无边框独立窗口（无浏览器地址栏/标签条，任务栏独立图标）；都没有则回退默认浏览器普通窗口。
- **上下文菜单 + 打开方式**：`ctxmenu` → HKCU\Software\Classes 写「用 Web Agent 打开」（文件 `*\shell` 传 `%1`、目录 `Directory\shell` 传 `%V`；run cmd 收到**文件**参数时自动取其目录当工作区）；另注册 ProgID `WebAgent.OpenWith` 进 .md/.txt/.js/.json/.py/.html/.css 的「打开方式」菜单——**不劫持双击默认关联**。卸载 `uninsdeletekey/uninsdeletevalue` 清干净。
- **PATH**：`addpath` → HKCU Environment Path 以 `{olddata};{app}` 追加；`ChangesEnvironment=yes` 广播环境变量、新终端即刻生效；**覆盖安装先摘旧段再追加（幂等）**，卸载经 [Code] `StripAppFromPath` 精确摘除（绝不整值删用户 Path）。
- **双安装模式**：`PrivilegesRequiredOverridesAllowed=dialog`——默认用户级，对话框可选「为所有用户」（系统级，对照 ShunCode 的 Program Files 默认）。
- **许可页/说明页**：许可页挂真许可证 `LICENSE`（ISC）；安全边界（隧道=施工证、Key 明文取舍等）挂安装前说明页 `InfoBeforeFile=SECURITY.md`。

## 怎么编译（Windows）
1. 装 Inno Setup 6（jrsoftware.org，免费；语言包含简体中文）。
2. 双击或命令行跑 `installer\build-installer.cmd`。
3. 产物：`installer\output\webagent-setup-<版本>.exe`（`output/` 已排除在安装源与 Git 之外）。

## 沙箱边界（诚实说明）
本仓库的 Linux 沙箱**无法编译 .iss**（ISCC 仅 Windows）。此处交付：脚本 + 编译入口 + 本说明 + 语法自查；真机编译与安装冒烟列入 Windows 验收唯一基线 `review/CHECKLIST_WINDOWS.md`（D 节）。

## 语法自查清单（改 .iss 时过一遍）
- [ ] `{#AppVer}` 与 OutputBaseFilename 一致；升版只改 `#define AppVer`
- [ ] Excludes 通配以反斜杠写目录、逗号分隔；`!` 取回保留项（package.json）
- [ ] AppId GUID 不换（换了=另一个产品，升级链断）
- [ ] 新增运行时缓存目录 → 同步 [UninstallDelete]
- [ ] 中文文案在 [Languages] chs 下无乱码（真机看一眼）
- [ ] 新增 [Registry] 键 → 同步卸载清理（uninsdeletekey/uninsdeletevalue 或 [Code] 摘除）；PATH 只能精确摘段
- [ ] 新增 [Tasks] → 同步 [Icons]/[Registry] 的 Tasks: 引用与 installer/README 附加任务节
