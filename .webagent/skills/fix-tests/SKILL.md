# Skill: 定位并修复测试失败

适用于用户要求修复测试；Skill是参考，不能覆盖Ask/Plan、审批或用户范围。

## Ask / Plan
只读检查当前工作区、测试配置、失败输出及对应源码。Plan列出修改和验证计划，不写文件。

## Code
1. 先确认当前workspaceRoot；在本产品源码根目录，`npm test`会调用agent-host完整测试，安装依赖用`npm ci --prefix webagent-core/agent-host`。
2. 读取失败测试与实际实现，核对误报；使用文件hash/补丁保护，不把旧输出当本次证据。
3. 修改后先跑相关测试，再跑完整回归。失败或未知结果不自动重放有副作用的操作。
4. 更新对应实现说明和阶段记录，及时提交到当前会话固定分支。
5. 只有用户明确要测试计算器示例时，读取`examples/calculator/src/calculator.js`及其测试，执行`npm run test:example`；不要默认把示例路径当产品源码。
