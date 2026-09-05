# 安全说明

本仓库是跑在**你自己电脑上**的工作台 + agent-host，不是云端代管。默认只听 `127.0.0.1`。

## Bridge / 隧道

点「启动 Bridge」并装了 cloudflared 之后，会给 48271 办一张临时公网门牌（`*.trycloudflare.com`）。

拿到完整 MCP 地址（`/mcp/<密钥>`）的人可以：

- 读工作区里未标敏感的文件
- 打补丁、跑**非破坏性**命令（Windows 上是 PowerShell；`rm -rf` / `git push` / `curl | sh` 一类即使带 `confirm_dangerous` 也会被远程拒绝，只能在本机 Chat 确认）
- 在你这台电脑上执行 Code 模式允许的其它工具

**不要**把 `trycloudflare.com/mcp/...` 发到群、Issue、截图网盘。域名每次启动都会变，旧地址作废，但当次有效期内等同施工证。

公网请求打 `/api` 或 `/ws` 会 404；本机 Chat 走 3000，不经过隧道。CORS 白名单**不是**门卡，URL 里的密钥仍要保管。

## 本机密钥

MCP 密钥和模型 API Key 写在工作区 `.webagent/config.json`（尽量 `chmod 0600`，并 gitignore）。不是系统钥匙串。GitHub PAT 不会写入该文件。

ChatGPT Plus 连接器用的 OAuth access / refresh **只在内存**。关掉 `run-webagent` 进程后要重新配对。

## 报告漏洞

请开 GitHub Issue，或私下联系仓库维护者。不要在 Issue 里粘贴有效 MCP 地址或 API Key。
