# 最终端到端实测报告

**构建版本**：`1.0.0+83d2aeab`
**测试时间**：2026-09-15
**结果**：**16/16 步骤全部通过**

---

## 一、实测输出（原始）

```
── A. 页面就绪 ──
  ✓ 页面就绪（编辑器可交互）
── B. 登录态 ──
  ✓ 鉴权诊断  — email=sytrus720@gmail.com provider=google
── C. 探针注入 ──
  ✓ 探针注入（版本比对）  — injected 1.0.0+83d2aeab
  ✓ 版本一致
── D. 自动提问 ──
  ✓ 提交问题  — 已提交
  ✓ 响应采集完成  — 耗时 64.4s
── E. 协议采集与判定 ──
  ✓ 协议帧解析  — 事件=[ping,batch] 帧=10 种
  ✓ 【关键】不再误判为 openai 家族  — family=None
  ✓ 判定为诚实的 UNKNOWN（仅传输层）
  ✓ UUID 映射表可用
── F. 从流取 public-access-token ──
  ✓ 流文本非空
  ✓ 取得 access token
  ✓ token 解码  — pub=True 有效期剩余 3546s
  ✓ 提取 run id
── G. 读取 run trace → 真实模型标识 ──
  ✓ 读取 run trace  — HTTP 200 24841 字节
  ✓ 提取模型标识  — qwen3.8-max-0902
```

---

## 二、两条轨道的最终输出

### 轨道 ①：探针判定（客户端协议层）

```
判定模式 : UNKNOWN
模型     : 模型家族未知（仅识别出传输层）
家族     : null
传输层   : __sdk_wire (Vercel AI SDK UI Message Stream)
置信度   : 0.0%
协议帧   : start, start-step, reasoning-start, reasoning-delta, reasoning-end,
           text-start, text-delta, text-end, finish-step, finish
```

**关键变化**：修复前这里报的是 `openai 家族 / 74.1%`（假阳性）；现在诚实地报 `模型家族未知`。

### 轨道 ②：真实模型标识（run trace）

```
★ qwen3.8-max-0902        （各轮输入 token: 7.0k）
调用方式: OpenAI 兼容协议 (@ai-sdk/openai-compatible)
```

**这是 worker 自己写入 run 的真实模型名**，不是推断。

---

## 三、本次实测发现并修复的两个假阳性

### 假阳性 ①：传输层冒充模型家族（上一轮已修）

```js
// 错误：把厂商无关的传输层标成 openai 家族
{ family: 'openai', weight: 0.78, label: 'Vercel AI SDK UI Message Stream' }
```

→ 改为 `family: '__sdk_wire'`，并从家族判定中排除。

### 假阳性 ②：遥测上报被当成模型响应（本轮新发现）

**发现方式**：本轮实测输出 `qwen 家族 / 43.2%`，但证据链的 URL 是：

```
https://browser-intake-us3-datadoghq.com/api/v2/rum?ddsource=browser&...
```

**根因**：Datadog RUM 上报的 URL 含 `/api/`，命中了我的"疑似 LLM 端点"规则；其通用 JSON 字段（`request_id`、`code`、`message`）又恰好命中了我给 qwen 加的通用指纹。

**两处修复**：

| 位置 | 修复 |
|---|---|
| `interceptor.js` | 新增遥测域排除（datadoghq/posthog/sentry/GA/… 共 30+ 域）+ 无关路径排除 |
| `registry.js` | 移除 qwen 指纹里的通用字段（`request_id`、`code+message`），只保留 DashScope 强绑定特征 |

---

## 四、验证

### 测试覆盖

```
node tools/verify.mjs
  构建            ✓
  单元测试        59/59 ✓
  端到端集成测试  15/15 ✓
  启动冒烟测试    13/13 ✓
  ──────────────────────
  合计            87/87 ✓
```

### 新增回归用例（锁定两类假阳性）

| 用例 | 锁定行为 |
|---|---|
| 【回归】仅凭 AI SDK 帧不得判出 openai 家族 | 传输层不得冒充厂商 |
| 【回归】AI SDK 指纹的 family 不得是真实厂商名 | 必须 `__` 前缀 |
| 【回归】通用 JSON 不得命中 qwen 指纹 | 通用字段不可作家族指纹 |
| 【回归】遥测域不得被当作模型端点 | URL 层过滤 |
| E2E-10b 遥测上报不得被当作模型响应 | 端到端验证（真实 URL） |
| E2E-10c PostHog/Sentry 同类遥测也须排除 | 覆盖多个遥测域 |
| E2E-10 静态资源不产生证据 | 原有保护 |
| 【回归】有真实厂商协议证据时仍能正常判家族 | 修复未破坏正常判定 |
| 【回归】qwen 特征应判为 qwen | 真特征仍有效 |

### 修复前后对照（同一站点）

| 场景 | 修复前 | 修复后 |
|---|---|---|
| AI SDK 流 | `openai / 74.1%`（错） | `UNKNOWN / 传输层`（对） |
| 遥测流量混入 | `qwen / 43.2%`（错） | 不产生证据（对） |
| 真实 qwen 特征 | — | `qwen / INFERRED`（对） |

---

## 五、实测能力总览

| 能力 | 状态 | 说明 |
|---|---|---|
| 自动提问 / 自动提交 | ✓ | 真实输入管线，绕过 ProseMirror 内部状态问题 |
| 自定义 realtime 协议解析 | ✓ | 嵌套 `records[].body` 二次解包 + 转义处理 |
| 协议帧识别 | ✓ | 10 种帧，含 reasoning/text/finish 完整序列 |
| 传输层识别（不冒充家族） | ✓ | `__sdk_wire` / `__realtime_batch` / `__sse_generic` |
| 家族级判定 | ✓ | 有真实厂商特征时可信（已用回归用例锁定） |
| **真实模型标识** | **✓** | **`qwen3.8-max-0902`**，来自 run trace |
| UUID → 模型名映射 | ✓ | 装载 1871 条 / 888 个名字（本次页面） |
| 版本比对注入 | ✓ | 内容哈希，避免跑旧版 |

---

## 六、一句话总结

**客户端侧能拿到的真实模型标识是 `qwen3.8-max-0902`；探针在协议层诚实地报告"家族未知"，两者互补且都不再产生假阳性。**

---

## 七、复现步骤

```bash
python -m pip install websocket-client
node tools/build.mjs                 # 构建（含内容哈希版本号）
python arena_probe.py --login        # 首次：登录一次（之后持久化）
python final_e2e.py                  # 最终端到端实测
```

单题 / 批量 / 交互：

```bash
python arena_probe.py --ask "问题" --json recon/out.json
python arena_probe.py --file questions.txt
python arena_probe.py --serve
```

获取真实模型标识（持续记录）：

```bash
python agent_model_id.py             # 提问并输出当前模型标识
python agent_model_id.py --no-ask    # 读最近一次 run
```
