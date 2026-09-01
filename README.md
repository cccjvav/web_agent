# ShunCode 复现工作台

对照官方文档 [docs.shuncode.top](https://docs.shuncode.top/docs/intro/) 的本地可运行版本。

**Windows 用户请先读 [使用指南.md](./使用指南.md)**（安装、CMD、自己的仓库、ChatGPT Bridge 全在里面）。

- 右侧 **Chat**：Ask / Plan / Code，只改本机，不需要隧道
- **Bridge**：把同一套工具变成 MCP，给 ChatGPT / Arena 用；在自己电脑上需要 cloudflared

## Windows 最快开始

```bat
check-env.cmd
run-shuncode.cmd
```

浏览器打开 http://127.0.0.1:3000

挂你自己的仓库：

```bat
run-shuncode.cmd D:\code\my-app
```

让 ChatGPT 改这个仓库：先 `winget install --id Cloudflare.cloudflared`，再在工作台 **启动 Bridge** → **复制提示词**。细节见使用指南第 6 节。

## 其它环境

```bash
./run-shuncode.sh
```
