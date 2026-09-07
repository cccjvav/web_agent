# Windows 真机验收清单（CHECKLIST_WINDOWS · 唯一活基线）

- **对应代码**：`arena/01a07238-web-agent`（含 ShunCode 对齐 S1–S4 全部提交）
- **地位**：**唯一**真机验收基线。2026-09-07 合并：V 时代 A/B/C 节 + ShunCode 对齐第四阶段 D 节；旧编号 A1–A11 / B1–B11 保留不变（历史报告引用不失效），过时措辞已就地修订（见各条「修订」注）
- **为什么需要**：审查在 Linux 沙箱完成，以下维度沙箱**覆盖不到**：Windows 专属代码路径（junction、.cmd、CRLF）、真实隧道长时间运行、真实浏览器交互、真实外部服务（GitHub / 模型 API / 浏览器扩展）、Inno Setup 编译与安装行为
- **分工**：**A 节给使用者**（约 25 分钟，双击+点几下）；**B 节给项目助手/开发**（约半天）；**D 节=第四阶段交付形态**（安装包+UI，使用者可跑 D2–D7）；C 节是**不用做**的（沙箱已覆盖）
- **记录方式**：每节末尾有结果表。填完后可整份提交回仓库（或聊天发回），失败的项附截图/CMD 窗口原文

## 前置条件

| 项 | 要求 |
|---|---|
| 系统 | Windows 10/11 |
| Node.js | **20 LTS**（CI 用 20；`agent-host/package.json` 声明 `engines.node >=18`，别用更旧的） |
| Git | 任意近年版本（`check-env.cmd` 会查） |
| Inno Setup | **6**（仅 D1 编译安装包需要；https://jrsoftware.org/isinfo.php） |
| 隧道（可选，B3 需要） | `winget install --id Cloudflare.cloudflared`；ngrok 走 `winget install Ngrok.Ngrok` |
| 网络 | A3/A5/B6/B7/D2/D8 需要外网（Monaco CDN、code-server 自下载、模型 API、GitHub） |
| 克隆方式 | `git clone` 后**不要**手动改 .cmd 换行符（`.gitattributes` 已强制 CRLF 检出） |

---

## A 节：使用者冒烟（约 25 分钟）

> 每条格式：操作 → 预期。**任何一条不符，记下编号和现象即可，不要自己改文件。**

**A1 环境检查**
双击 `check-env.cmd` → 列出 Node/npm/Git 版本；cloudflared/ngrok 未装时给出 winget 安装命令而不是报错崩溃。

**A2 默认壳启动（修订：S4-2 起默认入口=VS Code 复刻壳）**
双击 `run-webagent-vscode.cmd`（或安装器桌面图标，见 D2）→ 黑色 CMD 窗口保持开着；**首跑从 npm 下载 code-server 4.135.0（约 50MB+依赖，耐心等）**；随后浏览器/壳内打开 `http://127.0.0.1:3000` = VS Code 网页版。**不要与经典壳同时开**（两壳都要 3000 口）。

**A3 经典壳（备用）与工作台首开（修订：经典壳降为备用入口）**
先关掉 A2 的壳。双击 `run-webagent.cmd` → CMD 窗口打印工作台 3000、MCP 48271；首次运行自动 `npm install`。浏览器开 `http://127.0.0.1:3000` → 经典工作台样式完整（无裸 HTML）；左侧文件树能展开 `workspace/` 里的示例计算器项目；双击文件能打开编辑器（联网时 Monaco 深色；断网退化为普通文本框，**不算失败**，见 B6）。

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

**A10 测试双击跑（修订：29→30）**
双击 `run-tests.cmd` → 自动装依赖后逐文件 PASS，最后 `30 test files passed`（数字可能随版本增加），窗口不闪退。

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

**B4 V4-1 已修复，验证重连（预期：日志仍滚动）**
开着工作台与 Bridge，放置 35 分钟不刷新，再从网页端触发一次工具调用 → BRIDGE 日志**照常滚动**；期间状态栏可能短暂出现「事件流重连中」后自动恢复。不要按「断了必须刷新页面」当通过标准。

**B5 浏览器 E2E 点击流**
设置弹窗逐页打开保存（概述/环境/技术栈/智能体/技能/指令/提示/挂钩/MCP/插件/API/Codex/多模型博弈）；多模型博弈开 2–8 分支跑一轮合并（合并主模型经 S4-3 弹层选择，见 D5）；终端面板 `run_command`；搜索 `search_files` 结果可点击打开文件；全程 DevTools Console 无未捕获异常。

**B6 Monaco CDN 失败路径**
断网（或 hosts 屏蔽 `cdn.jsdelivr.net`）刷新工作台 → 编辑器退化为文本框（`#editor-fallback`），能打开、编辑、Ctrl+S 保存；恢复网络后刷新回到 Monaco。

**B7 真实外部服务**
① GitHub 设备码流：设置页 `btn-gh-device` 走完授权 → 状态显示已验证；**重启 agent-host 后令牌应消失**（SECURITY.md 承诺只在内存）；`.webagent/config.json` 里不得出现 PAT。② 真实模型 API Key 跑通 A5。③ DeepSeek++ 扩展（ID `kdmpkkahkhdmdhfkdihkopikgcocbpbf`）按卡片步骤实连，BRIDGE 出现工具调用；④ Chat Plus（github.com/aiguicai/Chat-Plus）同验，注意"复制规则"贴进编排系统提示词、开"注入工具信息"。

**B8 网页 VS Code 模式端口拓扑（修订：3000 的占用者是 code-server，不是 agent-host）**
`run-webagent-vscode.cmd` 设 `WEBAGENT_SKIP_WORKBENCH=1` 启动 agent-host → **agent-host 不监听 3000**（`skipWorkbench.test.js` 锁）；**监听 3000 的是 code-server**（`run-code-oss.js`，`CODE_SERVER_PORT` 默认 3000）；MCP 48271 照常；插件打本机 `/api` 通（无 Cloudflare 头不误杀）。验证：`netstat -ano` 看 3000 的属主应是 code-server 进程；两壳同开抢 3000 报占用＝**预期行为**，别当缺陷。

**B9 docs-site 于 Windows**
`docs-site\serve.cmd`（或 `node serve.js`）→ 默认只听 127.0.0.1；`http://127.0.0.1:4173/#/…` 各页渲染正常；探针 `GET /..%2f..%2f使用指南.md` 与 `GET /../使用指南.md` 应 404/403（win32 下 `path.sep='\\'` 守卫仍生效）。

**B10 admin-host 绑定覆盖**
`set WEBAGENT_ADMIN_BIND=0.0.0.0` 后启动 `run-admin.cmd` → 日志显示实际 bind 地址（诚实日志），且无令牌仍 401。测完还原。

**B11 中文路径深测（A9 的开发侧延伸）**
在 `D:\我的 项目\demo` 上跑通：`apply_patch`（含中文内容文件）、`search_files` 中文关键词、junction/symlink 逃逸拒绝、`start_command` 输出中文不乱码。

### B 节结果表

| 项 | 通过? | 备注（失败附日志） |
|---|---|---|
| B1–B11 | ☐ | B4 预期=35 分钟后日志仍滚动；B8 预期=3000 属主为 code-server |

---

## C 节：不需要在真机做的（沙箱已覆盖）

- `npm test` 30/30、`npm audit` 0 漏洞、`node --check` 全量语法、md 链接/密钥/gitignore 扫描（Linux 侧已绿；真机只需 A10/B1 的 Windows 侧确认）
- XSS 面审查（escapeHtml/textContent 全覆盖）、MCP 认证链、内存有界性、原子写、子进程清理——源码级已验
- V1–V5 修复项的验收（见同目录 REPORT_v2…v5 矩阵）；ShunCode 对齐 S1–S4 代码面（见 REPORT_SHUNCODE_S1…S4）

---

## D 节：第四阶段交付形态（安装包 + 默认壳 + UI 对齐）

> 图形对照：`review/shuncode-ui/`（参考产品 ShunCode 截图索引，含归属约定）。D5–D7 明暗两主题各过一遍。

**D1 安装包编译（需 Inno Setup 6）**
`installer\build-installer.cmd` → 产出 `webagent-setup-{AppVer}.exe`（版本号唯一改动点＝.iss 顶部 `#define AppVer`），编译过程无脚本错误。

**D2 安装冒烟**
标准用户权限可装；默认目录 `{autopf}\WebAgent`；桌面+开始菜单主图标 → `run-webagent-vscode.cmd`，开始菜单「经典工作台（备用）」→ `run-webagent.cmd`、「环境自检」→ `check-env.cmd`；勾选「立即启动」进 VS Code 壳且首跑 code-server 自下载成功。

**D3 缺 Node 机器**
未装 Node 的机器上运行安装/启动 → 给出 check-env 指引且**不阻断不崩溃**（安装器前置检查为非阻断）。

**D4 卸载干净**
控制面板卸载 → 程序与运行时缓存（agent-host `node_modules`、`bin\code-server-runtime`）清除；**用户工作区/配置/浏览器 profile 保留**；重装覆盖安装正常。

**D5 可搜索模型弹层（对照 11/12/13 图）**
composer 模型按钮 → 弹层：搜索过滤（名称/ID/组）生效、行显上下文与能力 pill、点选后按钮标签与隐藏 select 同步、Esc/外点关闭、视口内不溢出；多模型页「合并主模型」弹层带「Current merge model」灰注且只读显同步。

**D6 回合徽标与 chip（对照 14 图）**
回合右下蓝徽标「模型 · 分支 n/n」计数正确；composer 语义 chip 显示正确。

**D7 Bridge 等待态文案（对照 05 图）**
启动 Bridge 未接客户端时，右栏等待文案语义到位（参考帧：「Waiting for the remote Agent… Input stays in the external client」+ 零统计）；不到位记入下轮抛光，**不算本阶段失败**。

**D8 S3 遗留 + computer-use 冒烟（S1 报告提议项）**
真机跑 `snap.ps1` 截图 → 远程网页客户端（Arena/ChatGPT 自制插件等）**实际收到 image 内容**并描述画面（各 MCP 客户端渲染支持逐个验证）；>6MB 截图走静默降级（tooBig）不报错。

### D 节结果表

| 项 | 通过? | 现象/截图 |
|---|---|---|
| D1–D8 | ☐ | |

---

## 已知未修项（跑清单时会遇到，别当新问题报）

| 编号 | 内容 | 状态 |
|---|---|---|
| V4-1 / V3-2 / V3-4 | WS 重连、时序安全比较、engines | **已落地**（`63a960d`），B4 按新预期验 |
| 披露取舍 | Key 明文在 `.webagent/config.json`、`/api/status` 带 secretKey、启动日志打印含密钥 MCP URL 等 | SECURITY.md 有意为之，勿报 |
| 真 PTY | 架构导读 §12 既定取舍：未点名不做 | 勿报 |
