# Windows 真机验证清单（CHECKLIST_WINDOWS）

- **对应代码**：`arena/01a05d84-web-agent` tip `2a49505`（或更新）；审查系列见 REPORT.md / REPORT_v2-v4.md
- **为什么需要**：四轮审查在 Linux 沙箱完成，以下维度沙箱**覆盖不到**：Windows 专属代码路径（junction、.cmd、CRLF）、真实隧道长时间运行、真实浏览器交互、真实外部服务（GitHub / 模型 API / 浏览器扩展）
- **分工**：**A 节给使用者**（约 20 分钟，双击+点几下，不需要读代码）；**B 节给项目助手/开发**（约半天，含一条已知问题 V4-1 的复现）；C 节是**不用做**的（沙箱已覆盖）
- **记录方式**：每节末尾有结果表。填完后可整份提交回仓库（或聊天发回），失败的项附截图/CMD 窗口原文

## 前置条件

| 项 | 要求 |
|---|---|
| 系统 | Windows 10/11 |
| Node.js | **20 LTS**（CI 用 20；package.json 暂无 engines 字段=已知可选项 V3-4，别用低于 18 的） |
| Git | 任意近年版本（`check-env.cmd` 会查） |
| 隧道（可选，B3 需要） | `winget install --id Cloudflare.cloudflared`；ngrok 走 `winget install Ngrok.Ngrok` |
| 网络 | A5/B6/B7 需要外网（Monaco CDN、模型 API、GitHub） |
| 克隆方式 | `git clone` 后**不要**手动改 .cmd 换行符（`.gitattributes` 已强制 CRLF 检出） |

---

## A 节：使用者冒烟（约 20 分钟）

> 每条格式：操作 → 预期。**任何一条不符，记下编号和现象即可，不要自己改文件。**

**A1 环境检查**
双击 `check-env.cmd` → 列出 Node/npm/Git 版本；cloudflared/ngrok 未装时给出 winget 安装命令而不是报错崩溃。

**A2 主程序启动**
双击 `run-webagent.cmd` → 黑色 CMD 窗口出现并保持开着；窗口里打印的地址/端口（工作台 3000、MCP 48271）与后面实际能打开的一致；首次运行会自动 `npm install`，耐心等它跑完。

**A3 工作台首开**
浏览器开 `http://127.0.0.1:3000` → 页面样式完整（无裸 HTML）；左侧文件树能展开 `workspace/` 里的示例计算器项目；双击文件能打开编辑器（联网时是 Monaco 深色编辑器；断网时应退化为普通文本框，**不算失败**）。

**A4 编辑与保存**
改一个文件按 Ctrl+S → 提示保存成功；文件树里该文件内容确实变了（用记事本开磁盘上的文件核对）。

**A5 本机 Chat**
右侧 Chat 发一句"你好" → 有回复流出来。**没配模型 API Key 时应给出明确提示**（引导去设置页填 Key），而不是无反应或白屏报错。

**A6 Bridge / 隧道（装了 cloudflared 才做）**
设置里启动 Bridge（默认 Cloudflare Quick Tunnel）→ 数十秒内出现 `https://….trycloudflare.com/mcp/…` 地址；界面有"施工证"警示文案。**做完记得停 Bridge、关 CMD 窗口。**

**A7 复制规则按钮**
Bridge 页选中 DeepSeek++ 或 Chat Plus 卡片 → 出现「复制规则」按钮，点击后剪贴板里是一段以"这些规则与 MCP initialize.instructions 相同"开头的规则文本；选中 Arena 卡时该按钮**隐藏**。

**A8 统计后台（可选组件）**
双击 `run-admin.cmd` → 另一个进程起在 4174；浏览器直接开 `http://127.0.0.1:4174/` 应**要令牌**（401/提示），`http://127.0.0.1:4174/health` 不需要。

**A9 中文与空格路径**
建目录 `D:\我的 项目\demo`（放任意小项目），CMD 里跑 `run-webagent.cmd "D:\我的 项目\demo"` → 正常启动且工作台文件树显示中文目录名不乱码；Chat/编辑可用。

**A10 测试双击跑**
双击 `run-tests.cmd` → 自动装依赖后逐文件 PASS，最后 `29 test files passed`（数字可能随版本增加），窗口不闪退。

**A11 干净退出**
关掉 CMD 窗口 → 任务管理器里不应残留 `node.exe`（起了隧道时也不应残留 `cloudflared.exe`/`ngrok.exe`）；再双击能重新起来。

### A 节结果表

| 项 | 通过? | 现象/截图 |
|---|---|---|
| A1–A11 | ☐ | |

---

## B 节：项目助手/开发技术项

**B1 win32 junction 沙箱分支（Linux 上被跳过，从未真实执行）**
`sandbox.test.js` L72 起：junction 指向工作区外时 `resolveSafePath` 必须拒绝。注意该段包在 `try{…}catch(_){}` 里，`fs.symlinkSync(…,'junction')` 失败会**静默跳过**。验证方法：先 `node -e "const fs=require('fs');fs.symlinkSync('C:\\Windows','.%TEMP%\\jtest','junction');console.log('ok')"` 确认本机能建 junction，再跑 `npm test` 看 sandbox.test 通过；建议在测试里给 catch 加一行 skip 日志（属可选改进）。

**B2 .cmd 检出形态**
`git ls-files --eol "*.cmd"` 在 Windows 检出后应全部 `w/crlf attr/text eol=crlf`（6 个：check-env、run-webagent、run-webagent-vscode、run-admin、run-tests、docs-site/serve）。任何 `w/lf` 都说明检出被污染。

**B3 真隧道长挂 ≥2 小时（验证 V3-1 修复）**
启动 Bridge（cloudflared），期间让网页端持续调工具（或挂一个长任务）。观察：任务管理器 node 进程内存**稳定不爬升**（修复前三处日志 buf 无上限）；BRIDGE 日志持续滚动；隧道日志里 Token 显示为 `[token]` 不是原文。ngrok 同样跑一轮（它 `--log=stdout` 每请求一行，最吃缓冲）。

**B4 V4-1 复现与修复验证（当前预期"复现成功"）**
已知问题：工作台事件流 30 分钟静默断连（`connectWs` 无重连 × `eventBus` 一次性 idle 定时器）。复现：开着工作台与 Bridge，放置 35 分钟不刷新，再从网页端触发一次工具调用 → BRIDGE 日志**不再滚动**、文件树不自刷，刷新页面才恢复。修复后（客户端退避重连 + 服务端活动重置定时器 + 源码锁测试）重跑本条应变为"35 分钟后日志照常滚动"。

**B5 浏览器 E2E 点击流**
设置弹窗逐页打开保存（概述/环境/技术栈/智能体/技能/指令/提示/挂钩/MCP/插件/API/Codex/多模型博弈）；多模型博弈开 2–8 分支跑一轮合并；终端面板 `run_command`；搜索 `search_files` 结果可点击打开文件；全程 DevTools Console 无未捕获异常。

**B6 Monaco CDN 失败路径**
断网（或 hosts 屏蔽 `cdn.jsdelivr.net`）刷新工作台 → 编辑器退化为文本框（`#editor-fallback`），能打开、编辑、Ctrl+S 保存；恢复网络后刷新回到 Monaco。

**B7 真实外部服务**
① GitHub 设备码流：设置页 `btn-gh-device` 走完授权 → 状态显示已验证；**重启 agent-host 后令牌应消失**（SECURITY.md 承诺只在内存）；`.webagent/config.json` 里不得出现 PAT。② 真实模型 API Key 跑通 A5。③ DeepSeek++ 扩展（ID `kdmpkkahkhdmdhfkdihkopikgcocbpbf`）按卡片步骤实连，BRIDGE 出现工具调用；④ Chat Plus（github.com/aiguicai/Chat-Plus）同验，注意"复制规则"贴进编排系统提示词、开"注入工具信息"。

**B8 网页 VS Code 模式**
`run-webagent-vscode.cmd`（`WEBAGENT_SKIP_WORKBENCH=1`）→ 本进程不占 3000；插件打本机 `/api` 通（无 Cloudflare 头不误杀）；48271 照常。

**B9 docs-site 于 Windows**
`docs-site\serve.cmd`（或 `node serve.js`）→ 默认只听 127.0.0.1；`http://127.0.0.1:4173/#/…` 各页渲染正常；探针 `GET /..%2f..%2f使用指南.md` 与 `GET /../使用指南.md` 应 404/403（win32 下 `path.sep='\\'` 守卫仍生效）。

**B10 admin-host 绑定覆盖**
`set WEBAGENT_ADMIN_BIND=0.0.0.0` 后启动 `run-admin.cmd` → 日志显示实际 bind 地址（诚实日志），且无令牌仍 401。测完还原。

**B11 中文路径深测（A9 的开发侧延伸）**
在 `D:\我的 项目\demo` 上跑通：`apply_patch`（含中文内容文件）、`search_files` 中文关键词、junction/symlink 逃逸拒绝、`start_command` 输出中文不乱码。

### B 节结果表

| 项 | 通过? | 备注（失败附日志） |
|---|---|---|
| B1–B11 | ☐ | B4 修复前预期=复现成功 |

---

## C 节：不需要在真机做的（沙箱已覆盖）

- `npm test` 29/29、`npm audit` 0 漏洞、`node --check` 全量语法、md 链接/密钥/gitignore 扫描（Linux 侧已绿；真机只需 A10/B1 的 Windows 侧确认）
- XSS 面审查（escapeHtml/textContent 全覆盖）、MCP 认证链、内存有界性、原子写、子进程清理——源码级已验
- V1–V3 全部修复项的验收（见 REPORT_v2/v3/v4 矩阵）

## 已知未修项（跑清单时会遇到，别当新问题报）

| 编号 | 内容 | 状态 |
|---|---|---|
| V4-1 | 工作台 WS 30 分钟静默断连不重连（B4 就是它） | **待修**，修复建议见 REPORT_v4.md 第四节 |
| V3-2 | secretKey/token `===` 比较非时序安全 | 可选加固 |
| V3-4 | package.json 无 engines 字段 | 可选（前置条件里人工注意 Node 版本即可） |
| 披露取舍 | Key 明文在 `.webagent/config.json`、`/api/status` 带 secretKey、启动日志打印含密钥 MCP URL 等 | SECURITY.md 有意为之，勿报 |
