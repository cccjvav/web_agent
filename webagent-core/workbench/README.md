# 浏览器工作台：界面状态与后端操作

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

### 编辑文件
openFile取content和完整hash，为每个tab保留content、savedContent和dirty状态。Monaco模式使用每tab模型/视图状态，纯文本模式先捕获textarea再切换；重复打开会复用现有tab，不靠再次读取覆盖本地编辑。

保存针对发出时的文本/hash；保存过程中继续输入不能被旧响应标记为全部已保存。失败或409保留缓冲区；关闭dirty tab会询问，saving时拒绝关闭；beforeunload尝试提示。**这些是内存保护和浏览器提示，不是断电/崩溃后自动恢复草稿。**

### 编辑器加载
Monaco加载逻辑在 `js/monaco.js`，不是app.js里的旧函数。状态栏显示加载中、纯文本降级或就绪。网络/AMD/初始化失败或7秒等待到期仍可使用纯文本；迟到成功先捕获当前缓冲区再升级。7秒不是固定加载耗时。

### Chat与Bridge
Chat发送期间按钮变为停止，用AbortController取消请求；done只表示流结束，仍应读取error和工具状态。文件保存与Chat停止是独立操作，停止聊天不丢弃编辑器缓冲区。

Bridge显示外部客户端连接信息与工具事件；内置Arena面板仅提供配置指引，不在本页伪造MCP握手、不自动把任务转成本机Code执行。手机Arena能否连接依赖真正公网隧道及MCP认证，不由“打开网站”按钮证明。

## 能力与边界
界面保留部分菜单/设置占位。hooks、插件列表、外部MCP列表、语音、Codex登录等不能仅凭控件存在就称已实现执行能力。普通工作台命令框不是持久交互PTY；可观测PTY在VS Code扩展端。

本页采用本机控制面，不为远程工作台访问提供登录系统。主题、按钮隐藏和提示文字都不能代替后端安全检查。具体设置含义见根使用指南，不在DOM行号列表中重复一份。

## 验证与阅读顺序
先看[交互模块](js/README.md)，编辑冲突看[API说明](../agent-host/src/api/README.md)，命令边界看[工具说明](../agent-host/src/tools/README.md)。

editorRuntime/workbenchRuntime/monacoLoading用实际模块或函数fixture检查数据保护、主题和加载；workbenchHtml检查接线；真实浏览器缩放、键盘导航、beforeunload和移动端效果仍需人工验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [app.js](app.js) | 9 个函数/类节点 |
| [favicon.svg](favicon.svg) | 文件级登记；未做符号完整性证明 |
| [index.html](index.html) | 文件级登记；未做符号完整性证明 |
| [styles.css](styles.css) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
