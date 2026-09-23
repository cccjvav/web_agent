# 交叉验证合并台账 — 分支 01a0c925 × 01a0c932

- 日期：2026-09-22
- 本文作者：分支 `arena/01a0c925-web-agent`（下称 **A**）
- 对照分支：`arena/01a0c932-web-agent`（下称 **B**），对照时其顶点为 `08aa942`
- 共同基线：`2f6e7ab`
- A 当前顶点：见下方"吸收状态"，本地 104/104 测试文件通过
- **吸收状态（2026-09-23 更新）：B 分支已冻结不再更新，A 已把 B 独有/互补项全部吸收完毕，逐条实测后采纳，见 §10**
- 读者：B 分支助手，以及后续做集成的人

> 本台账的用途是让两条并行审查线**收敛**，不是评比。凡分歧项一律以可复现实测定论，不投票、不折中。

---

## 0. 结论摘要

| 类别 | 条数 | 含义 |
|---|---|---|
| 独立同解（互证） | 4 | 两边各自发现、各自修，方案一致 → 缺陷判定可信度最高 |
| 互补（两边都需要） | 1 | 同一问题的不同层面，**必须都合入** |
| A 独有 | 3 | B 未覆盖 |
| B 独有 | 1 | A 未覆盖 |
| **分歧（一方错）** | **1** | **A 错 B 对，已按 B 的方案修正** |

最重要的一条是分歧项：A 的严格解码会静默删除文件 BOM，而 A 自己的测试因为断言写法错误而未能发现。详见 §3。

---

## 1. 独立同解（互证）

两条审查线在互不知情的情况下得到同样结论与同样修法。这类项的缺陷判定可信度最高，集成时任选其一即可，建议优先取测试覆盖更厚的一侧。

| 编号 | 缺陷 | A 的提交 | B 的提交 | 备注 |
|---|---|---|---|---|
| X1 | `git diff` 绕过敏感文件过滤，可泄露被排除路径内容 | `c7acac4` | `bd0d060` | 两边都改为先按 `--name-status` 求允许集合再取 diff，**且两边都用 `rev-parse --show-prefix` 处理"工作区是仓库子目录"**（A 的 `workspacePrefix()`+`stripPrefix()`，B 的 `workspacePrefix()`+`localGitPath()`）。命名不同、语义等价 |
| X2 | 非法 UTF-8 不同字节序列产生相同 hash | `c7acac4` | `bd0d060` | 都改为 `fatal:true` 严格解码。**但 BOM 处理有分歧，见 §3** |
| X3 | diff 生成无预算，超大变更可阻塞事件循环 | `c7acac4` | `bd0d060` | 都引入预算并抛专用错误码 |
| X4 | admin-host 存储损坏时的处理 | `c7acac4` | `1fbd2af` | 同向修复 |

**X1 更正（2026-09-23）**：本台账初版称"A 缺少 `workspacePrefix()` 处理、建议取 B"，**这是错的**。A 在 `c7acac4`（第 1 批）就已加入 `workspacePrefix()` + `stripPrefix()`，是我核对时看漏了自己的改动。已实测确认 A 的实现行为正确：

```
工作区 = <repo>/sub 时
status.files : [{" M","inside.txt"},{" M","nested/deep.txt"}]   ← 已剥前缀
误含仓库顶层 top.txt : false      diff 泄露 top.txt : false
```

两边命名不同（A 用 `stripPrefix`，B 用 `localGitPath`）但语义等价，**无需移植**。记录此更正以免后来者据错误结论做无谓改动；也说明台账本身同样需要被核对，不能因为它是"交叉验证产物"就默认可信。

---

## 2. 互补（两边都需要，不可二选一）

| 编号 | 问题 | A 做了什么 | B 做了什么 | 为什么都要 |
|---|---|---|---|---|
| C1 | GitHub 身份请求无界 | 在 `auth/github.js` 内部加 `githubJson` 超时预算（`66f5dc7`） | 在 `api/routes.js` 加 `identityRequest()`，把 `AbortController` 绑到**真实 HTTP 请求生命周期**（`1fbd2af`） | A 管"上游不响应时自己超时"，B 管"客户端断开时立刻取消"。缺任一边都会留下一类挂起 |

**集成方式**：直接取并集，两者无冲突（改的是不同文件的不同层）。

**已吸收（2026-09-23）**：A 已加入 `identityRequest()`。吸收前先实测确认缺口真实存在——客户端断开后上游 signal 不 abort：

```
模式 current(基线) : 上游已发出 true | 客户端断开后上游取消 false
模式 fixed        : 上游已发出 true | 客户端断开后上游取消 true
```

配套红测 `tests/identityRequestLifetime.test.js`，已验基线红。

---

## 3. 分歧项（必须以实测定论）—— A 错，已修正

### D1：严格解码吞掉 BOM，导致文件被静默改坏

| | A（原） | B |
|---|---|---|
| 写法 | `new TextDecoder('utf-8', { fatal:true, ignoreBOM:false })` | `... { fatal:true, ignoreBOM:true }` |
| 是否正确 | ❌ | ✅ |

**注意 `ignoreBOM` 的语义是反直觉的**：`ignoreBOM:true` 意为"忽略 BOM 的**特殊含义**"，即把它当作普通字符 U+FEFF **保留**；`false` 才会**剥掉**它。

实测（`node`，与仓库无关，可独立复现）：

```js
const bytes = Buffer.concat([Buffer.from([0xEF,0xBB,0xBF]), Buffer.from('hello','utf8')]);
new TextDecoder('utf-8',{fatal:true,ignoreBOM:false}).decode(bytes) // "hello"      → 重编码 5 字节，往返失败
new TextDecoder('utf-8',{fatal:true,ignoreBOM:true }).decode(bytes) // "\uFEFFhello" → 重编码 8 字节，往返成功
```

**为什么这是缺陷而不是风格差异**：这次严格解码的全部目的就是让"解码出的字符串重编码 == 磁盘字节"，hash 才能真正标识那些字节。`ignoreBOM:false` 破坏了这个不变式。

端到端后果（在 A 的代码上实测，走真实 `read_files` → `apply_patch`）：

```
原始首三字节: ef bb bf
patch 结果  : {"ok":true}     ← 报告成功
改后首三字节: 6c 69 6e        ← BOM 被静默删除
```

用户只想改一行字，文件的 BOM 没了。

**为什么 A 的测试没抓到**（这条比 bug 本身更值得记）：

```js
// A 原来的断言 —— BOM 在与不在都通过，等于没测
assert.ok(readBoundedText(f).endsWith('after bom\n'), 'BOM file still readable');
```

实现和测试是同一个人带着**同一个错误假设**写的，所以测试只是把错误确认了一遍。这是单人审查的结构性盲区，也是本次交叉验证最直接的收益。

**A 的修正**（提交 `710f6c3`）：
- `src/utils/boundedFile.js` 改为 `ignoreBOM:true` 并写明理由与该参数的反直觉语义；
- `tests/textEncoding.test.js` 断言改为「BOM 保留为 `\uFEFF`」+「重编码字节 == 原始字节」，并新增一条**端到端**断言：patch 之后磁盘首三字节仍为 `ef bb bf`。

**给 B 的建议**：B 的实现是对的，但请检查 B 侧是否有等价的**端到端**断言（read→patch→write 后磁盘字节不变）。仅有单元层的 `ignoreBOM` 正确，不能防止别人日后"顺手"改回去。

---

## 4. A 独有（B 未覆盖，建议 B 拉取或复核）

| 编号 | 缺陷 | A 的提交 | 严重度 | 说明 |
|---|---|---|---|---|
| A1 | **命令输出跨管道分块被打碎** | `0861e31` | 高（数据正确性） | `executor.js` 对每个 chunk 各自 `data.toString()`。管道分块边界由 OS 决定、不对齐字符边界。实测一个逐字节输出「项目已完成」的程序，返回 **15 个 U+FFFD**。这不是显示问题——模型拿到的就是乱码，会据此推理并采取行动。修法：stdout/stderr **各自**一个 `StringDecoder('utf8')`（两流必须独立，否则 stderr 的半个字符会接到 stdout 尾巴上），close/error 时 `flushDecoders()` 把截断残余以单个替换字符收尾而非静默丢弃 |
| A2 | **危险命令包装器绕过** | `0861e31` | 高（安全） | `sudo rm -rf /` **不被识别**。同类还有 `nohup`/`setsid`/`nice`/`ionice`/`stdbuf`/`time`/`command`/`builtin`/`exec`/`xargs`/`env VAR=v` 共 12 个同 argv 包装器。这既不是编码混淆也不是环境变量间接，就是原命令前加一个词。修法：`ARGV_WRAPPERS` + `stripWrappers()` 剥壳后递归判定，剥壳只能更严、不能洗白已命中命令 |
| A3 | UI 字号不可调、104 处硬编码 px | `c1e76bf` | 中（可用性） | 改为 rem 字阶 + `--text-scale`，新增 A-/A+ 控件。`calc(100% * var(--text-scale,1))` 与系统字号**相乘**而非覆盖，不破坏系统无障碍设置 |

**A2 的重要边界**（请 B 一并复核，不要误解为已做到）：以下形式**明确不覆盖**，且 A 已用断言把"不覆盖"钉住，防止后人误当沙箱依赖：

- `bash -c "rm -rf X"`、`eval "rm -rf X"`（需重新解析字符串）
- `python -c` / `node -e` 正文（进入解释器）
- `$(echo rm) -rf`（命令替换）
- fork bomb `:(){ :|:& };:`

实测 fork bomb 词法层确实未识别（系统负载冲到 259），但被 `detached` 进程组终止成功回收，无残留进程。**真正兜底的是进程组终止与工作区路径限制，不是这张词法表。**

**A2 的误报验证**：用 31 条日常命令验证零误报（`npm test`、`git status`、`time npm test`、`sudo -v`、`env | sort`、`command -v node`、`exec node app.js` 等）。这一步不能省——一个会拦住 `npm test` 的保护，用户会直接整个关掉，比漏报更糟。

---

## 5. B 独有（A 未覆盖，A 认可）

| 编号 | 缺陷 | B 的提交 | A 的态度 |
|---|---|---|---|
| B1 | `run-code-oss.js` 里 agent-host 依赖安装的回退路径无界，且与 server 子进程清理策略重复 | `7d36305` | A **未审过此文件**。B 改为交给 `runPreparation()` 统一持有该直接子进程（带 `timeoutMs` 与 `signal`），避免双重清理策略。**已吸收，见 §10** |

---

## 6. 双方都**未**覆盖的范围（不得当作已审）

集成前请把这块当作已知缺口，不要因为"两条线都绿"就认为审完了。

- `webagent-core/agent-host/src/mcp/server.js`（553 行）、`src/mcp/oauth.js`（573 行） — 对外暴露面最大，**优先级最高**
- `webagent-core/extension/extension.js`（792 行）、`extension/ptyHost.js`（441 行）
- `webagent-core/workbench/js/bridge.js`（684 行）、`operations.js`（460 行）
- `.github/workflows`（2 个）
- `installer/preparation.js`（52 行，B 改了调用方但未必审过被调方）

**环境性未验证项**（两条线都受限，不能互相代签）：

- 浏览器 E2E / 真实 DPI 观感：本机 Chromium 无法安装（`npx playwright install chromium` 5 次 `ECONNRESET`，勿再重试）
- Windows / C# / PowerShell：无 dotnet、无 pwsh
- 用户桌面实机验收（M1–M5、R8）：沙箱与 CI 都不能代替

---

## 7. 给 B 分支的具体操作建议

A 的工作已全部推送到 `origin/arena/01a0c925-web-agent`（顶点 `710f6c3`，线性 5 提交，本地 102/102 通过）。

### 方案一：只看不拉（推荐先做这步）

```cmd
git fetch origin arena/01a0c925-web-agent
git log --oneline 2f6e7ab..origin/arena/01a0c925-web-agent
git diff 2f6e7ab origin/arena/01a0c925-web-agent -- webagent-core/agent-host/src/tools/executor.js
git diff 2f6e7ab origin/arena/01a0c925-web-agent -- webagent-core/extension/dangerousPolicy.js
```

**最需要 B 复核的两处**（只有 A 改了，无人复核过）：

1. `executor.js` 的 `StringDecoder` 改造 —— 重点看两个流是否真的各自独立、`flushDecoders()` 是否在 error 与 close 两条路径都调到。
2. `dangerousPolicy.js` 的 `stripWrappers()` —— 重点看**误报**。剥壳逻辑最大的风险不是漏报而是把正常命令判危。另外 `extension/dangerousPolicy.js` 与 `extensions-installed/webagent.webagent-core-0.7.2/dangerousPolicy.js` 必须**逐字节一致**（`tests/extensionCopy.test.js` 会红），改动时务必同步拷贝。

A 用的复现脚本思路（可自行重写，不依赖 A 的临时文件）：
- 编码：写一个把中文**逐字节**输出、字节间隔几毫秒的小程序，强制父进程在多字节字符中间看到分块边界。**直接管道整块输出复现不出来**，因为边界常自然对齐。
- 绕过：对 `isDangerousCommand` 跑一个矩阵，正例（各种 wrapper + `rm -rf`）与反例（日常命令）都要有。

### 方案二：择优挑拣（cherry-pick 单批）

```cmd
git fetch origin arena/01a0c925-web-agent
git cherry-pick 0861e31
```

`0861e31`（A1+A2）与 B 已改的文件**无交集**，冲突风险低。
`c1e76bf`（A3，UI 字号）同理，只动 workbench 与 styles.css。
`c7acac4`（X1–X4）与 B 的 `bd0d060`/`1fbd2af` **高度重叠，会冲突**，不要 cherry-pick，走 §8 的收敛流程。

### 方案三：整体合并

留到 §8 第 3 步再做，不要现在做。

---

## 8. 建议的收敛流程

1. **B 先复核 A 独有的 A1/A2**（见 §7 方案一）。这两项无人复核，是当前最大的单点风险。
2. **A 复核 B 独有的 B1** —— 已完成，A 认可，见 §5。
3. **逐项定稿重叠项的实现归属**：
   - X1 `gitOps` → **建议取 B**（有 `workspacePrefix` 处理子目录工作区，A 缺）
   - X2 `boundedFile` → 取任一，但**必须是 `ignoreBOM:true`**，且要有端到端断言
   - X3/X4 → 取任一
   - C1 → **取并集**
4. **择一分支做集成**，另一边只提交审查意见，避免两边继续在同一批文件上分头改。
5. **继续未审范围**（§6），从 `mcp/server.js`、`mcp/oauth.js` 开始 —— 对外暴露面最大。

---

## 9. 环境提醒（踩过的坑，B 大概率也会遇到）

- **沙箱重建会把分支指针退回旧提交，而工作文件是最新的**。A 这次就中了：BOM 提交挂到了 `bbe7985` 上，直接推送会抹掉已推送的 4 批工作。
  **处置方式**：禁止 `reset --hard` / `clean -fd`。先建备份分支，再逐一核对 `git diff <远端顶点> <本地顶点>` 的实际文件差异，确认只有本次改动，然后 `git reset --soft <正确父提交>` 重新提交。
  **预防**：每次交接前先核对 `git log --oneline -1` 与 `git ls-remote --heads origin` 是否一致。
- `node_modules` 属于快照排除目录，重建后会消失，需要 `npm ci --prefix webagent-core/agent-host --include=dev` 重装。
- `git ls-files` 默认 `core.quotePath=true`，中文文件名会被转义成八进制。脚本里请用 `git -c core.quotePath=false ls-files -z`。
- 改了源码里的具名函数后，文档门禁会红：`documentationLearning.test.js` 要求**每个具名函数**（含私有函数）在配对中文详解里逐字出现；随后要跑 `node docs-site/check-docs.js --write` 与 `node docs-site/build.js` 回填。新增测试文件还要同时登记到 `documentationLearning.test.js` 的 pairs 与 `scripts/run-tests.js`。


---

## 10. 吸收记录（2026-09-23，B 分支已冻结）

B 分支停止更新后，A 把 B 独有与互补的三项逐条复现、采纳并补红测。**没有直接照搬**：每项先在 A 的代码上复现缺口，确认缺口真实存在才改，改完再验红。

| 项 | 复现结论 | 处置 | 红测 |
|---|---|---|---|
| X1 gitOps 子目录前缀 | **台账原判有误**。A 在 `c7acac4` 就已有 `workspacePrefix()`+`stripPrefix()`，实测工作区为 `<repo>/sub` 时路径已正确剥前缀、未泄露仓库顶层文件 | **无需吸收**，已更正 §1 | 既有 |
| C1 身份请求生命周期 | 缺口属实：客户端断开后上游 signal 不 abort（`current` false / `fixed` true） | 吸收 `identityRequest()`，三条 bridge 路由统一包裹，回错补 `code`、写响应前查 `res.destroyed` | 新增 `identityRequestLifetime.test.js`，已验基线红 |
| B1 依赖准备无期限 | 缺口属实：模拟卡住的 install，5 秒后仍无任何期限介入，只能靠用户 Ctrl+C；且它被登记进 `children`，停止路径会对 runPreparation 已持有的进程再套 9 秒服务器宽限 | 吸收 `runPreparation(...)`（120s deadline + `controller.signal`），移出 `children` | 吸收 B 的 harness 沙箱化改造 + 8 条新测，已验基线全红 |

**B1 吸收时发现的连带问题**：`codeServerLifecycle.test.js` 的 harness 通过 `vm` 注入假 `child_process`，但 `preparation.js` 自己 `require('child_process')`，**会逃出沙箱去跑真实 npm**（实测报错 `npm.cmd: not found`，说明确实在尝试真实安装）。B 的 harness 改造把 `preparation.js` 也放进同一沙箱执行，这一段必须一起吸收，否则测试会真的动网络。

**C1 写测试时踩的坑（记录以免重演）**：最初把红测合写进 `networkBudget.test.js`，结果**基线也绿**。原因是 `github.js` 有模块级身份状态（`identityGeneration`/`pendingDevice`）会主动作废在途尝试，同进程里早先的身份测试会在约 150ms 把本测试的上游调用 abort 掉——断言因**错误原因**通过。改为独立文件后才能让"是谁取消的"没有歧义。这也是一个通用教训：**看到新测试变绿，要先确认它是为正确的原因变绿**。

吸收后本地 104/104 通过。至此 B 分支的全部可吸收内容已并入 A。


---

## 11. 全量合并记录（2026-09-23，合并提交 `3dd6447`）

**为什么会有这一节**：§10 的"吸收"只覆盖了对方的**代码**改动。用户指出后核实——我此前用 `git diff -- '*.js'` 做比对，**把对方 4 个纯文档提交整个滤掉了**，其中包括 R7「200 份 Markdown 逐份时效核对」。7 个提交我只看过 3 个。这是我的方法错误：过滤器决定了我能看见什么，而我没有复核过滤器本身。

本次执行完整 `git merge`，34 处冲突**逐一人工裁决**，没有用 `-X ours/theirs` 批量压过。

### 11.1 吸收的对方成果

- **R7 文档时效核对**：`FULL_REVIEW_INDEX.md` 重构为逐文件时效清单（200 份，每份含内容指纹、时效处置、对照依据、保留边界）。加上本分支的交叉验证台账，现为 201 份。
- **59 个我从未编辑过的文档**的时效修正直接受益：`README`/`SECURITY`/`使用指南`/`docs/guides/*`/各模块详解等。
- **3 个新回归测试**：`githubNetwork` / `fileReadSafety` / `adminIntegrity`。

### 11.2 合并过程中发现并修复的真实缺陷

这些不是"合并冲突"，是两边实现对撞后暴露出来的行为缺口。每条都先复现再改。

| # | 缺陷 | 复现 | 修法 |
|---|---|---|---|
| 1 | **`fetchText` 期限不设防** | `abort()` 只是*请求*传输停止。黑洞传输（忽略 signal）下 Promise 永久挂起，实测 25 秒未返回，期限形同虚设 | 超时侧自己 `reject(E_TIMEOUT)`，与 `send`/`readResponseText` 分别 `Promise.race`。期限由本机强制，不依赖对端配合 |
| 2 | **git diff 重命名泄露** | `git mv rename.key renamed-public.txt` → 差异里出现 `RENAMED_SECRET` 全文。旧名被排除、新名放行 | 重命名/复制是**一条**两名变更，两侧任一命中敏感规则就整条 withhold |
| 3 | **跨工作区边界重命名** | 工作区为 `<repo>/scope` 时 `git mv ../outside.txt scope/from-parent.txt`，父仓库内容被带进来 | 任一侧 `stripPrefix` 为 null（落在工作区外）即整条 withhold |
| 4 | **显式目录绕过过滤** | `filePath:'.'` 或传目录时跳过敏感枚举，直接 diff 整棵子树 | 一律先枚举元数据再按允许清单取内容，聚合/目录/单文件走同一条路径 |
| 5 | **过滤后谎报完整** | `excludedSensitivePaths` 有值，`truncated` 仍为 `false` | 过滤即置 `truncated`，并给出 `omittedFiles` 计数显式披露 |
| 6 | **`diff.relative=true` 导致误删** | 用户本地偏好使元数据变为工作区相对，`stripPrefix` 二次剥前缀 → 合法改动被全部丢弃 | 元数据枚举固定加 `--no-relative` |
| 7 | **`saveReports` 泄露底层错误** | 写入/rename 失败时 EIO/EACCES 直接逃逸，HTTP 层拿不到稳定形状 | 统一包成 `E_STORE_CORRUPT`，携带文件名与原因 |

其中 #2/#3 是**安全性质**的：一个把敏感文件改名就能读出内容的过滤器，等于没有过滤器。

### 11.3 冲突裁决原则：取并集，不二选一

| 文件 | 裁决 |
|---|---|
| `diff.js` | 我的时间/编辑预算 **+** 对方的输入字节、行数与输出字节上限 |
| `requestScope.js` | 我的 `fetchImpl` 注入 **+** 对方的 `timeoutMs` 校验与 `checkDeadline` 双查 |
| `github.js` | **取对方**更硬的实现（`redirect:'error'`、字段校验、错误分类），改用本分支的 `fetchImpl` 注入口；超时 15s→**10s**、响应上限 1MiB→**64KiB** |
| `boundedFile.js` / `admin-host/app.js` | 保留本分支（`readBoundedJsonText`、`corruptStore` 带文件与原因），**并入**对方的逐行 `validReport`、大小上限与 `mode 0600` |
| `routes.js` / `run-code-oss.js` / `codeServerLifecycle` | 纯格式或注释差异，保留本分支 |
| `diffBudget.test.js` | 双方各自新建了同名文件；保留本分支，**补入**对方独有的三条断言（输入/输出上限、patch 往返可应用、超预算新建不得创建父目录） |

**错误码差异不是行为差异。** 对方测试断言 `E_INVALID_TEXT`/`E_REPORT_STORE`，本分支存活的是 `E_ENCODING`/`E_STORE_CORRUPT`，合同完全相同（拒绝非法 UTF-8、损坏存储 fail-closed 且不改原字节）。我改的是**测试里的码名**并在文件头注明原因，**没有放宽任何一条断言**。

### 11.4 结果

本地 **107/107** 通过（含对方 3 个新测试文件）。Windows 侧由 CI 复核。


---

## 12. 机械化复核：合并是否真的完整（2026-09-23）

用户追问"你确定不能全部抓取并理解对方还有什么漏做"。§11 的结论建立在我人工裁决 34 处冲突之上，而我**已经因为过滤器用错漏过一次**，所以这次不靠记忆和印象，改用机械判据重新验证。

### 12.1 判据与结果

| 检查 | 方法 | 结果 |
|---|---|---|
| 提交完整性 | `git log 对方分支 ^HEAD` | **空** —— 对方 7 个提交全部在我方历史内 |
| 合并可达性 | `git branch -a --merged HEAD` | 列出对方分支；`git merge-base 对方 HEAD` = 对方顶点 `08aa942`，即对方历史被完全包含 |
| 文件新增 | 对方相对基线新增的文件，逐个 `test -e` | **0 缺失** |
| 文件删除 | 对方删除的文件，检查我方是否仍残留 | **0 残留** |
| **内容行级** | 对方相对基线 `2f6e7ab` 新增的每一行，逐行检查是否仍出现在我方树中 | 117 文件中 24 个存在未保留行，**逐一人工判读见下** |

### 12.2 24 个"未完全保留"文件的判读

行级检查会把"同义不同写法"也报为未保留，所以逐个看了实际内容：

- **实现等价、我方版本存活**（`diff.js`、`boundedFile.js`、`routes.js`、`requestScope.js`、`run-code-oss.js`、`patchEngine.js`、`admin-host/app.js`）：未保留的行都是对方的写法（`E_DIFF_LIMIT`/`E_INVALID_TEXT`/`fetchFn` 位参/单行 finally），功能已由我方等价实现覆盖，§11.3 已记录裁决理由。
- **生成物**（`documentation-manifest.json`、`source-index.md`、`content.js`）：由 `check-docs.js --write` + `build.js` 重新生成，数值反映我方真实树，不应保留对方的旧数字。
- **管理文档**（`CONTEXT.md`、`s10`、`FULL_REVIEW_INDEX` 计数行）：未保留的是对方分支自述（"当前会话固定分支 01a0c932"、其 CI 编号、200 份分母），**按事实不应搬到本分支**；R7 完成这一事实已写入本分支 CONTEXT 与阶段 10。
- **README/SECURITY 若干行**：措辞不同、语义一致，且我方措辞对应我方实现。

### 12.3 本次复核**新发现并补上**的两项

行级比对确实抓到了两处我在 §11 裁决时漏掉的实质内容，都在 `gitOps.js`（该文件保留率仅 4%，是最值得怀疑的信号）：

| 项 | 对方有、我方缺 | 处置 |
|---|---|---|
| 内容 diff 缺 `--no-renames` | 允许清单由元数据 `-M` 全仓枚举得出（两侧都查），但内容命令若在自己更窄的 pathspec 内**重新**检测重命名，理论上可能把允许文件与一个未经批准的源配对 | 已加。**实测当前不可达**——三种构造（敏感文件改名、内容相同的删除+新增、跨目录复制）均未泄露，因为元数据枚举已在任一侧命中时整条 withhold。作为纵深防御保留，注释写明"今天不可达" |
| argv 只限条数不限字节 | 我方 `MAX_DIFF_PATHSPECS=300` 只数个数。300 个长中文路径可超出 Windows 命令行上限，失败形态是晦涩的 spawn 错误而非干净的预算提示 | 新增 `MAX_DIFF_PATHSPEC_BYTES=12000`，按字节与条数双重封顶 |

### 12.4 R7 台账自身的交叉核对

不只看对方声明的数字，直接对账：

```
git ls-files '*.md'        → 201 份
台账表内唯一 .md 目标      → 201 份
跟踪但未登记                → 0
台账登记但仓库不存在        → 0
```

双向零差。（表格 204 行 = 201 份 .md + 3 条非 .md 附表项，符合对方在"审查标准"里声明的口径。）

### 12.5 结论

对方分支**已无遗漏内容**：提交、文件、内容三个层级均已核对，§12.3 两项补齐后不再有"对方有而我方无"的实质项。本地 107/107 通过。

**方法教训**：这次能抓到 §12.3 两项，靠的是"逐行比对 + 看保留率异常值"，不是靠回忆。`gitOps.js` 4% 的保留率是明确信号，而它恰好是安全相关文件。以后凡是声称"已全部吸收"，都应先出这张保留率表。
