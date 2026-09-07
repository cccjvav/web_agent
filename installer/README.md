# installer/ — Windows 安装器（第四阶段 S4-1）

**定位：** 用户点名的「Windows 安装包」。Inno Setup 6 脚本，编译出单文件 `webagent-setup-<版本>.exe`。**不是 Electron**（任务书红线：不做 Electron exe 当产品壳；安装器 exe 只是安装载体）。

## 装什么 / 不装什么
- **装**：仓库全部源文件与文档（`.git`、`node_modules`、`.cache`、`.local`、`code-server-app`、`bin/code-server-runtime/*`（保留其 package.json）、日志、压缩包、`workspace/*`（只带骨架 README）、`manager/privacy.md`、`installer/output/*` 均排除）。
- **不捆绑 Node**：安装时检测 PATH/注册表，缺则提示先装 Node LTS 或跑 `check-env.cmd`（不拦安装）。
- **code-server 首跑自下载**：沿用仓库既定 gitignore 规则（`run-webagent-vscode.cmd` 第一次运行从 npm 拉 4.135.0）。
- **卸载**：清运行时产物（node_modules、code-server-runtime、code-server-app、.cache、.local）；**workspace 是用户的仓库，卸载不碰**。

## 默认壳
桌面与开始菜单主图标 → `run-webagent-vscode.cmd`（Code-OSS / VS Code 复刻壳，用户点名）；开始菜单另给「经典工作台（备用）」→ `run-webagent.cmd`。装完勾选「立即启动」进 VS Code 壳。

## 怎么编译（Windows）
1. 装 Inno Setup 6（jrsoftware.org，免费；语言包含简体中文）。
2. 双击或命令行跑 `installer\build-installer.cmd`。
3. 产物：`installer\output\webagent-setup-<版本>.exe`（`output/` 已排除在安装源与 Git 之外）。

## 沙箱边界（诚实说明）
本仓库的 Linux 沙箱**无法编译 .iss**（ISCC 仅 Windows）。此处交付：脚本 + 编译入口 + 本说明 + 语法自查；真机编译与安装冒烟列入 Windows 验收清单（见 `review/REPORT_SHUNCODE_S4.md`，收尾时写）。

## 语法自查清单（改 .iss 时过一遍）
- [ ] `{#AppVer}` 与 OutputBaseFilename 一致；升版只改 `#define AppVer`
- [ ] Excludes 通配以反斜杠写目录、逗号分隔；`!` 取回保留项（package.json）
- [ ] AppId GUID 不换（换了=另一个产品，升级链断）
- [ ] 新增运行时缓存目录 → 同步 [UninstallDelete]
- [ ] 中文文案在 [Languages] chs 下无乱码（真机看一眼）
