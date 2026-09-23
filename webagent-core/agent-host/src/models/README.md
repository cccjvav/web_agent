# 工作区配置、画像与记忆

逐函数阅读：[配置存储详解](配置存储详解.md) · [画像与记忆详解](画像与记忆详解.md)。


## 职责与文件归属
这些模块把“当前被编辑项目”的配置和偏好放在其 `.webagent/` 下。安装器的用户runtime目录与这里的工作区状态不是同一个概念。

| 文件 | 存储/输出 | 用途 |
|---|---|---|
| `store.js` | `.webagent/config.json` | 模型、活动模型、Bridge选项、多模型配置及持久身份 |
| `modelSettings.js` | 严格模型设置请求→原子单文件保存结果 | 校验局部/旧整表模型API，保护脱敏Key与连接身份 |
| `customizations.js` | `customizations.json`及三份派生Markdown | 指令、偏好、环境/栈覆盖与界面列表 |
| `profile.js` | 返回对象或Markdown，不主动写盘 | 根据平台、项目清单和锁文件推断环境与测试命令 |
| `memory.js` | `memory/YYYY-MM-DD.md` | 追加简短备忘和读取日期条目 |

## 配置读写流程
### 模型与Bridge配置
`load`在文件不存在时使用defaults；已有文件的JSON或部分结构校验失败则抛 `E_CONFIG_CORRUPT` 并保留原文。模型ID须非空且不重复，已校验的模型字段要满足类型约束；这不是所有嵌套字段的完整schema验证。

`patch`先load，再合并顶层和特定子对象；`save`写同目录独占临时文件并rename，尝试0600权限及忽略规则保护。损坏配置应先备份再显式修复，不能期待下一次patch静默重置。权限模式在Windows不等价于完整ACL管理；gitignore也不能移除已跟踪的秘密文件。

模型POST另经`modelSettings.updateModelSettings`收紧：非空包装只接受activeModelId/models/model/multiModel，models与model不能混用；每条模型只接受运行时支持的固定字段（保留`capabilities`旧兼容数组），模型与多模型字段有类型、总量、枚举和引用边界，addProvider包装及目录项也拒绝未知字段，追加后整表不得超过100项。GET经`publicModel`只投影这组固定且类型/预算有效的字段并把Key替换为`••••`，`publicMultiModel`也只投影五个类型有效的运行字段；`/status`复用相同投影，不会把历史配置中的未知属性或错类型嵌套值原样发给页面。占位Key只可为同一模型、同一protocol/baseUrl/modelId恢复磁盘旧Key。改连接身份必须显式提供Key字段，防掩码或省略字段把现存凭据转绑到另一端点。整表兼容不等于开放无校验覆盖，保存仍是单进程同步读改写，不是跨进程CAS。

| 配置组 | 主要字段与语义 |
|---|---|
| 模型 | activeModelId、models中的id/protocol/baseUrl/apiKey/modelId；默认有builtin探索模型 |
| 多模型 | enabled、mergeModel、thinkLevel、maxBranches（2–8）、mergeAllowsRead |
| Bridge | loggedIn/deviceAuthorized、provider/username/githubId、tunnelProvider及提供商域名/Token |
| 主机身份 | secretKey、installId由config.persistIdentity补充，非每次随机生成的新配置 |

GitHub身份验证后保存身份字段，不保存该流程的PAT。模型API Key和隧道Token则可能存在config.json中；不能笼统说“没有凭据落盘”。

### 自定义配置：保证不同
`loadCustom`通过有界读取把历史文件投影为defaults声明的固定顶层：environment/techStack/codex按已知字段补默认，六类列表最多100项且各自只保留固定字符串字段；未知顶层、嵌套或列表项属性不经GET发布，已知槽位错类型仍抛E_CUSTOM_CORRUPT并保留原文件。仅ENOENT回默认。saveCustom先严格校验输入并读取旧配置，拒绝未知/错类型输入或覆盖损坏配置；所有目标走真实路径检查，提前渲染并逐输出检查8MiB预算，再通过独占临时文件和rename顺序写JSON及三份Markdown；不是四文件事务。

单文件替换保护不表示四份文件同时成功。后续派生文件失败时，前面的JSON可能已经改变；需要核查部分更新，不自动重试整个修改。patch拒绝空请求，按字段保留environment/techStack/codex中未提交的旧值；列表整体替换，不是任意层递归深合并。登记项内容并不因通过形状校验就变可信命令、URL或已实现功能，具体行为见逐函数说明。

### 环境与记忆
profile先探测平台、package/lock/项目清单，再用用户非auto的值覆盖；推断出的测试命令不证明依赖已安装或命令能成功。hooks、外部MCP配置等列表的存在不代表运行时执行器已经实现。

memory的day必须为有效日历日期；路径和真实链接目标经过工作区检查。remember写入正文最多16KiB、含追加内容的每日文件最多256KiB，超限保留原文并拒绝而不轮转；recall只读、不为了查询创建目录；读取有条目数及文本预算。Ask/Plan允许写这类协作元数据，不等于允许任意修改源码。

## 验证与关联
`stateIntegrity`覆盖store/customizations损坏保留与发布失败，`hostPersist`覆盖身份持久化，`profile`覆盖画像和局部保存，`apiFiles`以真实HTTP覆盖customizations固定schema/历史未知值投影，`auditStorage`覆盖记忆日期与路径。它们不证明customizations拥有四文件事务、跨进程CAS或登记内容可信。

配置进入Chat系统提示的链路见[Agent说明](../agent/README.md)；接口及失败映射见[API说明](../api/README.md)。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [customizations.js](customizations.js) | 17 个函数/类节点 |
| [memory.js](memory.js) | 9 个函数/类节点 |
| [modelSettings.js](modelSettings.js) | 21 个函数/类节点 |
| [profile.js](profile.js) | 15 个函数/类节点 |
| [store.js](store.js) | 31 个函数/类节点 |
<!-- docs-inventory:end -->
