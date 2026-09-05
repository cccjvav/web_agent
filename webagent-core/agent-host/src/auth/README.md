# auth 模块说明书

当前处理目标：`webagent-core/agent-host/src/auth/`

本目录只有 `github.js`：用 GitHub **校验用户名**（PAT 或 Device Flow）。**不**把令牌写入 `config.json`。Chat 不需要走这里。无 `.json` / `.html`。

---

## 1. 模块概述

- **定位：** Bridge 可选身份。成功则 `store.patch` `provider:'github'` + `username` + `githubId`。失败保持本机演示授权。
- **依赖：** `../models/store`。HTTP 走注入的 `fetchFn`（默认全局 `fetch`）。
- **谁调用：** `../api/routes.js` 的 `/bridge/token`、`/bridge/device`、`/bridge/device/poll`、`/bridge/github/clear`、`/bridge/logout`；`GET /status` 读 `deviceAvailable()`。

环境变量：`WEBAGENT_GITHUB_CLIENT_ID`（有才开设备码）、可选 `WEBAGENT_GITHUB_CLIENT_SECRET`。

---

## 2. 文件级详细说明书

### 📄 文件名：`github.js`

- **文件职责：** 调 `api.github.com/user` 或 GitHub Device Flow；模块级 `pendingDevice`（进程内存，关了就没）。
- **核心类/函数清单：**

  - **Function `githubClientId`（L5–L7）** / **`githubClientSecret`（L9–L11）** — trim 环境变量。
  - **Function `deviceAvailable`（L13–L15）** — client id 非空则为真。
  - **Function `fetchGitHubUser(token, fetchFn=fetch)`（L17–L48）** — `GET https://api.github.com/user`，`Authorization: Bearer`。非 JSON 当 `{}`。`!ok` 抛（`status` 原 HTTP，文案要 `read:user`）。无 `login` 抛 502。返回 `{ login, id, name }`。
  - **Function `applyGithubUser(user)`（L50–L67）** — patch `loggedIn/deviceAuthorized` true，`provider:'github'`，`username=login`，`githubId`，`license:'github'`。返回 `{ success, provider, username, githubId }`。**不**保存 token。
  - **Function `clearGithubKeepDemo`（L69–L81）** — `pendingDevice=null`；bridge 收回 `local-demo` / `local` / 空 `githubId`，仍 `loggedIn`。
  - **Function `loginWithToken(token, fetchFn=fetch)`（L83–L92）** — trim 空 → 400。否则 `fetchGitHubUser` + `applyGithubUser`。
  - **Function `startDeviceLogin(fetchFn=fetch)`（L94–L133）** — 无 client id → `E_NO_GITHUB_APP` 400。POST `https://github.com/login/device/code`（`client_id`、`scope=read:user`，有 secret 才带）。缺 `device_code`/`user_code` 抛 400。写入 `pendingDevice`（interval 至少 5，expiresAt）。返回 userCode / verificationUri / interval / expiresIn。
  - **Function `pollDeviceLogin(fetchFn=fetch)`（L135–L170）** — 无 pending → `{ pending:false, done:false, error }`。过期则清 pending。POST `https://github.com/login/oauth/access_token`，`grant_type` **必须** `urn:ietf:params:oauth:grant-type:device_code`（下划线 `device_code`）。`authorization_pending` / `slow_down` → `{ pending:true }`。无 `access_token` → 清 pending 并 error。有 token 则 `fetchGitHubUser` + `applyGithubUser`，`done:true`。
  - **Function `resetPending`（L172–L174）** — 只清内存 pending。

- **关键变量：** L3 `pendingDevice`。导出见 L176–L186。

---

## 3. 执行逻辑流

1. 工作台「验证令牌」→ POST `/api/bridge/token` → `loginWithToken` → 只把用户名写入 store。
2. 「用 GitHub 设备码」：有 `WEBAGENT_GITHUB_CLIENT_ID` 才 `startDeviceLogin`；前端按 interval 打 `/bridge/device/poll`。
3. 「清除 GitHub 身份」→ `clearGithubKeepDemo`，Bridge 仍可用演示授权。
4. 登出 Bridge → `resetPending`。主 `index.js` **不** listen 管理页。
