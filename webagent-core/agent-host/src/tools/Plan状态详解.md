# Plan 回合状态与本地共识：逐函数讲解

## 职责与执行流程

[planRound.js](planRound.js) 保存进程级当前回合；[consensusEngine.js](consensusEngine.js) 产生本地草案/拼接结果。上层 [runChat 调度](../agent/Chat调度详解.md) 管异步模型请求、旧回合检查。这里没有数据库、模型 HTTP 调用或文件补丁操作。

```text
start → round（0分支） → addBranch → 至少2分支 → markMerged
reset → null
新 start → 替换原 round；异步旧结果由调用方拒绝写入
```

## 1. planRound.js 的全部函数

| 函数 | 输入/返回 | 状态与边界 |
|---|---|---|
| clampMax(n) | 任意可Number转换值→2–8整数 | 非有限数默认4；其余 round 后限幅；空值可能变0再限到2，不是都默认4 |
| previewOf(text) | 文本→最多160字符加省略号 | 压缩空白、trim，不保留原排版；无状态修改 |
| snapshot() | 无→新展示对象 | 无round返回 inactive 默认；有round返回任务/模型/思考级别、merged布尔、canBranch/canMerge及分支摘要；map逐项只选公开字段，不带完整答案/facts |
| reset() | 无→空快照 | round=null；本函数不广播 reset 事件，上层另发事件 |
| start({task,maxBranches,mergeModelId,thinkLevel}) | 参数→新round引用 | task trim空则抛 E_PLAN_NO_TASK；替换旧状态、设默认、广播 plan_round_started；不是追加会话 |
| current() | 无→原round或null | **返回可变对象引用**，调用者能直接修改；不是只读快照 |
| addBranch(branch) | 分支草案→实际记录 | 无round、已总结、满额分别抛 E_PLAN_NO_ROUND/E_PLAN_MERGED/E_PLAN_FULL；顺序id/index，默认模型/思考级别，答案trim、创建时间；push后广播 plan_branch |
| markMerged(result) | 结果→快照 | 无round或少于两支分别抛 E_PLAN_NO_ROUND/E_PLAN_NEED_TWO；存 result（假值则用时间对象），广播 plan_merged；本函数没有独立的“已总结拒绝”分支，上层负责防重复 |
| branches() | 无→数组 | 浅拷贝数组，但记录对象仍共用；外部改记录可影响内部，不是深拷贝 |

snapshot 的 canBranch 要求已有至少一支且未满/未总结，canMerge 要求至少两支且未总结；这是 UI 提示，不取代 addBranch/markMerged 检查。addBranch 同步落地，异步模型请求的“预订槽位”不在这里。eventBus 广播也是副作用；如果内部订阅者抛错，需接着看 eventBus，不能假定广播永不影响调用者。

## 2. consensusEngine.js 的全部函数

### clip(text,n=900)

String、trim，超过n取前段并加省略号。用于本地摘要，不是模型上下文或资源硬上限。

### localPlanText({task,facts={},modelName,thinkLevel})

纯文本模板：最多24文件名，README截500、pkg截400、测试命令缺省npm test，声明本地探索、只读、需要Code落地。数组 filter(Boolean) 去空段后 join。依赖的是传入 facts，不会自己重新读磁盘；默认测试命令只是建议，不能证明测试可运行。

### draftLocalBranch({taskDescription,facts={},modelName,thinkLevel,index=1}={})

返回含id/model/modelName/focus/verdict/simulated/thinkLevel/answer的对象。缺任务用默认评估语句，focus固定本机只读摸底，simulated=true，answer来自 localPlanText。无HTTP、无投票、无状态存储；同一事实模板并不模拟独立大模型推理。

### mergeLocalBranches({taskDescription,branches=[],facts={}}={})

创建本地合并结果，返回前广播 consensus_finished。canonical只是任务/分支数/验证提示；unifiedActionPlan固定三项：确认入口、Code读hash后补丁、测试。participants 的 map 保留每个分支的模型名、focus/thinkLevel及答案；disagreements为空、consensusReached=false、agreementRate=null。

源码里另一个 map 创建 parts（逐分支标题与答案），**目前该局部变量未被放进返回结果**。不要看到局部拼接就写“canonical 包含所有原文”；完整答案实际在 participants。输出也不代表模型间真有共识或没有分歧。

### runMultiModelConsensus({taskDescription,facts={},emit}={})

保留给无 live round 的 `/consensus/run` 路径；async函数先 draft 一份本地分支，可选emit状态，然后调用 mergeLocalBranches。它允许一份分支作本地结果，与交互 Plan markMerged 的至少两支约束不同；没有调用 planRound.markMerged，不能混写为“一支自动完成当前回合”。

## 3. 验证与剩余边界

```bat
npm test --prefix webagent-core/agent-host -- --filter=planRound
npm test --prefix webagent-core/agent-host -- --filter=runChat
npm test --prefix webagent-core/agent-host -- --filter=modelLifecycle
```

检查回合容量/前置条件、草案语义和异步旧结果。它们不证明不同浏览器有独立回合，也不证明真实多个模型达成一致；当前两者均不应承诺。复盘时跟踪 current 与 snapshot 的差别，解释为什么调用方必须在 await 之后再次比较 round 引用及分支数。
