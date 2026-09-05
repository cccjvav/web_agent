# 使用统计后台（独立进程）

这是一个**单独的 Node 服务**，默认监听 **4174**。主工作台（`agent-host` 的 4173）**不会**自动打开这个端口。

## 启动

Windows CMD：

```
cd 仓库根
run-admin.cmd
```

或：

```
set WEBAGENT_ADMIN_PORT=4174
node webagent-core\admin-host\index.js
```

macOS / Linux：

```
./run-admin.sh
```

打开 `http://127.0.0.1:4174/` 看当天排名。`GET /api/stats?day=YYYY-MM-DD` 返回 JSON。

## 客户端怎么上报

在跑工作台的那台机器上设置：

- `WEBAGENT_TELEMETRY_URL` = `http://127.0.0.1:4174/api/report`（或后台的公网地址）
- `WEBAGENT_TELEMETRY_TOKEN` = 与后台令牌相同

后台令牌来源：

1. 环境变量 `WEBAGENT_ADMIN_TOKEN`，或
2. 首次启动时写入 `webagent-core/admin-host/data/admin-token.txt`（可用 `WEBAGENT_ADMIN_DATA` 改数据目录）

客户端每 15 分钟、以及 Bridge 工具调用后约 4 秒，把**当天**的 `toolCalls` / 失败次数 / `installId` / 可选 GitHub 用户名 POST 过来。没配 URL+令牌就不发，工作台照常可用。

## 鉴权

- 看网页和 `/api/stats`：**不需要**令牌（本机排行榜）。
- `POST /api/report`：必须 `Authorization: Bearer <令牌>`。

不要把令牌写进仓库。`admin-host/data/` 已在 `.gitignore`。
