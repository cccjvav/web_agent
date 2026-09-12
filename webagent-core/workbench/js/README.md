# 工作台交互模块

逐函数正文：[状态与编辑器详解](状态与编辑器详解.md) · [启动与Chat详解](启动与Chat详解.md) · [Bridge与设置详解](Bridge与设置详解.md) · [交互绑定详解](交互绑定详解.md)。包含启动、事件绑定、编辑器保存、Chat流、Bridge与设置；HTML/CSS精细说明仍单独跟进。


## 职责与入口
这些ES模块由上一级app.js加载，在浏览器内维护工作台。整体布局和启动流程见[工作台说明](../README.md)，这里负责模块分工；不承担后端授权。

## 文件分工
- state.js：共享状态、DOM选择器及ui函数注册表。
- dom.js：主题、文字转义、提示和基础DOM能力。
- bind.js：界面事件与操作函数的接线。
- tabs.js：标签页、文件模型、dirty状态及保存/关闭交互。
- chat.js：聊天发送、流式结果、停止请求和会话展示。
- bridge.js：Bridge状态与连接/认证相关界面操作。
- settings.js：模型与自定义配置界面。
- picker.js：选择器相关交互。
- monaco.js：加载高级编辑器；失败/超时保留纯文本编辑，迟到成功先捕获缓冲区再升级。

## 执行流程与边界
app.js初始化绑定并并行拉取状态、目录和配置。模块经ui注册表调用，HTTP使用相对地址；后端校验不能用隐藏按钮替代。文件编辑按tab保留模型，保存携带磁盘hash，冲突或失败保持编辑内容；取消请求不保证已完成的磁盘操作可回滚。

## 验证
agent-host测试中的editorRuntime、workbenchRuntime、monacoLoading执行实际模块/函数fixture；HTML接线另有测试。真实浏览器焦点、页面卸载和无障碍仍需人工验收。

<!-- docs-inventory:start -->
## 自动源码导航

此区块由工具生成；登记和AST提取不等于语义审查通过。不要手改。

| 源码 | 定位证据 |
|---|---|
| [bind.js](bind.js) | 100 个函数/类节点 |
| [bridge.js](bridge.js) | 29 个函数/类节点 |
| [chat.js](chat.js) | 30 个函数/类节点 |
| [dom.js](dom.js) | 14 个函数/类节点 |
| [monaco.js](monaco.js) | 9 个函数/类节点 |
| [picker.js](picker.js) | 14 个函数/类节点 |
| [settings.js](settings.js) | 25 个函数/类节点 |
| [state.js](state.js) | 2 个函数/类节点 |
| [tabs.js](tabs.js) | 39 个函数/类节点 |
<!-- docs-inventory:end -->
