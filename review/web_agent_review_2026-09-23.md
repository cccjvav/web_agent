# Web Agent 全项目复审报告（只读，未改动任何仓库文件）

- 复审日期：2026-09-23
- 主分支（本会话绑定）：`arena/01a0cb3e-web-agent` @ `08aa942`（= `origin/arena/01a0c932-web-agent`，单个压平根提交，工作树干净）
- 并行分支（第二轮补充复核）：`origin/arena/01a0c925-web-agent` @ `f8ab6d0`（只通过 remote-tracking ref + `git archive` 导出到 `/tmp/c925` 只读检查，没有切换/创建/推送任何分支）
- 本文件位于仓库之外，仓库内零改动。§六 是可直接交给下一位助手执行的修复提示词。

---

## 0. 验证基线（两条分支都实际跑过）

| 项目 | 08aa942（本分支） | f8ab6d0（c925） |
|---|---|---|
| `npm test`（agent-host，`scripts/run-tests.js`） | 101/101 通过 | 107/107 通过（新增 6 个测试文件已登记进 preferred 列表） |
| `node docs-site/check-docs.js` | 282 份，0 updated | 288 份，0 updated |
| `node docs-site/build.js` → `content.js` | 字节一致 | 字节一致 |
| `npm audit --omit=dev --audit-level=high` / `npm outdated` | 0 / 无 | （无 package.json / lock 变化，同左） |
| `examples/calculator` `npm test`；18 个 `.py` `py_compile` | 6/6；全部通过 | 同左（未改动） |
| GitHub CI（精确 SHA） | — | run 35798392830 九个 job 全绿；但其前一个 docs-only 提交 `afac0c8`（run 35795513487）在 `windows-latest/22` 失败于 `tunnelCleanupAcl.test.js`（见 §5.4-5） |
| 沙箱无法覆盖 | Windows/PowerShell/C#、真实浏览器 E2E、VS Code 扩展宿主、cloudflared 隧道、桌面 App 窗口 | 同左 |

结论先行：
1. 本分支（08aa942）存在 6 个 P1 级问题，其中 P1-1（apply_patch 整文件覆盖）与 P1-2（多字节输出被拆成 U+FFFD）在沙箱内已复现。
2. c925 是本分支的严格超集（在 `3dd6447` 全量合并了 08aa942，再叠加 F62 第 1–7 批），**修掉了 P1-2、部分 P1-5 和约一半 P2**，但 **P1-1、P1-3、P1-4、P1-6 及 P1-5 的大部分仍然开放**（P1-1 在 c925 上重新复现成功）。
3. c925 自己新引入 1 个行为回归（Windows `$LASTEXITCODE` 尾语句把 cmdlet 失败变成退出码 0）、1 处合并时丢失的防护（git diff 的 argv 字节预算）、若干文档漂移，以及一个未被记录的 Windows CI 偶发失败（`TunnelAclFixture.Run` 空引用）。
4. 建议后续修复以 c925 为基线（见 §5.6），按 §六 的批次执行。

---

## 一、P1：会造成数据丢失 / 安全绕过 / 核心功能失真（本分支 08aa942）

| # | 位置 | 问题 | 证据 | c925 状态 |
|---|---|---|---|---|
| P1-1 | `agent-host/src/tools/patchEngine.js:392`（`else { patchedContent = applyEol(patch, eol); }`）+ `:344 recalledHash()` | 对**已存在**文件调用 `apply_patch`，若 patch 既没有 `<<<<<<< SEARCH/=======/>>>>>>> REPLACE` 块也不是 unified diff，整个 patch 字符串被当作**新的完整文件内容**写回；而 `readCache.recalledHash()`（持久化在 `read-hashes.json`）自动补齐 expectedHash，导致 `HASH_REQUIRED` 永远不触发。模型漏写标记时，一次调用就把文件替换成一个片段。 | 隔离工作区复现：3 行文件 + 无标记 patch → `success:true, +1 -3`，文件只剩片段。**c925 上重新复现，结果相同。** | **未修** |
| P1-2 | `executor.js:221/225`（`data.toString()` 逐块解码） | stdout/stderr 每个 chunk 独立解码，跨块的多字节 UTF-8 字符被拆成 U+FFFD。 | 240KB 中文输出 → 10 个 U+FFFD | **已修**（`StringDecoder` 每流一个 + `flushDecoders()`，`commandEncoding.test.js` 覆盖） |
| P1-3 | `executor.js:160` Windows `guardedCommand` | 没有设置 `[Console]::OutputEncoding` / `$OutputEncoding` / `chcp 65001`，中文 Windows 上原生程序（git、dir、python 等）经 CP936 输出后按 UTF-8 解码 → 乱码。仓库内已有正确做法可复用：`tunnel/processIdentity.js:38` 显式 `[Console]::OutputEncoding=[Text.UTF8Encoding]::new($false)`。 | 代码审读；沙箱无 Windows | **未修**（c925 的 `commandEncoding.test.js` 全部用 Node 子进程输出 UTF-8 字节，测不到原生代码页问题） |
| P1-4 | `executor.js:160`、`mcp/stdioBridge.ps1:7`、`tests/tunnelCleanupAclFixture.ps1:5` | 每次 `run_command` 都 `Add-Type -Path commandJob.cs`，即每条命令都启动 csc 编译（冷启动 3–30s，且期间零输出）。与 R4 记录的 `commandElapsedMs 30073, stdoutBytes 0` 症状一致。 | 代码审读 + s10 R4 证据 | **未修**（R4 根因仍在 CONTEXT 里标"开放"） |
| P1-5 | `extension/dangerousPolicy.js:39 cmdName(tokens[0])`（extensions-installed 副本同步） | 只看第一个 token，包装前缀和大量破坏性动词绕过：`sudo/env/nohup/xargs/VAR=x/command/busybox/timeout`、`bash -c "…"`/`sh -c`/`cmd /c`/`powershell -Command`、`git branch -D`、`git stash clear`、`npm publish`、`chmod -R 777 /`、`crontab -r`、`kill -9 -1`、`Stop-Computer`、`Format-Volume`、`: > file`。`ptyPolicy.js` 的 EXTRA_DANGER 没有合并进核心。 | 26 例矩阵实测 | **部分修**：c925 剥离 argv 包装器（sudo/doas/nohup/setsid/stdbuf/nice/ionice/time/command/builtin/exec/xargs/env VAR=）。在 c925 上重跑矩阵，仍然放行：`FOO=1 rm -rf /`、`busybox rm -rf /`、`timeout 5 rm -rf /`、`bash -c "rm -rf /"`、`sh -c 'rm -rf ~'`、`cmd /c "rd /s /q C:\x"`、`powershell -Command "Remove-Item -Recurse …"`、`pwsh -c`、`git branch -D main`、`git stash clear`、`npm publish`、`chmod -R 777 /`、`mv src /dev/null`、`crontab -r`、`Stop-Computer`、`Format-Volume`、`kill -9 -1`。 |
| P1-6 | `models/store.js:181 ensureWorkspaceGitignore()`（`:204` 启动时调用） | 启动时改写**用户仓库根目录**的 `.gitignore`。工具进程不应静默修改用户受版本控制的文件。 | 代码审读 | **未修** |

---

## 二、P2：性能、稳定性、协议正确性（本分支 08aa942）

| # | 位置 | 问题 | c925 状态 |
|---|---|---|---|
| P2-1 | `tunnel/cloudflared.js:57-58 findCloudflared()` ← `:283 snapshot()` ← `api/routes.js:77`（status 载荷） | 每次 status 轮询都 `spawnSync where/which cloudflared`，同步阻塞事件循环 | 未修 |
| P2-2 | `utils/executionControl.js:18 permissions()` | 每次工具调用都 `store.load()` 读盘解析 | 未修 |
| P2-3 | `tools/sensitive.js` | `isSensitive` 每个路径都重读 `.webagentignore`；`globMatch` 每次 `new RegExp` | **已修**（stat 身份缓存 + globRegex memo + 512 条/64KiB 上限） |
| P2-4 | `tools/readCache.js persist()` | 每次 read 都整表重写 `read-hashes.json` | **已修**（相同 hash 跳过；tmp+rename 原子发布） |
| P2-5 | `tools/fileOps.js:373` | `grep_search` 每次调用新建 Worker | 未修 |
| P2-6 | `index.js:167` + `tunnel/cloudflared.js:290` | 两个 SIGINT 处理器竞争；没有退出钩子清理 `detached` 的 executor 子进程 | 未修 |
| P2-7 | `mcp/server.js:495 handleGet` | GET 进入 bridge 模式，所有方法都在 `control.run('bridge')` 下；`initialize` 宣告 `tools/resources/prompts.listChanged:true` 与 `logging:{}`（`:207-210`），但从未推送 listChanged 通知 / 日志 | 未修 |
| P2-8 | `agent/openai.js` | 非流式（`:181 chat/completions` 一次性等待）；`step < 10`（`:177`）；每轮工具上限 8（`:15`）；历史 `slice(-12)`（`:162`）；`temperature` 永远发送（`:170`，推理模型会 400）；只支持 chat/completions | 未修 |
| P2-9 | `tools/fileOps.js:214`（1000 条硬上限）、`listDir maxDepth` 上限 8；`workbench/js/tabs.js loadTree` 忽略 `truncated` | 大仓库文件树静默截断 | 未修 |
| P2-10 | `index.js:43` | `express.json({limit:'20mb'})` 应用全局（应仅限文件写入路由） | 未修 |
| P2-11 | `index.js` / `api/routes.js` | 没有 CSP / X-Frame-Options / X-Content-Type-Options；静态资源 `Cache-Control: no-store`（`index.js:27`）；`/health` 暴露版本（`index.js:50`）；`SECURITY.md` 未提到 `x-mcp-secret` | 未修 |
| P2-12 | `auth/github.js`、`usage/tracker.js` 裸 `fetch` | 无超时/字节上限 | **已修**（统一走 `fetchText`，10s/64KiB、10s/256KiB；`networkBudget.test.js`） |
| P2-13 | `utils/requestScope.js fetchText` | 传入的 fetch 实现忽略 `signal` 时期限形同虚设 | **已修**（`Promise.race` 硬超时 `E_TIMEOUT`） |
| P2-14 | `mcp/oauth.js spentRefresh` | 重放墓碑集合无上限（7 天 TTL 内可到 ~60 万条） | **已修**（c925 自己发现，`MAX_SPENT_REFRESH=5000`） |
| P2-15 | `utils/diff.js` | 展示 diff 预算 100ms/4000 编辑过紧、且算法跑两遍 | **已改**（1500ms/20000，单次 `structuredPatch`，错误码 `E_DIFF_LIMIT`→`E_DIFF_BUDGET`；见 §5.4-3 的文档漂移） |

---

## 三、P3：文档时效、元数据、工程卫生（本分支 08aa942）

1. `manager/CONTEXT.md:13`：写着固定分支 `arena/01a0c932-web-agent`、基线 f317c44、97/97，与实际 HEAD/测试数不符。（c925 的 CONTEXT 同样有计数陈旧，见 §5.4-4。）
2. `agent-host/src/api/README.md` 缺 5 条 `/probe/*` 路由（`routes.js:298-302`），只在正文提"由另一专项负责"。**c925 相同。**
3. `agent-host/package.json`：`version 1.0.0`（其余全是 0.7.2）、`main: index.js` 指向不存在的文件、`license ISC` 与根仓库 LICENSE 不一致；根 `package.json` 与 `extension/package.json` 缺 `license`。**c925 相同。**
4. Ask/Plan 模式文档写"只读"，但 `remember`/`board_*`/`set_todos` 在这两个模式下可写。
5. `/api` 鉴权中间件挂载两次（幂等但冗余）。
6. `executor.js:156` 硬编码 `/bin/bash`（Alpine/NixOS 无）；`:171` 注入 `CI=true`（改变 npm/yarn/vitest 等行为，用户不知情）。
7. 严格 UTF-8 读取直接拒绝 GBK 文件（中文 Windows 老项目常见），没有"检测到非 UTF-8 → 提示转码"的友好路径。
8. `extension/package.json:14 activationEvents:["*"]`（拖慢 VS Code 启动；应按命令/视图激活）。
9. `admin-host/app.js`、`scripts/*` 跨包 `require('../agent-host/src/...')`、`probe-extension/` 反向引用——包边界不清。
10. 没有 ESLint/Prettier 配置，CI 只跑测试。
11. `docs-site/content.js`（4.4MB）、`documentation-manifest.json`（1.4MB）、`source-index.md`（744KB）作为生成物入库，每次文档改动都产生巨大 diff。
12. `patchEngine.js:212/221` 用 `={5,}` 识别 SEARCH/REPLACE 分隔，Markdown/表格里的 `=====` 会误判。
13. `mcp/session.js:9` 取 `x-forwarded-for` 作为会话 IP（未信任代理时可伪造）。
14. `run-webagent.sh` 绕过 `installer/launch.js`，与 `.cmd` 行为分叉。
15. `manager/stages/s10-upstream-adoption.md` 1180+ 行（c925 1370+ 行），"当前工作包"与历史批次混排，接手成本高。
16. 探针三模块（`arena-model-probe`、`arena-trace-inspector`、`probe-extension`）按约定暂停，未审查；但根目录仍有 `探针*.md` 入口，新读者容易误入。
17. ~300 张截图（`computer-use/shots`、`review/`）入库。
18. `list_directory` 返回 960/1000 项且未排序——对模型不友好（应排序、目录优先、返回 `truncated` 提示）。
19. `.github/workflows/test.yml` 矩阵 ubuntu/windows × node 18–24 共 9 job，每次 push 全量跑；没有路径过滤（docs-only 提交也跑 Windows 全套，见 §5.4-5 的偶发失败）。
20. 中文文件名（`补丁与路径详解.md` 等）在部分 Windows 工具链/zip 中有编码风险。
21. `SECURITY.md` 缺少 `x-mcp-secret`、`/oauth/*` 速率限制、`--allow-origin` 的说明。

---

## 四、可优化方向（不是缺陷，是收益最大的改造点）

1. **Windows 执行栈重做**：预编译 `commandJob.cs` 为 DLL（按源码 sha256 缓存于 dataDir，`Add-Type -Path *.dll` 毫秒级）+ 统一 UTF-8 输出编码 + 可选常驻 job-host，一并关闭 R4 根因、P1-3、P1-4。
2. **工具层数据安全**：`apply_patch` 对已存在文件拒绝无标记 patch（要求显式 `mode:'overwrite'` 或走 `write_file`）；`recalledHash` 只用于 `dryRun`/提示，不再静默满足 hash 要求。
3. **热路径缓存**：`permissions()`、`findCloudflared`、grep Worker 池、文件树增量。
4. **Chat 体验**：SSE 流式、Markdown 渲染、推理模型参数适配（不传 temperature）、可配置 step/tool 上限。
5. **MCP 清理**：不宣告未实现的能力；GET 不进入 bridge 模式；`x-mcp-secret` 文档化。
6. **安全头与缓存策略**：CSP/frame-ancestors/nosniff；静态资源 immutable 缓存，API 才 no-store。
7. **文档治理**：`check-docs.js` 只校验生成区，正文错误码/数值漂移检测不到——增加"正文中的 `E_*` 错误码与源码导出集合一致性"检查；把 s10 的"当前工作包"拆成独立短文件。
8. **工程基线**：ESLint（no-unused-vars/no-empty）、CI 路径过滤、生成物移出 Git 或用 LFS。

---

## 五、并行分支 `arena/01a0c925-web-agent`（f8ab6d0）复核

### 5.1 关系与结论
- c925 由 `01a0c4b1` 分出，ff 到 `01a0bfa9`，叠加 F62 第 1–7 批，并于 `3dd6447` **全量合并了本分支 08aa942**（含 200 份 Markdown 时效核对），最后 `f8ab6d0` 补台账。相对 08aa942：84 个文件，+8380/−4601（含生成物；纯源码/测试约 +2961/−419），无依赖变化。
- 它的自述台账 `review/CROSS_VALIDATION_LEDGER_2026-09-22.md` 与实际代码基本一致（我逐文件 diff 核对了 executor/dangerousPolicy/gitOps/sensitive/boundedFile/diff/requestScope/routes/oauth/errors/github/tracker/readCache/patchEngine/fileOps/admin app/run-code-oss/workbench）。
- **确实"推进得更多"**：P1-2、P2-3、P2-4、P2-12、P2-13、P2-14、P2-15 已修，P1-5 部分修，另加 git diff 敏感路径/子目录/重命名双侧过滤、admin 坏存储 fail-closed、严格 UTF-8 + BOM 保留、字号 rem 化。
- **"缺漏"部分**见 5.3 与 5.4。

### 5.2 c925 已修/已吸收（我独立验证的方式）
| 项 | 验证 |
|---|---|
| A1 多字节输出拆分（=P1-2） | diff 确认 `StringDecoder` 每流一个、`error`/`close` 都 `flushDecoders()`；`commandEncoding.test.js` 在沙箱通过 |
| A2 argv 包装器剥壳（P1-5 一部分） | 27 例矩阵实测：`sudo/env/env -i/nohup/xargs/command/doas/sudo -u root/sudo --/nice -n 10` 前缀均被拦截 |
| X1 git diff 敏感/越界/重命名 | 读 `gitOps.js` 全文：先 `--name-status -z -M --no-relative` 枚举，双侧任一敏感或跨边界即整条剔除，再以白名单跑内容 diff，`truncated/omittedFiles/excludedSensitivePaths` 如实上报 |
| X2 严格 UTF-8 + `ignoreBOM:true` + `readBoundedJsonText` | `boundedFile.js` diff；`textEncoding.test.js` 通过 |
| X3 diff 预算 | `diff.js` diff；`diffBudget.test.js` 通过 |
| X4 admin 坏存储 | `app.js` diff：`E_STORE_CORRUPT`、tmp+rename、mode 0600 |
| C1 身份请求生命周期 / B1 依赖准备 120s | 本分支 08aa942 已有，c925 合并后保留（diff 只剩注释） |
| P2-3/P2-4/P2-12/P2-13/P2-14 | 见 §二 |
| A3 字号 | `styles.css` 0 处 px 字号残留；A-/A+ 控件 + localStorage 持久化 |

### 5.3 c925 上仍开放的问题（来自 §一/§二/§三）
- **P1-1 apply_patch 整文件覆盖——在 c925 上原样复现**（`success:true +1 -3`）。`patchEngine.js` 在 c925 只改了新建文件分支的注释/顺序。
- **P1-3 Windows 输出编码**、**P1-4 每命令 Add-Type 编译**、**P1-6 启动改写 .gitignore**：相关文件在 c925 无对应改动。
- **P1-5 剩余绕过**：见 §一 表格 c925 列（17 例仍放行）。其中 `cmd /c …` 与 `powershell -Command …` 在 Windows 上是模型最常写的形式，不该归为"字符串再解析、超出范围"——未加引号时它们就是 argv 形式，可与 `sudo` 同法剥壳；`VAR=x cmd` 的裸赋值前缀、`busybox`、`timeout N` 也是 argv 形式。动词表（git branch -D / stash clear / npm publish / chmod -R / crontab -r / kill -9 -1 / Stop-Computer / Format-Volume）与 `ptyPolicy.js` 的 EXTRA_DANGER 仍未合入核心。
- P2-1/2/5/6/7/8/9/10/11、§三 全部项：均未触及（c925 未改 `index.js`、`tools/index.js`、`executionControl.js`、`store.js`、`agent/openai.js`、`mcp/server.js` 主体、任何 `package.json`、CI 配置、`SECURITY.md` 的 `x-mcp-secret`）。
- c925 台账 §6 自列的未审面：`mcp/server.js`、`extension.js`、`ptyHost.js`、`bridge.js`、`operations.js`、workflows、`installer/preparation.js`、`computer-use/win`。
- c925 CONTEXT 记录 `origin/arena/01a0c5ba-web-agent`（33bd177，3 个提交：`bbf22e7 await editor ensure and recheck identity after open`、`a208576 docs`、`33bd177 retry post-open probes and keep preparation timers`；触及 `extension.js`、`ensure-code-server.js`、`installer/launch.js`、`appWindow.js` 及测试）**仍未合并，去留待定**——这是一个悬而未决的分叉。

### 5.4 c925 新引入或合并遗留的问题
1. **[P1 级回归] Windows 退出码尾语句（`cc3675c`，`executor.js:166-168`）**
   `guardedCommand` 末尾追加 `if ($null -ne $LASTEXITCODE) { exit $LASTEXITCODE }`。修复了"原生程序退出 3 被报成 1"，但引入反向错误：当用户命令**只含 cmdlet 且以非终止错误失败**（`Get-Item missing.txt`、`Remove-Item nonexist`、`Copy-Item` 失败等），`$LASTEXITCODE` 仍为 `$null`，这个 `if` 成为最后一条语句且 `$?` 为真 → **进程退出 0**，而修复前会退出 1。混合情况 `node ok.js; Get-Item missing` 同样变成 0。`commandEncoding.test.js` 只断言了 `node failing.js → 3`，没有 cmdlet 失败用例。
   建议形态：`$__ok = $?; if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } elseif (-not $__ok) { exit 1 } else { exit 0 }`，并补 Windows-only 测试：`Get-Item (Join-Path $PWD 'nope.txt')` 期望 `exitCode != 0`。需在 Windows CI 上验证（沙箱无 pwsh）。
2. **[P2] 合并时丢失 git diff 的 argv 字节预算**
   08aa942 的 `gitOps.js` 用"≤80 条路径且 ≤12000 字节"限制内容 diff 的命令行（注释明确写着"Bound argv on Windows as well as Unix"），并在内容 pass 加 `--no-renames`、对每侧再过一遍 `resolveSafePath`。c925 合并后改为固定 `MAX_DIFF_PATHSPECS=300`，**没有字节预算**：Windows `CreateProcess` 命令行上限 32767 字符，300 条 100+ 字符的 monorepo 路径会超限，`spawnSync` 直接 `r.error` → 抛 `E_INTERNAL: git failed to start`，大改动集下 `git_diff` 整体失败（原先是优雅降级 `truncated:true`）。建议改用 `--pathspec-from-file=- --pathspec-file-nul` 经 stdin 传路径（git ≥2.25），或恢复字节预算。另：`git()` 每次调用都先 `git config --get-regexp filter.*` 再跑真正命令，`gitDiff` 一次要 **6 次同步 spawn**（`gitStatus` 4 次），Windows 上每次 50–150ms，全部阻塞事件循环——可按工作区缓存 filter 覆盖参数和 `--show-prefix`。
3. **[P3] 合并后的文档漂移（`check-docs.js` 测不到，因为它只校验生成区）**
   - `agent-host/src/tools/README.md:45`：仍写 `E_INVALID_TEXT`、`算法100ms/4000编辑`、`E_DIFF_LIMIT`；实际是 `E_ENCODING`、1500ms/20000、`E_DIFF_BUDGET`。
   - `agent-host/src/tools/补丁与路径详解.md:59、63、67`：同上三处旧错误码/旧预算。
   - `admin-host/统计服务详解.md:57`：`500/E_REPORT_STORE`，实际 `E_STORE_CORRUPT`。
   - 台账 §11 自己写了"错误码差异不是行为差异"，但只改了测试没改正文。
   - `commandEncoding.test.js:82-84` 注释称"Windows cmd.exe 不提供 printf/>&2/;"，而 Windows 执行器用的是 powershell.exe（`;` 合法、`>&2` 不合法）——注释与实现不符。
4. **[P3] `manager/CONTEXT.md` 计数/状态陈旧**
   - 第 13 行"本地104/104通过"——合并后 107 个测试文件（本地实跑 107/107）。
   - 第 8 行"F62独立复审已交付3批"——s10 与 git log 显示第 1–7 批。
   - 第 11 行"仍待修：`reports.json`无条数上限与轮转"——合并后 `MAX_REPORTS=10000` 已生效（轮转仍无），应改口径。
   - s10 第 1 批表格 F62-02 写"status/diff一律附 `-- .`"，最终代码里元数据 pass 刻意**不**加 `-- .`（为看见跨边界重命名），批次表未随之更正。
5. **[P2] 未记录的 Windows CI 偶发失败**
   docs-only 提交 `afac0c8`（run 35795513487）`windows-latest/22` 失败：`tunnelCleanupAcl.test.js:19` — `Exception calling "Run" … Object reference not set to an instance of an object`，随后 `fixture-target-exited` 正常打印（说明 NRE 发生在 `fixture-privileges-disabled` 之前）。对照 `tests/tunnelCleanupAclFixture.cs:114 child.MainModule.FileName`：.NET Framework 在进程刚创建、模块表尚未就绪时 `EnumProcessModules` 返回 `ERROR_PARTIAL_COPY`，重试耗尽后 `MainModule` 为 **null** → NRE。这是夹具竞态而非产品缺陷，但：(a) c925 任何 .md 里都没有这次失败的记录，与"每批必查 CI 结论、失败不注销"的自定规则矛盾；(b) 修法明确——用产品代码已有的 `QueryFullProcessImageName(targetHandle)`（`tunnelCleanup.cs:28`）或直接使用已知的 `program` 路径，不再依赖 `MainModule`。产品侧 `tunnel/processIdentity.js:38` 也用 `$p.MainModule.FileName`，同类竞态会把刚启动的隧道进程判成 `unknown`（有兜底，不致命）。
6. **[P3] A-/A+ 字号缩放与固定 px 布局高度冲突**
   `styles.css:34-36` `--title:30px; --status:22px; --activity:48px`、`.tabs height:35px`（`:107`）、`.panel-head height:28px`（`:178`）仍是 px；`html{font-size:calc(100%*var(--text-scale))}` 放大到 140–160% 时，状态栏（22px 高）里 `--fs-sm` 变 17–19px 会溢出/裁切。c925 自己也承认"UI 改动只有静态断言与 DOM 夹具证据、无真实浏览器"。建议这些高度改 rem 或 `min-height + auto`。
7. **[P3] 输出窗口按 UTF-16 code unit 截断**
   `executor.js:84 publicRecord()` 的 `tail` 与 `MAX_CAPTURE` 切片都用 `String.prototype.slice`，astral 字符（emoji、CJK 扩展 B）落在边界时留下孤立代理项（沙箱验证：`'😀'.repeat(3).slice(-1)` → `"\ude00"`）。c925 测试只用 BMP 字符 `中` 验证"整字符"。两条分支同样存在。
8. **[P3] 新增测试对基线的依赖**
   `sensitiveBoundary.test.js` / `diffBudget.test.js` 等新测试都依赖真实 `git` 与 CPU 时间预算（`WEBAGENT_DIFF_TIMEOUT_MS` 默认 1500ms），慢 CI runner 上有偶发风险；建议测试内显式设更宽松的环境变量。

### 5.5 c925 值得保留的好实践（后续基线应沿用）
- 每个修复先在基线上"红测"再修（`git stash` 验证）；测试文件登记到 `run-tests.js` preferred 列表。
- 跨分支合并逐冲突裁决并写台账（§11），错误码取舍有理由。
- `fetchText` 的双注入口（`options.fetchImpl` / 位置参数）保持测试可注入。
- `readBoundedJsonText` 把"BOM 保留（hash 忠实）"与"JSON 解析需去 BOM"分离，避免两个需求互相打架。

### 5.6 基线选择建议
- **以 c925（f8ab6d0）为后续修复基线**：它是 08aa942 的超集，CI 精确 SHA 全绿，且已包含本分支的全部文档时效工作。本分支 08aa942 保持冻结即可。
- 若本会话必须留在 `arena/01a0cb3e-web-agent`，可以把 c925 的差异作为补丁合入（无依赖变化、无冲突文件——c925 已经是合并后的状态，`git diff 08aa942 f8ab6d0` 可直接 apply），然后按 §六 施工。**这一步需要用户明确授权后再做，本轮未动。**
- 无论哪条基线，§六 第 1 批（P1-1 / 5.4-1 / 5.4-2）应最先做。

---

## 六、可直接交给下一位助手的修复提示词

> 使用方法：整段复制给执行修复的助手（或本助手下一轮）。基线建议为 `origin/arena/01a0c925-web-agent@f8ab6d0`（若留在当前分支，先按 §5.6 合入 c925 差异）。每一批独立提交、独立跑 `npm test` + `node docs-site/check-docs.js --write` + `node docs-site/build.js`，并核对精确 SHA 的 CI 九个 job；Windows 相关改动必须看 windows-latest 三个 job 的真实结论，不以本地 Linux 绿灯代签。

```
你在仓库 cccjvav/web_agent 的 <当前 Arena 绑定分支> 上工作（不要切换/创建/推送其他分支）。
遵守 AGENTS.md / manager/agents.md：只用 JavaScript，不改 webagent-repro/、不接手三个暂停的探针模块，
extension/ 与 extensions-installed/webagent.webagent-core-0.7.2/ 必须字节一致（extensionCopy.test 会检查）。
每批完成后：npm test（webagent-core/agent-host）、node docs-site/check-docs.js --write、node docs-site/build.js，
同步更新 manager/CONTEXT.md（≤80 行）与 manager/stages/s10-upstream-adoption.md 的工作包表，然后提交并核对精确 SHA 的 CI。
先写会在基线上失败的测试，再修。

第 1 批（数据安全，最高优先）
1. patchEngine.js：对已存在文件，patch 既无 SEARCH/REPLACE 块也不是 unified diff 时，拒绝并返回
   E_BAD_ARGS（提示改用 write_file 或显式 mode:'overwrite'），不得整文件覆盖；recalledHash 只允许在 dryRun
   或"内容级校验通过"的路径上满足 hash 要求，否则返回 HASH_REQUIRED。补测试：无标记 patch 对已有文件 → 拒绝且文件字节不变。
2. executor.js Windows guardedCommand 尾语句改为：
   $__ok = $?; if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) { exit $LASTEXITCODE } elseif (-not $__ok) { exit 1 } else { exit 0 }
   补 Windows-only 测试：纯 cmdlet 失败（Get-Item 不存在路径）→ exitCode≠0、status 'error'；node 退出 3 仍为 3；成功命令为 0。
3. gitOps.js：内容 diff 的路径改经 stdin 传递（--pathspec-from-file=- --pathspec-file-nul），或恢复 08aa942 的
   "≤80 条且 ≤12000 字节"预算并保留 pathspecCapped 上报；内容 pass 加回 --no-renames；把 filter 驱动覆盖参数与
   --show-prefix 按工作区缓存（文件系统身份或 TTL），把 gitDiff 的同步 spawn 次数从 6 降到 ≤2。
4. store.js：删除启动时 ensureWorkspaceGitignore() 对用户仓库 .gitignore 的改写；把 WebAgent 自己的数据目录放到
   .git/info/exclude 或 dataDir 之外，文档说明。

第 2 批（Windows 执行栈）
5. commandJob.cs / stdioBridge.cs / tunnelCleanup.cs：改为按源码 sha256 预编译到 dataDir/compiled/<sha>.dll，
   Add-Type -Path 该 dll；编译失败才回退源码编译并给出可见错误；记录首启编译耗时到 R4 诊断元数据。
6. guardedCommand 开头设置 [Console]::OutputEncoding=[Text.UTF8Encoding]::new($false); $OutputEncoding=同上；
   补 Windows-only 测试：cmd /c echo 中文 与 git status 含中文路径 的输出无 U+FFFD。
7. tests/tunnelCleanupAclFixture.cs:114/116：不再用 Process.MainModule（进程刚创建时可能为 null），改用
   QueryFullProcessImageName(handle) 或已知 program 路径；把 run 35795513487 的失败写入 s10/CONTEXT 的失败记录。
8. publicRecord()/MAX_CAPTURE 切片改为按码点（Array.from 或正则 /[\s\S]/gu）截断，避免孤立代理项。

第 3 批（危险命令策略）
9. dangerousPolicy.js：
   a) 剥壳表增加 busybox、timeout [N]、doas/sudo 已有；裸 VAR=value 前缀（允许多个）；
   b) cmd /c、cmd.exe /c、powershell/pwsh -c/-Command/-EncodedCommand（-EncodedCommand 直接判危险或 base64 解码后再判）、
      bash/sh/zsh -c "<字符串>"：解出字符串后递归 tokenize 再判定（有引号也处理）；
   c) 合并 ptyPolicy.js EXTRA_DANGER，并新增动词：git branch -D/--delete --force、git stash clear/drop、git push --force*
      （非 --force-with-lease）、npm publish/unpublish、chmod/chown -R 指向 / 或 ~、crontab -r、kill -9 -1、
      Stop-Computer/Restart-Computer/Format-Volume/Clear-Disk/Remove-Partition、mv <path> /dev/null、: > <file>；
   d) 用 26+17 例矩阵做表驱动测试，同时同步 extensions-installed 副本。

第 4 批（热路径与稳定性）
10. executionControl.permissions()：缓存 store.load() 结果，store.save 时失效。
11. cloudflared.findCloudflared：缓存结果（成功永久、失败 30s），/api/status 不再同步 spawn。
12. grep_search：Worker 复用（单 worker + 队列）或至少并发上限；listDir 返回 truncated 时 workbench 树显示提示。
13. index.js：统一 shutdown（移除 cloudflared.js:290 的独立 SIGINT），退出时 killChild 所有 executor 子进程；
    express.json 20mb 只挂在文件写入路由，其余 1mb。
14. 安全头：CSP（self + inline 样式白名单）、X-Frame-Options/frame-ancestors、X-Content-Type-Options；
    静态资源 Cache-Control 改为按 hash 的 immutable，API 保持 no-store；/health 去掉版本或需鉴权。

第 5 批（文档与元数据）
15. 修正 §5.4-3 列出的旧错误码/预算正文（tools/README.md:45、补丁与路径详解.md:59/63/67、admin-host/统计服务详解.md:57）；
    在 check-docs.js 增加"正文出现的 E_* 错误码必须存在于源码"校验。
16. api/README.md 补 5 条 /probe/* 路由（标注属暂停专项，仅登记）。
17. package.json：agent-host 版本对齐 0.7.2、main 指向 src/index.js 或删除、license 与根 LICENSE 一致；根与 extension 补 license。
18. CONTEXT.md：测试计数、批次数、reports.json 口径按实际更正；s10 拆出"当前工作包"短文件，历史批次移到归档。
19. SECURITY.md：补 x-mcp-secret、/oauth 速率限制、--allow-origin。
20. Ask/Plan 模式文档：明确 remember/board_*/set_todos 可写，或在代码里按模式禁用。
21. CI：docs-only 改动跳过 Windows 矩阵（paths-ignore），并加 ESLint（no-unused-vars、no-empty）。
```
