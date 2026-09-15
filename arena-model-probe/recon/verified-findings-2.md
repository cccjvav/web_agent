# arena.ai 模型探针 · 逆向实测报告（第二轮：动用逆向工具链）

本轮针对上一轮遗留的两个问题——「主动探针」与「MITM 抓包」——做了实证，
并动用 JS 逆向手段突破了模型身份识别。

---

## 一、先回答两个遗留问题

### 1. MITM 抓包：**不需要，且 CDP 方案更强**

| 维度 | MITM | CDP Network 域（本项目采用） |
|---|---|---|
| 拿到明文 body | 需装根证书解密 | 浏览器已解密，直接可读 |
| TLS 指纹影响 | 会被改写（易触发风控） | 无影响 |
| 证书 pinning | 可能失败 | 不涉及 |
| 全保真度 | 受解密/压缩损耗 | 原始明文 |

**实测证据**：用 CDP 拿到 **61209 字节原始流 / 114684 字节展开文本**，
帧序列完整（`start → ... → finish`）。
穷举搜索结论如下（这是比 MITM 更彻底的搜索）：

| 搜索维度 | 结果 |
|---|---|
| `model` / `provider` / `harness` / `engine` / `deployment` 等键名 | **0 个** |
| 品牌名 / 内部代号（gpt / claude / astra / fable / …） | **0 个** |
| 实际出现的键 | 全是协议结构：`id` `data` `type` `delta` `seq_num` `body` `tail` `records` |

→ **请求体与响应体都不含模型标识。MITM 即便装上证书也只能得到同样结果。**

### 2. 主动探针：**已补上驱动（此前确实只是"写了没用"）**

发现的问题：`probe.js` 里 5 条 canary 与 `main.js` 的 `runCanaries()` 判定器都写好了，
但**从来没有代码真正发送这些探针问题** —— 它只分析"用户碰巧问的问题"的回复，
所以行为指纹几乎不可能触发。这是实现缺口，不是设计问题。

已新增 `active_probe.py`：主动、逐条发送 canary、收集证据、回灌判定。
顺带修掉两个真实缺陷：
- canary 问题里的换行触发 ProseMirror 段落切分 → 校验失败（改为压成单行）
- 流式渲染期间页面主线程繁忙导致 `Runtime.evaluate` 超时 → 误判为失败（加容错）

---

## 二、逆向突破：模型身份的真实来源

### 2.1 逆向出的数据模型（决定性证据）

从 JS chunk（`3hwcrf9ksztyo.js` / `860411` 段）挖出：

```js
// 反馈 schema —— 携带 modelId
PointwiseFeedback: { id, messageId, modelId, value }
PairwiseFeedback:  { id, messageAId, messageBId, modelAId, modelBId, arenaId, value }
MultiFeedback:     { messageIds[], modelIds[], winningMessageId, winningModelId }

// 模型 id 的来源：直接从【消息对象】上读
const selectModelIdsFromLastMessageIds = createSelector(
  [s => s.messages, s => s.lastMessageIds],
  (messages, ids) => {
    let r = null, n = null;
    for (const i of ids) {
      const t = messages.find(e => e.id === i);
      t?.participantPosition === a.a && (r = t?.modelId ?? null);   // modelAId
      t?.participantPosition === a.b && (n = t?.modelId ?? null);   // modelBId
    }
    return { modelAId: r, modelBId: n };
  });
```

**关键结论：消息对象携带的是 `modelId`（UUID），不是模型名。** 名字必须靠另一张表还原。

### 2.2 找到 UUID → 模型名 映射表

模型目录藏在排行榜页面的 RSC 载荷（`self.__next_f.push`）的 `initialModels` 里：

```json
{"id":"01a07d42-938f-7267-9398-4529e857491c",
 "organization":"openai","provider":"openaiResponses",
 "publicName":"gpt-6-astra-medium","displayName":"gpt-6-astra-medium",
 "userSelectable":false,
 "capabilities":{"inputCapabilities":{"text":true,"image":true,"file":true}},
 "rankByModality":{"chat":9007199254740991}}
```

**这就是揭示机制的最后一块拼图**：`modelId`(UUID) + 映射表 → 真实模型名。

### 2.3 提取方法的两次失败与最终方案

| 版本 | 方法 | 结果 |
|---|---|---|
| v1 | JS 正则找 `organization` | 失败：假设错了字段形态（实际嵌在 `initialModels`） |
| v2 | JS 手写括号配平解析 RSC | 失败：未正确处理双重转义 `\\"` 与嵌套数组 |
| **v3** | **Python 侧 `json.JSONDecoder.raw_decode`** | **成功：1058 个模型** |

v3 的做法：先还原 RSC 转义，再从每个 `{"id"` 锚点用 `raw_decode` 尝试解析
（比手写配平可靠得多），并用 `capabilities`/`rankByModality` 佐证过滤误报。

---

## 三、落地：探针已具备 UUID 还原能力

新增 `src/idmap.js`，并接入主流程：

```
★ 装载成功：3174 条映射 / 888 个唯一名字 / 来源 leaderboard-rsc

✓ 01a06ebf-809f-7e34-9abc-53b0fc8761a9  ->  gpt-6-astra-high        [openai]
✓ 019f9593-b5a9-7575-aff0-5971ff479f88  ->  claude-opus-5-max       [anthropic]
✓ 01a0681c-b561-76b6-b338-a44ff0cff460  ->  gemini-3.8-flash-high   [google]
✓ 01a05e31-fc9d-76dc-b6bf-ab5b6781d4c3  ->  claude-fable-5.1-high   [anthropic]

还原成功率: 4/4
```

**这意味着**：任何来源（网络层 / 消息层 / 反馈接口）一旦给出 UUID 形态的 `modelId`，
探针就能还原成 `gpt-6-astra-high` 这样的真实模型名，并纳入证据链
（`idmap.resolve` 权重 0.92，仅次于请求体）。

### 新增 API

```js
window.__MODEL_PROBE__.refreshMap()        // 重新拉取映射表（官方更新模型后调用）
window.__MODEL_PROBE__.resolve(uuid)        // 单个 UUID → 模型名
window.__MODEL_PROBE__.mapStats()           // 映射表统计
window.__MODEL_PROBE__.resolveEvidence()    // 把证据链里的 UUID 全量还原
window.__MODEL_PROBE__.isUuid(x)            // UUID 判定
```

---

## 四、Agent Mode 为何仍拿不到具体版本（诚实结论）

逆向 + 实测双重确认，**这不是能力不足，是站点设计**：

1. **请求体不含 modelId**（实测抓取完整提交体）：
   仅含 `chatId` / `trigger` / `recaptchaV3Token` / `timezone`

2. **JS 条件分支证实**（`17uw37vd_1wh0.js`）：
   ```js
   ...e_ && eN ? { modelId: eN } : {}   // 未选模型 → 不发
   ```

3. **页面无模型选择器**（实测点击验证）：
   ```
   BUTTON vis=True  text='Agent Mode'                          ← 唯一可见
   BUTTON vis=False text='Chat'/'Code'/'Image'/'Video'         ← 这些是【模态】切换
   ```
   点开后 **0 个 option** —— 那个下拉框是模态选择器，不是模型选择器。

4. **响应体不含模型标识**（全保真穷举搜索，见第一节）

5. **Agent Mode 走 `create-chat`，不经 EvaluationSession**：
   battle/侧比模式走 `create-evaluation` + `participantPosition: a|b`，
   消息带 `modelId`；Agent Mode 完全不同的路径，故消息无此字段。

**因此 Agent Mode 的最强判定是家族级（`INFERRED` / openai / 74.1%），而非具体版本。**

### 拿到具体版本的可行路径（按可靠性排序）

| 路径 | 可行性 | 说明 |
|---|---|---|
| **走 battle / 侧比模式** | **可行** | 消息带 `modelId`，配合已建成的 idmap 即可还原真名 |
| 显式选模型的页面/入口 | 可行 | 需站点提供模型选择器（Agent Mode 当前无） |
| 主动行为探针 | 部分 | 只能给家族级旁证 |
| MITM | **不可行** | 请求/响应均无模型标识 |
| 纯 HTTP 客户端 | **不可行** | reCAPTCHA Enterprise 校验 |

---

## 五、模型目录（真实数据）

从排行榜提取 **1058 个模型 / 3174 条 UUID 映射**，按组织分布：

| organization | 数量 | 代表模型 |
|---|---|---|
| openai | 86 | `gpt-6-astra-high`、`gpt-5.6-sol-xhigh`、`gpt-5.6-luna/terra-*` |
| google | 71 | `gemini-3.8-flash-high`、`gemini-3.7-flash`、`gemini-3.1-pro` |
| alibaba | 61 | Qwen3.8 / Qwen3.7-Max-Preview 等 |
| anthropic | 39 | `claude-opus-5-max`、`claude-fable-5.1-high`、`claude-sonnet-5` |
| xai | 25 | `grok-4.20-beta-0309-reasoning`、`grok-4.6` |
| minimax | 19 | `minimax-h3`、`minimax-m3` |
| bytedance | 13 | `seed-2.1-pro-preview`、`seedream-5.0-pro` |
| meta | 13 | `Llama-4-Maverick-17B` |
| tencent | 12 | `hunyuan-hy3-preview` |
| moonshot | 11 | `kimi-k3-gateway-max`、`kimi-k2.6-code` |
| mistral | 9 | `mistral-medium-3.5` |
| zai | 7 | `glm-5.3` |
| nvidia | 6 | `Nemotron-3-Ultra-550B` |

（完整数据见 `recon/model-id-map.json`）
</br>

**发现的重要内部代号**：
- GPT：`astra`（GPT-6）、`sol` / `luna` / `terra`（GPT-5.6 三个变体）
- Claude：`fable`、`mythos`（Claude 5 代）
- DeepSeek：`ch1` / `ch3`

---

## 六、本轮修复的缺陷

| # | 缺陷 | 后果 | 修复 |
|---|---|---|---|
| 1 | canary 从未真正被发送 | 行为指纹形同虚设 | 新增 `active_probe.py` 驱动 |
| 2 | canary 问题含换行 | ProseMirror 切分段落，键入校验失败 | 压成单行 |
| 3 | 流式渲染期 evaluate 超时 | 提交已成功却被判失败 | `evaluate_soft` 容错重试 |
| 4 | RSC 解析假设错误字段形态 | 提取 0 个模型 | 改为 `raw_decode` 稳健解析 |
| 5 | RSC 双重转义未处理 | 括号配平全失败 | 先反转义再解析 |
| 6 | 构建版本号未随源码变化 | 页面跳过注入，新能力不生效 | 内容哈希盖章 + 构建期自检 |

---

## 七、测试覆盖

```
node tools/verify.mjs
  构建            ✓
  单元测试        53/53 ✓
  端到端集成测试  13/13 ✓
  启动冒烟测试    13/13 ✓
  ──────────────────────
  合计            79/79 ✓
```

新增的 idmap 回归用例（7 个）锁定本轮逆向成果：
- UUID 识别、映射装载、UUID→名字还原、未知 UUID 不编造
- 名字反查、还原后能正确归类（闭环）、真实 RSC 载荷解析、脏数据健壮

---

## 八、交付物

```
src/idmap.js                  UUID → 模型名 映射（本轮核心新增）
arena_probe.py                独立驱动器（含容错加固）
active_probe.py               主动 canary 探针（补上缺失的一环）
extract_model_map2.py         从 RSC 提取映射表（稳健解析版）
extract_api_surface.py        从 JS 提取完整 API 面
trace_reveal.py               逆向模型揭示链路
full_capture.py / _2.py       全保真抓包（替代 MITM）
model_select_probe.py         模型选择器探测（证实无选择器）
verify_idmap.py               映射能力实测验证

recon/model-id-map.json       1058 个模型 / 3174 条 UUID 映射
recon/api-surface.json        完整 API 路由清单
recon/reveal-trace.json       揭示链路逆向证据
recon/full-capture2-raw.txt   61209 字节完整原始流
recon/verified-findings.md    上一轮实测报告
recon/verified-findings-2.md  本报告
```
