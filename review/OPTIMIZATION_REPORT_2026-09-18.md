<!-- 定位：2026-09-18 全仓检查与优化建议报告，供接手助手交叉审查；不是语义认证，也不代替逐句审查清单。 -->

# 全仓检查与优化报告（2026-09-18）

作者：本会话施工助手（Arena 固定分支 `arena/01a0b0da-web-agent`）。
检查基线：`e5c83637534ad3515a3d949447786c2eebd59792`（工作树干净，远端同 SHA）。
用途：交给下一位助手做**交叉审查**——每条结论都给出可复现命令或 `文件:行`，请先复核再采信。
不是：语义认证、用户实机验收、性能压测结论，也不是“全部完成”报告。

> **2026-09-18交叉复核更新：** 第45组已逐项核对本报告。P1-A七个结果消费者、P2-D设备码并发和P2-A审计门禁已经修复；P2-B/C/E与P3仍为取舍/维护候选。不要再把下文的原始发现表当成当前未修清单；处置、回归与剩余边界见[全仓交叉审查与实修报告](FULL_AUDIT_FOLLOWUP_2026-09-18.md)。原文保留用于追溯当时证据。

---

## 1. 检查方法与可复现命令

在仓库根执行（Node ≥18，先 `npm ci --prefix webagent-core/agent-host`）：

```sh
git status --short && git rev-parse HEAD          # 工作树与基线
npm test --prefix webagent-core/agent-host        # 完整测试套件
node docs-site/check-docs.js && node docs-site/build.js   # 文档清单/构建一致性
npm audit --omit=dev --prefix webagent-core/agent-host    # 生产依赖审计
gh run view <run-id> --json headSha,conclusion,jobs       # 精确提交 CI 九项
```

本次实际输出（关键数字，非摘要推断）：

| 检查 | 结果 |
|---|---|
| 完整测试 | **83 个测试文件通过**（`83 test files passed`） |
| 文档清单 | `{"files":247,"directories":28,"excluded":110,"updated":0}`；`content.js` 在基线提交为 3473871 字节（每批文档改动都会重写，接手后数字会不同） |
| 依赖审计 | `found 0 vulnerabilities`（`--omit=dev`） |
| 实现提交 CI | `db85323` → [CI35332743748](https://github.com/cccjvav/web_agent/actions/runs/35332743748) 九项逐项成功 |
| 证据提交 CI | `e5c8363` → [CI35333059059](https://github.com/cccjvav/web_agent/actions/runs/35333059059) 九项逐项成功 |
| 九项构成 | Ubuntu Node 18/20/22/24、Windows Node 20/22/24、windows-installer、workbench-browser |

仓库规模：829 个跟踪文件；核心 JS 188 个（不含 `extensions-installed` 副本）27778 行；测试 83 个；Markdown 195 个；`.git` pack 60.74 MiB。

---

## 2. 已确认健康项（避免接手助手重复怀疑）

以下都做了实际检查，不是推测：

- **无 TODO/FIXME 债务**：`git grep -nE 'TODO|FIXME|HACK|XXX'` 仅 3 处命中，全部是误报（`package-lock.json` 的 integrity 哈希、`progressTracker.js:6` 的 `MAX_TODOS` 常量、`webagent-repro` 的工具描述文案）。
- **无危险动态执行**：`git grep -nE 'shell: *true|\beval\(|new Function\('` 在 `webagent-core/**/*.js` 无命中。
- **无真实凭据入库**：模式扫描只命中 `tests/eventBus.test.js` 的固定脱敏夹具（`sk-abcdefghijklmnopqrstuvwxyz` 等），该测试正是断言这些值不出现在事件流里。
- **依赖极少且干净**：生产依赖只有 `express 5.2.1`、`cors 2.8.6`、`diff 9.0.0`、`ws 8.21.3`；开发依赖 `acorn 8.18.0`、`playwright 1.63.0`（锁定版本）。审计 0 漏洞。
- **文档守卫真实生效**：`documentationPolicy/Quality/Learning/Links/docsSite` 会因清单漂移、坏链接、新测试文件缺说明、命名函数未登记而失败——本会话已实际触发过两次（新增测试文件未映射、`show/dispose` 符号未说明），不是空守卫。
- **CI 覆盖面**：7 个主机矩阵 + Windows 安装器（含 C#/PowerShell 编译与 Inno 编译）+ 真实 Chromium 页面回归；Windows 还重复跑 5×`ptyLifecycle`、2×`stdioMcp` 抗抖动。

---

## 3. 发现与建议（按优先级）

分级含义：**P1** 会造成用户看到错误结果或数据展示错误，建议尽快修；**P2** 工程化/维护性；**P3** 取舍型，需项目主人决定。

### P1-A：仍有 6 处“请求发出即当成功”的界面消费者

第41–43组已修密钥轮换与 Bridge 启停（经典页 + 原生扩展），但同一类缺陷在其他控件仍在。全部由本次逐行阅读确认：

| 位置 | 现象 | 用户可见后果 |
|---|---|---|
| `webagent-core/workbench/js/bind.js:221-229` | `#btn-gh-login` 只 `await fetch('/api/bridge/login')`，不看 `res.ok`/`data.success`，随后无条件 `state.loggedIn = true` 并 toast | 主机拒绝或 500 时仍显示“已打开本机演示授权” |
| `webagent-core/workbench/js/bind.js:276-280` | `#btn-gh-clear` 同样不消费响应就 toast“已清除 GitHub 身份” | 清除失败时界面宣称已清除 |
| `webagent-core/workbench/js/bind.js:497-506` | `#lnk-new-file` PUT `/api/files/content` 后直接 `loadTree()`+`openFile(name)` | 写入被拒（路径越界/400）时打开一个不存在的文件且无错误 |
| `webagent-core/workbench/js/bind.js:518-533` | `#term-form` 只取 `data.result.stdout/stderr`，忽略 `res.ok` 与 `data.success` | 命令被拒/失败/审批中时终端一片空白，看起来像“没输出” |
| `webagent-core/workbench/js/bind.js:534-547` | `#btn-search` 失败时落到 `|| '没有命中'` | 请求失败被表述为“搜索无结果” |
| `webagent-core/workbench/js/chat.js:235-242` | `apply_patch` 后 `.then(r=>r.json())` 不校验状态，直接 `tab.content = d.content` | 读取失败时把编辑器内容置为 `undefined`（磁盘未坏，但视图被清空） |
| `webagent-core/extension/ptyHost.js:152-163` | `poll()` 直接读 `r.json.jobs`，不看 `r.status` | 身份/工作区 409 时静默当成“没有待批任务” |

建议动作：沿用第41–43组已落地的同一套合同（HTTP 状态 + `success` 严格布尔 + 明确“未确认/已确认但读取失败”文案 + 不自动重试 + 期限），逐控件红测后修；每处都要有失败负例，不接受“看起来没问题”。
验收：`workbenchRuntime`/`nativeRotationCommands` 增加对应断言；不新增跨标签锁或幂等承诺。

### P1-B：管理文档计数曾经与事实不符（本批已修正）

本次核对发现两处我自己写错的数字，已在同批修正，记录在此供交叉审查：

- `manager/CONTEXT.md` 基线行写“本地82测试文件通过，246源码/28目录/110排除”，而当前实际是 **83 个测试文件、247 源码**（`check-docs` 输出）。
- `review/SEMANTIC_REVIEW_2026-09-16.md` 的 F43 行写“197项逐句7、局部30、待103口径不变”，却同时说明本批把两篇改为局部——自相矛盾。实际清单为 **197 个文件行**，状态分布：已逐句 7、局部 32、待逐句 101、待历史定位 32、暂停 15、待边界 7、生成定位 1、只读规范 1、受限证据 1。

建议动作（流程改进，已写入 `manager/docs/experience.md`）：**每批结束前用命令重算数字**，不要沿用上一批文案：

```sh
npm test --prefix webagent-core/agent-host | tail -3
node docs-site/check-docs.js
awk '/^## 逐文件状态/,0' review/FULL_REVIEW_INDEX.md | grep '^|' \
  | grep -oP '\| \K[^|]+(?= \| [0-9a-f]{16}|\| 不读取)' | sort | uniq -c
```

### P2-A：CI 里 `npm audit` 永不失败

`.github/workflows/*.yml` 的 `Audit production dependencies` 步骤带 `continue-on-error: true`。今天审计为 0 漏洞，但一旦上游出高危公告，CI 仍会全绿。
建议：保留 `continue-on-error` 的同时，把审计结果写成 job summary 或 artifact，并在 `manager/stages` 的每批证据里记一行“审计 N 漏洞”；或直接改成失败即红（需项目主人同意，因为可能因上游公告阻塞施工）。

### P2-B：CI 矩阵包含两个已 EOL 的 Node 版本

矩阵为 `ubuntu × {18,20,22,24}` + `windows × {20,22,24}`，`package.json` 声明 `engines: node >=18`。按当前日期（2026-09），Node 18 与 Node 20 均已过维护期，7 个主机任务里有 3 个跑在 EOL 运行时上。
建议：与项目主人确认后收缩为 `{22,24}`（+可选 current），把省下的矩阵时间用于 P1-A 的新增回归；同时更新 `engines` 与 Windows 指南的最低版本说明。这是产品决策，不是纯技术清理，未擅自改动。

### P2-C：没有 lint/format 配置

仓库无 `.eslintrc*`/`.prettierrc`/`.editorconfig`（`git ls-files` 无命中）。当前质量靠测试与文档守卫，但“未使用变量、误写全局、`==`、遗漏 await”这类问题只能靠人眼。
建议：加最小 ESLint（`no-undef`、`no-unused-vars`、`require-await`、`eqeqeq`）+ CI 一步；**先只报错不改风格**，避免一次性大 diff 淹没语义审查。注意 `webagent-repro/` 为冻结目录，需 ignore。

### P2-D：设备码轮询缺 catch/去重/中止（已在文档标注为已知）

`webagent-core/workbench/js/bind.js:246-272`：`tick()` 无 `try/catch`（网络错误会成为未处理拒绝），无代次去重，重复点击可产生多条并行轮询链。该限制在 `webagent-core/extension/入口与Webview详解.md` 与 `交互绑定详解.md` 已如实写明，但代码未修。
建议：加 `AbortController` + 轮询代次 + `tick` 内 catch；与 P1-A 同批做，复用已有单飞模式。

### P2-E：单文件过长，影响逐句审查与定位

行数（`wc -l`）：`tests/workbenchRuntime.test.js` 1137、`tests/workbench.browser.js` 827、`extension/extension.js` 733、`src/api/routes.js` 649、`workbench/js/bridge.js` 643、`src/tools/index.js` 581、`src/agent/runChat.js` 581、`workbench/js/bind.js` 576。
建议：**不要为拆而拆**。优先只拆 `routes.js`（按 bridge/files/mcp/execution 分域，路由行为不变，测试可原样跑）；测试文件按“功能组”拆分前必须先确认 `run-tests.js` 的 `preferred` 顺序与文档映射同步，否则会触发文档守卫失败（本会话已实际遇到）。

### P3-A：仓库权重与生成物churn

- `docs-site/content.js` 3396 KiB，且 **33/33 个本地可见提交都修改了它**——每次文档改动都产生一个大 diff。
- `review/shuncode-ui/` 参考截图约 13 MB（单张最大 844 KiB），是上游对照资料，不是产品资产。
- `webagent-core/extensions-installed/`（136 KiB）是 `webagent-core/extension/`（140 KiB）的重复副本，由 `extensionCopy.test.js` 按字节比较守卫。

建议（三选一或组合，均需项目主人决定，未擅自改）：
1. 保持现状（最稳，代价是 diff 噪声与 clone 体积）；
2. `content.js` 改为构建期生成 + `.gitignore`，文档站测试改为“构建后比对内存结果”（需要同时改 `docsSite.test.js` 与 `docsHttp`，属于有风险的改动）；
3. 截图移到 Release 资产或 Git LFS，仓库只留索引。
副本目录不建议删除：安装器/code-server 同步依赖它，且字节比较守卫是本会话验证过会真实失败的。

### P3-B：沙箱/交接环境的两个事实（会误导新助手）

本会话反复遇到“HEAD 看起来回到旧提交、但文件是最新”的现象，根因已查清：

```sh
$ ls .git/shallow && git rev-list --count HEAD
.git/shallow            # 浅克隆
33                      # 本地只有 33 个提交
$ git config --get-all remote.origin.fetch
+refs/heads/main:refs/remotes/origin/main    # 只跟踪 main
$ git rev-parse origin/arena/01a0b0da-web-agent
fatal: ambiguous argument ...                 # 没有该远端跟踪引用
```

含义：
1. 本地历史被截断，`git log`/`git blame` 不能当作完整项目史；完整历史在 GitHub。
2. 没有 `origin/<工作分支>` 引用，必须用 `git ls-remote origin refs/heads/arena/01a0b0da-web-agent` 或显式 `git fetch origin <branch>` + `FETCH_HEAD` 核对远端。
3. 若发现 ref 与工作树不一致：**先备份真实差异**（`git diff --binary HEAD > /path/before.patch`），再用 `git fetch` + `git diff --quiet FETCH_HEAD --` 证明工作树等于远端，最后才 `update-ref`/`read-tree`。不要 `reset --hard`、`clean -fd` 或整树覆盖。该流程已写在 `manager/stages/s10-upstream-adoption.md` 的“新助手第一小时”，本会话按它执行且零文件损失。

### P3-C：逐句审查进度与推进策略

197 个文件行中只有 **7 项已逐句核对、32 项局部核对**，101 项待逐句、32 项待历史定位、15 项暂停（探测）、7 项待边界。按当前节奏（每批 1–2 篇局部）收敛很慢。
建议：
- 每包固定“1 个功能修复 + 1 篇高风险文档逐句”，高风险优先序：`src/api/路由逐项详解.md` → `src/mcp/OAuth授权详解.md` 剩余段 → `src/tools/*详解.md` → `workbench/js/*详解.md`。
- 历史归档 32 项不必逐句，只核对“归档/引用/证据”三件事，可批量降级为一次性核对。
- 暂停的 15 项（探测）在外部交接前不要动。

---

## 4. 明确不建议做（避免越界）

- 不改 `webagent-repro/`（冻结原型，项目约定禁止改 JS）。
- 不把“未知结果”改成自动重试/自动重放；不新增跨进程锁、跨标签幂等或“停止即所有进程退出”的承诺。
- 不用 TypeScript 重写，不引入框架级重构（项目约定：JavaScript，禁止 TS 重写）。
- 不把 CI 绿灯当用户实机验收；M1–M5 本机清单、Windows 人工项、手机连接范围仍以 `review/CHECKLIST_WINDOWS.md` 为准。
- 不动探测专项（阶段8 暂停，等外部正式交接）。
- 历史 Windows22 两项超时（`36ff82f` / CI35125290301）根因未定位，**不要**因为后续绿灯就宣布已修。

---

## 5. 建议的下一包顺序（每包都要红测 + 精确 CI）

| 顺序 | 内容 | 完成标准 |
|---|---|---|
| 1 | P1-A 前 3 项（gh-login / gh-clear / new-file） | 每处失败负例断言“未确认”，不再无条件成功；全量测试 + 九项 CI |
| 2 | P1-A 后 4 项（term-form / search / apply_patch 后读 / ptyHost.poll） | 同上，另加“失败不得显示为无结果/空内容” |
| 3 | P2-D 设备码轮询 + P2-A 审计可见化 | 轮询可中止且不并行；审计结果进入 CI 可见位置 |
| 4 | P2-C 最小 lint（只报错不改风格） | CI 一步通过，`webagent-repro/` 已 ignore |
| 5 | P2-E 只拆 `routes.js` | 路由行为与测试不变，文档映射同步 |

---

## 6. 给接手助手的交叉审查清单

请逐条复核，不要直接采信本报告：

1. `git rev-parse HEAD` 是否仍是 `e5c8363…`；`git status --short` 是否干净；`git ls-remote` 是否同 SHA。
2. `npm test --prefix webagent-core/agent-host` 是否 83 个文件全通过（不是 82——82 是第43组之前的数字）。
3. `node docs-site/check-docs.js` 是否输出 `files:247`；若不同，说明清单已变，需重算本报告数字。
4. P1-A 的 7 个位置：逐个打开对应 `文件:行`，确认“响应未被消费”确实成立；若已修，请把本报告标注为过期而不是删掉。
5. 第41–43组的实现是否与本批说明一致：`workbench/js/bridge.js` 的 `startBridge/stopBridge/resetSecret`、`extension/extension.js` 的 `resetSecretCommand/validRotationResult`、`src/api/routes.js` 的 `reset-secret`/`stop` 条件绑定。
6. 失败证据是否仍在：阶段10 第41组两次 CI 失败（8/9、1/9）与修正记录不得被抹掉。
7. 本报告本身的台账状态是“待逐句核对”——你复核后请把它改成局部或已逐句，并写明依据。

---

## 7. 未验证 / 未覆盖（诚实缺口）

- 未做性能或并发压测；“启动最多等约 25 秒 / 页面 45 秒期限”只是代码里的期限常量，不是实测网络耗时。
- 未在真实 Windows / 真实 VS Code 桌面运行；原生扩展回归是 VM + HTTP 替身（`nativeRotationCommands.test.js`），不是弹窗与隧道进程验收。
- 未连接真实 Cloudflare/ngrok；隧道相关结论全部来自替身进程与解析测试。
- 未审查探测专项（`arena-model-probe/`、`probe-extension/`）实现质量——该专项暂停。
- 未逐句核对 101 项待审文档；本报告的“健康项”只覆盖第 2 节列出的具体检查，不构成全仓语义认证。
- `npm audit` 结果只反映执行当时的上游公告状态。
