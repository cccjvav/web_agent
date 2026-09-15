# arena.ai 模型探针 · 实测验证报告

本报告只写**实测验证过的事实**，推测部分单独标注。

## 一、目标站点的真实形态（已验证）

| 项目 | 实测结果 |
|---|---|
| 站点框架 | Next.js + Turbopack（`x-nextjs-deployment-id: dpl_CuF2si35ytcTy6B96t2hTt2ZwXhR`） |
| 防护 | Cloudflare（直连 403，需代理出口；代理下正常 200） |
| 登录 | Supabase 认证，cookie `arena-auth-prod-v1`（base64 包 JWT） |
| 鉴权校验 | `GET /api/me` → 200 且返回真实 user 才算登录；匿名访客返回 `email:""` |
| 提交端点 | `POST /ai-proxy/realtime/v1/sessions/{sid}/in/append` |
| 输出流 | `GET /ai-proxy/realtime/v1/sessions/{sid}/out` |
| 会话创建 | `POST /nextjs-api/stream/create-chat` |
| reCAPTCHA | 请求体带 `recaptchaV3Token`（Enterprise）→ **纯 HTTP 客户端不可行** |
| 输入组件 | ProseMirror / tiptap（需真实输入事件才能触发提交） |

## 二、协议结构（已验证，实测抓帧）

arena.ai Agent Mode **不使用**标准 OpenAI/Anthropic SSE，而是三层结构：

```
第 1 层  自定义 realtime 传输：event: batch / event: ping
         data: {"records":[{"seq_num":N,"body":"<JSON字符串>"}],"tail":{...}}

第 2 层  body 是「JSON 字符串里再套 JSON」→ 必须二次 JSON 解析

第 3 层  Vercel AI SDK UI Message Stream 部件：
         start → start-step → reasoning-start → reasoning-delta → reasoning-end
               → text-start → text-delta → text-end → finish-step → finish
```

**实测解出的帧序列**（`recon/final-probe5.json`）：

```
事件     : ping, batch
协议帧   : start, start-step, reasoning-start, reasoning-delta,
           reasoning-end, text-start, text-delta, text-end
```

## 三、模型身份：为什么拿不到精确名（已验证）

**Agent Mode 是服务端盲测。** 三重证据：

1. **请求体不含 modelId。** 实测抓到完整提交体：

```json
{"kind":"message","payload":{"message":{"parts":[{"type":"text","text":"..."}],
"id":"...","role":"user"},"chatId":"...","trigger":"submit-message",
"metadata":{"originHost":"arena.ai","timezone":"Etc/GMT-8",
"arenaVisitId":"...","submissionSource":"chat_input",
"recaptchaV3Token":"<REDACTED>"}}}
```

   无 `modelId`、无 `harnessId`。

2. **JS 源码里的条件分支证实**（`recon/chunks/17uw37vd_1wh0.js`）：

```js
...e_ && eN ? { modelId: eN } : {}   // 未选模型 → 请求体不带 modelId
```

3. **页面无模型选择器。** UI 探测只有 4 个 `role=combobox`，全部是 "Agent Mode"，
   无任何含 model 字样的可选元素。

**结论：模型由服务端分配，身份既不在请求里也不在响应里。**
因此本探针在 Agent Mode 下能给出的最强判定是**家族级**（`INFERRED`），
而不是具体版本——这是对事实的忠实反映，不是能力不足的掩饰。

## 四、探针实测表现（已验证）

```
判定模式 : INFERRED
家族     : openai
modelId  : null   （未暴露，故为 null）
置信度   : 74.1%
chunks   : 15
事件     : ping, batch
协议帧   : start, start-step, reasoning-start, reasoning-delta, reasoning-end, text-start, text-delta, text-end, finish-step, finish
```

命中的协议指纹：

| 指纹 | 说明 | 权重 |
|---|---|---|
| `Vercel AI SDK UI Message Stream` | start/start-step/text-delta/reasoning-* 多帧命中 | 0.78 |
| `__realtime_batch` | event: batch + records[].seq_num + tail.seq_num | 0.30 |
| `__sse_generic` | 通用 SSE 兜底 | 0.20 |

## 五、模型目录（已验证，来自公开排行榜）

从 `arena.ai/leaderboard{,/agent,/text,/vision,/webdev}` 提取到 **966 个真实模型名**：

| 家族 | 数量 | 代表模型 |
|---|---|---|
| openai | 197 | gpt-6-astra-max、gpt-5.6-sol-xhigh、gpt-5.5-instant |
| qwen | 129 | Qwen3.8、Qwen3.7-Max-Preview、Qwen3.5-397B-A17B |
| anthropic | 124 | claude-opus-5-max、claude-fable-5.1-high、claude-sonnet-5 |
| xai | 76 | grok-4.6、grok-4.5-agent、grok-4.20-beta |
| google | 72 | gemini-3.8-flash-high、gemini-3.7-flash、gemini-3.1-pro |
| deepseek | 52 | deepseek-v4.1-flash-max、deepseek-v4-pro、deepseek-v4-ch3 |
| meta | 46 | Llama-4-Maverick-17B、Llama-3.3-70B |
| zhipu | 41 | glm-5.3-flash、glm-5.2-max |
| moonshot | 36 | kimi-k3-gateway-max、kimi-k2.6-code |
| bytedance | 35 | seed-2.1-pro-preview、seedream-5.0-pro |
| mistral | 34 | mistral-medium-3.5、mistral-large-3 |
| tencent | 26 | hunyuan-hy3-preview、hunyuan-t1 |
| stepfun | 23 | step-3.7-flash、step-3.5-flash |
| minimax | 21 | minimax-m3、minimax-h3-max |
| baidu | 18 | ernie-5.1-0508-release、ernie-5.0-preview |
| microsoft | 14 | phi-4、Phi-3.5-vision |
| nvidia | 10 | Nemotron-3-Ultra-550B、nemotron-3.5-lightning |
| cohere | 7 | command-a-03-2025 |
| ai21 | 4 | jamba-1.5-large |
| other | 1 | — |

> **重要修正**：本轮实测前，注册表里靠经验写的正则与实际滞后明显。
> 真实情况是 GPT 已到 **6（代号 astra）**、GPT-5.6 有 **sol/luna/terra** 三代号、
> Claude 已到 **opus-5 / fable-5.1**、Gemini 已到 **3.8**。注册表已按此校准。

## 六、未能拿到的信息（诚实声明）

| 事项 | 状态 | 原因 |
|---|---|---|
| 精确 modelId（Agent Mode） | **拿不到** | 服务端盲测，请求/响应均不含 |
| `usage` token 计数 | 未出现 | 该协议帧里未下发 usage |
| 模型选择器值 | 无选择器 | 页面只提供 "Agent Mode" |

**提升精度的可行路径**（未实施，供后续选择）：

1. **走非盲测页面**：`arena.ai` 主页的 battle / side-by-side 模式会下发 `modelAId`/`modelBId`，
   那里能直接读到模型名。
2. **主动行为探针**：已内置 5 条 canary（拒答模板、知识截止、tokenizer 边界），
   在无网络证据时提供家族级旁证。
3. **推理帧风格分析**：本项目已捕获 `reasoning-delta` 序列，
   不同厂商的推理呈现差异可作为补充指纹。

## 七、复现步骤

```bash
python -m pip install websocket-client
node tools/build.mjs            # 构建探针（版本号含内容哈希）
python arena_probe.py --login   # 首次：浏览器窗口里登录一次
python arena_probe.py --ask "你的问题" --json recon/out.json
```

## 八、测试覆盖

```
node tools/verify.mjs
  构建            ✓
  单元测试        45/45 ✓
  端到端集成测试  13/13 ✓
  启动冒烟测试    13/13 ✓
  ──────────────────────
  合计            71/71 ✓
```

其中包含由**本轮实测发现并修复**的缺陷的回归用例：

1. `interceptor.js` 缺 import → 采集层静默失效，证据恒为 0
2. `tok_per_sec` 量纲压倒其余维度 → 时序抖动误判为新模型（相似度 0.988→0.9999 / 0.616→0.0032）
3. URL 启发式漏掉匿名网关路径 → 改为「URL 或流式内容类型」双通道
4. 嵌套 `records[].body` 未二次解包 → 模型字段与帧类型全看不见
5. **转义引号导致协议指纹全漏判** → 真实帧是 `\"type\":\"start\"`，
   只匹配未转义文本时家族恒为「通用 SSE」
6. 构建版本号未随源码变化 → 页面跳过注入、新指纹不生效（改为内容哈希盖章）

## 九、交付物

```
arena_probe.py         独立驱动器（自研 CDP 客户端，零 selenium/playwright）
final_e2e.py           最终端到端实测（16 步全链路）
agent_model_id.py      获取真实模型标识（读 Trigger.dev run trace）
get_token.py           取得并解码 public-access-token
wait_login.py          登录等待器
active_probe.py        主动 canary 探针
extract_model_map2.py  从 RSC 提取 UUID→模型名 映射表
extract_model_labels.py 从 run trace 提取模型标签
full_capture2.py       全保真抓包（替代 MITM）
trigger_full.py        读取 run payload 与 trace
extract_catalog.py     从排行榜提取模型目录
sync_catalog.py        同步目录到探针资产
new_tab.py             用 CDP 开新标签（新版浏览器禁止 GET /json/new）

src/                   探针内核（8 模块，含 idmap.js）
dist/                  构建产物（userscript + inject + catalog + build-info）
tools/                 构建/测试/验证工具链
recon/                 实测证据与报告
```

### 关键报告

| 文件 | 内容 |
|---|---|
| `recon/FINAL-TEST-REPORT.md` | 最终端到端实测报告（16/16 通过） |
| `recon/false-positive-report.md` | 假阳性事故报告与修复 |
| `recon/verified-findings.md` | 第一轮：站点形态、协议结构、盲测证据 |
| `recon/verified-findings-2.md` | 第二轮：逆向揭示机制、UUID 映射表 |
| `recon/model-id-map.json` | 1058 个模型 / 3174 条 UUID 映射 |
| `recon/final-e2e.json` | 最终实测原始数据 |
