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

## 第三轮审批与环境修正（2026-09-14）
- 常见cat/type/Get-Content、git diff/log/show正文读取需当次PTY审批，即使已允许会话/命令族；路径/符号链接/已跟踪密钥无法仅靠命令词判断安全。
- 会话/命令族允许仍可能执行其他任意程序；规则是尽力识别，不是OS沙箱。不得向不受信任务授予宽授权。
- executor与PTY共用ptyPolicy.scrubEnv，移除token/access-key/storage-key等凭据名称，保留PATH/Conda；shell-integration终端设置strictEnv防重新继承。未知命名/程序自行读取磁盘凭据不在此保证内。
- 截断或混合不完整SEARCH/REPLACE补丁拒绝，不整文件覆盖；需要写入字面补丁标记时应走受权限/hash保护的write_file。

## 外部网络依赖与用量上报

- 经典工作台从jsDelivr加载Monaco可执行脚本，同页能访问本机状态，因此存在第三方CDN供应链信任面。加载失败提供纯文本回退；当前尚未vendor Monaco，不把离线回退当供应链隔离。
- 配置WEBAGENT_TELEMETRY_URL与WEBAGENT_TELEMETRY_TOKEN两者后才可能外发统计，默认未配置不发送。payload包含installId、可选githubUser/githubId/provider、日期、调用数、失败数、成功率、lastAt、产品与版本，不包含模型key、MCP secret或命令正文，但不是匿名数据。
- 关闭上报：停止产品，删除启动环境中的上述两项配置，再从清理后的新进程启动；本地usage.json仍可能记录统计，关闭上报不等于删除本地记录。不公开遥测令牌。
- 截图自动回传除工作区外还允许本项目computer-use目录（现有技能兼容例外），该目录不要放私人截图。命令stdout中图片路径可能触发附件读取；尚未改成显式附件协议，此例外不能误说成严格仅工作区。
- 强杀主机进程后应人工确认对应cloudflared/ngrok已退出；仅凭旧PID自动强杀可能误伤PID复用的其他进程，当前不实施这种回收。断电时进程不会继续运行，但重启后的外部服务/残留启动机制仍需核对。

## OAuth注册与配对的当前限制

注册最多80客户端，活跃令牌或授权码保护其注册；满时仅回收超过5分钟的无活动注册，否则503，不撤销正常连接来腾位置。回调最多16个、每个2048字符，只支持HTTPS或HTTP回环，精确匹配；不支持自定义URI scheme。公开授权GET不再生成/更新码，须从本机工作台生成。授权请求另有IP限流，五次错误预算按已注册clientId隔离，不能用另一注册者全局作废码；ID不是秘密，不声称消除针对已知目标ID或流量层的拒绝服务。

OAuth issuer优先采用本机设置的publicTunnelUrl；没有该值时只接受本机Host，不信任转发Host/proto。自建反向代理须在本机控制面配置正确公网地址，不能只靠X-Forwarded-Host发现。客户端密钥POST/Basic和公开客户端PKCE均保留；授权仍在内存，重启重新配对。

## 资源与文档站的补充边界

公网OAuth JSON/表单请求限制64KiB；MCP有效路径先认证再解析请求体，/api先检查本机与跨站边界。认证后的工具JSON仍保留20MiB，因为单文件文字预算8MiB且补丁/JSON转义需要余量，不按报告建议盲目降到几MB破坏兼容性。默认不把文件/命令正文静默脱敏后假装原始内容；敏感路径与环境过滤不能保证任何stdout都绝无秘密。

文档站content.js含产品源码快照，没有认证，默认回环。DOCS_HOST设成非回环会打印警告；不要把文档站接公网隧道。用户安装文档站直接使用预构建快照，不在Program Files重建。

Windows非PTY命令加入KILL_ON_JOB_CLOSE Job Object：shell退出会关闭其后代，所以不能用Start-Process把后台服务遗留在一次性命令之外；长运行任务请保持前台并通过start_command管理。它不是权限沙箱，不能替代命令审批，也不覆盖任意外部隧道/桌面PTY进程。

## 显式stdio程序启动

stdio只由受保护本机API进行只读预览、两分钟一次性确认启动；远程MCP不接受启动配置。预览绑定程序SHA256及可选工作区reviewFiles，审批配置不持久化。目标通过字面参数启动，不使用npx/uvx隐式安装；允许任意已信任的原生程序/解释器，解释器名称及扩展名检查**不是代码沙箱**。

启动就执行OS用户代码，代码可访问工作区外文件、网络、系统凭据文件以及本机管理面。逐次external_request审批不隔离恶意本机进程，不证明程序不会自行执行动作/安装依赖。不要启动不可信程序；参数可在进程列表可见，密钥应显式放env，环境基础白名单不继承宿主凭据。stderr仅计数、不保存；第三方工具若主动在结果中返回秘密，不能由传输层保证识别，操作者仍须审查数据。

程序/所选入口文件hash不是签名、完整依赖锁或原子执行锁，仍有检查与执行间文件竞态；路径可能通过系统挂载指向其他存储，不能称为网络隔离。Windows固定PS/C#监督器先附加KILL_ON_JOB_CLOSE并监视宿主，再启动目标；失败不回退。POSIX使用进程组和父死亡监视，能回收普通同组后代，但不是cgroup/namespace，恶意setsid可脱离。

取消/超时/退出/输出超限停止整个stdio服务，拒绝在途请求、保留unknown语义，不自动重启/重放；握手与发现不能证明目标可信。全会话8MiB输出、stderr1MiB、4096帧、单帧256KiB、8在途请求等限制用于资源控制，不是第三方代码的CPU/内存/磁盘配额。
