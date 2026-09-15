# arena-agent / Skainet Bridge：定向源码审阅与借鉴建议

日期：2026-09-15。我们的对照基线：`2400ad9` / 产品0.7.0。

上游：[IvanSkainet/arena-agent](https://github.com/IvanSkainet/arena-agent)，本次读取的master提交：`46d97048a75ed2fe7227a5ca6f2a85778d32ccd9`。以下源码链接固定到这个提交，避免上游后来变化影响结论。

## 1. 结论与审阅边界

**值得学习，但应学习真实执行、诊断和验证的工程方法，而不是复制它的全部功能、名称或体量。** 它不只是README：浏览器扩展、MCP客户端、能力探测、任务队列、自定义工具组合、执行隔离和审计都有实现文件。但源码存在不等于在用户Windows、浏览器账号和网络条件下可用。

本轮是定向静态审阅，不是全仓安全审计或兼容认证。阅读了README、LICENSE，以及下表列出的主要实现和相关测试；未安装其Python依赖、未运行安装脚本/服务/测试，也未验证Android、浏览器账号登录或Windows AppContainer。没有把README的代码行数、测试数量、版本数量或徽章当成成功证据。

第三方检出位于产品仓库之外；没有将其代码或依赖合并进本项目。本次只交付审阅结论，不改变运行权限、网络暴露、用户配置或验收状态。

## 2. 最值得学习的部分

| 方向 | 看到的实际实现 | 对我们的价值与限制 |
|---|---|---|
| 能力探测 | `build_capabilities`区分平台、CDP模块是否存在、是否连接及桌面后端；相关测试验证这些区别 | 我们应区分“已注册工具”“依赖已安装”“当前会话可执行”“完成真机验收”，让UI和Agent共享同一能力结果，而不是显示一排可能点不动的功能 |
| 外部MCP客户端 | `McpStdioClient`维护子进程、initialize握手、请求ID和响应读取；Manager复用客户端 | 我们现有“外部MCP地址备注”不是客户端。实现真正客户端可以接入成熟工具，减少重复造浏览器/桌面驱动；但需要独立信任、权限、输出预算和进程回收设计 |
| 浏览器聊天接入 | MV3扩展有parser、站点适配、内容扫描、指纹去重与sidepanel历史；能将工具块送到本机Bridge并回填 | 对没有原生MCP入口的聊天网站有价值。它不是“复制一个URL就能让任意聊天调用电脑”，仍需安装扩展、站点适配与明确审批；不能保证长期兼容网站DOM |
| 可组合工具 | `custom_tools.py`支持单工具包装、多步骤组合及嵌套工具；深度上限8，调用重新进入正常分发器 | 比把一段提示词命名为“技能”更接近可执行工作流。可借鉴schema、步骤输出引用、撤销和风险传播，不应允许流程绕过权限入口 |
| 场景执行与结果核验 | `ScenariosRuntime.preview/run`含风险预览、dry-run、逐步结果以及文件/HTTP后置条件等待 | 帮我们从“工具返回成功”走向“目标文件确实存在、内容确实正确、任务才完成”。预览和成功标准有直接价值；重试机制另见风险部分 |
| 排队与任务状态 | `tasks/queue.py`有任务文件，区分inbox/running/done/failed；runner有移动和执行流程 | 我们已有任务板与长命令，不需要再造平行系统；应将任务板、命令ID、工具记录和验收结果关联起来 |
| 可观测性 | audit模块有结构化写入、脱敏、轮转；tracing模块有trace_id | 我们0.7.0已补本进程Bridge快照，但还没有完整任务级追踪。值得补hostInstanceId/sessionId/taskId/callId，而不是继续添加彼此不关联的计数 |
| 执行环境探测 | autonomy的posture与runner区分sandbox/network/privilege/filesystem/runtime，并在无法提供要求的隔离时拒绝执行 | 可借鉴“先验证环境、能力不足明确拒绝”。我们的Job Object是进程树生命周期控制，不是文件/网络访问沙箱，不能混为一谈 |
| 缺口跟踪 | `capability_gaps.py`记录证据、建议工具、场景和解决状态 | 可将用户真实失败转成复现步骤与验证用例；但不能让Agent以“补缺口”为由自动安装软件或提升权限 |

### 对应源码

- [能力探测](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/capabilities.py)、[能力测试](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/tests/test_capabilities.py)
- [MCP客户端](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/mcp_client/client.py)、[输出边界测试](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/tests/test_mcp_client_output_bounds.py)
- [扩展权限清单](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/chat_extension/manifest.json)、[内容扫描/去重](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/chat_extension/content.js)、[侧栏历史与动作](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/chat_extension/sidepanel.js)
- [自定义工具](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/mcp/custom_tools.py)、[场景执行](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/scenarios/runtime.py)
- [任务队列](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/tasks/queue.py)、[任务runner](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/tasks/runner.py)
- [审计](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/observability/audit.py)、[追踪](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/observability/tracing_core.py)
- [执行姿态](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/autonomy/posture.py)、[隔离runner](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/autonomy/runner.py)、[能力缺口](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/capability_gaps.py)

## 3. 不应照搬或过度解读的地方

### 3.1 有ReAct/反思名称，不等于新增了通用推理模型

读到的[agentic/runtime.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/agentic/runtime.py)中，`_choose_actions`从有限动作集合中选择，`react_sync`执行状态/记忆/诊断等观察，`reflect_sync`按观察缺失和失败项构造反馈。这个模块自身不是通用LLM工具循环；不据此否认该仓库其他模块可能连接模型。

同样，给我们的内置探索加“自主Agent”名称也不会让它获得通用理解能力。需要复杂推理时，仍要由外部AI、配置的模型API或另行接入的本地推理服务承担；主机负责安全执行、反馈和证据。

### 3.2 外部MCP的“安全”分类与我们的策略不一致

[extension_bridge/policy.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/extension_bridge/policy.py)把`mcp.ext_call`列入SAFE集合，注释解释其信任主要在添加服务器时决定。这是信任模型选择，不是所有外部工具都只读的证明。

我们不能照抄这个分类：接入服务器后仍需知道具体工具权限与风险，未知工具默认不能自动升级为安全；远程危险命令拒绝、桌面输入单独授权等既有边界必须保留。

### 3.3 解释器白名单不是代码沙箱

MCP客户端的`_command_allowed`主要核对命令名称/路径basename，如node、python、npx；客户端环境还继承宿主环境。允许node/python并不能证明参数、脚本、包或解释器文件可信。这里没有完成攻击利用验证，但仅凭这层白名单不足以支持“配置被篡改也不能执行任意代码”的强保证。

若我们接外部MCP，应审核实际包/脚本及启动参数、限制环境变量继承、绑定工作目录、限制网络/文件能力，并记录操作者信任决策。

### 3.4 输出限制仍需按字节和总量设计

读取线程先`for line in self.proc.stdout`得到整行，再检查4MB字符上限；队列深度1000。这比完全无限队列更有边界，但不是严格的低内存预算：超长无换行内容仍可能在整行形成前积累，接近上限的很多行也有很大理论占用。

不能因为存在测试文件就假定所有资源边界充分。借鉴时应采用增量分帧、单帧字节限制、总缓存预算、异常终止与待处理请求失败传播。这是源码静态风险分析，未对该仓库运行OOM实验。

### 3.5 场景重试不能直接移植

场景默认只有一次尝试，但配置retry后，调用已成功、后置条件等待失败也可能进入下一次调用。用于读取可能合理，用于写文件、提交、付款或桌面点击则可能重复副作用。

我们的规则仍是：模型失败显式停止，不自动换模型重放修改；只读重试与有副作用步骤必须分开。后置条件失败应先读回核对，不能默认重新执行写操作。

### 3.6 WebSocket广播本身仍不是历史记录

读到的[events/runtime.py](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/arena/events/runtime.py)是实时队列广播，QueueFull时移除订阅者，这个模块自身不提供历史重放。项目另有审计模块，不能混称“所有事件天然可靠持久化”。

因此不建议用它替换我们刚补好的主机统计快照；下一步应补任务关联与明确的数据保留策略。

### 3.7 可持久化不等于事务安全

抽查的custom_tools和capability_gaps存储使用JSON直接write_text及部分内存缓存，不能仅凭“支持持久化”就宣称多调用并发、崩溃、磁盘写满情况下不会丢更新。若我们实现，需要原子写入、锁/串行化、版本冲突与损坏恢复测试。

### 3.8 不能复制整个产品范围

单进程单端口可以减少用户配置，但不是安全性质；我们仍必须区分本机控制面和认证公网MCP。也不应为复刻这个项目，同时引入Android、集群、语音、任意代码生成、自建插件市场和后台自启动。

原生MCP能解决的路线优先原生MCP；DOM浏览器扩展放在兼容路线，不把聊天页面文字直接当可信授权指令。

## 4. 建议的实施顺序与验收标准

以下是建议，不代表本轮已实现或已获准放宽任何权限。

| 优先级 | 建议任务 | 建议落点 | 通过条件 |
|---|---|---|---|
| P0 | 统一主机身份和能力诊断 | config/status、workspace_info/ping、前端Bridge与扩展 | UI和外部MCP能核对同一hostInstanceId、工作区及版本；缺依赖给出具体原因；不因工具注册就报告可执行；诊断默认只读 |
| P0 | 任务级可观测性与结果核验 | MCP入口、eventBus、任务板、Bridge页面 | taskId/callId关联开始/完成/失败/取消；刷新不丢当前进程状态；写任务必须读回；未确认结果标unknown而非成功；日志不含凭据/正文 |
| P0 | 将用户场景变成端到端回归 | 现有HTTP/浏览器/Windows测试与人工清单 | 帮助卡真点击、外部MCP真调用、断WS仍同步、主机重启状态解释清楚；失败用例不能仅靠相同DOM替身自证 |
| P1 | 强化内置探索的诚实契约 | runChat的内置流程及Chat文案 | 明确展示“确定性本机探索”；对显式文件优先读取并说明限制；工具结果与总结一致；不把搜索/模板草案叫通用推理 |
| P1 | 真正的外部MCP客户端 | 新独立客户端模块与生命周期管理；替代备注页的明确新入口 | 已审批测试服务器可initialize/list/call；断开/超时/取消可恢复；限制进程树、输出与环境；新工具不绕过逐项权限 |
| P2 | 可预览、可验证的工作流 | 在现有Skill/任务板之上，而非另造平行任务系统 | schema验证、权限传播、dry-run、步骤结果引用、失败停止；禁止未经确认的副作用重试；撤销可用 |
| P2 | 无原生MCP网站的扩展兼容 | 独立浏览器扩展，不塞入经典工作台 | 只识别明确工具块，用户可预览/拒绝；站点授权最小化；流式DOM不重复执行；回填后能证明同一次调用 |

实际开发应先把前三项连成一次小而完整的交付，不先堆功能目录。若未来选择持久化执行历史，要单独定义用户同意、脱敏、保留天数与删除机制；不能把它顺带当作持久化配对凭据的授权。

## 5. 与当前项目已有能力的关系

我们已有：认证MCP、受保护本机管理面、工作区文件读写/哈希保护、真实模型工具循环、内置探索、任务板、Windows进程树控制、桌面VS Code扩展、主机端Bridge计数与最近100条摘要。

应复用这些基础，而不是照搬一个Python主机替换Node主机，或同时运行两个彼此不关联的任务系统。最有价值的差距在于：能力状态统一、会话/任务/调用关联、结果读回验证，以及可受控接入第三方工具。

这个GitHub链接也不会自动给当前Arena聊天添加用户电脑的MCP工具。能力仍需实际连接到执行会话；从第三方项目学习不能改变这一事实。

## 6. 许可证与本轮交付

[LICENSE](https://github.com/IvanSkainet/arena-agent/blob/46d97048a75ed2fe7227a5ca6f2a85778d32ccd9/LICENSE)为MIT，含IvanSkainet的版权声明。未来若复制或实质改编代码，需要保留许可和版权通知，记录来源提交，并另查打包依赖和资源的许可证；MIT不等于删除署名，也不是安全担保。

本轮只新增本审阅报告及索引入口，不改产品代码、不安装第三方运行时、不更新用户验收通过项。未运行第三方测试；引用的测试仅证明存在相应测试代码，不声明它们在本环境通过。
