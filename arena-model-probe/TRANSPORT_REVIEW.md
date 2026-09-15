# 采集层审阅与修复（2026-09-15）

本轮完整读取interceptor.js；读取main.js生命周期/导出段和ui.js结果呈现段、classify.js前85行、selftest.mjs入口。没有跑原型的启动、登录、CDP、主动提问或后台轨迹功能；新测试只导入不自动启动的interceptor/classify/registry，数据由隔离fixture提供。

## 已确认并修复

| 问题 | 修复 | 验证 |
|---|---|---|
| fetch流分支返回new Response，丢失原Response的url/redirected/type等语义 | 原对象原样返回，采样使用clone，不包装成替代响应 | 严格对象相等、url、请求参数和正文仍可读 |
| 缓冲区只有text截断，buf遇到无换行长流会增长 | 每次捕获1MiB/4096块，每行65536字符、最多4096行；越界标truncated并停止采样 | 长行、单块超额、单字节持续输入、单块很多行 |
| clone().json/text可能读取整份大响应，旁路读没有并发/时间上限 | readCapture统一4路、15秒、字节/块预算；JSON截断不当完整证据解析 | 容量、截止回调、取消与释放；不取消页面自身的请求 |
| XHR复用叠加load回调，旧请求上下文可能被再次记录 | send前移除旧回调，新监听只消费一次；空URL也清理旧监听 | 同一个XHR反复open/send只剩一个监听 |
| XHR正文/观察记录不受原SSE保留上限约束 | 正文最多200000字符，BUS.addObservation统一最近20条 | 30次写入只保留20条 |
| WebSocket/EventSource包装丢静态常量、允许不用new调用、子类构造语义不稳 | 继承原构造器静态属性，用Reflect.construct传递new.target | OPEN/CLOSED常量、无new拒绝、子类instanceof/参数 |
| UI把启发式权重当成“置信%”，把标签当已核实真名 | 改称线索分、非认证概率、运行标签自报未独立核验 | 静态标签回归；未评估真实分类准确率 |

## 函数与预算说明

- `readCapture(body, consume)`取得clone reader后登记activeCaptures，启动15秒计时器；read循环先核对累计bytes/chunks，再调用consume。consume返回false结束解析；异常取消旁路，finally清计时器/登记并释放锁。tee分支的cancel可能等原页面消费，所以不await cancel；不是终止页面传输。
- `stopCaptures()`只停止当前旁路读取，**不是卸载所有钩子/停止整个原型**，后续请求仍可能被采集。
- `SSETap.feed/handleLine/finish`检查字节/块/行上限；遇限丢弃残留半行、记录truncated、只发布一次观测。事件/帧类型各最多64个、每项128字符。usage只扫描最近8192字符，可能漏掉较早数据，不承诺完整账单统计。
- `BUS.addObservation`统一限制条数；它保留的原型观测仍可能含正文和敏感内容，不等于脱敏器，不能把它的dump导入本机连接核对。
- fetch hook只旁路采样最多32768字符的疑似推理请求体；clone读取达到容量时跳过，不改变页面响应。响应/请求过滤仍是启发式。
- socket消息只检查大小，不能因此认为它已经具备按用途的隐私隔离。

## 尚未完成，不能称全扩展无bug

- main仍缺完整销毁协议；后续生命周期修复已禁止热替换叠加实例，更新需要刷新。HUD销毁不等于清除订阅、定时器和网络钩子。
- SSETap不是完整标准SSE实现，尤其多行data/CR换行、内容与事件关联需单独协议测试。
- XHR非文本responseType、错误/中断与跨请求归属仍需扩展测试；原页面自身的大响应下载不受探针采样预算约束。
- 分类权重、相似度及协议归属未经统计校准；多来源可能共享同一上游，不能算独立证明。
- 自动令牌/轨迹解析、原始dump隐私、Python脚本、真实站点/浏览器兼容尚未全审。新代码不会自动运行这些路径。

测试入口（产品源码目录）：`node webagent-core/agent-host/tests/probeTransport.test.js`，已加入npm test自动发现。不要把这组离线通过写成真实Arena会话或具体模型身份验证。

另已纠正文档：document-start元数据不等于main实际已安装钩子（当前仍可能等DOMContentLoaded），单次DevTools注入不会跨刷新保留。这里只修正错误操作说明，启动时序代码尚未重构。

## 本轮执行记录

- 本机完整`npm test --prefix webagent-core/agent-host`：61个测试文件全部通过。
- 完整静态读取tools/build.mjs后执行纯本地构建，再对两个产物运行`node --check`：均通过。没有执行/注入产物；dist保持忽略，不随安装包带入原型。构建成功不代表浏览器运行成功。
- 浏览器接入回归的精确提交CI结果另记在集成报告，不拿本轮单元测试代替。

## 后续交叉核查

已补齐main.js全文阅读，runmodel.js只读自动编排/轮询/重置段，ui.js追加拖动段；不把这些标作全模块审计。运行标签的HUD日志和note也改为未核验；主入口返回的verdict显式modelIdentityVerified:false，旧的realName:true改为reportedName:true（仓库内没有其他消费者）。既有realModel/realModels函数名暂保留兼容，只返回来源报告的名称；历史VERIFIED存档枚举不构成认证，后续需独立数据迁移而非伪造验证。

补充待修候选：quickVerdict把不同请求的modelId证据混用；recompute每次可能重复加入同一canary证据且绕过BUS.push上限；自动轮询读取可变全局run状态，跨请求归属与重置的竞态尚待隔离测试。没有为了通过测试而执行真实令牌/轨迹。这些仍影响原型判定可靠性，因此原型仍不随产品启用。

## 生命周期续修

已修复三个可复现问题，仍只运行隔离fixture：

1. `BUS.on`以前不返回退订函数，emit直接遍历可变数组且漏掉async rejection。现在每次注册拥有独立包装函数，返回幂等退订；emit使用订阅快照，隔离同步异常及异步拒绝。本次事件开始时的订阅仍收一次事件，增删在下一次生效。它不自动取消监听内部已启动的异步工作。
2. HUD只监听document mouseup，失焦/拖动中关闭会残留mousemove。新增`destroy`清理起始/移动/结束/blur监听、动作回调与日志；重复mousedown先释放前次拖动，非左键忽略。关闭按钮调用destroy，后续render/log不再操作被销毁面板。**关闭面板不停止采集**，按钮说明与README已明确。
3. 旧main在DOMContentLoaded前没有启动预约，重复注入可注册多个boot；换版仅移除旧HUD却保留旧后台任务。新`lifecycle.js.scheduleBoot(win,doc,version,start)`同步登记pending票据；run先核对票据/占用，再依次标starting/ready。异常标failed且不重试，已有实例/预约不替换。main.boot也拒绝重复的半启动实例，同一已有实例直接返回。

`tools/build.mjs`把lifecycle列入构建/哈希模块清单。测试覆盖同版/不同版重复排队、重复DOMContentLoaded、已有旧API、启动异常、排队后被旧实例占用，以及退订快照、async rejection、blur/mouseup/重复拖动/幂等destroy。这里只把boot替身计数，未调用真正main.boot；不运行令牌/轨迹链。

后续仍需全局停止的所有权设计和真实浏览器原型验证；目前保留“禁用注入后刷新”的退出方式。此前列出的SSE多行、证据归属及轮询竞态没有被这批生命周期测试覆盖。

新增workbench.browser的隔离HUD浏览器回归：只加载ui.js到空白页、拦截全部网络，验证实际Shadow DOM拖动/失焦/关闭按钮/销毁后的行为。不加载原型main、采集层、账户或轨迹模块。其结果以最新提交CI为准，不将本地语法检查冒充浏览器通过。
