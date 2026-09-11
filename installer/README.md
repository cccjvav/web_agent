# Windows安装与用户运行时（2026-09-11整改）

## 安装包来源

先运行`node installer/package.js`，按显式文件/源码目录白名单生成installer/output/payload与SHA-256 installation.json清单。ISCC只读取这个payload，不能再递归打包整个checkout。排除admin-host/data、用户workspace内容、密钥目录、node_modules、历史webagent-repro和管理隐私资料。code-server配置生成干净默认值，不复制本机配置中的密码。

白名单以package.js为准；新增产品资源必须同时更新打包测试。目录中的链接拒绝打包。清单校验用于检测损坏，不是数字签名或发布者身份认证。

## 用户确认的方案A

安装文件仍留Program Files（系统安装）或用户程序目录（用户安装）。CMD入口交给无依赖installer/launch.js：安装版本按manifest哈希复制并校验到`%LOCALAPPDATA%\WebAgent\releases\<hash>`，npm/code-server下载仅在该用户运行时副本内进行，不写程序安装目录。首次复制失败清理临时目录，并发准备只复用完整副本。

稳定用户数据：默认工作区`%LOCALAPPDATA%\WebAgent\workspace`；code-server配置/密码与用户设置在WebAgent/code-server；admin报告与令牌在WebAgent/admin。`WEBAGENT_DATA_HOME`可明确覆盖根。显式WORKSPACE_ROOT和工作区参数继续优先，文件参数取父目录；相对参数基于调用者原cwd，盘符根不去尾斜杠。

源码checkout不带installation.json，仍使用源码目录与原有workspace；不能把开发checkout当成安装包。

升级保留既有用户数据和旧runtime版本，不自动删除或覆盖用户资料。旧版放在安装目录workspace中的数据**不自动迁移**：升级前备份，将工作区复制到用户可写位置，启动时显式指定新位置；不要在Program Files内继续编辑。卸载不删除LocalAppData/WebAgent；彻底移除时需用户备份并手动清理，其他用户数据不触碰。

## 入口与编译

- run-webagent.cmd：classic，本机自绘工作台＋agent-host。
- run-webagent-vscode.cmd：vscode，agent-host＋code-server。
- run-webagent-appwindow.cmd：app，后台启动code-server；轮询healthz最多120秒，不再固定等5秒。超时提示用户startup.log；浏览器路径不重复加引号。
- run-admin.cmd：admin独立进程；install-vscode-extension.cmd：extension，仅安装桌面扩展。
- installer/build-installer.cmd：先stage再调用Inno Setup 6；需要Node与ISCC。

已修AppVer预处理定义、Node检查Exec/退出码、PrepareToInstall返回String。PATH按分号分割、规范后逐条完整比较，保留同前缀其他条目；卸载不整值删除用户Path。

## 验收边界

installerPackaging.test.js覆盖干净清单、私密数据排除、用户副本与校验失败清理、工作区路径和关键Inno声明。新增Windows CI编译任务；本地Linux无法执行ISCC/CMD，必须另外确认Windows CI及普通用户安装/升级/卸载/Edge窗口实机结果。不把静态声明检查当安装验收。

Windows CI首次实际编译发现官方Inno安装没有ChineseSimplified.isl；现改为检测语言包存在才启用chs，否则保留英文标准向导（产品自定义中文说明不变）。若需完整中文标准向导，构建机先安装简体中文语言包。
