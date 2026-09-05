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

主工作台 `src/index.js` **不会** `listen` 4174。docs-site 可视化页默认 4173，不要和本进程搞混。

---

## 文件级（`app.js` / `index.js`）

当前处理目标：`webagent-core/admin-host/`。无 Express，只用 `http.createServer`。

### 📄 文件名：`app.js`

- **Function `defaultDataDir`（L6–L9）** — `WEBAGENT_ADMIN_DATA` 或本夹 `data/`。
- **Function `ensureToken(dataDir)`（L19–L34）** — 环境变量优先；否则读/写 `admin-token.txt`（chmod 0600）。
- **Function `ingest(dataDir, body)`（L54–L83）** — 无 `installId` 抛 400。按 installId+day 去重后追加。
- **Function `rankDay(rows, day)`（L85–L111）** — 同一 GitHub 用户或同一 installId 留最新一条；按 toolCalls 降序。
- **Function `renderPage`（L121–L182）** — HTML 排行榜；无 GitHub 显示「未绑定 GitHub」+ installId。
- **Function `createHandler({ dataDir, token })`（L207–L250）** — GET `/` HTML；GET `/health`；GET `/api/stats`；POST `/api/report` 要 Bearer；其它 404。
- **Function `createServer(opts={})`（L252–L258）** — 返回 `{ server, handler, dataDir, token }`。

### 📄 文件名：`index.js`

L1–L14：`WEBAGENT_ADMIN_PORT` 默认 4174，`listen(port, '0.0.0.0')`。打印本机 URL 与数据目录。未设 `WEBAGENT_ADMIN_TOKEN` 时提示令牌文件路径。
