# CMD、Shell、依赖声明与CI逐步解释

本文解释15个非JS文件；Node函数另见[安装器函数](installer/函数详解.md)与[编辑器编排](webagent-core/scripts/编辑器编排详解.md)。脚本没有JS函数也有参数、目录、退出码和副作用，不能只做文件名登记。

## 1. 五个CMD启动薄层

[run-webagent.cmd](run-webagent.cmd)、[run-webagent-appwindow.cmd](run-webagent-appwindow.cmd)、[run-webagent-vscode.cmd](run-webagent-vscode.cmd)、[run-admin.cmd](run-admin.cmd)、[install-vscode-extension.cmd](install-vscode-extension.cmd)结构相同，唯一区别是交给launch.js的mode依次classic/app/vscode/admin/extension。

逐句：@echo off关命令回显；chcp65001设控制台UTF8，>nul隐藏码页结果；setlocal EnableExtensions DisableDelayedExpansion限定环境改动并避免路径中的感叹号被延迟展开；where node将正常/错误输出都隐藏，errorlevel≥1报错并exit /b1。node调用用`%~dp0installer\launch.js`绝对定位程序，`%~1`去用户首参数外引号再重新包双引号。最后exit /b %ERRORLEVEL%传播Node退出码。

**刻意不cd**：相对工作区按调用者目录交给launch.js解析，不按安装目录解析。只转第一个参数，不声称透传任意多参数。缺Node不自动下载安装；不自动conda activate，但继承当前已激活Conda的PATH/环境。双击资源管理器启动与激活Conda的CMD启动环境可能不同。

## 2. 检查、测试、文档和安装器CMD

### check-env.cmd

@echo/chcp/setlocal后，where node/npm/git与&&/||控制显示；for /f捕获-v/--version输出，cloudflared/ngrok只检查PATH存在并给安装提示。没有运行winget、没有验证VS Code、Conda、端口、C#编译器或实际隧道连通。末尾pause等按键，**不是严格以非零退出表示环境不合格的CI检查器**。

### run-tests.cmd

setlocal EnableExtensions，title设置窗口标题，cd /d `%~dp0`可跨盘。where node失败pause/exit1；cd agent-host，express目录不存在才call npm install，失败pause/exit1。call用于从npm.cmd返回本批处理；npm test后立即保存ERR，避免echo/pause改掉目标退出码；失败提示/pause并exit ERR，成功提示/pause/exit0。

只检测express marker不证明所有devDependencies（Acorn）齐全；脚本没有透传--filter参数，筛选应直接用npm test -- --filter=…。它不会帮用户创建venv或Conda环境，CI不应调用含pause的交互入口。

### docs-site/serve.cmd

[serve.cmd](docs-site/serve.cmd)关回显、UTF8、cd脚本目录、设置title，where node失败pause/exit1；node serve.js启动静态文档，结束后pause。没有setlocal或显式保存Node错误码，因此不能把最后批处理退出码当精确保留的服务退出码。

### installer/build-installer.cmd

[build-installer.cmd](installer/build-installer.cmd)进入installer目录，先查ProgramFiles(x86) Inno，再ProgramFiles，最后PATH的iscc若存在覆盖前者；无ISCC提示pause/exit1。node package.js先生成干净payload，失败exit1；ISCC /Qp编译webagent.iss，失败提示pause/exit1；成功显示output路径，endlocal。它不安装Inno，不捆绑Node；构建语义见[Inno声明详解](installer/安装声明详解.md)。

## 3. 四个Shell入口

### run-webagent.sh

[源码](run-webagent.sh)：#!/bin/bash、set -e；ROOT通过脚本所在目录子shell cd+pwd求绝对路径。首参数非空则覆盖WORKSPACE_ROOT，否则环境/默认ROOT/workspace；端口默认48271/3000。command -v分别查node/npm，缺失stderr提示exit1。目录不存在时，显式参数报错，未显式参数则mkdir -p（包括环境指定目录）。打印地址后cd agent-host，express缺失npm install，最后exec node src/index.js替换Shell进程。

注意：首参数**没规范成绝对路径**，目录检查发生在调用者cwd，之后cd agent-host再启动，相对WORKSPACE_ROOT可能改变解释基准；它不具备CMD新版launch.js完全相同的相对路径保证。本次如实记录，不隐式重构脚本。set -e使多数失败停止，但不是所有Shell复合语句的事务保证。

### run-webagent-vscode.sh

[源码](run-webagent-vscode.sh)：同样set-e/ROOT/首参数与环境/端口默认，查node/npm；工作区不存在一律exit1，不自动建默认目录；exec绝对路径run-code-oss.js并传workspace。该脚本没有最后cd，因此与classic Shell入口的相对路径行为不同。code-server大下载/认证/进程退出由Node编排负责。

### run-admin.sh

[源码](run-admin.sh)：env bash，set -euo pipefail（失败停止、未定义变量错误、管道失败可传播）；cd脚本目录，默认admin端口4174，打印独立进程说明；exec node admin-host/index.js。没有前置where/command-v，node缺失由Shell报错；不自动启动主工作台。WEBAGENT_ADMIN_BIND/data/token等由Admin入口读取。

### webagent-core/start-webagent.sh

[源码](webagent-core/start-webagent.sh)：set-e，ROOT取本文件上一级仓库目录，exec根run-webagent.sh，`"$@"`逐个保留所有参数。它只是转发层，不设第二套工作区/端口规则；目标脚本实际只用首参数。

## 4. agent-host/package.json每组字段

[package.json](webagent-core/agent-host/package.json)的name/version标识npm包，并非安装器AppVer；main=index.js是模块默认入口声明，实际npm start脚本为node src/index.js，所以不要因main文字而去运行不存在的根入口。scripts.test调用scripts/run-tests.js，负责真实子进程测试发现/退出；engines node>=18是声明范围，不证明当前所有依赖/场景在18均验收过。

dependencies：express HTTP路由、cors来源控制、ws WebSocket、diff差异展示；devDependencies acorn用于源码AST/文档测试；版本带^是兼容范围，锁文件固定安装解析结果，npm ci与npm install职责不同。keywords/author/description空不产生运行行为；license ISC是包元数据，正式仓库许可仍看LICENSE。

## 5. .github/workflows/test.yml全部job与命令

[workflow](.github/workflows/test.yml)在push/pull_request触发，两job独立，不是一个通过另一个就可省略。

**agent-host（Ubuntu）**：默认working-directory agent-host；checkout@v4拉源码；setup-node@v4选Node20；npm ci安装锁定依赖（含dev默认）；check-docs只检查、不自动修漂移；npm test跑全测试。Actions本身使用的Node运行时与node-version设置的项目Node版本是两件事；平台废弃action旧运行时提示不能被误报为项目测试失败。

**windows-installer（Windows）**：checkout/setup Node22；npm ci --prefix agent-host，check-docs验证Windows换行规范；直接跑installerPackaging测试，再node installer/package.js生成payload。

接着显式shell:powershell：ErrorActionPreference Stop，foreach input.cs/input2.cs/keys.cs Add-Type编译；foreach所有PS1用Language.Parser.ParseFile获取tokens/parseErrors，有错误throw；WinInput.Click零窗口、WinBgKeys.SendChars零窗口必须返回ERR_*。这**没有点击真实应用**，也没有编译/执行capture/mark所有桌面功能。

最后shell:pwsh：检查ProgramFiles(x86) ISCC，不在则choco安装并传播失败；设ErrorActionPreference Continue是为了捕获编译器原生stderr；ISCC /Qp输出合并管道Tee-Object记录compileLog，立即保存LASTEXITCODE，非零时最后12行拼%0A写GitHub error annotation，exit结果。日志归档不是忽略编译失败；没有交互安装/升级/卸载，也没有上传Release步骤。

## 6. 验证

```bat
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
```

Linux可用`bash -n run-webagent.sh run-webagent-vscode.sh run-admin.sh webagent-core/start-webagent.sh`只检查语法，不启动服务。CMD/Inno的真实执行需Windows；Conda步骤照[Conda环境说明](Conda环境说明.md)，阅读完成与实际执行仍分开记录。
