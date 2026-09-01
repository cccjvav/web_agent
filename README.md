# ShunCode 复现工作台

对照官方文档 [docs.shuncode.top](https://docs.shuncode.top/docs/intro/) 的本地可运行版本。

右侧 **Chat** 只改本机，不需要隧道。  
**Bridge** 把同一套工具变成 MCP，给 ChatGPT / Arena 等网页 Agent 用——在你自己的电脑上，这需要 Cloudflare Quick Tunnel。

## 在 Windows 上让 ChatGPT 改本机仓库

1. 安装 [Node.js LTS](https://nodejs.org/)
2. 安装 cloudflared（无需 Cloudflare 账号）：

```bat
winget install --id Cloudflare.cloudflared
```

装完后**新开一个终端**（刷新 PATH）。

3. 双击或运行仓库根目录的 `run-shuncode.cmd`  
   浏览器打开 http://127.0.0.1:3000
4. 把 `WORKSPACE_ROOT` 换成你的项目（可选）：

```bat
set WORKSPACE_ROOT=D:\your\repo
run-shuncode.cmd
```

默认工作区是仓库里的 `workspace\`。

5. 齿轮 → **智能体自定义设置** → **Bridge** → **启动 Bridge**  
   等 MCP 地址变成 `https://….trycloudflare.com/mcp/…`
6. **复制提示词**，整段作为 ChatGPT（或 Arena）新对话的**第一句**发出  
   每次重新点启动，Quick Tunnel 的域名会变，要再复制一次。

不要把 MCP 地址发到群里：对面拿到就能改文件、跑命令。

本地 Chat 不走隧道，不装 cloudflared 也能用 Ask / Plan / Code。

## 其它环境

```bash
./run-shuncode.sh
```

预览端口 **3000**。没有 cloudflared 时，Bridge 会退回当前页面的源（只适合已经有公网 HTTPS 的预览）。Windows 上找不到 cloudflared 会直接报错，避免把 `localhost` 交给 ChatGPT。
