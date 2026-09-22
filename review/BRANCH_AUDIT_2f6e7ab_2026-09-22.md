# 对方分支独立审查（2026-09-22，基线 commit 2f6e7ab）

用户澄清后的任务：不只复审对方助手提供的 F61 报告，而是**由我本人对 `arena/01a0bfa9-web-agent` 分支做一次独立审查**，输出错误集合，重点找 F61 报告**未披露**的问题。本报告是我的独立审查结果；对 F61 的验证结论另见[对照报告追加二](BRANCH_COMPARISON_01a0bfa9_2026-09-21.md)。

- 审查对象：`origin/arena/01a0bfa9-web-agent` @ `2f6e7ab716477dd9983f6599dc2d414c32770010`（其 F61 报告提交本身），worktree 检出、`npm ci` 后实测 **97/97 通过**、`docs 278/28/111 updated=0`、其 CI 35665317209 九项 success。
- 环境：Linux 沙箱、Node v22.22.3。Windows/C#/PowerShell/DPAPI/桌面路径**不能**在此验证，只做静态读码，不计入本轮结论。
- 方法：静态逐文件读码（MCP 会话与生命周期、tunnel 全族、installer 全族、workbench 前端、extension、OAuth、CI 工作流、打包清单）+ 真实回环 HTTP / 真实子进程 / 真实文件系统探针。所有探针只写自建临时目录，不接触真实凭据、不发起外部网络、不安装 code-server。

## 一、本轮新发现（F61 报告未披露）

### A1 · P2（会话可用性）· SSE 满员 503 仍先分配会话，可把合法空闲会话挤出表

位置：[`src/mcp/server.js`](../webagent-core/agent-host/src/mcp/server.js) `handleGet`（约 536–545 行）与 [`src/mcp/session.js`](../webagent-core/agent-host/src/mcp/session.js) `createHttpSession`。

代码顺序是「先绑定/创建，再查上限」：`bindHttpSession(req, { createIfMissing: wantsSse(req) })` 成功建会话（或用调用方给的 sid），**之后**才 `if (sseOpen >= MAX_SSE) return 503`。被 503 拒绝的请求已经占下一个会话记录，且永远不会被 `beginHttpSessionWork`/`release` 释放。表满 200 时 `createHttpSession` 会驱逐「最旧的空闲会话」来腾位，于是**被拒绝的请求反过来驱逐别的合法会话**。

最小复现（真实回环 HTTP，本机 `src/mcp/server` 挂到 express）：

```
victim 先 initialize 拿到 sid → 打开 32 条 SSE 占满 MAX_SSE
→ ping(victim)=200 → 再发 250 个注定 503 的 SSE GET
→ ping(victim)=404
{"sseOpened":32,"pingBefore":200,"rejected503":250,"pingAfterAttack":404,"victimEvicted":true}
```

影响：持有效凭据的调用方（含 OAuth 已授权客户端、允许来源的浏览器页）可用被拒请求持续改写会话表，让空闲的合法客户端在下一次调用时收到 404、被迫重新 initialize；同时绕过其 F54/F55 刚立的「在途会话不被 TTL/容量驱逐」不变量的一半——该不变量只对 `active>0` 生效，**被拒请求造成的是另一种驱逐路径**。同类顺序在基点 `50c03be` 已存在（`git show 50c03be:.../server.js` 第 417 行同序），属继承性缺陷，但 F61 报告与 `会话与结果详解.md`／`mcp/README.md` 的 F54 段都只写了「全忙拒绝新分配（503）」，没有披露「拒绝路径本身消耗容量并驱逐他人」。

建议修复（最小）：把上限判断挪到分配之前（先算 `wantsSse`，超限直接 503，不 bind/create）；或在 503 分支显式回收刚创建的会话（若本次新建且无工作，直接 `destroyHttpSession`）。前者更简单且不引入新状态。验收：满员时连续 250 次被拒 SSE GET 后，先前的空闲会话仍为 200。

### A2 · P2（启动可靠性）· 首次复制被打断后，安装副本目录永久无法再准备

位置：[`installer/launch.js`](../installer/launch.js) `prepareRuntime`（约 33–46 行）。

发布逻辑是「写临时目录 → `fs.writeFileSync(tmp/.ready)` → `renameSync(tmp, dest)`」，失败时只做 `catch (err) { if (!fs.existsSync(dest/.ready)) throw err; }`。也就是说：**只要 `dest` 里已经存在非空残骸（中断/断电/磁盘满/被安全软件打断在复制中途留下的半成品），`renameSync` 会以 `ENOTEMPTY` 失败，而代码既不清理也不复用，直接重新抛错**。之后每一次启动都在同一处失败，形成永久性不可启动，只有用户手工删掉该目录才能恢复；而用户看到的是原始 Node 错误，没有任何可操作提示。

最小复现（真实文件系统）：

```
prepareRuntime(src, home) 正常完成 → 删掉 dest/.ready 并放一个残留文件（模拟中断）
→ 再次 prepareRuntime
run1 FAILED code=ENOTEMPTY msg=ENOTEMPTY: directory not empty, rename '<home>/releases/.prepare-XXXX' -> '<home>/releases/<hash>'
run2 FAILED code=ENOTEMPTY msg=（同上，换了个临时名）
```

影响：更新/首次安装后只要复制过程被打断一次，`run-webagent-*.cmd` 全模式（classic/vscode/app/admin/recovery）都不再可用，且错误与磁盘状态无关地复发。`installer/函数详解.md` 第 45 行写到「否则重新抛错」，但**没有披露其后果是永久阻断、也没有自愈路径**，F61 报告亦未列入（其 F56–F58 专项正是启动可靠性）。

建议修复（最小）：`dest` 存在但缺 `.ready` 时，先 `fs.rmSync(dest, { recursive: true, force: true })` 再 rename（或改为「发布到新 hash 目录 + 校验后原子改名」并在失败路径清理），并把错误信息改为「请删除 <dest> 后重试」。验收：制造半成品目录后，下一次 prepareRuntime 能自行恢复并启动；并补一条「重启后仍失败」的负例断言。

## 二、F61 报告核验结论（对照项，非新发现）

三段附录复现脚本（文件/Git/统计/网络参数、真实回环 HTTP、同步 diff）在其 HEAD 与我方分支分别原样执行，输出与其声称**逐字段一致**；F61-01/02/03/05 在我方分支同样复现，04/06 静态确认同在。覆盖账本 `evidence/F61-file-coverage.csv` 873 数据行与其基线 `git ls-tree -r` 跟踪文件数 873 精确一致，分类加总吻合。**未发现其虚报、夸大或掩盖**；其证据分档（复现／静态确认／风险）经复核成立。

## 三、我实测无问题的面（本轮已验证，非「全部无问题」认证）

| 面 | 实测方法与结果 |
|---|---|
| 敏感路径全通道 | 经 MCP `read_files`/`write_file`/`delete_file`/`rename_file`（**含改名为 .env**）全部 `E_FORBIDDEN`；`search_files` 只扫到非敏感文件（`scannedFiles:1`，.env 内容未出现） |
| 工作区逃逸 | 真实 symlink 文件/目录指向工作区外：读、写均被 `Security error: ... outside workspace root` 拒绝 |
| MCP 协议对抗面 | 批量 65 项→400、批内重复 id→400、浮点 id→400、坏 `MCP-Protocol-Version`→400、纯通知→202、混合批量→200、2MB 正文→413、错误 content-type→400、未知会话 GET→404、删后 ping→404、删后重 initialize→200：全部符合预期 |
| 命令子进程清理 | `start_command`→`cancel_command`、`run_command`（`timeoutSec:2`）：用 `pgrep -fc` 统计，子进程计数回到基线，**无泄漏**（注：参数名是 `timeoutSec` 秒，不是 `timeoutMs`） |
| 本地控制面 | `localControl.js` Host 头逐条比对（DNS rebinding）、隧道头、回环 socket 三重；`/api` 与 `/ws` 均先过该关；WebSocket `verifyClient` 同源策略 |
| 打包完整性 | 对 `installer/package.js` 清单逐文件解析相对 `require`，**零缺件**（含新增 `installer/{appWindow,preparation,tunnel-recovery.ps1}`、`agent-host/scripts/tunnel-{cleanup,residue}.js`、`agent-host/src` 全树与 `.ps1/.cs`） |
| 启动编排（appWindow） | 只探固定回环只读入口、64KiB 正文、IPC 消息形状逐字段校验（prepared 恰 4 键/released 恰 1 键）、120s 总期限、读后写前身份双探测、失败不按名称/端口/PID 补杀 |
| OAuth 授权服务器 | PKCE 强制 S256 且 43 位校验、授权码一次性、redirect_uri 注册表精确匹配（`localhost/127.0.0.1/[::1]` 或 https）、令牌端点按 client 鉴权方式校验、限流窗口与 Retry-After 实现完整 |
| CI 工作流 | `permissions: contents: read`、无 `pull_request_target`、无 secrets 引用 |
| 前端改动 | 移动端三视图切换的 dataset/`aria-pressed` 与 CSS 选择器一致；tab 关闭有 `length===1` 守卫与 Delete 键路径；`esc` 转义覆盖（抽查 innerHTML 插值点均过 escapeHtml） |

## 四、文档已披露、F61 未列的相关风险（不计新发现）

- **注册容量 DoS**：`/oauth/register` 未认证即可调用，`clients` 上限 80、只清「无令牌且注册超 5 分钟」的条目；`OAuth授权详解.md` 第 59 行已明确「未配对注册仍能占满短期容量，这是有界拒绝服务风险」——已披露。
- Monaco 走固定版本 CDN（其 O4/R3 已列为待评估）；`/api` 对任意回环来源页面开放（文档写明「仅本机回环」）；`?secret=` 查询凭据为既有产品决策（F54 已裁决不修）。

## 五、未覆盖范围（诚实边界）

Windows 专有路径（`tunnelCleanup.ps1/.cs`、`receiptProtection.ps1` DPAPI、开始菜单入口实际点击、PTY/跨用户/PID 复用）、真实桌面与读屏器、真实浏览器（沙箱无 Chromium）、真实 code-server 冷安装、模型/账号调用、暂停探针模块（`arena-model-probe`、`probe-extension`、`arena-trace-inspector`）本轮**均未认证**。本报告是发现与复现记录，不是「该分支无其他问题」的证明；A1/A2 的修复须在其分支另行红测交付，本报告不代签。
