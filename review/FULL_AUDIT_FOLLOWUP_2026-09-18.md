<!-- 定位：第45组全仓交叉审查、实修与验证报告；结论按证据范围成立，不是用户实机或形式化安全认证。 -->

# 全仓交叉审查与实修报告（2026-09-18）

- 固定分支：`arena/01a0b053-web-agent`
- 同步目标：`arena/01a0b0da-web-agent`，基线 `81fb5c2527bffe227c6e69afedae466b25aadf82`
- 前置报告：[全仓检查与优化报告](OPTIMIZATION_REPORT_2026-09-18.md)

## 1. 结论摘要

本轮先逐项交叉复核前置报告，再扩展到工作台结果合同、认证并发、文件创建、PTY、HTML/CSS/键盘交互、CI、文档库存和辅助项目。前置报告的P1-A七个结果消费者与P2-D设备码竞态均确认存在并已修；P2-A生产依赖审计改为高危硬门禁。扩展审查另发现并修复Chat流缺可靠终态、`createOnly`链路非独占、补丁后读覆盖草稿、Bridge刷新真假值、模态/页签/工具卡键盘语义、窄屏侧栏，以及`arena-model-probe`同名未知模型重复建档。

在当前自动化与静态证据范围内，没有遗留已知P0/P1阻塞。这个结论不等于形式化安全证明，也不覆盖真实Windows/VS Code、屏幕阅读器、手机、Cloudflare/ngrok或第三方模型服务实机。

## 2. 覆盖方法

| 范围 | 实际检查 |
|---|---|
| JavaScript / Node | 对247项源码库存中的202份JS做`node --check`；阅读网络结果消费者、认证、文件、PTY、补丁、状态发布与UI动态DOM；完整83文件主测试 |
| HTML / CSS / 浏览器代码 | 重复ID、控件名称/标签、原生按钮、ARIA、焦点、键盘页签、11px下限、390px布局静态与VM回归；真实Chromium断言已写入但本机浏览器缺失 |
| Python | 库存中的2份Python用`py_compile`；辅助打包器仍由主测试/Windows CI覆盖 |
| C# / PowerShell / CMD / Shell | 4份Shell以`bash -n`检查；C#/PowerShell/CMD在本机无编译器，仅核对现有Windows CI编译/解析门禁，不冒充本地执行 |
| 文档 | `check-docs --write`重建247源码、28目录、110排除库存；函数说明学习/质量守卫、文档站构建与镜像一致性 |
| 辅助项目 | calculator 6项、trace-inspector 77项、model-probe四阶段离线verify；冻结`webagent-repro/`保持零差异 |
| 依赖与CI | 生产依赖`npm audit --omit=dev --audit-level=high`；工作流最小`contents: read`权限与高危门禁人工复核 |

## 3. 已修问题与边界

### 3.1 结果消费与可靠终态

- `bind.js`的演示登录、令牌/设备登录、清除身份、新建文件、终端、搜索和Skill创建现在同时验证HTTP、严格业务字段与关键响应形状；写已确认但后续读取失败会单独提示，不自动重放写操作。
- `chat.js`拒绝非2xx、无body、畸形NDJSON、超限未分帧缓冲、无`done/error`终态的断流，以及`error → done`伪成功；只有可靠`done`且未见`error`才写入assistant历史。
- `tabs.js`的文件树、打开文件、保存、预览和回退要求可信内容/hash/路径合同；补丁后读通过`reconcilePatchedFile`协调：干净标签更新磁盘内容，脏草稿保留并依赖旧hash阻止误覆盖。
- Bridge活动刷新返回真实布尔结果；清除本轮的写确认不会因随后状态读取失败被改写成“未清除”。

### 3.2 认证、文件与PTY

- GitHub身份操作使用服务端和浏览器两层代次。新设备流程、令牌登录、演示登录或清除都会淘汰旧流程；设备poll单飞，旧异步响应不能覆盖新身份。
- 浏览器新建发送`createOnly:true`；路由、工具入口和文件写入均传递该合同，独占临时文件加硬链接完成原子创建；`EEXIST`映射`E_FILE_EXISTS`/HTTP 409。并发HTTP回归证明同一路径只允许一个胜者。该保证不宣称隔离同用户外部进程对父目录的恶意竞态。
- PTY的hello、poll、claim、accept、check、input和cancel消费者只接受2xx及对应严格业务字段；HTTP 409伪成功不能确认或spawn。发行安装镜像与规范扩展按字节同步。

### 3.3 UI、排版与交互

- 静态表单控件补齐可访问名称，伪链接/可点击容器改为原生按钮；动态文件树、搜索结果、编辑器标签、空聊天入口和工具详情均可键盘操作。
- 模态框打开后聚焦内部，`Tab/Shift+Tab`约束可见控件，`Escape`关闭并恢复触发器焦点；折叠`details`里的隐藏后代不进入焦点循环。
- 编辑器标签与右侧Chat/Bridge页签采用`aria-selected`、`aria-controls`、roving tabindex以及左右/Home/End键；tabpanel关系明确。工具卡原生披露按钮同步`aria-expanded`。
- 所有工作台小字下限调整为11px，补统一`focus-visible`轮廓；390px下侧栏改为视口内覆盖抽屉，中心/右栏保持可达并禁止水平溢出。

### 3.4 工程化、文档与辅助项目

- GitHub Actions顶层权限收敛为`contents: read`；生产依赖高/严重公告现在直接使CI失败，不再`continue-on-error`。
- `.webagent`本地身份、用量、记忆和定制文件加入嵌套及根忽略规则，避免启动工作台后反复污染工作树或误提交本地数据。
- 文档库存、函数说明、测试导航、API/认证/PTY/工作台页面与样式说明已同步；自动生成`documentation-manifest.json`、`source-index.md`与`content.js`。
- `arena-model-probe`离线verify实际复现：同一已声明未知模型因时序指纹变化再次返回`NEW_MODEL`；已改为模型ID精确命中优先，兼容没有向量的已验证条目，并过滤畸形证据/导入项。没有恢复CDP、账户或外部整合施工。

## 4. 前置报告交叉复核状态

| 前置项 | 当前状态 |
|---|---|
| P1-A 七个假成功/坏结果消费者 | 已逐项修复并加入VM/HTTP/PTY回归 |
| P2-D 设备码轮询无catch/代次/中止 | 已修：AbortController、浏览器代次、服务端代次及poll单飞 |
| P2-A 审计不阻断CI | 已修：高危生产依赖硬门禁 |
| P2-B Node 18/20 EOL | 保留，属于兼容矩阵与最低版本的产品取舍；不在本轮擅自缩减 |
| P2-C 缺少lint/format | 仍在；当前有语法、Acorn函数文档和行为测试，但不等价ESLint。引入前需处理旧代码告警及冻结目录边界 |
| P2-E 长文件拆分 | 未做；为拆而拆会放大风险，当前优先保持行为修复可审 |
| P3 生成物/截图/发行副本权重 | 未改仓库策略；保留现有生成一致性与安装镜像字节守卫 |

## 5. 验证结果

最终验证应以本报告提交后的CI为准；本地已执行结果如下：

- agent-host：83个测试文件全部通过；故意注入的`fixture stop failed`等stderr不代表套件失败。
- 文档：247项源码、28个目录、110项排除；清单检查、函数学习/质量守卫及文档站构建一致。
- 辅助项目：calculator 6/6；trace-inspector 77/77；model-probe构建、69项单测、15项E2E、20项启动冒烟四阶段通过。
- 生产依赖审计：0个已知漏洞；结论只对应执行时公告与生产依赖。
- 语法/镜像：202份库存JS、2份Python、4份Shell通过对应本地语法检查；规范扩展与安装镜像一致；`webagent-repro/`零差异。
- 真实浏览器：本机没有Playwright Chromium，下载此前持续`ECONNRESET`，因此新增模态焦点、页签键盘和390×844断言尚未本地执行；CI的`workbench-browser`必须补这层证据。

## 6. 仍需保留的风险/决策

1. 等CI在Ubuntu/Windows Node矩阵、Windows C#/PowerShell/Inno和真实Chromium上验证本提交；本地不能代签。
2. Node 18/20最低兼容与矩阵是否退役需产品决定，并同步`engines`和用户指南。
3. 最小ESLint、`routes.js`拆分及`content.js`生成物策略仍是维护性候选，不是本轮功能缺陷。
4. 真实VS Code、多窗口、屏幕阅读器、手机窄屏、隧道和第三方OAuth/模型服务仍按人工清单验收。
5. 外部探针整合仍暂停；本轮只修离线自检实际暴露的本地建档缺陷，不宣称外部项目已交接。
6. 全仓逐文件清单中的“待逐句”文档仍不能因本报告自动获得语义认证；本报告只对上表列明的代码链与相邻说明负责。

## 7. Git工作区恢复记录

对话中断后，沙箱把固定分支ref恢复到初始`1d532d0`，但工作文件仍是目标分支加本轮修改。已先保存二进制diff及未跟踪文件清单，再显式fetch目标分支，确认`FETCH_HEAD=81fb5c2`，只用`update-ref`和`read-tree`恢复当前固定分支引用/索引；没有`reset --hard`、`clean`或覆盖工作文件。此记录防止后续把上游历史误算成本轮修改。
