# runChat.js：从用户消息到探索、模型调用与 Plan

## 职责、数据与返回方式

[runChat.js](runChat.js) 的两个导出是 runChat 和共享 planRound。它不是 HTTP 路由：外层负责请求生命周期，本文件负责选模型、调工具并 emit 事件。依赖 `store` 配置、`tools.callTool`、`openai.runOpenAI` 和两个 Plan 模块。

返回值并不统一：远程模型正常返回 `{text}`，部分失败返回 `{ok:false,error}`，内置/Plan 多数分支只 emit 后返回 undefined。读调用方时必须同时看事件和返回对象，不能把 Promise resolve 理解为任务成功。函数位置见源码索引，不维护静态行号。

## 1. 普通入口的执行流程

### runChat(payload = {}, emit)

第二参数是函数时优先作为 send，否则取 payload.emit。同步 `store.load()` 在模型 try/catch 之前，坏配置会直接使 async 函数拒绝。mode 缺省为 `agent`；本文件没有在这里把 agent 改名为 code，HTTP/扩展的模式处理需另看调用方。

Plan 直接委托 runPlanRound。普通模式 pickModel；选中非 builtin 但字段不齐时 emit error、返回失败，不执行内置写入；字段齐则 await runOpenAI，异常转换为 error 事件及失败对象。其他情况走 runBuiltin。

### pickModel(cfg, id)

从 cfg.models 查显式 id；找不到再查 activeModelId，仍无则取首项。两个 find 回调都是精确 id 比较。返回模型对象引用或 undefined，不复制对象、不验证字段；无效 id 并非严格报错。

### canCallModel(m)

返回布尔：对象、apiKey、baseUrl、modelId 都为真且 protocol 不为 builtin。不是网络探测、URL 检查或供应商协议兼容证明。只有 protocol=builtin 强制排除远程调用；其他 protocol 标签在这里没有不同适配分支。

### timedTool(emit, mode, name, args)

记录时间 → await callTool → 若业务对象显式 ok/success 为 false，则抛入同一 catch。成功 emit tool（原始 result、参数、耗时、短标签），返回 `{ok:true,result,durationMs}`；失败 emit 带 error 的 tool，返回 `{ok:false,error,durationMs}` 而非继续抛错。

因此上层要检查 ok。emit 本身不是隔离的消息队列：成功 emit 抛错也会落进 catch，失败 emit 再抛仍可使函数拒绝。工具取消到达这里也可能被包装为失败结果，不等于整个探索流程自动终止。

## 2. 内置探索的全部辅助函数

| 函数 | 输入 → 输出 | 步骤、边界与副作用 |
|---|---|---|
| flattenDir(items, acc=[]) | 目录树 → 扁平数组 | 深度优先将每项（包括目录）push，再递归 children；修改传入 acc，不做循环引用防护 |
| keywordsFrom(message) | 文本 → 最多 6 个词 | 分隔标点/空白；map trim；filter 长度至少2且不在停用词表；不是分词模型。后面拼 regex 时没有做正则转义 |
| pickExisting(relPaths) | 固定候选名 → 存在的普通文件名 | 用 workspaceRoot 拼路径，exists/stat；将反斜杠转正斜杠。此辅助只用于内部候选，不替代工具路径检查；stat 竞争失败会抛出 |
| detectTestCommand() | 无 → `{cmd,kind}` 或 null | resolveTechStack 有 testCommand 就标 declared（即使它是启发式探测结果）；否则有 tests 目录就猜包管理器 test；不执行、不确认安装了 pytest/Conda |
| extractPatch(message) | 文本 → 第一段 SEARCH/REPLACE 或 null | 正则提取首个成对标记，不校验补丁目标或能否应用 |
| extractWriteIntent(message) | 文本 → `{filePath,content}` 或 null | 同时匹配写入/创建关键词后的简单文件路径和第一个代码围栏；路径字符集有限，不是任意中文/空格文件名解析器 |
| clip(text,n=1400) | 文本 → 截短预览 | 超 n 字符保留前段加省略号；不是字节/Token 硬预算 |
| stripLineNumbers(content) | 文本 → 去行号文本 | split/map 去掉每行开头数字冒号、join；也可能去掉恰好符合该形式的原始文本，不是可逆解码 |

### explore(emit, mode, message)

返回 facts：files、readme、pkg、testCmd、testOutput。依次执行：

1. list_directory 深度3，成功才 flatten，再 filter 文件/map 路径、截前80。
2. git_status；find_files 最多100，成功结果按路径去重加入 facts.files，因此最终不是严格80项。
3. 有关键词时取前三项拼成 regex，search_files 限30；搜索结果以事件呈现，没有塞入 facts 正文。
4. 固定 README/语言清单候选先 pickExisting，再补文件树中的项；读取最多6文件、每文件 limit120。跳过错误项，去行号；遇到多个 README 后者覆盖前者，只有 package.json 放入 facts.pkg。
5. detectTestCommand 非空才覆盖 facts.testCmd，然后返回。

**初始化 testCmd 就是 `npm test`**，所以总结里出现“探测到 npm test”不一定真的探测到了。该函数也不是全仓分析：有深度、结果数、文件数和读行数限制。多数工具失败只得到错误事件，探索仍继续；直接 fs/画像异常可能使函数拒绝。

### summarizeAsk(message, facts)

纯格式化：取前30路径，README 最多800字符，pkg 最多600，拼工作区、问题、探测命令和提示。路径 map 回调加列表符号；末尾 filter 去空行。返回 Markdown，不 emit、不验证业务结论。尾部旧提示“没 Key 会跑测试/补丁”只适合显式选内置的路径，不能推导为外部模型失败自动回退。

## 3. runBuiltin(payload, emit)

默认 mode=ask。先 set_todos（扫描进行中）、发 status、explore，再更新任务列表。todos 是工作区状态副作用；“Ask 只读”指业务文件修改权限，不等于完全没有内部状态变化。

- plan：发探索总结与切 Code 提示，返回；正常顶层 Plan 已由 runPlanRound 接管，这个分支是内置辅助自身的行为。
- ask：将任务列表标完成，emit message，返回。
- 其余模式进入写/补丁/测试段：识别显式写意图后 call write_file，带 confirm_overwrite:true；工具本身的权限仍有效，失败 emit error 后 return。
- 识别补丁后，从 `file/文件` 后解析目标，否则用 facts.files[0]。先 read_files 取 hash，只有成功且有 hash 才 apply_patch；应用失败停止。没有目标或读取/hash 条件不满足时跳过，但最终仍可能写“已尝试”，不是补丁成功证明。
- 再次 detectTestCommand，非空才 run_command，timeoutSec=60；成功保存 stdout/stderr，失败保存 error。之后仍把验证 todos 标 completed，并总结“已运行”，**不是测试已通过**。

所有修改已经发生就不会因后面的测试失败自动回滚。内置引擎只按有限模板搜读与应用用户给出的内容，不是自动分析并生成修复的大模型。

## 4. Plan 调度全部函数

### capturingEmit(emit)

返回内部 wrap(type,data={})；遇到 message 只保存最后一条 text，不向外发；其他事件转发。给 wrap 挂 captured() 闭包读取当前文本。这样分支的最终答案由上层统一带分支信息输出，不重复发普通消息；它不是多段文本拼接器。

### resolvePlanAction(payload, mm)

显式 merge/branch/start/reset 最优先；否则 enabled=false 选 single；否则消息为空、存在未总结且至少一分支的当前轮次时选 branch，其余选 start。显式动作可以绕过 enabled 的默认判断；不能把关闭多模型描述成拒绝所有 Plan API。

### runPlanBranch({emit,model,thinkLevel,task,history})

非 builtin 配置不完整立即抛错。可远程调用时使用 mode=plan、allowTools=true，capturingEmit 收答案，返回 `{answer,simulated:false}`。

否则取共享 live 及其 facts，无 facts 时更新 todos 并 explore，写回原 live.facts；调用 draftLocalBranch 返回 `{answer,simulated:true,facts,focus}`。index 用当前已有分支数+1；没有 live 时从1起。这里没有创建新轮次，single 调用也可能复用当前 live.facts，故不要把 single 当作完全隔离的无状态草案。

### addLiveBranch({emit,model,thinkLevel,history,task})

先捕获 live 引用、任务和下一个序号并发 status，再 await runPlanBranch。恢复后要求 current() 仍是相同对象、非空且未 merged，否则丢弃迟到结果。最后写 facts、调用 planRound.addBranch 执行容量检查并返回记录。

容量约束在 addBranch 落地时检查；同时发多个分支可能先花掉模型请求，再因容量/轮次变化拒绝，并不是先预订槽位。

### emitRound(emit, rec)

取 snapshot；没有 emit 就返回，否则依次发 planRound、message（答案与 index/max/modelName/simulated）。对外快照不等于完整内部对象。

### runPlanRound(payload, emit, cfg)

读取 multiModel、思考级别、模型与 action：

- single 在函数内 try/catch **之前**，await 分支后发 message；异常向调用方传播。
- reset 清空 round，发空快照和消息。
- start 对消息 trim 后 planRound.start，再 addLiveBranch、emitRound。
- branch 在原 live 上 addLiveBranch、emitRound。
- merge 至少要求两支。记录 live 引用和分支数 mergeVersion；`auto` 映射当前活动模型，其他 id 仍通过 pickModel 的回退选取。

可调用合并模型时，把分支 map 成带标题的长文本（这里没有额外总字符裁剪）；用 plan 模式、空历史，mergeAllowsRead 控制工具声明及提示。返回结构刻意保留 `agreementRate:null`、`consensusReached:false`，不能当投票统计。participants 的 map 把分支身份/答案转结果格式。

**合并模型不能调用时，仍会走 mergeLocalBranches 本地拼接**；这与分支缺配置即失败不同。得到结果后，再检查同一轮次、未 merged、分支数未变；通过才 markMerged、更新 todos，再发 planRound/consensus/message。catch 转发 error，通常返回 undefined。

检查之后的 set_todos 仍可能失败但不会回滚已 markMerged 的 round。轮次是全进程共享内存，不按浏览器隔离，服务重启即丢失。

## 5. 验证、复盘与现有差异

仓库根：

```bat
npm test --prefix webagent-core/agent-host -- --filter=runChat
npm test --prefix webagent-core/agent-host -- --filter=modelLifecycle
npm test --prefix webagent-core/agent-host -- --filter=planRound
```

modelLifecycle 用假 fetch 检查服务失败不重放修改、超8项工具反馈、旧轮次与合并期间新增分支；不是真实供应商认证或全部并发排列。完整测试与人工验收仍分别执行。

本篇揭示的 UI措辞/测试命令猜测/Plan回退差异是**当前行为**，本轮不为让文档漂亮而修改运行语义。继续读[模型与截图详解](模型调用详解.md)、[Plan 状态与本地共识](../tools/Plan状态详解.md)。
