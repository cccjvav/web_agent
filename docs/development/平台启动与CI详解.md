# CMD、Shell、依赖声明与CI逐步解释

本文解释当前CMD/Shell入口、依赖声明与CI配置；Node函数另见[安装器函数](../../installer/函数详解.md)与[编辑器编排](../../webagent-core/scripts/编辑器编排详解.md)。脚本没有JS函数也有参数、目录、退出码和副作用，不能只做文件名登记。

## 1. 五个CMD启动薄层

[run-webagent.cmd](../../run-webagent.cmd)、[run-webagent-appwindow.cmd](../../run-webagent-appwindow.cmd)、[run-webagent-vscode.cmd](../../run-webagent-vscode.cmd)、[run-admin.cmd](../../run-admin.cmd)、[install-vscode-extension.cmd](../../install-vscode-extension.cmd)结构相同，唯一区别是交给launch.js的mode依次classic/app/vscode/admin/extension。

逐句：@echo off关命令回显；chcp65001设控制台UTF8，>nul隐藏码页结果；setlocal EnableExtensions DisableDelayedExpansion限定环境改动并避免路径中的感叹号被延迟展开；where node将正常/错误输出都隐藏，errorlevel≥1报错并exit /b1。node调用用`%~dp0installer\launch.js`绝对定位程序，`%~1`去用户首参数外引号再重新包双引号。最后exit /b %ERRORLEVEL%传播Node退出码。

**刻意不cd**：相对工作区按调用者目录交给launch.js解析，不按安装目录解析。只转第一个参数，不声称透传任意多参数。缺Node不自动下载安装；不自动conda activate，但继承当前已激活Conda的PATH/环境。双击资源管理器启动与激活Conda的CMD启动环境可能不同。

## 2. 检查、测试、文档和安装器CMD

### check-env.cmd

@echo/chcp/setlocal后，where node/npm/git与&&/||控制显示；for /f捕获-v/--version输出，cloudflared/ngrok只检查PATH存在并给安装提示。没有运行winget、没有验证VS Code、Conda、端口、C#编译器或实际隧道连通。末尾明确提醒修改PATH后完整重启VSCode再新建集成CMD（独立CMD另行重开）；pause等按键，**不是严格以非零退出表示环境不合格的CI检查器**。

### run-tests.cmd

setlocal EnableExtensions，title设置窗口标题，cd /d `%~dp0`可跨盘。where node失败pause/exit1；cd agent-host，检查express与Acorn的package.json；缺任一项才call npm ci --include=dev --no-audit --no-fund，安装失败pause/exit1。call用于从npm.cmd返回本批处理；npm test后立即保存ERR，避免echo/pause改掉目标退出码；失败提示/pause并exit ERR，成功提示/pause/exit0。

入口文件存在不证明依赖树完整；脚本没有透传--filter参数，筛选应直接用npm test -- --filter=…。它不会帮用户创建venv或Conda环境，CI不应调用含pause的交互入口。

### docs-site/serve.cmd

[serve.cmd](../../docs-site/serve.cmd)关回显、UTF8、cd脚本目录、设置title，where node失败pause/exit1；node serve.js启动静态文档，结束后pause。没有setlocal或显式保存Node错误码，因此不能把最后批处理退出码当精确保留的服务退出码。

### installer/build-installer.cmd

[build-installer.cmd](../../installer/build-installer.cmd)进入installer目录，先查ProgramFiles(x86) Inno，再ProgramFiles，最后PATH的iscc若存在覆盖前者；无ISCC提示pause/exit1。node package.js先生成干净payload，失败exit1；ISCC /Qp编译webagent.iss，失败提示pause/exit1；成功显示output路径，endlocal。它不安装Inno，不捆绑Node；构建语义见[Inno声明详解](../../installer/安装声明详解.md)。

## 3. 四个Shell入口

### run-webagent.sh

[源码](../../run-webagent.sh)：#!/bin/bash、set -e；ROOT通过脚本所在目录子shell cd+pwd求绝对路径。首参数非空则覆盖WORKSPACE_ROOT，否则环境/默认ROOT（仓库根目录）；端口默认48271/3000。command -v分别查node/npm，缺失stderr提示exit1。目录不存在或不是目录时一律退出，不悄悄创建错误的环境指定目录。打印地址后cd agent-host，express缺失npm install，最后exec node src/index.js替换Shell进程。

相对WORKSPACE_ROOT在切换目录前经case补上调用者PWD，目录检查和随后Node解析不会因cd到agent-host换基准；这不是规范真实路径或符号链接的步骤，最终约束仍在主机文件策略。Shell入口和Windows启动器仍有各自依赖准备分支。set -e使多数失败停止，但不是所有Shell复合语句的事务保证。

### run-webagent-vscode.sh

[源码](../../run-webagent-vscode.sh)：同样set-e/ROOT/首参数与环境/端口默认，查node/npm；工作区不存在一律exit1，不自动建默认目录；exec绝对路径run-code-oss.js并传workspace。该脚本同样在exec前将相对WORKSPACE_ROOT按调用者PWD补成绝对路径；与classic一样不受之后进程工作目录改变影响。code-server大下载/认证/进程退出由Node编排负责。

### run-admin.sh

[源码](../../run-admin.sh)：env bash，set -euo pipefail（失败停止、未定义变量错误、管道失败可传播）；cd脚本目录，默认admin端口4174，打印独立进程说明；exec node admin-host/index.js。没有前置where/command-v，node缺失由Shell报错；不自动启动主工作台。WEBAGENT_ADMIN_BIND/data/token等由Admin入口读取。

### webagent-core/start-webagent.sh

[源码](../../webagent-core/start-webagent.sh)：set-e，ROOT取本文件上一级仓库目录，exec根run-webagent.sh，`"$@"`逐个保留所有参数。它只是转发层，不设第二套工作区/端口规则；目标脚本实际只用首参数。

## 4. agent-host/package.json每组字段

[package.json](../../webagent-core/agent-host/package.json)的name/version标识npm包，并非安装器AppVer；main=index.js是模块默认入口声明，实际npm start脚本为node src/index.js，所以不要因main文字而去运行不存在的根入口。scripts.test调用scripts/run-tests.js，负责真实子进程测试发现/退出；engines node>=18是声明范围，不证明当前所有依赖/场景在18均验收过。

dependencies：express HTTP路由、cors来源控制、ws WebSocket、diff差异展示；devDependencies中acorn用于源码AST/文档测试，playwright用于独立真实浏览器回归，当前清单固定1.63.0；scripts.test:browser执行tests/workbench.browser.js，不在npm test的.test.js扫描中。Playwright包与Chromium浏览器程序分开安装，生产启动不需要它，CI浏览器回归需要保留。版本带^是兼容范围，锁文件固定安装解析结果，npm ci与npm install职责不同。keywords/author/description空不产生运行行为；license ISC是包元数据，正式仓库许可仍看LICENSE。

## 5. .github/workflows/test.yml全部job与命令

[workflow](../../.github/workflows/test.yml)在push/pull_request触发；三个job定义实际展开为九项任务（七组主机矩阵、安装器、浏览器），不是“两项”或只有主机单测。

### agent-host

fail-fast:false让失败不取消其它矩阵。Ubuntu/Windows各Node20/22/24，include再加Ubuntu18兼容任务。default working-directory是agent-host；checkout@v4取源码，setup-node@v4选择项目Node，npm ci按锁文件安装依赖，check-docs只检查不修漂移，npm test运行测试发现/汇总。

npm audit --omit=dev有continue-on-error，只是生产公告提示，不是绿色CI即零漏洞的保证。Action自身的Node运行时弃用警告与矩阵node-version不同，不能混报。

Windows主机任务在全量之后，再用pwsh重复5轮ptyLifecycle、2轮stdioMcp，每轮立即检查LASTEXITCODE，非零直接退出，不重试到绿。Node18任务只是最低声明兼容回归，不建议新装过期版本，也不等于code-server支持所有同版本组合。

### windows-installer

1. Windows/Node22，npm ci --prefix安装开发依赖，check-docs检查Windows换行；运行installerPackaging与installer/package.js暂存载荷。
2. 用runner Python执行probe-extension/package_vsix.py --verify、package_browser.py --verify，构建并检查独立Companion/Inspector包。含解包/hash/合成样本验证，不安装到用户VSCode、不连接真实账户。
3. shell:powershell，ErrorActionPreference=Stop；Add-Type编译commandJob.cs与stdioBridge.cs，ParseFile检查stdioBridge.ps1。capture.cs/mark.cs引用System.Drawing编译；input.cs/input2.cs/keys.cs另编译；逐个ParseFile检查computer-use/win/*.ps1。零窗口输入必须返回ERR_*。这是编译/无效输入检查，不是真实截图、鼠标、键盘或DPI验收。
4. shell:pwsh，寻找ProgramFiles(x86)的ISCC，不存在则choco安装Inno并检查退出。ErrorActionPreference=Continue让原生编译stderr可收集；ISCC /Qp后Tee-Object记录输出，立即保存LASTEXITCODE，失败取末12行生成annotation并退出失败。没有上传Release或实际交互安装/升级/卸载步骤。

### workbench-browser

Ubuntu/Node22，job timeout-minutes=10；npm ci后执行`npx playwright install --with-deps chromium`，安装匹配浏览器及Linux系统依赖，再`npm run test:browser`。它不在每组Node矩阵中重复。

真实Chromium运行工作台HTTP/MCP/磁盘交互；还包含独立探针HUD和文档页面。部分测试用route提供实际静态资源或拦截公网登记请求：真实DOM不等于真实公网服务。经典UI、文档导航通过也不代签桌面VSCode、code-server整个界面、真实手机或厂商账户。

## 6. 本地验证与边界

```bat
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
```

需要本机浏览器回归时，在依赖安装成功后另运行：

```bat
cd webagent-core/agent-host
npx playwright install chromium
npm run test:browser
```

Windows用户在已有VSCode集成CMD/Conda中运行即可，不必改用Python Playwright或pip。这里是Node Playwright。Linux可能需系统依赖；CI的--with-deps不意味着必须在Windows复制同样的包管理命令。普通运行WebAgent/连接Arena不要求下载Chromium。

Linux可执行`bash -n run-webagent.sh run-webagent-vscode.sh run-admin.sh webagent-core/start-webagent.sh`作语法检查，但不运行服务。CMD/Inno实际执行需Windows；读取本指南不算实机验收。Shell固定LF、CMD/BAT固定CRLF见.gitattributes。

## 根package.json开发入口

name为webagent-project，version与核心入口本次0.7.2对应，private=true防误发布，description说明源码入口。scripts.start调用installer/launch.js classic；start:vscode选择vscode模式；test委托agent-host完整测试；test:example仅跑examples/calculator；docs:check检查文档清单，不自动重写。没有新增依赖；首次测试仍先npm ci --prefix webagent-core/agent-host。验证workspaceEntry执行真实launch.main但替换进程启动，另用Node子进程检查配置默认根；不冒充Windows GUI启动验收。
