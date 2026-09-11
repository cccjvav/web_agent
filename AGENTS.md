<!-- 以下内容由 project-manager 自动生成与维护 -->

## 项目管理

本项目使用 project-manager 规则进行推理型项目管理。任何 AI Agent 处理本项目任务时，须遵循以下规则。

### 启动顺序
1. 读取 `manager/CONTEXT.md`（项目索引，< 80 行）
2. 读取 `manager/agents.md`（项目约定）
3. 不支持 Skill 的工具：在步骤 1 之前先读 `manager/SKILL.md` 获取完整规则
4. 按 CONTEXT.md 的「导航规则」按需读取其他文件，禁止预加载全部

### 触发项目管理的时机
- 开始新上下文或接手项目
- 需要了解项目当前状态
- 进入新开发阶段
- 完成开发后更新项目记录
- 用户要求生成使用手册
- 用户提到「项目管家」「更新项目记录」「生成手册」

### 完成开发后必做
1. 更新 `manager/CONTEXT.md` 的「当前状态」
2. 在 `manager/stages/` 当前阶段文件追加关键决策
3. 有复用价值的经验同步到 `manager/docs/experience.md`
4. 检查 CONTEXT.md 非阶段摘要区域是否超 80 行

### 注意事项
- 产品用户指南仍是仓库根 `使用指南.md`，不要另写第三份总说明书抢地位
- 只推当前Arena会话固定分支（以会话提供的分支为准，不沿用历史分支名）
- 涉敏信息用 `{{占位符}}`，真实数据只存 `manager/privacy.md`（已 gitignore）
