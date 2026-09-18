> 这是用户上传的研究原型，不是当前产品启动入口。当前Companion/整合浏览器包为0.5.2，已接入离线分析、实时参考、历史与受控浏览器操作；入口和限制见[现行探针指南](../探针入口与实际可用范围.md)。不再以0.1/0.2阶段“仅连接/离线”描述当前产品，也不额外自动启动原型网络钩子。
>
> 以下原型命令、权重和原始测试记录只描述研究代码，不代表整合产品已全量审阅或真实账户验收。模型候选是参考而非身份认证；Chat API确切验证仍延期。原始recon已移出跟踪，历史未清除；不要提交原始dump或令牌，凭据处理见[安全说明](../SECURITY.md)。可选五字段会话核对已并入[使用指南](../使用指南.md)，不是完整探针的替代品。

# arena-model-probe · 页面模型探针

在浏览器页面内收集模型标识与协议线索，给出启发式候选。**页面字段、网关格式和运行标签都不是后台实际模型的独立认证。**需要你有权访问且页面可正常运行；不绕过Cloudflare或登录控制。

```
原型排序权重（启发式分数，不是正确率/认证概率）
  1. 请求体 .model          ← 客户端请求的标识，不证明后台执行者    权重 1.00
  2. 响应头 model 字段                                 权重 0.95
  3. 响应 JSON 里的 model 字段                         权重 0.93
  4. SSE chunk 内的 model 字段                         权重 0.90
  5. URL 路径 / 主机名                                 权重 0.80
  6. 协议帧指纹（不依赖 model 字符串）                 权重 0.72
  7. 行为探针 / tokenizer 指纹                         权重 0.35
  8. 模型自述                                          权重 0.15  ← 最弱，防幻觉
```

---

## 快速开始

### 方式 A：油猴脚本（推荐，日常使用）

1. 装 Tampermonkey / Violentmonkey
2. 打开 `dist/arena-model-probe.user.js`，全选复制，新建脚本粘贴保存
3. 打开 `https://arena.ai/agent`，右上角出现探针面板
4. 发一条消息 → 面板立刻显示模型判定

脚本声明 `@run-at document-start`，但当前main仍可能等DOMContentLoaded再boot；不能保证先于页面请求，早期流量可能漏采。此生命周期问题尚待修复。

### 方式 B：CDP 自动实测（开发/验证）

```bash
# 1) 用调试端口启动 Chrome
chrome.exe --remote-debugging-port=9222 --user-data-dir=%TEMP%\amp-chrome

# 2) 在该 Chrome 里打开 https://arena.ai/agent

# 3) 跑驱动器（自动注入 + 刷新 + 轮询判定结果）
node tools/cdp-inspect.mjs
```

### 方式 C：DevTools 控制台一次性注入

```js
// 1) 打开 DevTools → Sources → Snippets，粘贴 dist/arena-model-probe.inject.js 内容
// 2) Ctrl+Enter 运行
// 3) 不刷新，发一条消息。单次注入会在刷新后失效；刷新后需重新注入，也无法补采早期请求。
```

### 方式 D：本地构建 + 全量验证

```bash
node tools/verify.mjs      # 构建 + 单测 + 集成 + 冒烟，共 63 用例
```

纯 Node，无 npm 依赖，无需 `npm install`。

---

## 它怎么判定（四层机制）

### 第 1 层：网络取证（最硬）

在页面最早的时机接管 `fetch` / `XMLHttpRequest` / `EventSource` / `WebSocket`，**旁路读取**流量：

- `fetch` 保留原始Response对象，从clone有界采样。**不是零侵入**：仍有内存、CPU、时序成本，不能保证所有站点兼容
- SSE 逐块增量解析（`SSETap`），**首个 chunk 到达即可出首判**，不用等回答结束
- 深度遍历 JSON（`collectModelFields`），能挖出 `model`、`model_id`、`upstream_model`、`base_model`、`deployment` 等 16 种键名，包括任意嵌套层级
- 正则兜底（`scanTextForModel`），应对截断流与非 JSON 响应

请求体只能说明页面请求了哪个标识，代理可能重映射；它不能单独证明实际执行模型。

### 第 2 层：协议指纹（匿名网关下仍有效）

盲测站点常把上游模型抹成 `model-a` / `model-b`。这时靠**流长什么样**判家族：

| 家族 | 判别特征 |
|---|---|
| Anthropic | `message_start` / `content_block_delta` / `thinking_delta` / `toolu_` / `cache_creation_input_tokens` |
| OpenAI Chat | `chatcmpl-` / `object: chat.completion.chunk` / `system_fingerprint` / `call_` / `logprobs` |
| OpenAI Responses | `response.created` / `response.output_text.delta` / `resp_` / `response.reasoning.summary_text.delta` |
| Google | `candidates[].content.parts` / `finishReason` 枚举 / `usageMetadata` / `thought:true` |

**关键设计**：单条命中只给 60% 折算分。因为 `reasoning_content` 这类字段是 DeepSeek / xAI 共用的，单条命中不足以定家族——宁可不出结论，也不误判。

### 第 3 层：行为探针（canary battery）

发一条措辞经过挑选的问题，看它怎么回：

- **拒答模板**：OpenAI / Anthropic / Google 的安全话术风格差异明显
- **知识截止边界**：能列举 GPT-5 / Gemini-3 / Claude-5 说明是新一代
- **tokenizer 边界指纹**：让它原样复读罕见字形（`🜁ᚠ𐌰꧁𝔄①②③ﷺ㊙`），统计保真度
- **tokenizer 定量指纹**：用 `usage.prompt_tokens` 反推 chars/token，比对已知 tokenizer profile

### 第 4 层：未知模型自动建档（"支持未来新模型"的关键）

**这只能为新线索建档，不证明识别了真实模型**：

1. 每次观测 → 归约成 18 维指纹向量（协议特征 + 时序 + token 用量）
2. 与本地指纹库（`localStorage`，最多 400 条）做**加权余弦相似度**比对
3. 已声明的模型ID先按不区分大小写的同名条目精确命中，避免时序抖动重复建档；没有同名条目时，相似度 ≥ 0.92 才命中已有档，否则**新建档并标记 `UNSEEN`**
4. 代号解析（`parseCodename`）自动提取版本号、档位（turbo/pro/mini）、日期快照、推理变体、参数量、私有部署标记
5. 匿名簇后续暴露真名时，`backfillNames()` 自动回填整簇

自动建档只表示记录了新线索；相似度命中不保证具体模型或版本正确，新模型仍需独立验证。导入时只接受带有限非空ID的对象条目，畸形证据字段会被忽略；这属于健壮性校验，不是导入来源认证。

---

## 已覆盖的模型（`src/registry.js`）

OpenAI（GPT-6/5/4.5/4o/4、o 系列）、Anthropic（Claude 5/4/3）、Google（Gemini 3/2/1）、xAI（Grok 5/4/3）、DeepSeek（V4/V3/R1）、Qwen（3/2.5）、Moonshot（Kimi K2）、智谱（GLM 5/4）、MiniMax、字节（豆包/Seed）、Meta（Llama 5/3）、Mistral、Cohere、AI21、NVIDIA、Microsoft（Phi）。

外加 15 条网关主机映射（OpenRouter / Azure / Vertex / Groq / Together / Fireworks / Perplexity …）。

**新增模型只需在 `MODEL_PATTERNS` 加一条正则**，改完 `node tools/build.mjs` 即可。

---

## 面板读法

```
模型探针 · arena-model-probe
├─ RESOLVED          ← 判定模式
├─ GPT-6 系列        ← 模型标签
├─ id: gpt-6-turbo   ← 原始 model 字符串
├─ 置信 98%          ← 置信度条
├─ [openai] [gpt-6] [最新代际]
├─ 盲测槽位           ← 模型 A / 模型 B 分别判定
├─ 本次响应           ← TTFT / 总耗时 / chunks / token 数
├─ Tokenizer          ← chars/token → 最接近哪个 tokenizer
├─ 指纹库             ← 建档数 / 未知数 / 匿名簇数
├─ 证据链             ← 每条证据的来源与内容
└─ [重新判定][导出证据][导出指纹库]
```

**三种判定模式，语义严格区分：**

| 模式 | 含义 | 置信区间 |
|---|---|---|
| `RESOLVED` | 拿到权威 model 字符串 | 0.55 ~ 0.99 |
| `INFERRED` | 只有协议指纹 → 判家族，**不谎报具体版本** | 0.40 ~ 0.85 |
| `UNKNOWN` | 尚无可用证据 | 0 |

这是刻意的设计：**能定到版本就定版本，只能定到家族就说家族，什么都不确定就说什么都不知道**——不编造。

---

## 控制台 API

```js
window.__MODEL_PROBE__.classify()       // 当前判定结果
window.__MODEL_PROBE__.bus.evidence     // 全部证据
window.__MODEL_PROBE__.bus.observations // 每次响应的观测
window.__MODEL_PROBE__.learned()        // 指纹库内容
window.__MODEL_PROBE__.export()         // 导出指纹库 JSON
window.__MODEL_PROBE__.probePack()      // 5 条 canary 探针
window.__MODEL_PROBE__.canaries(text)   // 对任意文本跑 canary 分析
window.__MODEL_PROBE__.reset()          // 清空证据链
```

---

## 架构

```
src/
  registry.js     模型正则表 + 协议指纹库 + 主机映射 + 代际排序（数据层，改这里加新模型）
  classify.js     证据融合引擎 + 深度模型字段提取 + 18 维指纹向量 + 加权余弦相似度
  interceptor.js  fetch / XHR / SSE / WebSocket / EventSource 钩子 + SSETap 增量解析
  learned.js      未知模型自动建档 + 代号解析 + 相似度归簇 + 溯名回填
  probe.js        5 条 canary 探针 + tokenizer 定量指纹
  ui.js           Shadow DOM HUD（样式隔离，不污染页面也不被页面污染）
  main.js         编排：装钩子 → 收证据 → 首帧快判 → 精判 → 建档
tools/
  build.mjs       自研极简 ESM 打包器 → 单文件产物
  selftest.mjs    37 个单元测试（判定逻辑、协议指纹、代号解析、健壮性）
  e2e.mjs         13 个端到端测试（真实 Response/ReadableStream 环境跑采集层）
  boot-smoke.mjs  13 个冒烟测试（完整 bundle 启动路径 + HUD 挂载 + API 暴露）
  verify.mjs      一键跑全部 4 阶段
  cdp-inspect.mjs CDP 驱动器，注入真实 Chrome 并输出判定
dist/
  arena-model-probe.user.js    油猴脚本
  arena-model-probe.inject.js  单文件注入版
```

---

## 验证结果

```
构建              ✓
单元测试          37/37 ✓
端到端集成测试    13/13 ✓
启动冒烟测试      13/13 ✓
────────────────────────
合计              63/63 ✓
```

测试抓出并修掉的三个真实缺陷：

1. **`interceptor.js` 缺 import** → 采集层静默失效，证据恒为 0。端到端测试发现。
2. **`tok_per_sec` 量纲压倒其余维度** → 时序抖动就把同一模型判成新模型。改为饱和归一化 + 加权余弦后，同源/异源相似度从 `0.988 vs 0.616` 改善到 **`0.9999 vs 0.0032`**。
3. **URL 启发式漏掉匿名网关** → `/api/anonymous` 这类不可预测路径被整体跳过。改为"URL **或** 内容类型是流式"双通道判定。

---

## 边界与局限（明确说明，不含糊）

- **服务端验证受限**：`arena.ai` 走 Cloudflare，本机 IP 被 403 拦截（`CF-RAY: a3b53143cf02d4d9-LAX`），所以无法预先扒站点接口。探针因此设计成页面内取证——这也让它不惧站点改版。
- **完全匿名时只能定家族**：若网关同时抹掉 model 字段**且**改写了协议帧，则只能靠行为探针，置信度上限约 0.35。
- **自述证据权重刻意压到 0.15**：模型自报身份极不可靠（幻觉、系统提示可覆盖），只作旁证。
- **指纹库是本地私有的**：`localStorage` 按站点隔离，换设备需用"导出指纹库"手动迁移。
- **HUD 会被 `document.write` 类站点清掉**：此时用控制台 API 或 CDP 驱动器读取结果。

## WebAgent本轮采集层审阅修复

详见[采集层审阅](TRANSPORT_REVIEW.md)。原型仍不随产品自动启动。2026-09-18全仓复核仅在本地离线运行`tools/verify.mjs`：它发现同一未知模型因指纹抖动重复建档，现已用模型ID精确命中、无向量已验证条目兼容及畸形导入/证据回归修复；未运行CDP、账户或远端轨迹脚本。原README中的历史用例数与实测报告不自动作为当前产品验证证据。

### 重复注入、关闭与升级

本轮禁止把旧版HUD移走后直接启动新版：旧版/半启动实例仍占用页面时保留原实例；DOMContentLoaded之前重复注入也只排一次启动。**更新脚本后需刷新页面**。如果启动失败也请刷新，不自动重试可能已装过的网络钩子。

HUD关闭按钮现在清理拖动监听并销毁面板，但**不停止整个探针**。如需彻底停止：先在脚本管理器禁用原型，再刷新页面；单次DevTools注入刷新后即失效。BUS.on返回退订函数，HUD.destroy仅负责UI资源；完整钩子/轮询/定时器卸载仍待实现，不提供虚假的全局stop承诺。

## 能力差异说明
原型、WebAgent连接版、VS Code配套版不是同一功能集合。连接版没有实现模型探测；原型新增采样上限也会漏掉部分长/晚/并发响应线索，不能说无损优化。详见[逐项能力与取舍](../探针能力对照与迁移边界.md)。
