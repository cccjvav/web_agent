# 阶段8：双探针完整整合

状态：**0.5主体实现接入，自动回归/打包与真实环境验收分开管理；阶段未关闭**。目标是完整参考能力，Chat API确切验证后置。

| 能力 | 当前实现 | 证据/待验 |
|---|---|---|
| 单采集器/字段/协议/行为 | Inspector独占CDP；trace双解析及同源Fetch/XHR/EventSource/文本WS采样；标准/轻量预设 | 解包78项；通用采样合成回归；实际流格式待验 |
| trace/run/span/用量 | 原范围链保留；独立响应不硬绑run；跨端快照标注预算截断 | traceIntegration及原Inspector测试；真实标签/缺字段待验 |
| 离线分析/参考历史 | Worker、50条摘要、比较/删除、整库导出导入、旧浏览器批量迁移 | probeHistory/probeIntegration；实机持久化待验 |
| 实时浏览器→WebAgent→VSCode | 15分钟扩展Origin能力、单tab/工作区、2秒同步、明确订阅trace或response、过期停止 | probeBridge真实回环HTTP + 合成浏览器driver；Chrome权限/MV3待验 |
| 统一操作审批 | probe_request → operatorQueue → 单次命令；网页写操作再确认；取消/撤销/未知不重放 | 回环审批/所有权/幂等/撤销与DOM adapter桩；真实页面待验 |
| 公开映射刷新 | 固定公开源、无Cookie/跳转、预算/取消、缓存日期/冲突、当前UUID应用、目录导出 | 真实解析器合成输入；实际网页可用性待验 |
| 主动题组/tokenizer | 选择完整题目后逐次批准发送；拒答题安全替换；基准声明+prompt计数才测 | DOM adapter及tokenizer门槛回归；账户计费/可比计数待验 |
| 未知模型/历史聚类/回填 | 原向量、complete-link样本簇、精确UUID追加派生参考，不继承邻居身份 | 指纹/聚类/映射回填合成回归；原记录保留 |
| 文档/阶段管理 | 重写当前索引、阶段7/8、README和实施验收；逐函数解释及清单更新 | 文档机械检查/源码清单与站点构建；不宣称全文语义认证 |
| 桌面/真实网站/手机11.3 | 未实机验收 | 根目录《探针完整整合实施与验收.md》10步；不得由CI替代 |

## 证据管理

- 前一已交付基线：6d5d059 / CI35014925412九项成功，Companion0.4/浏览器0.3。
- 本轮：0.5两端构建及解包验证通过；新增probeBridge/probeIntegration，主机测试文件总数68。本地全量68文件通过；代码提交bed754754a7be88c9a4eee185ce981c23b125496，CI35020288953九项成功（https://github.com/cccjvav/web_agent/actions/runs/35020288953）。失败的中途回归不当作成功。
- 不隐瞒限制：任意旧Probe完整dump不是单次输入契约；未保存agent会话不得远控；CDP解压返回不具硬内存界；历史是投影，不是所有原始细节备份。
- 发行包：webagent-probe-companion-0.5.0.vsix、webagent-arena-inspector-0.5.0.zip；额外从解包模块验证popup配对→当前trace快照→命令执行→回执→断开（合成Chrome/fetch，不是实机）。
- 后续关闭要求：上述实机项有真实记录；若发现站点变化、数据迁移或控制差距，继续修复，不把未实现项永久排除。

## 管理修正
旧CONTEXT原样归档于context-history-through-0.4.md。当前索引≤80行，阶段表是管理状态依据；不再靠给过时结论追加“最新”段落掩盖矛盾。
