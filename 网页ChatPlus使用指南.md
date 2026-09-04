# 网页 Chat Plus（多网站扩展）使用指南

不少网页 AI（ChatGPT、Gemini、DeepSeek、豆包、通义……）**自己调不了 MCP**。社区扩展 **Chat Plus**（[aiguicai/Chat-Plus](https://github.com/aiguicai/Chat-Plus)）用站点适配器当手：模型只负责想，扩展拦截工具调用，打到本仓库的 ShunCode Bridge（Streamable HTTP），真正读写磁盘的仍是本机 `agent-host`。

本仓库把它写成**配套路径**（从 GitHub 编译、加载、把 MCP URL 填进扩展）。**不**把扩展源码拷进 Git，也**不** fork。许可证是 **GPL v3 或更新**，拷进本仓库会传染许可证。

上游 README 常让你先跑他们的 [MCP-Gateway](https://github.com/aiguicai/MCP-Gateway)。**连本仓库时不要装。** 扩展源码里 MCP 客户端本身就认 Streamable HTTP / SSE 的 `http(s)` 地址；我们的 agent-host 已经是 MCP 服务。Gateway 是把别人的 stdio 转成远程 MCP 用的，再加一层只会多一个进程。

| | 说明 |
|---|---|
| 要不要 ChatGPT / 各家 Plus | **不要**（扩展往网页里塞工具，不是官方连接器） |
| 要不要隧道 | **要**（和 Arena 一样，云上的网页才能打到你家电脑） |
| 浏览器 | **Chrome 或 Edge**（推荐）。上游也出 Firefox 包 |
| 改磁盘的程序 | 本仓库 `agent-host`，不是 MCP-Gateway，也不是 DeepSeek++ 的 Shell |
| 要不要装 `aiguicai/MCP-Gateway` | **不要** |
| Chrome 网上应用店 | **没有**商店 ID。从 GitHub 源码 `npm run build:chrome` 后「加载已解压的扩展」 |

上游示例适配过的站点（以他们 README 为准，网页改版后适配器可能失效）：ChatGPT、Gemini、Google AI Studio、DeepSeek、豆包、通义、Arena、小米 Mimo、Z.ai、Chatbox。

---

## 1. 从 GitHub 编译并加载（Windows CMD）

扩展**不在** Chrome 商店。需要本机已有 **Git** 和 **Node.js / npm**（跑 ShunCode 本来就要）。仓库根目录：

```bat
check-env.cmd
```

应有 Node.js、npm。然后另开一个目录克隆扩展（不要克隆进本仓库）：

```bat
cd /d D:\code
git clone https://github.com/aiguicai/Chat-Plus.git
cd Chat-Plus
npm install
npm run build:chrome
```

成功后应有 `D:\code\Chat-Plus\dist\chrome\`（里面有 `manifest.json`）。`npm run build` 会连 Firefox 一起编；只连我们 Bridge 用 Chrome 包即可。

### Chrome

1. 地址栏打开 `chrome://extensions`
2. 打开右上角 **开发者模式**
3. **加载已解压的扩展程序**，选 `D:\code\Chat-Plus\dist\chrome`
4. 工具栏应出现扩展图标。打开已适配的网页后，侧边栏里能看到 MCP / 工具等页

### Microsoft Edge

1. 地址栏打开 `edge://extensions`
2. 打开 **开发人员模式**
3. **加载解压缩的扩展**，同样选 `dist\chrome`

### Firefox（能装，不作为主路径）

上游 `npm run build:firefox` 出 `dist\firefox`。地址栏 `about:debugging#/runtime/this-firefox` → 「临时载入附加组件」→ 选该目录 `manifest.json`。临时载入关掉 Firefox 会丢。连我们 Bridge 请优先 **Chrome / Edge**。

### 不要做的安装

**不要**再克隆或运行 [aiguicai/MCP-Gateway](https://github.com/aiguicai/MCP-Gateway) 来「转」我们的服务。本项目读盘、打补丁、跑命令已经由 `run-shuncode.cmd` 拉起的 agent-host 负责。

本仓库也**不会**把 Chat-Plus 源码放进 `shuncode-core/`。升级扩展请回上游 Git 拉新再 `npm run build:chrome`。

---

## 2. 本机先把 Bridge 跑起来（Windows CMD）

和 [使用指南.md](./使用指南.md) 第 1、3、6 节相同。仓库根目录：

```bat
check-env.cmd
```

网页端要改本机仓库时还必须有 **cloudflared**。没有就：

```bat
winget install --id Cloudflare.cloudflared
```

装完**新开一个 CMD**，再：

```bat
cd /d D:\code\web_agent
run-shuncode.cmd D:\code\my-app
```

把路径换成你的。浏览器打开 http://127.0.0.1:3000 → 齿轮 → **Bridge** → **启动 Bridge**，等到地址变成：

```
https://xxxx.trycloudflare.com/mcp/一串密钥
```

仍是 `http://127.0.0.1:...` 的话，云上的网页打不进来。

---

## 3. 把 MCP 地址填进 Chat Plus

1. 工作台 Bridge 页选中客户端 **Chat Plus 扩展（多网站）**（无需 Plus）
2. 点 **复制**（只要这一行 URL）。选中该卡片时「复制提示词」复制的也是这一行，**不要**把 Arena 那两段说明塞进 URL 框
3. 打开 Chat Plus **侧边栏**，添加 MCP 服务：
   - 传输：**Streamable HTTP**（源码里也叫 `streamable-http`；不要为了连我们再填 Gateway）
   - URL：粘贴 `https://….trycloudflare.com/mcp/…`（带密钥）
   - 请求头：空着即可（密钥已经在路径里）
4. 保存，确认扩展能列出工具（`workspace_info`、`read_files`、`apply_patch` 等）
5. 打开**已经适配**的网页（例如 `chatgpt.com`、`gemini.google.com`、`chat.deepseek.com`），给**当前页**启用工具

SSE 作为备选（本仓库 GET `/mcp` 也认 `text/event-stream`）；主路径仍是 Streamable HTTP。

只连 DeepSeek、且能装商店扩展时，也可以继续用 [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md) 的 DeepSeek++（不用从源码编译）。两套扩展不要抢同一页；选一个即可。

---

## 4. 在网页 AI 里下任务

新开一条对话，直接说要改的仓库里的事，例如：`修复测试并运行 npm test`。

扩展会：识别模型打出的工具标记 → 调我们的 MCP → 把结果写回**同一条**会话，模型再继续。

回到 ShunCode，右侧切到 **BRIDGE**，应能看到工具调用。磁盘上的文件会变。确认启动窗口里 `Workspace` 打印的是你以为的那个目录。

Quick Tunnel 的域名每次「启动 Bridge」都会变，必须回扩展里改 URL。不要把这条地址发到群里。

这**不是** ChatGPT Plus 官方开发者模式连接器。免费 ChatGPT 普通栏本身仍然加不了 MCP；是扩展在页面里当手。官方连接器见工作台 **ChatGPT Plus** 卡片（OAuth，规范地址 `/mcp`）。

---

## 5. 和其它客户端怎么选

| 你想用 | 怎么连 |
|---|---|
| 本机工作台右侧 CHAT | 不用扩展、不用隧道 |
| Arena 等能把 URL 当工具后端的网页栏 | 复制「URL + 那句连接说明」当第一句（可以不装扩展） |
| **多个网页 AI**（ChatGPT / Gemini / 豆包 / 通义 / DeepSeek…） | **本页：Chat Plus + Streamable HTTP** |
| 只连 DeepSeek 网页 | [网页DeepSeek使用指南.md](./网页DeepSeek使用指南.md)（商店装 DeepSeek++）或本页 |
| ChatGPT 免费普通聊天（不装扩展） | 通常加不了 MCP，不要只把 URL 贴进聊天框 |

---

## 6. 故障排除

**侧边栏没有 MCP / 当前页显示不支持**  \\n扩展没加载，或这个网站还没有适配器。确认加载的是 `dist\\chrome`，刷新该聊天页。网页改版后适配器可能失效，回上游仓库看 Issues。

**工具列表是空的 / 一直转圈**  \\nMCP 地址必须是 `https://….trycloudflare.com/mcp/…`，传输选 Streamable HTTP。Bridge 要在跑。公司网可能拦隧道。不要填 MCP-Gateway 的地址。

**网页只空谈、BRIDGE 没有调用**  \\n模型没有走工具，或扩展没拦到标记。新开对话；确认当前页已启用工具。不要把 URL 只贴在聊天框里当普通文字（那不是连接方式）。

**改到了文件，但不是你的仓库**  \\n看 `run-shuncode.cmd` 窗口的 `Workspace` 行。要用 `run-shuncode.cmd D:\\code\\my-app` 挂自己的目录。

**误装了 MCP-Gateway**  \\n停掉它。连我们的 Bridge 用不到。不要指望靠它代替 agent-host。

**和 DeepSeek++ 同时开着**  \\n同一标签里两套拦截可能打架。DeepSeek 页只留一个扩展。

**GPL / 升级**  \\n不要把 Chat-Plus 源码合并进本仓库。上游更新后在它自己的目录再 `npm run build:chrome`，Chrome 扩展页点刷新。
