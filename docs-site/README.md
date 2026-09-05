# 架构 / 源码可视化导览

把仓库根的 **架构导读**、**技术实现**、**总览**、各夹行级 README 收成一套可点的 HTML。不另写实现；正文来自那些 Markdown。

## 打开（Windows CMD）

在仓库根：

```bat
node docs-site\serve.js
```

浏览器打开 **http://127.0.0.1:4173/**

启动时会重新跑 `build.js`，所以改过 `架构导读.md` / `技术实现.md` 后只要重启这个进程。

Linux / macOS：

```bash
node docs-site/serve.js
```

不要和 `run-webagent.cmd` 抢端口：导览默认 **4173**，工作台仍是 3000。

## 页面

| 页 | 看什么 |
|---|---|
| 全景图 | 远端 / 车间 / 店堂三层；路径 A/B/C；一次 apply_patch |
| 架构导读 | 每节四层卡片（人话、比喻、文件、行业叫法） |
| 代码直译 | `技术实现.md` 全文 + 左侧目录 |
| 知识图谱 | `总览.md` |
| 工作流 | `组件说明.md` |
| 文件夹说明书 | 各子夹 README |
| 术语 | 导读第 12 节 |

## 文件

| 文件 | 职责 |
|---|---|
| `index.html` / `styles.css` / `app.js` | 壳 |
| `build.js` | 把 Markdown 打成 `content.js`（无 npm 依赖） |
| `serve.js` | 先 build，再在 `0.0.0.0:4173` 提供静态页。侧栏链到 `#/guide` 等站内 hash，**不**链 `../架构导读.md`（那个路径 404） |
| `content.js` | 生成物；不要手改 |

改导读或行级 README 后：再执行一次 `node docs-site/build.js` 或重启 `serve.js`。
