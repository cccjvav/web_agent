# 网页 DeepSeek（DeepSeek++）使用指南

DeepSeek 网页（[chat.deepseek.com](https://chat.deepseek.com/)）**不能原生调用 MCP**。要让它改你电脑上的仓库，需要第三方浏览器扩展 **DeepSeek++** 当手：模型只负责想，扩展拦截工具调用，打到本仓库的 ShunCode Bridge（Streamable HTTP），真正读写磁盘的仍是本机 `agent-host`。

本仓库把它写成**配套路径**（安装、浏览器、把 MCP URL 填进扩展）。**不**把扩展源码拷进 Git，也**不** fork [zhu1090093659/deepseek-pp](https://github.com/zhu1090093659/deepseek-pp)。

| | 说明 |
|---|---|
| 要不要 ChatGPT / DeepSeek Plus | **不要** |
| 要不要隧道 | **要**（和 Arena 一样，云上的网页才能打到你家电脑） |
| 浏览器 | **Chrome 或 Edge**（推荐）。Firefox 能装扩展，但 Native Host / 标签控制可能不全 |
| 改磁盘的程序 | 本仓库 `agent-host`，不是扩展自带的 Shell |
| 要不要装 `deepseek-pp-shell-host` | **不要**。那是扩展自己的本机命令通道，连我们的 Bridge 用不到 |

扩展在 Chrome 网上应用店的 ID：`kdmpkkahkhdmdhfkdihkopikgcocbpbf`。发布者是社区（chunlinzhu666 等），**不是 DeepSeek 官方产品**。数据默认存在浏览器本地。

---

## 1. 浏览器里安装 DeepSeek++

### Chrome

1. 打开 [DeepSeek++ 商店页](https://chromewebstore.google.com/detail/deepseek++/kdmpkkahkhdmdhfkdihkopikgcocbpbf)
2. 点「添加至 Chrome」
3. 地址栏右侧应出现扩展图标。打开 [chat.deepseek.com](https://chat.deepseek.com/) 后，侧边栏里能看到 MCP / 记忆 / 技能等页

### Microsoft Edge

Edge 可以装 Chrome 网上应用店的扩展：

1. 第一次会提示「允许来自其他应用商店的扩展」，允许
2. 用上面同一条商店链接安装
3. 同样在 `chat.deepseek.com` 里用侧边栏

### Firefox（能装，不作为主路径）

商店是 Chromium 的。Firefox 需要从 GitHub 发行包「临时载入」：

1. 到 [zhu1090093659/deepseek-pp/releases](https://github.com/zhu1090093659/deepseek-pp/releases) 下载扩展 zip，解压
2. 地址栏打开 `about:debugging#/runtime/this-firefox`
3. 「临时载入附加组件」，选解压目录里的 `manifest.json`
4. 工具栏按钮打开侧边栏

临时载入关掉 Firefox 会丢。连我们 Bridge 请优先 **Chrome / Edge**。

### 不要做的安装

**不要**运行：

```bat
npx deepseek-pp-shell-host install --browser chrome --extension-id kdmpkkahkhdmdhfkdihkopikgcocbpbf
```

那是给扩展本机文件/Shell 用的 Native Host。本项目读盘、打补丁、跑命令已经由 `run-shuncode.cmd` 拉起的 agent-host 负责。再装一层只会多一个本机命令通道，和 MCP 无关。

本仓库也**不会**把扩展源码放进 `shuncode-core/`。升级扩展请走商店或上游 GitHub。

---

## 2. 本机先把 Bridge 跑起来（Windows CMD）

和 [使用指南.md](./使用指南.md) 第 1、3、6 节相同。仓库根目录：

```bat
check-env.cmd
```

应有 Node.js、npm。网页端要改本机仓库时还必须有 **cloudflared**。没有就：

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

仍是 `http://127.0.0.1:...` 的话，云上的 DeepSeek 打不进来。

工作台也可以点 **打开 DeepSeek**：会复制 MCP 地址，并提示去本机 Chrome/Edge（内置假浏览器跑不了扩展）。

---

## 3. 把 MCP 地址填进 DeepSeek++

1. 工作台 Bridge 页选中客户端 **DeepSeek 网页**（无需 Plus）
2. 点 **复制**（只要这一行 URL）。选中该卡片时「复制提示词」复制的也是这一行，**不要**把 Arena 那两段说明塞进 URL 框
3. 用**已经装了 DeepSeek++** 的 Chrome 或 Edge 打开 https://chat.deepseek.com/
4. 打开扩展**侧边栏** → **MCP**
5. 添加远程 / 本机服务：
   - 传输：**Streamable HTTP**（不要选只给本机 Native Host 用的那种）
   - URL：粘贴 `https://….trycloudflare.com/mcp/…`（带密钥）
6. 保存，确认扩展能列出工具（`workspace_info`、`read_files`、`apply_patch` 等）

SSE 作为备选；本仓库主路径是 Streamable HTTP。不要用扩展的「本地桥 / Native Messaging」来代替我们的隧道。

---

## 4. 在 DeepSeek 里下任务

新开一条对话，直接说要改的仓库里的事，例如：`修复测试并运行 npm test`。

扩展会：识别模型打出的工具标记 → 调我们的 MCP → 把结果写回**同一条** DeepSeek 会话，模型再继续。

回到 ShunCode，右侧切到 **BRIDGE**，应能看到工具调用。磁盘上的文件会变。确认启动窗口里 `Workspace` 打印的是你以为的那个目录。

Quick Tunnel 的域名每次「启动 Bridge」都会变，必须回扩展里改 URL。不要把这条地址发到群里。

---

## 5. 和其它客户端怎么选

| 你想用 | 怎么连 |
|---|---|
| 本机工作台右侧 CHAT | 不用扩展、不用隧道 |
| Arena 等能把 URL 当工具后端的网页栏 | 复制「URL + 那句连接说明」当第一句 |
| **DeepSeek 网页** | **本页：DeepSeek++ + Streamable HTTP** |
| ChatGPT 免费普通聊天 | 通常加不了 MCP，不要走那条 |

---

## 6. 故障排除

**侧边栏没有 MCP 页**  \n扩展没装上，或当前标签不是 `chat.deepseek.com`。换 Chrome/Edge，刷新商店页确认已启用。

**工具列表是空的 / 一直转圈**  \nMCP 地址必须是 `https://….trycloudflare.com/mcp/…`，传输选 Streamable HTTP。Bridge 要在跑。公司网可能拦隧道。

**DeepSeek 只空谈、BRIDGE 没有调用**  \n模型没有走工具，或扩展没拦到标记。新开对话；确认扩展未关掉「MCP 工具执行」。不要把 URL 只贴在聊天框里当普通文字（那不是连接方式）。

**改到了文件，但不是你的仓库**  \n看 `run-shuncode.cmd` 窗口的 `Workspace` 行。要用 `run-shuncode.cmd D:\code\my-app` 挂自己的目录。

**误装了 Shell Native Host**  \n不影响我们的 MCP。可以不管。不要指望靠它代替 Bridge。

**工作台点「打开 DeepSeek」没有连上**  \n那一页只给步骤和复制地址。真正聊天必须在本机 Chrome/Edge 的 `chat.deepseek.com`，因为只有那里加载得了扩展。
