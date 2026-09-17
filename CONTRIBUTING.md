# 怎么改这个仓库

## 环境与测试

主程序使用 Node.js/npm；开发校验还需要 agent-host 的开发依赖，包括文档解析所用的 Acorn。Windows 用户使用桌面 VS Code 集成 CMD；Python 项目继续使用已有 Conda 环境，不要求另建 venv。

从仓库根准备完整依赖：

```sh
npm ci --include=dev --prefix webagent-core/agent-host
```

Windows 可以执行 `run-tests.cmd`；跨平台可以执行：

```sh
npm test --prefix webagent-core/agent-host
```

产品启动器安装的生产依赖不等于测试环境。浏览器回归、Windows 安装器编译等还有各自前置条件，见[测试说明](docs/development/测试说明.md)及 CI 工作流。必须检查测试真实退出码，不能仅凭日志尾部判定成功。

## 修改与文档闭环

[代码文档维护规范](manager/docs/documentation.md)是唯一维护规则：目录 README 解释本模块，复杂函数详解保留在其主解释位置，根指南不再复制完整实现清单。

先逐句核对涉及的正文与源码，直接删除或更正错误句子，不在矛盾正文后追加免责声明。然后从仓库根执行：

```sh
node docs-site/check-docs.js --write
node docs-site/build.js
node docs-site/check-docs.js
npm test --prefix webagent-core/agent-host
```

生成器只维护清单、源码 hash、符号及导航，不认证语义。删除文档时同时修复链接、站点页面和测试；已完成审查与待审范围分别记录。源码无变更也不表示旧说明天然正确。

## 保持的边界

- 只在当前 Arena 固定分支工作并及时推送经过验证的批次；不覆盖未核实的本地修改。
- 不为绿灯改冻结的 `webagent-repro/`，不另复制根 `tests/`。
- 不把内置探索器、演示授权、探针参考或 Plan 拼接包装成真实大模型、GitHub 登录、模型身份证明或投票共识。
- 模型故障明确停止；不得自动切模型、扩大权限或重放可能已有副作用的操作。
- 本机 `/api/status` 返回连接所需秘密，不能因此开放远程控制面。权限与网络边界见 [SECURITY](SECURITY.md)。
- 不提交依赖、下载运行时、输出包、有效令牌或原始抓包。许可证见 [ISC](LICENSE)。
