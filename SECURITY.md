# 安全说明

本仓库是跑在**你自己电脑上**的工作台 + agent-host，不是云端代管。默认只听 `127.0.0.1`。

## 威胁模型（故意做到哪、故意停在哪）

主路径是给网页 AI 一座 **MCP 桥**，让它当 Agent 改本机仓库。一次任务把隧道挂几十分钟到几小时是**预期用法**；做完应点「停止 Bridge」。

信任：这台电脑的主人；任务期间拿着完整 MCP 地址的那个网页 Agent。  
不信任：把地址发到群里的人；通宵无人值守、把隧道当永久公网服务。

因此**不做**：操作系统级命令沙箱、系统钥匙串、把一把 URL 密钥拆成多把、**远程**交互式 PTY、按客户端隔离全部全局状态。理由见 [架构导读.md](./架构导读.md) 第 12 节。已经做的：文件工具路径不能跑出工作区、远程常见破坏性命令拒绝（词法归一后判定，编码/嵌套脚本仍可能绕过）、公网 `/api` 404（含 `/api/pty/*`）、带了不在白名单里的 Origin 打 `/mcp` 得 403、密钥 gitignore；若 Git 已经跟踪 `.webagent/config.json`，启动时会警告。桌面 Chat 的集成终端 PTY 只走本机 `/api/pty`（VS Code 插件，`client: vscode-extension`）；远程 `send_command_input` 是 `E_FORBIDDEN`。

## 本机控制面与文件工具补充（2026-09-11）

`/api`要求Host为localhost、127.0.0.1或[::1]（可带有效端口），且socket回环、无隧道特征头；外站Origin/Referer仍被拒绝。`/ws`在upgrade阶段也验证本机控制面和Origin；无Origin的本机Node客户端仍允许。`WEBAGENT_CORS_ORIGINS`只扩展MCP网页白名单，不能放开API或WS。

文件路径检查同时验证逻辑路径和真实链接目标；内置敏感规则不区分大小写并覆盖嵌套目录。记忆day仅接收有效日历日期；用户Skill必须实际位于工作区内，产品固定bundled目录例外保留。这是应用层保护，不是OS沙箱，不承诺抵抗有本机文件系统写权限进程的所有竞态或硬链接操作。

本轮只修复了一批问题；webview动态文本已改为DOM/textContent并加nonce CSP与宿主消息校验（真实VS Code验收尚待）；PTY审批与取消等仍需处理，见[交叉验证台账](./review/AUDIT_CROSSCHECK_2026-09-11.md)。不要把新增回归通过视为整体安全验收完成。

## Bridge / 隧道

点「启动 Bridge」并装了对应隧道程序之后，会给 48271 办一张公网门牌：默认是临时的 `*.trycloudflare.com`；选 Named Tunnel 则是你在 Cloudflare 登记的主机名；选 ngrok 则是 `*.ngrok*` 或你预留的域名。

拿到完整 MCP 地址（`/mcp/<密钥>`）的人可以：

- 读工作区里未标敏感的文件
- 打补丁、跑**非破坏性**命令（Windows 上是 PowerShell；`rm -rf` / `rm -r -f` / `find -delete` / `git push` / `curl | sh` 一类即使带 `confirm_dangerous` 也会被远程拒绝，只能在本机 Chat 确认。这是常见写法拦截，不是操作系统沙箱）
- 在你这台电脑上执行 Code 模式允许的其它工具

**不要**把 `trycloudflare.com/mcp/...`、ngrok 地址或 Named 的 `https://你的域名/mcp/...` 发到群、Issue、截图网盘。Quick Tunnel（以及未预留的 ngrok）域名每次启动都可能变，旧地址作废，但当次有效期内等同施工证。Named Token 与 ngrok Authtoken 不要贴进聊天或日志。

公网请求打 `/api` 或 `/ws` 会 404；本机 Chat 走 3000，不经过隧道。CORS 白名单**不是**门卡，URL 里的密钥仍要保管。

MCP 认证优先用路径 `/mcp/<密钥>` 或请求头 `Authorization: Bearer`。还认查询串 `?secret=`，只是兜底；经公共隧道时 query 可能进边缘/代理访问日志，不要把密钥放在查询串里当主用法。

## 本机密钥

MCP 密钥和模型 API Key 写在工作区 `.webagent/config.json`（尽量 `chmod 0600`，并 gitignore）。不是系统钥匙串，也不搬到 `%APPDATA%`（密钥跟着这台「车」）。非 Git 场景（打包、备份、网盘同步、把工作区目录整个拷走）仍可能带上明文 Key。GitHub PAT 不会写入该文件。

敏感路径拦截（`.env`、`*.pem`、`.ssh/`、`.webagent/config.json` 等）**只作用于文件工具**。`read_files ".env"` 会被拒；`run_command "cat .env"` 可以读出内容。

工作台 `GET /api/status` **仍带** `secretKey`：本机拼 MCP 地址要用，且`/api`限制回环socket＋明确本机Host＋本机HTTP(S) Origin（允许本机不同端口，不是严格同源）。不另开 `/api/bridge/secret`。

ChatGPT 自制 MCP 插件用的 OAuth access / refresh **只在内存**。关掉 `run-webagent` 进程后要重新配对。

## 报告漏洞

请开 GitHub Issue，或私下联系仓库维护者。不要在 Issue 里粘贴有效 MCP 地址或 API Key。

## 请求与终端取消（2026-09-11）

Chat断开/停止会传递取消信号；每请求5分钟总期限，模型响应120秒期限。PTY基于客户端身份与工作区绑定，审批超时后不得执行；只读自动批准只接受保守完整命令。无可靠退出/输出捕获的fallback不执行，避免“已发送=成功”。这些是应用层控制，不保证对抗同机高权限进程或所有脱离进程组的子进程；真实Windows和VS Code仍待验收。
