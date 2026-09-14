# 浏览器工作台：界面状态与后端操作

非JS实现复盘：[HTML与SVG](页面结构详解.md) · [全部CSS规则组](样式规则详解.md)。


逐函数正文：[状态与编辑器详解](js/状态与编辑器详解.md) · [启动与Chat详解](js/启动与Chat详解.md) · [Bridge与设置详解](js/Bridge与设置详解.md) · [交互绑定详解](js/交互绑定详解.md)。包含启动、事件绑定、编辑器保存、Chat流、Bridge与设置；HTML/CSS与SVG精细说明现已补齐，见工作台目录的页面结构与样式规则详解。


## 职责与入口
本目录是浏览器原生ES module界面，由agent-host在默认3000端口提供静态资源。它不直接访问Node文件系统；操作通过相对 `/api` 请求和本机 `/ws` 事件流完成。网页VS Code模式由code-server占用3000，跳过本工作台。

## 文件与页面分工
| 文件/区域 | 负责什么 |
|---|---|
| `index.html` | 标题栏、文件导航、标签页/编辑器、Chat/Bridge、设置及状态栏骨架 |
| `app.js` | 导入模块、boot初始化、WS连接与退避重连 |
| `js/` | 编辑器、聊天、Bridge、配置和控件逻辑；详细分工见该目录README |
| `styles.css` / `favicon.svg` | 布局、主题和静态图标，不包含后端授权 |

## 执行流程
boot注册编辑器保护和界面事件，初始化Chat模式，并行获取状态/文件树/Skill/配置及加载Monaco；随后连接WS并恢复当前标签页。WS用于输出和状态提示，断线以1–30秒退避重连，不是保证每条事件都会补发的消息队列。

### 无需API的本机探索
聊天模型选择器包含“内置探索 Agent”，选择Ask即可做确定性本机扫描和读取，不要求API Key。它不是通用语言模型，不保证严格按自然语言指定文件选择；读取上限与顺序见agent-host的explore实现。合并模型选择器仍只列外部配置模型。

### 编辑文件
openFile取content和完整hash，为每个tab保留content、savedContent和dirty状态。Monaco模式使用每tab模型/视图状态，纯文本模式先捕获textarea再切换；重复打开会复用现有tab，不靠再次读取覆盖本地编辑。

保存针对发出时的文本/hash；保存过程中继续输入不能被旧响应标记为全部已保存。失败或409保留缓冲区；关闭dirty tab会询问，saving时拒绝关闭；beforeunload尝试提示。**这些是内存保护和浏览器提示，不是断电/崩溃后自动恢复草稿。**

### 编辑器加载
Monaco加载逻辑在 `js/monaco.js`，不是app.js里的旧函数。状态栏显示加载中、纯文本降级或就绪。网络/AMD/初始化失败或7秒等待到期仍可使用纯文本；迟到成功先捕获当前缓冲区再升级。7秒不是固定加载耗时。

### Chat与Bridge
Chat发送期间按钮变为停止，用AbortController取消请求；done只表示流结束，仍应读取error和工具状态。文件保存与Chat停止是独立操作，停止聊天不丢弃编辑器缓冲区。

Bridge显示外部客户端连接信息与工具事件；内置Arena面板仅提供配置指引，不在本页伪造MCP握手、不自动把任务转成本机Code执行。手机Arena能否连接依赖真正公网隧道及MCP认证，不由“打开网站”按钮证明。

## 能力与边界
经典工作台定位为轻量本机界面：保留文件编辑/搜索、Chat、模型配置和认证Bridge；完整IDE请用桌面VS Code扩展。未接线的编辑/选择/查看/转到/运行菜单、源控/调试/扩展/账户图标、聊天附件、浏览器历史、启动欢迎勾选和仿站发送/登录界面已移除。语音/Codex入口不再展示；旧Codex隐藏节点仅为原绑定/数据兼容保留。hooks、外部MCP地址和插件备注移入折叠“兼容资料（不执行）”，不删除用户存档。普通工作台命令框不是持久交互PTY；可观测PTY在VS Code扩展端。

本页采用本机控制面，不为远程工作台访问提供登录系统。主题、按钮隐藏和提示文字都不能代替后端安全检查。具体设置含义见根使用指南，不在DOM行号列表中重复一份。

## 验证与阅读顺序
先看[交互模块](js/README.md)，编辑冲突看[API说明](../agent-host/src/api/README.md)，命令边界看[工具说明](../agent-host/src/tools/README.md)。

editorRuntime/workbenchRuntime/monacoLoading用实际模块或函数fixture检查数据保护、主题和加载；workbenchHtml检查接线；真实浏览器缩放、键盘导航、beforeunload和移动端效果仍需人工验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [app.js](app.js) | 16 个函数/类节点 |
| [favicon.svg](favicon.svg) | 文件级登记；未做符号完整性证明 |
| [index.html](index.html) | 文件级登记；未做符号完整性证明 |
| [styles.css](styles.css) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
