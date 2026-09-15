# arena-model-probe · 独立驱动器（Python）

自动提问 + 自动判定模型，**不依赖油猴脚本、不依赖我接管浏览器**。

---

## 为什么是「CDP 驱动浏览器」而不是纯 HTTP 客户端

从 arena.ai 的 JS 源码里挖到了真实提交链路：

```js
fetch("/nextjs-api/stream/create-chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    message: { id, role: "user", parts: [...] },
    recaptchaV3Token,          // ← reCAPTCHA Enterprise，强制校验
    recaptchaV2Token,
    timezone,
    modelId?,                  // ← 指定模型（盲测时由服务端分配）
    harnessId?,
  })
})
```

**请求体带 reCAPTCHA Enterprise token**，纯 HTTP 客户端（requests/httpx）过不了这道校验——这也是为什么必须驱动真实浏览器。CDP 是唯一同时满足「自动化」和「通过验证」的路径。

---

## 架构

```
arena_probe.py                 # 独立驱动器（仅需 websocket-client）
  ├─ CDP 客户端                # 自研，无 selenium / playwright 依赖
  ├─ 浏览器生命周期管理         # 持久化配置目录，登录一次长期有效
  ├─ 探针注入                  # document-start + 立即执行（双保险）
  ├─ 真实输入管线              # 点入 → Ctrl+A → insertText → Enter
  ├─ 双通道取证                # 页面内探针 + CDP 网络层，交叉验证
  └─ 判定输出                  # 模型 / modelId / 家族 / 代际 / 置信度 / 证据链

wait_login.py                  # 登录等待器：检测到真实账号后自动进入实测
```

**关键设计决策：**

| 决策 | 原因 |
|---|---|
| 独立配置目录（非默认目录） | Chromium 136+ **禁止**默认配置目录开启 `--remote-debugging-port`（实测：带了参数但端口不监听） |
| 持久化配置目录 | 登录一次长期有效，之后全自动 |
| 不刷新页面 | 刷新可能丢会话；探针用「document-start 注册 + 立即执行」双保险注入 |
| 移除弹窗 DOM 而非点按钮 | arena.ai 的 Radix 弹窗按钮是 `pointer-events: none`，合成事件无效 |
| 真实输入管线 | 直接改 `innerHTML` 会绕过 ProseMirror 内部状态，提交处理器 `if(!y.trim())return` 直接返回 |

---

## 快速开始

### 1. 安装依赖

```bash
python -m pip install websocket-client
```

### 2. 首次登录（只需一次）

```bash
python arena_probe.py --login
```

会弹出浏览器窗口，在其中完成登录（Google / 邮箱均可）。配置目录 `~/amp-edge-profile` 会持久保存登录态。

若想让脚本自动检测登录完成：

```bash
python wait_login.py
```

### 3. 自动提问

```bash
# 单题
python arena_probe.py --ask "用一句话说明什么是二分查找。"

# 多题（批量）
python arena_probe.py --ask "问题1" --ask "问题2" --ask "问题3"

# 从文件读（每行一个）
python arena_probe.py --file questions.txt

# 结果写入 JSON
python arena_probe.py --ask "问题" --json recon/result.json
```

### 4. 交互模式

```bash
python arena_probe.py --serve
# ask> 输入问题回车提交，Ctrl+C 退出
```

---

## 输出示例

```
[*] 登录状态 : 已登录（user@example.com）
[*] 探针       : 已注入
--- [1/1] 用一句话说明什么是二分查找。
    提交: 已提交
    [3s] UNKNOWN / 证据 1 / 观测 0
    [7s] RESOLVED / 证据 6 / 观测 1

====================================================================
  判定模式 : RESOLVED
  模型     : GPT-6 系列
  modelId  : gpt-6-turbo
  家族     : openai    代际: gpt-6    前沿: True
  置信度   : 98.0%
====================================================================

  最近响应 : TTFT 412ms / 总计 3840ms / 27 chunks
  tokens   : in 42 / out 318 / reasoning None
  协议帧   : chat.completion.chunk

  证据链（6 条，显示最近 6 条）:
    [request.body.model    ] gpt-6-turbo              fetch body .model
    [response.header.model ] gpt-6-turbo              x-served-model
    [sse.chunk.model       ] gpt-6-turbo              $.model @chunk1
    [protocol.framing      ] openai                   OpenAI Chat Completions [chatcmpl- id|object=chat.completion.chunk]
```

---

## 判定模式语义

| 模式 | 含义 | 置信区间 |
|---|---|---|
| `RESOLVED` | 拿到权威 model 字符串（请求体/响应头/JSON/chunk） | 0.55 ~ 0.99 |
| `INFERRED` | 只有协议指纹 → 判家族，**不谎报具体版本** | 0.40 ~ 0.85 |
| `UNKNOWN` | 尚无可用证据 | 0 |

**能定到版本就定版本，只能定到家族就说家族，什么都不确定就说什么都不知道。**

---

## 相关脚本

| 脚本 | 用途 |
|---|---|
| `arena_probe.py` | 主驱动器：自动提问 + 判定（`--ask` / `--file` / `--serve` / `--login`） |
| `final_e2e.py` | 最终端到端实测（16 步全链路，一次跑完） |
| `agent_model_id.py` | **获取真实模型标识**（读 Trigger.dev run trace 的 span 标签） |
| `get_token.py` | 取得并解码 `public-access-token` |
| `wait_login.py` | 登录等待器（检测到账号后自动继续） |
| `active_probe.py` | 主动 canary 探针（拒答模板/知识截止/tokenizer 边界） |
| `full_capture2.py` | 全保真抓包（替代 MITM，明文无损耗） |
| `extract_model_map2.py` | 从排行榜 RSC 提取 UUID → 模型名 映射表 |
| `extract_model_labels.py` | 从 run trace 提取模型标签 |
| `extract_catalog.py` | 从排行榜提取模型目录 |
| `sync_catalog.py` | 同步目录到探针资产并校验 |

---

## 两条轨道

探针现在有两条互补的获取路径：

### 轨道 ①：协议层判定（`arena_probe.py`）

诚实输出，**不再产生假阳性**：

```
判定模式 : UNKNOWN
模型     : 模型家族未知（仅识别出传输层）
传输层   : __sdk_wire (Vercel AI SDK UI Message Stream)
协议帧   : start, start-step, reasoning-*, text-*, finish-step, finish
```

当上游确实暴露了厂商特征（如 `chatcmpl-`、`cache_creation_input_tokens`）时，
会正常给出家族级判定。

### 轨道 ②：真实模型标识（`agent_model_id.py`）

```
$ python agent_model_id.py
★ 模型标识：qwen3.8-max-0902
调用方式: OpenAI 兼容协议 (@ai-sdk/openai-compatible)
```

原理：服务端在流里下发 `public-access-token`（`pub:true`，scope 含 `read:runs`），
用它读 run 的 trace，其中 `ai.streamText.doStream` span 的标签含真实模型名。

---

## 故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| `匿名访客 (email='')` | 会话是访客态，非真实账号 | 重新 `--login` 完成账号登录 |
| `编辑器不可见（页面未就绪）` | 页面加载慢 | 脚本会自动重试 40s；仍失败则手动刷新该窗口 |
| `键入未生效` | 编辑器焦点丢失 | 重跑；或先用 `--serve` 手动确认页面可交互 |
| CDP 未就绪 | 浏览器未启动 / 端口被占 | `--fresh` 重建配置目录 |
| `找不到探针产物` | 未构建 | `node tools/build.mjs` |

---

## 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `AMP_PROFILE` | `~/amp-edge-profile` | 浏览器配置目录（登录态持久化于此） |
| `AMP_CDP_PORT` | `9222` | CDP 调试端口 |
| `AMP_URL` | `https://arena.ai/agent` | 目标页面 |

---

## 与油猴脚本的分工

| 场景 | 用哪个 |
|---|---|
| 手动聊天，顺带看模型 | 油猴脚本 `dist/arena-model-probe.user.js` |
| 批量/自动化提问，需程序化取结果 | 本 Python 驱动器 |

两者共用同一套探针内核（`src/*.js` → `dist/arena-model-probe.inject.js`），判定逻辑完全一致。
