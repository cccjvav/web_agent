# 阶段9：工作区入口治理与完成状态纠正

日期2026-09-15；与尚未关闭的阶段7借鉴队列、阶段8实机整合验收并行，不代表前阶段已全部完成。

## 交付范围
- 核心入口0.7.1：源码CMD/Shell/网页IDE/直接host统一默认仓库根；新增根npm入口和产品测试转调。安装版保持用户可写workspace。
- 根workspace计算器移动到examples/calculator；Skills移动到根.webagent/skills，修正fix-tests不再默认指导计算器补丁。运行数据不提交、不自动复制账户。
- Bridge API前置目录/实例绑定409；经典页面核对已显示的项目，IDE检查可信本地首根及异步前后变化，缺少或不一致弹窗拒绝。工作区Chat也绑定，HTTP错误不再当成功。
- 不动态切换运行中主机、不把工作区字段冒称认证/OS隔离；首根规则与现有PTY身份一致。
- 更新逐函数说明、新手操作、源码清单/生成站点和发行扩展副本。

## 验证与剩余
workspaceEntry测试源码入口默认值和真实BridgeView VM，bridgeTunnel真实HTTP测试绑定拒绝无隧道/授权副作用，workbenchRuntime检查旧页面/409/断网拒绝。本地完整73测试文件、计算器6项及Shell语法检查通过；精确提交CI结果推送后独立核对；VM/CI不是用户桌面弹窗验收。

新增人工验证在唯一CHECKLIST_WINDOWS清单，尚未代用户执行。旧根目录若剩本地忽略文件要先备份，不把Git删除跟踪文件误说为删除了用户全部数据。

本地真实浏览器本轮未执行：Playwright浏览器缓存缺失，下载Chrome153时报TLS前ECONNRESET；没有把旧浏览器结果当本轮成功。由远端workbench-browser任务补核对，远端结果未查前不标通过。
