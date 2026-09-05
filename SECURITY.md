# 安全说明

本仓库是跑在**你自己电脑上**的工作台 + agent-host，不是云端代管。默认只听 `127.0.0.1`。

## 威胁模型（故意做到哪、故意停在哪）

主路径是给网页 AI 一座 **MCP 桥**，让它当 Agent 改本机仓库。一次任务把隧道挂几十分钟到几小时是**预期用法**；做完应点「停止 Bridge」。

信任：这台电脑的主人；任务期间拿着完整 MCP 地址的那个网页 Agent。  
不信任：把地址发到群里的人；通宵无人值守、把隧道当永久公网服务。

因此**不做**：操作系统级命令沙箱、系统钥匙串、把一把 URL 密钥拆成多把、交互式 PTY、按客户端隔离全部全局状态。理由见 [架构导读.md](./架构导读.md) 第 12 节。已经做的：路径不能跑出工作区、远程危险命令拒绝、公网 `/api` 404、密钥 gitignore；若 Git 已经跟踪 `.webagent/config.json`，启动时会警告。

## Bridge / 隧道

点「启动 Bridge」并装了对应隧道程序之后，会给 48271 办一张公网门牌：默认是临时的 `*.trycloudflare.com`；选 Named Tunnel 则是你在 Cloudflare 登记的主机名；选 ngrok 则是 `*.ngrok*` 或你预留的域名。

拿到完整 MCP 地址（`/mcp/<密钥>`）的人可以：

- 读工作区里未标敏感的文件
- 打补丁、跑**非破坏性**命令（Windows 上是 PowerShell；`rm -rf` / `git push` / `curl | sh` 一类即使带 `confirm_dangerous` 也会被远程拒绝，只能在本机 Chat 确认）
- 在你这台电脑上执行 Code 模式允许的其它工具

**不要**把 `trycloudflare.com/mcp/...`、ngrok 地址或 Named 的 `https://你的域名/mcp/...` 发到群、Issue、截图网盘。Quick Tunnel（以及未预留的 ngrok）域名每次启动都可能变，旧地址作废，但当次有效期内等同施工证。Named Token 与 ngrok Authtoken 不要贴进聊天或日志。

公网请求打 `/api` 或 `/ws` 会 404；本机 Chat 走 3000，不经过隧道。CORS 白名单**不是**门卡，URL 里的密钥仍要保管。

## 本机密钥

MCP 密钥和模型 API Key 写在工作区 `.webagent/config.json`（尽量 `chmod 0600`，并 gitignore）。不是系统钥匙串。GitHub PAT 不会写入该文件。

ChatGPT 自制 MCP 插件用的 OAuth access / refresh **只在内存**。关掉 `run-webagent` 进程后要重新配对。

## 报告漏洞

请开 GitHub Issue，或私下联系仓库维护者。不要在 Issue 里粘贴有效 MCP 地址或 API Key。
