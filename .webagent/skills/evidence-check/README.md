# Evidence-check Skill资源

本目录属于源码根工作区的`.webagent/skills`，不是自动执行入口。SKILL.md定义用途，references/checklist.md解释核对步骤；workflow.json是供人工审阅、预览、逐次审批的声明式工作流样例，不授予权限。不得把主机身份、模型自报或CI绿灯混成真实账户验收。

workflow.json字段由agent-host workflows.preview/validate检查；步骤、before/expect、工具白名单和资源预算以受控工作流详解为准。验证：预览不执行，审批后才执行；来源名不意味着安全认证。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [workflow.json](workflow.json) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
