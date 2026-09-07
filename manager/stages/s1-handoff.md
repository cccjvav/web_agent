<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 1：交接与本机视觉

## 目标
下一任助手能靠 L0+L1 接手；本机 Chat 按 PROMPT_SHUNCODE 第一阶段能看 computer-use 截图。

## 实现
- 官方 project-manager SKILL.md 放入 `project-manager/` 与 `manager/SKILL.md`
- 根目录 `CONTEXT.md` 改为指向 `manager/CONTEXT.md`
- `load_skill` 全文上限提到 28000，避免 23KB 的 SKILL 被截断
