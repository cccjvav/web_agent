# 怎么改这个仓库

不需要另装工具链。改完测绿再提交。

## 跑测试

Windows：仓库根 `run-tests.cmd`。其它环境：

```bash
cd webagent-core/agent-host
npm test
```

不要在仓库根再放一份 `tests/`。不要为了绿灯去改 `webagent-repro/` 的 JS（已冻结）。

## 改功能时改说明书

约定在 `workspace/.webagent/skills/docs-sync/SKILL.md`。动到「为什么这样装」时改根目录 `架构导读.md`。可视化页：`node docs-site/build.js`。

## 不要做的

- 把演示钮改回「使用 GitHub 登录」，或把 Plan 改回假 97%
- 假装 Codex OAuth 已经接上；Named / ngrok 缺 Token 时不要写成已经开了 Quick Tunnel
- 从 `/api/status` 拿掉 `secretKey`（工作台靠它拼 MCP 地址）
- 拆成多把 secret、接钥匙串、OS 命令沙箱、PTY、按客户端隔离全部全局状态、Playwright 点工作台——**不是漏修**，理由见 [架构导读.md](./架构导读.md) 第 12 节
- 提交 `node_modules/`、`bin/code-server-runtime/` 里下载的包、`image-search/`

许可证 [ISC](./LICENSE)。安全边界 [SECURITY.md](./SECURITY.md)。
