# 模式、标签、Provider、画像与Plan测试

以下五个测试直接调用真实模块；它们不启动真实模型服务。每个文件由测试运行器放入独立Node子进程，模块内存改动不会自动共享给下一文件。

## chatMode.test.js

[源码](chatMode.test.js)无自定义函数，五个strictEqual依次验证command ask/plan、prompt以/ask开头、普通修复任务默认code、空对象默认code。它调用扩展的modeFromChatRequest，不经过VS Code注册；没有穷举command与prompt冲突、大小写及/plan、/code全部变体。通过不代表Ask端点所有内部元数据均只读。

## toolLabel.test.js

[源码](toolLabel.test.js)八个strictEqual验证：list_directory有dirPath显示Explored src；null结果也可给Explored .；find_files用total生成数量；search_files用totalMatches；read_files/apply_patch显示路径；load_skill分单Skill和技能列表计数。无HTTP、无目录读取；参数中的ok=false不一定令标签变失败，错误外观由消费者另处理。本测试保护显示文本，不认证工具真的成功。

## providers.test.js

[源码](providers.test.js)的**run()**先验证probeCaps不会因名字gpt-4o猜vision，显式capabilities才保留；probeContext无字段空，128000→128K、1000000→1M。然后保存global.fetch，替换为异步响应对象，其**text()**返回两模型JSON：一项只有名字，另一项有vision/context_window。

try内await listRemoteModels，两个find回调取相应记录，断言未声明者caps空/context空，声明者vision/128K。finally恢复fetch；run.catch打印并exit1。没有真实DNS/凭据、超时、错误响应或供应商协议完整测试；它防“按模型名字猜能力”的误报。

## profile.test.js

[源码](profile.test.js)mkdtemp并把config.workspaceRoot指向临时目录；**main()**：

1. detectEnvironment结果必须在支持的OS/Shell枚举，没证明与实际shell进程一定一致。
2. 写package.json（express及test脚本），detectTechStack应识别JavaScript/Express/npm，测试入口归一为npm test而非直接取脚本正文。
3. saveCustom写环境、技术栈、偏好、指令；断言两份Markdown实际存在及格式包含PowerShell/npm test。
4. 写review/SKILL.md；formatWorkspaceContext(loadCustom,技能元数据)需含环境/技术栈/语言/Skill；getInstructions也须包含环境、Skills、review；readResource(webagent://profile)含技术栈。

末尾rm临时目录，不在finally；中途断言失败可能留下临时文件，但不改真实工作区。此链证明文件→上下文→MCP资源的连接，不证明模型遵循指令或真正运行声明的测试命令。

## planRound.test.js

[源码](planRound.test.js)的**throwsCode(fn,code)**捕获同步异常，先断言确实抛再比code，防止“没有抛错也假通过”。顶层reset隔离单例状态：

| fixture顺序 | 断言/保护 |
|---|---|
| clamp undefined/1/99 | 默认4、下限2、上限8，初始inactive |
| 空任务start、无回合addBranch | E_PLAN_NO_TASK / E_PLAN_NO_ROUND |
| start max3 | maxBranches3，未有分支时canMerge/canBranch均false |
| 第一模拟分支 | index1，canBranch真但不能合并 |
| 第二分支 | canMerge真、branches长度2 |
| 第三后再加 | E_PLAN_FULL，不无限增长 |
| markMerged | merged真、canMerge假，再加E_PLAN_MERGED |
| reset、新回合只一支 | markMerged E_PLAN_NEED_TWO；第二支后合并成功 |

最终reset；异常中途不finally重置，但独立子进程退出隔离。这里只测试Plan状态机，不调用合并模型、HTTP或真实多Agent投票。

## 验证

`npm test --prefix webagent-core/agent-host -- --filter=planRound`；其余可将filter替换chatMode、toolLabel、providers、profile。测试数据名字和日期不是实际用户/服务观测。
