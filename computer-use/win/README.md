# Windows桌面辅助实现

## 职责与入口
本目录提供截图、窗口信息、坐标标记、点击和文字提交。用户操作契约以[computer-use技能](../SKILL.md)为主；这里解释源码分工，不复制整份操作教程。

## 文件分工与流程
- snap.ps1加载capture.cs进行截图；info.ps1查询窗口信息。截图不是操作成功证明。
- mark.ps1加载mark.cs，在截图副本绘制目标点，帮助点击前复核。
- act.ps1加载input.cs：按唯一标题子串或前台窗口定位，检查矩形/焦点/坐标后提交前台点击。
- act-bg.ps1加载input2.cs：将窗口矩形坐标转换为客户区坐标，通过PostMessage提交后台点击。
- type.ps1加载keys.cs：选择后台粘贴、前台粘贴或WM_CHAR。剪贴板快照失败时不修改；finally尝试恢复，外部剪贴板变化时拒绝覆盖。

## 边界与验证
ERR_*必须非零退出，SUBMITTED只表示提交尝试，不代表应用接受。标题多匹配拒绝，前台操作仍有焦点竞争；DPI、遮挡、特殊剪贴板格式需实际桌面核验。Windows CI编译输入C#及解析PS，并检查无效句柄；截图/标记辅助及完整桌面流程不能仅靠这些检查宣称验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [act-bg.ps1](act-bg.ps1) | 文件级登记；未做符号完整性证明 |
| [act.ps1](act.ps1) | 文件级登记；未做符号完整性证明 |
| [capture.cs](capture.cs) | 文件级登记；未做符号完整性证明 |
| [info.ps1](info.ps1) | 文件级登记；未做符号完整性证明 |
| [input.cs](input.cs) | 文件级登记；未做符号完整性证明 |
| [input2.cs](input2.cs) | 文件级登记；未做符号完整性证明 |
| [keys.cs](keys.cs) | 文件级登记；未做符号完整性证明 |
| [mark.cs](mark.cs) | 文件级登记；未做符号完整性证明 |
| [mark.ps1](mark.ps1) | 文件级登记；未做符号完整性证明 |
| [ocr.ps1](ocr.ps1) | 文件级登记；未做符号完整性证明 |
| [snap.ps1](snap.ps1) | 文件级登记；未做符号完整性证明 |
| [type.ps1](type.ps1) | 文件级登记；未做符号完整性证明 |
<!-- docs-inventory:end -->
