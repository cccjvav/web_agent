# WebAgent Probe Companion（VS Code配套扩展）

这是上传探针的**安全连接诊断适配版**，不是把原型全部搬到VS Code，也不是浏览器网络嗅探器或模型鉴定工具。可以和`webagent.webagent-core`同时安装，两者ID不同，不覆盖旧扩展。

## 谁负责什么

- WebAgent：任务执行、审批、Bridge和本机agent-host；执行能力不转交给本扩展。
- Probe Companion：点击后访问本机诊断接口，导入五字段页面摘要，复制一次性挑战、查询回传状态。菜单可打开已安装的WebAgent Bridge。
- 独立userscript：在Arena网页手动生成最小摘要，不收登录/响应正文。
- 已认证并初始化的外部MCP客户端：调用confirm_connection完成回传。本扩展**不会自己调用confirm_connection**，否则自证没有跨端核对意义。

本扩展没有后台轮询、遥测、工作区文件读取、shell、网络钩子、CDP或令牌读取。模型标签、令牌/后台轨迹、指纹分类等原型能力均未移植。不能因此宣称已验证实际模型身份。

## 安装（Windows VS Code集成CMD + Conda）

先按项目现有指南启动本机WebAgent并安装原有WebAgent扩展。两个扩展应在同一个VS Code配置文件（Profile）内启用。已拿到VSIX时直接使用扩展面板“从VSIX安装”，不必安装Python或重新构建。

以下命令仅供从源码构建，在仓库根目录执行：

```cmd
conda activate 你的既有环境名
python webagent-core\probe-extension\package_vsix.py
code --install-extension webagent-core\probe-extension\dist\webagent-probe-companion-0.1.0.vsix
```

这里用Conda现有Python标准库，不新建venv，不下载包。`code`不在PATH时，在VS Code扩展面板右上角“…”选择“从VSIX安装”，选上面生成的文件。构建文件是本地产物，不在Git保存，不自动打进Windows安装器；未发布Marketplace，不依赖在线下载。

## 按顺序使用

1. 在**本机桌面、已信任的工作区**打开VS Code。本版拒绝浏览器版/code-server及SSH/WSL/Dev Container远程窗口，以免把“本机”指错。
2. 按Ctrl+Shift+P，搜索`WebAgent Probe: 打开配套诊断`，选择“查看主机与工作区”。只显示主机实例、工作区和版本，不把目录权限初检当任务执行成功。
3. 共用WebAgent的`webagent.agentHostUrl`设置，默认`http://127.0.0.1:48271`。只接受回环HTTP根地址，不接受公网、用户名密码、路径或查询参数；localhost固定解析到127.0.0.1，不跟随重定向。
4. 按根目录《双向连接核对使用指南》使用独立`arena-model-probe/webagent-connection.user.js`生成摘要。**不要使用原型完整注入脚本或dump。**
5. 在配套菜单选择导入，粘贴五字段JSON。输入框遮蔽文本，不自动读取剪贴板；不写入文件/日志/扩展存储。摘要有效期10分钟，挑战有效期约2分钟。
6. 显式选择“复制一次性核对请求”并确认剪贴板提示。交给已连接的外部MCP客户端调用，**不要直接粘到WebAgent本地Chat让它自我确认**。剪贴板历史可能保存挑战，本扩展不会偷偷读取或覆盖其他剪贴板内容。
7. 选择查询结果。`echo-confirmed`只说明该已认证会话持有挑战，不证明浏览器、人物、账号或底层模型身份；主机校验边界仍不变。
8. “丢弃”只清除此扩展的内存记录，不清除工作台/其他客户端的主机记录；主机记录按TTL过期。每次只跟踪一条，导入下一条不批量删除旧记录。

超时/错误不自动重试POST：请求可能已到主机。等待过期后明确重建；主机最多8条。配置改变不会让旧核对跳到新主机，查询始终绑定创建时的地址和实例ID。窗口重载清除内存；不会自动重连或重新导入。

## 实现与验证

见源码仓库同目录《实现详解.md》（不在精简VSIX内）。本机Node隔离测试和打包检查不等于VS Code实机验收。请在扩展面板确认两个扩展并存，验证菜单、正确/错误摘要、取消剪贴板确认、超时、窗口重载、未信任/远程工作区拒绝，再记录实际结果。VS Code不会提供浏览器页面网络访问权，本版没有把缺失能力伪装成已实现。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [client.js](client.js) | 9 个函数/类节点 |
| [extension.js](extension.js) | 12 个函数/类节点 |
| [package.json](package.json) | 文件级登记；未做符号完整性证明 |
| [package_vsix.py](package_vsix.py) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
