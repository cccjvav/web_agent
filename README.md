# ShunCode 复现工作台

对照官方文档 [docs.shuncode.top](https://docs.shuncode.top/docs/intro/) 实现的本地可运行版本。

- 编辑器是 Code-OSS 风格载体（Web workbench）
- 模型循环跑在独立 `agent-host`（端口 `48271`），不写进 VS Code 内核
- Chat：Ask / Plan / Code 工具锁
- Plan：多模型博弈（同一起点独立作答，意见一致再行动）
- Code：`apply_patch`（sha256 / STALE_FILE / 整包预检）
- Bridge：Streamable HTTP MCP（`/mcp/<secret>`），复制提示词接到 ChatGPT / Arena 等

```bash
./run-shuncode.sh
```

预览端口 **3000**。Chat 模式不用登录；本复现已预置 Bridge 演示授权。
