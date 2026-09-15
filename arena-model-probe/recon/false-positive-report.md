# 探针假阳性事故报告

## 一、问题

用户质疑：**Agent Mode 实际用的是千问（Qwen），为什么探针报「openai 家族 / 74.1%」？**

这是探针的**假阳性（false positive）**，且置信度高达 74.1% —— 属于"自信地报错误答案"，是最需要修的一类 bug。

---

## 二、根因：把传输层当成了模型家族

`src/registry.js` 里这条指纹的定义错了：

```js
// 【错误】修复前
{
  family: 'openai', weight: 0.78,
  label: 'Vercel AI SDK UI Message Stream',
  tests: [ {name:'start 帧', re:/"type"\s*:\s*"start"/}, ... ]
}
```

**范畴错误**：Vercel AI SDK 是**厂商无关的传输/序列化层**，同时封装 OpenAI、Anthropic、Google、Qwen、DeepSeek 等所有 provider。它只说明"用了 AI SDK"，不说明"用了哪个模型"。

打个比方：**用 HTTP 头判断网站后端用哪个数据库**——同样荒谬。

### 实测反证

| 检查项 | 结果 |
|---|---|
| 真实模型（由 Trigger.dev run trace 证实） | `qwen-latest-series-invite-202608-m4` |
| 原始流里 `qwen` 出现次数 | **0** |
| 原始流里 `openai` 出现次数 | **0** |

**双向证据都不存在**，探针却报出 openai 家族 —— 纯属凭协议层瞎猜。

---

## 三、第二处同源错误

修复过程中发现同一类错误还有一处：

```js
{ name: 'object=chat.completion.chunk', re: /"object"\s*:\s*"chat\.completion/ }
```

`object=chat.completion.chunk` 属于 **"OpenAI 兼容协议"层**，所有走兼容层的厂商（qwen / deepseek / moonshot / minimax…）都会带它。它同样不能区分"是否 OpenAI"。

真正能区分 OpenAI 的是**厂商独有特征**：
- `chatcmpl-` id 前缀
- `system_fingerprint` 字段
- `call_` 工具 id 前缀

---

## 四、修复内容

### 4.1 传输层指纹改名并降权

```js
// 【正确】修复后
{
  family: '__sdk_wire', weight: 0.30,
  label: 'Vercel AI SDK UI Message Stream（传输层）',
  note: '厂商无关的传输层：仅说明用了 AI SDK，不能推断模型家族',
  ...
}
```

### 4.2 classify 排除 `__` 前缀条目参与家族判定

```js
// 以 __ 开头表示【传输层/网关形态】，与"是哪个模型"无关。
// 若并入家族判定，就会用传输协议冒充模型家族（实测踩过）。
if (e.family && String(e.family).startsWith('__')) {
  wireAgg.set(...);   // 单独归类为 wire，不进 familyAgg
  continue;
}
```

### 4.3 新增「只有传输层证据」的诚实分支

```js
if (wireTop) {
  return {
    mode: 'UNKNOWN',
    family: null,
    label: '模型家族未知（仅识别出传输层）',
    wire: wireTop.family,
    wireLabel: 'Vercel AI SDK UI Message Stream',
    confidence: 0,
    note: '传输层与模型家族无关（同一协议可封装任意厂商模型），因此不据此推断家族。'
        + '如需真实模型名，读取 Trigger.dev run trace 的 span 标签。',
  };
}
```

### 4.4 拆分 OpenAI 指纹的权重

把"兼容层共有"的特征与"厂商独有"的特征在命名上区分，并注明哪些不可用于家族判定。

### 4.5 补充 qwen 指纹

之前完全没有 qwen 的协议指纹（只能靠 model 字段）。现补充 DashScope 独有特征：
- `enable_thinking` / `enable_search` 参数（阿里独有）
- `output.choices` 结构（DashScope 独有）
- `request_id` 字段（DashScope 独有）

---

## 五、修复前后对比（同一份真实流，61209 字节）

### 修复前
```
判定: openai 家族（具体版本未暴露）
置信: 74.1%              ← 错误且自信
命中: [openai] Vercel AI SDK UI Message Stream [start 帧|start-step 帧|...]
```

### 修复后
```
mode  : UNKNOWN
family: null
label : 模型家族未知（仅识别出传输层）
wire  : __sdk_wire (Vercel AI SDK UI Message Stream)
置信  : 0.0%
命中  : __sdk_wire / __realtime_batch / __sse_generic  （均为传输层）
```

**从"自信的错误"变成"诚实的未知"。** 这是正确的行为：不确定就不给结论，而不是拿传输层凑一个答案。

---

## 六、新增回归测试（5 个）

| 用例 | 锁定行为 |
|---|---|
| 【回归】仅凭 AI SDK 帧不得判出 openai 家族 | `family !== 'openai'`，且为 `UNKNOWN` |
| 【回归】AI SDK 指纹的 family 不得是真实厂商名 | 必须 `__` 前缀 |
| 【回归】有真实厂商协议证据时仍能正常判家族 | 传输层 + `chatcmpl` → openai |
| 【回归】qwen 特征应判为 qwen 而非 openai | 不能因兼容层压过厂商特征 |
| 【回归】转义嵌套帧也能识别出 AI SDK 传输层 | 转义帧解析 + 诚实结论 |

---

## 七、验证结果

```
node tools/verify.mjs
  构建            ✓
  单元测试        57/57 ✓
  端到端集成测试  13/13 ✓
  启动冒烟测试    13/13 ✓
  ──────────────────────
  合计            83/83 ✓
```

其中用**真实抓取的 61209 字节流**做了端到端验证，确认修复在真实数据上生效。

---

## 八、教训（方法论层面）

| 教训 | 说明 |
|---|---|
| **协议 ≠ 身份** | 传输层/兼容层是所有厂商共有的，用它判厂商必然假阳性 |
| **区分「共有特征」与「独有特征」** | 前者只能排除，后者才能确认 |
| **低置信度不等于安全** | 74.1% 的置信度让错误显得可信——比报 UNKNOWN 危险得多 |
| **需要有可反驳的真值来源** | 这次能发现 bug，是因为拿到了 run trace 的真实模型名做对照 |

**最关键的教训**：探针的价值在于"给出可验证的判断"，而不是"总能给出判断"。当证据只能支撑传输层结论时，说"模型家族未知"才是正确输出。
