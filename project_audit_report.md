# 项目审计报告 (简体中文)

---

## 1. 概览
本次审计涵盖了 `web_agent` 仓库的核心代码、文档、测试与安全等多个层面。主要目的是找出文档与实现不符、潜在 Bug、安全隐患、UI/UX 问题以及测试覆盖率不足的地方，并给出改进建议。

---

## 2. 文档 ↔️ 实现不符
| 项目 | 问题 | 影响 | 建议 |
|------|------|------|------|
| `技术实现.md` § 2.3 `rejectUnlessLocalControl` | 描述“只看 remoteAddress”，实际代码还检查 `cf-ray` 等云端请求头 | 用户可能误以为只有 127.0.0.1 可访问 `/api` | 更新描述，说明“云端头优先，无则 fallback to remote address” |
| `技术实现.md` § 4.7 OAuth flow | 仅列出 TTL，未提及 refresh-token 轮换与 `spentRefresh` | 读者可能不了解 token 使用后即作废 | 在 § 4.7 中增补 `spentRefresh` 与 `revokeAll` 说明 |
| `技术实现.md` § 5.12 `planRound.js` | 文档提及“≥2支才能总结”，实则单分支也能 start | 读者对“何时产生 round”产生误解 | 列出 `start`、`addBranch`、`merge` 三种状态，并注明“单分支时自动变为 single” |
| `DOCUMENTATION_SUMMARY.md` | 只列出文档清单，未标记已过时/缺少测试 | 难以快速定位优化优先级 | 在摘要中加入状态栏（✅ implemented, ⚠️ partial, ❌ missing）或在每个文件开头添加 `status` 标注 |
| `使用指南.md` (Windows) | 第 8 步提到 `if not "%~1"==""` 会创建工作区，实际上若路径不存在会直接退出 | 新手按照指引操作会报错“工作区不存在” | 明确说明“若路径不存在则直接退出，须手动创建或使用 `-workdir`” |
| `README.md` → `组件说明.md` | 目录里有“不用”的项（如 `webagent-repro`）但旧文件仍在 | 用户可能误删导致丢失快照 | 在 `组件说明.md` 中添加一行“（仅供参考，请勿删除）” |

---

## 3. 代码质量 / 潜在 Bug
| 项目 | 问题 | 影响 | 建议 |
|------|------|------|------|
| `src/utils/diff.js` | `\r\n` 与 `\n` 混合会导致 patch 在 Windows 上失效 | 跨平台 `apply_patch` 失败 | 开头统一行尾格式 `content.replace(/\r\n/g, '\n')` 后再进行 diff |
| `src/tools/patchEngine.js` | `occurrence` 参数未在文档中说明，用户不知道可以只修改第 N 次 | 误认为必须一次性全部修改 | 在函数签名与文档中展示 `occurrence?: number` 并加以说明 |
| `src/tools/fileOps.js` `writeFile` | `expectedHash` 只比对 `recalledHash`（上次进程），重启后会误报 `E_BAD_ARGS` | 正常覆盖被拦截 | 引入 `sessionHash`（当前进程计算得出的 hash）参与比对，或提供 `force: true` 选项 |
| `src/tools/executor.js` `startProcess` | 同时最多允许 8 个进程进行中，崩溃（crash）后若未释放计数器会导致卡死 | 后续 `startCommand` 获取到 `E_BAD_ARGS` | 在 `close` 事件中无论成功或失败均 `delete` 该 execId，并在启动时检查是否已存在 |
| `src/mcp/oauth.js` `issueAccess` | 旧 token 在 1 小时后失效，文档未作说明 | 用户误以为 token 永久有效 | 在 § 4.7 中补充“access token 有效期为 1 小时，过期后需重新配对” |
| `src/models/store.js` `load` | `catch` 返回 defaults 却不记录文件损坏，后续 `save` 可能持久化错误配置 | 配置出现静默异常（silently 异常） | 在 `catch` 中添加 `console.warn('config.json corrupted, using defaults')` 并在 `save` 前进行校验 |
| `src/utils/corsAllow.js` | 白名单中仅包含已知 origin，自定义域名会报 403 | 自托管（Self-hosted）Chat Plus 等无法使用 `/mcp` | 支持 `WEBAGENT_CORS_ORIGINS` 环境变量，并在文档中说明如何扩展 |
| `src/mcp/server.js` `handleRpc` `initialize` | 每次都重新读取 `custom.instructions` 产生微小延迟 | 高频连接（SSE）可能出现卡顿 | 在 `initialize` 时缓存到 session Map，或提供 `?refresh=true` 参数 |
| `src/tools/skills.js` `listSkills` | 未对 `SKILL.md` 内容做大小限制，过大的技能文件读取极慢 | 影响工作台加载速度 | 已限制最大 28000 字并加入 `preview` 截取前 240 字，避免一次性读取全文 |
| `src/tools/findFiles.js` | `globToRegExp` 仅支持 `**` 与 `*`，自定义正则会被当作普通文本处理 | 搜索失败 | 文档中明确说明：“仅支持 glob 模式，如需完整正则请使用 `grep_search`” |
| `src/tools/grepSearch.js` | `caseSensitive` 为 false 时 `escapeRegExp` 对含 `(`, `)` 的 pattern 可能产生非预期行为 | 搜索结果遗漏或误匹配 | 新增 `isRegex` 开关，用户自行提供正则时跳过 escape |
| `src/agent/openai.js` `runOpenAI` | “最多 10 轮”未限制 `tool_calls` 的 `max_iterations`，理论上可能无限迭代 | 安全风险 | 增加 `maxToolRounds` 参数（默认 10），并在耗尽后降级回落为纯文本 |
| `src/index.js` `listenOrExit` | 只有 `EADDRINUSE` 才列出占用信息，其它 `err.code` 直接 `exit(1)` 无提示 | 调试端口权限问题时不易定位 | 增加 `else console.error('Server start error:', err)` 后再执行 `exit(1)` |

---

## 4. 安全 / 隐私
| 项目 | 问题 | 影响 | 建议 |
|------|------|------|------|
| `src/models/store.js` `protectWorkspaceSecrets` | `.gitignore` 只在未被 `git add` 时生效，已被追踪的密钥仍可能被提交 | 密钥可能被意外推送到 Git | 启动时检查 `git ls-files`，若已被追踪则弹出警告 `warnTrackedSecrets` 并建议执行 `git rm --cached` |
| `src/mcp/oauth.js` `pairing code` | 配对码仅保存在内存中，进程重启即失效，无磁盘持久化备份 | 重启后找不到配对码，导致混淆 | `issuePairing` 结束时将配对码（已脱敏）写入 `.webagent/pairingcode.txt` 并在启动时读取 |
| `src/utils/localControl.js` `isTunnelRequest` | 依赖 `cf-ray` 等云端请求头，自定义代理可能被误判为非本地请求导致 404 | 合法内网代理被误拦截 | 新增 `isCustomProxy` 选项，或改为“检查远端 IP 是否在用户可信范围内” |
| `src/tunnel/cloudflared.js` `startQuickTunnel` | 错误提示信息仅引导 `winget install`，对 Linux/macOS 用户不友好 | 新手无法快速修复 | 在错误提示中同时提供 `apt-get install cloudflared` / `brew install cloudflared` |
| `src/agent/openai.js` `runOpenAI` | API Key 经由 `POST /api/chat` 传输，在公网环境下可能被中间人窃取 | 安全风险 | 文档中强制要求使用 HTTPS（已默认），并启用 `X-Forwarded-Proto` 检查 |

---

## 5. UI/UX 与 兼容性
| 项目 | 问题 | 影响 | 建议 |
|------|------|------|------|
| `pelican.html`（SMIL） | 部分移动端浏览器（Safari iOS 旧版、Android WebView）不支持或表现不稳定 | 动画可能不执行，导致用户误以为程序存在 Bug | 提供 CSS `@keyframes` 备选方案，在 `<svg>` 中增加 `@supports` 检测，不支持时显示静态图标 |
| `workbench/` `boot` | Monaco 编辑器加载耗时约 7 秒，在网络受限时无任何提示 | 用户误以为工作台卡死/崩溃 | 增加加载进度条，或提示“Monaco 正在下载，请耐心等待” |
| `workbench/` `bind.js` `#btn-copy-rules` | 仅在 `extension-http` 模式下显示，`paste-url` 模式下按钮隐藏 | 影响工作流体验 | 在任何连接模式下均显示“复制 MCP URL”与“复制规则”二选一，或在右键菜单中提供 |
| `docs-site/` 移动端适配 | 若干组件未使用相对单位，iPhone 缩放异常 | 阅读体验差 | 将所有 px 改为 `rem` 或 `vh/vw`，并补充简单的媒体查询适配 |
| `run-tests.cmd` | 仅在 `web-agent-core/agent-host/tests/` 目录下运行，未提供 `--filter` 运行单个测试 | CI 或本地开发时若想快速验证单个工具较为不便 | 增加类似 `--grep="tool name"` 的参数，或在 README 中列出常用的 npm test 子命令 |

---

## 6. 测试覆盖率（已发现的空白）
| 测试文件 | 缺失的测试用例 | 影响 |
|----------|----------------|------|
| `patchEngine.test.js` | `occurrence` 参数、 `dryRun` 模式下的 hash 比对 | 可能导致实现时的逻辑错误未被发现 |
| `fileOps.test.js` | `writeFile` 与 `expectedHash` 不匹配时的 `E_STALE_FILE` 返回 | 用户对为何修改文件被拒绝感到困惑 |
| `executor.test.js` | `startProcess` 超时后的 `force kill` 行为、`cancelCommand` 后状态是否重置归零 | CI 可能因残留子进程（child process）而失败 |
| `oauth.test.js` | `refresh_token` 的 `spentRefresh` 记录与重放检测 | OAuth 安全漏洞/风险未被覆盖测试 |
| `skills.test.js` | `loadSkill` 超过 28000 字时的截断行为 | 超大技能文件可能导致内存溢出或测试超时 |
| `grepSearch.test.js` | pattern 包含 `(?` 等正则特殊字符的情况 | 搜索功能在特定边界用例下可能抛出异常 |

---

## 7. 文档维护流程建议
1. **文档自动同步标签**  
   - 源码文件开头添加 `// doc-status: implemented / partial / missing`，CI 周期抓取并写入对应 `*.md` 的 front‑matter。
2. **变更日志自动生成**  
   - `git log --since="2024-01-01" --oneline` → 自动同步至 `CHANGELOG.md`（或更新 `DOCUMENTATION_SUMMARY.md`）。
3. **文档审查清单（Checklist）**  
   - 每次 PR 提交前必须运行 `npm run lint-docs`（检查：是否有未标注的行为、是否存在 `TODO` / `FIXME`），若校验失败则拒绝合并。
4. **测试覆盖率阈值**  
   - 在 `package.json` 中配置 `coverageThreshold`（分支覆盖率 80%、函数覆盖率 90%），CI 在测试未达标时阻断合并。

---

## 8. 小结 & 下一步行动
- **优先处理**：
  1. 文档 ↔️ 实现不符（本地控制、CORS、OAuth TTL、tunnel error path）。
  2. 安全性（gitignore 保护、配对码管理、敏感模式拦截）。
  3. 核心 Bug（diff 跨平台兼容、patchEngine `occurrence`、executor 计数器重置）。
- **次优先**：SMIL 兼容性、UI 进度条、测试覆盖率提升。
- **一般优先级**：文档自动化工具、新增/更新 checklist、细微的 UI 文案调整。

> **本轮不进行任何代码修改**。请根据上表挑选最想优化的项目，或把这份清单交给另一位助手接手处理。如果需要，我可以随时提供更详细的代码片段说明，或协助生成对应的 PR 模板。

---