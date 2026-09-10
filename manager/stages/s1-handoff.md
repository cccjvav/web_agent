<!-- 定位：项目阶段开发记录，记录该阶段的需求、设计、实现决策和复盘 -->

# 阶段 1：交接与本机视觉

## 目标
下一任助手能靠 L0+L1 接手；本机 Chat 按 PROMPT_SHUNCODE 第一阶段能看 computer-use 截图。

## 实现
- 官方 project-manager SKILL.md 放入 `project-manager/` 与 `manager/SKILL.md`
- 根目录 `CONTEXT.md` 改为指向 `manager/CONTEXT.md`
- `load_skill` 全文上限提到 28000，避免 23KB 的 SKILL 被截断

## 第一阶段「眼+手」关键决策（会话分支 arena/01a07238-web-agent，2026-09-07）
- **「手」选薄转发**（任务书两案中成本最低者）：`loadSkill('computer-use')` 返回 `absDir`/`scriptsDir`/`runHint`，executor/dangerous/resolveSafePath 零改动，不开任意 `D:\` 读
- **「眼」关在 agent 层**：新 `src/agent/computerUse.js`（截图白名单 = 工作区或仓库根 computer-use/，realpath 判 symlink 逃逸，仅 png/jpg，6MB 上限）；`openai.js` 工具循环里 vision 模型下一回合收 `role:'user'` + `image_url` data URL；base64 只进请求体，事件流只带相对路径
- **诚实失败**：`modelSeesImages` 只认显式 `vision:true` 或 caps 含 vision（不猜 modelId）；纯文本模型注入系统提示 + status，不假 OCR；设置页 Add API 增 `#m-vision` 勾选
- **Bridge 零改动**：`tools/call` 恒 `{type:'text'}`，`tests/chatVision.test.js` 源码锁防回潮（含 mcp/server.js 与工作台 UI 三件套）
- **合并产品分支 92b3e93**（2d1a4b9）：skills.js 冲突两取（BUNDLED_SKILL_NAMES+28000 与 absDir/runHint 共存）、tools/README loadSkill 行号校正为 L59–L96、content.js 以合并后源重建
- 交付明细与 Windows 真机待办 → `review/REPORT_SHUNCODE_S1.md`
