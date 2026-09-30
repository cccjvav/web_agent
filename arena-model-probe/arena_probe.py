#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
arena_probe.py — arena.ai 模型探针独立驱动器

为什么是这个架构（关键决策依据）：
  从 arena.ai 的 JS 源码里挖到真实提交链路：
      POST /ai-proxy/realtime/v1/sessions/{sid}/in/append   （提交，带 recaptchaV3Token）
      GET  /ai-proxy/realtime/v1/sessions/{sid}/out         （输出，event: batch）
  请求体带 reCAPTCHA Enterprise token，纯 HTTP 客户端过不了这道校验，
  所以必须驱动真实浏览器。本程序因此走 CDP（Chrome DevTools Protocol）。

设计要点：
  1. 持久化浏览器配置目录 → 只需登录一次，之后全自动
  2. 用独立配置目录启动 → 绕过 Chromium 136+ 禁止默认目录开调试端口的限制
  3. document-start 注入探针 → 钩子先于页面代码，不漏首个请求
  4. 真实输入管线（点入 → Ctrl+A → insertText → Enter）→ 触发 ProseMirror 内部状态
  5. 双通道取证：页面内探针 + CDP 网络层，互为交叉验证

用法：
    python arena_probe.py --login              # 首次：启动浏览器供你登录一次
    python arena_probe.py --ask "问题"          # 自动提问并输出判定
    python arena_probe.py --file questions.txt  # 批量（每行一个问题）
    python arena_probe.py --serve              # 交互式 REPL

依赖：websocket-client  (pip install websocket-client)
"""

import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

try:
    import websocket  # websocket-client
except ImportError:
    print("[!] 缺少依赖，请先运行:  python -m pip install websocket-client")
    sys.exit(1)

# ----------------------------------------------------------------------------
# 配置
# ----------------------------------------------------------------------------
HERE = Path(__file__).resolve().parent
BUNDLE = HERE / "dist" / "arena-model-probe.inject.js"
BUILD_INFO = HERE / "dist" / "build-info.json"
PROFILE_DIR = Path(os.environ.get("AMP_PROFILE", Path.home() / "amp-edge-profile"))
CDP_PORT = int(os.environ.get("AMP_CDP_PORT", "9222"))
TARGET_URL = os.environ.get("AMP_URL", "https://arena.ai/agent")

EDGE_CANDIDATES = [
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
]


def probe_version():
    """
    读取当前构建的版本号（语义版本 + 内容哈希）。

    为什么读文件而不是写死常量：实测踩过坑——改了探针却没改版本号，
    页面里的旧实例被判为「版本相同」而跳过注入，新指纹不生效，排查很久。
    """
    try:
        info = json.loads(BUILD_INFO.read_text(encoding="utf-8"))
        v = info.get("version")
        if v:
            return v
    except Exception:
        pass
    try:
        head = BUNDLE.read_text(encoding="utf-8")[:400]
        m = re.search(r"v(\d+\.\d+\.\d+\+[0-9a-f]+)", head)
        if m:
            return m.group(1)
    except Exception:
        pass
    return "1.0.0"


PROBE_VERSION = probe_version()

# 网络层噪音过滤（仅用于日志降噪，探针内部的 URL 启发式是自适应的）
NET_NOISE = re.compile(
    r"datadoghq|posthog|sentry|googletagmanager|google-analytics|gstatic|"
    r"accounts\.google|recaptcha|msn\.com|play\.google|cloudflareinsights|"
    r"youtube|doubleclick|\.(js|css|png|jpe?g|svg|woff2?|ico|map|webp|gif|avif)(\?|$)",
    re.I,
)


def log(msg):
    """Windows 控制台默认 GBK，做一次安全输出"""
    try:
        print(msg)
    except UnicodeEncodeError:
        print(msg.encode("utf-8", "replace").decode("utf-8", "replace"))
    sys.stdout.flush()


# ----------------------------------------------------------------------------
# CDP 客户端（仅依赖 websocket-client）
# ----------------------------------------------------------------------------
class CDP:
    def __init__(self, ws_url, timeout=30):
        self.ws_url = ws_url
        self.timeout = timeout
        self._id = 0
        self._pending = {}
        self._handlers = {}
        self.ws = None
        self._closed = False

    def connect(self):
        self.ws = websocket.create_connection(
            self.ws_url, timeout=self.timeout, suppress_origin=True,
            max_size=200 * 1024 * 1024)
        return self

    def close(self):
        self._closed = True
        try:
            if self.ws:
                self.ws.close()
        except Exception:
            pass

    def send(self, method, params=None, _id=None):
        if _id is None:
            self._id += 1
            _id = self._id
        self.ws.send(json.dumps({"id": _id, "method": method, "params": params or {}}))
        return _id

    def on(self, method, fn):
        self._handlers.setdefault(method, []).append(fn)

    def call(self, method, params=None, timeout=None):
        """发送并等待该 id 的响应（期间分发所有事件）"""
        mid = self.send(method, params)
        deadline = time.time() + (timeout or self.timeout)
        self.ws.settimeout(0.3)
        while time.time() < deadline:
            try:
                raw = self.ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            except Exception as e:
                raise RuntimeError("WS recv failed: %s" % e)
            if not raw:
                continue
            try:
                msg = json.loads(raw)
            except Exception:
                continue
            if msg.get("id") == mid:
                if "error" in msg:
                    raise RuntimeError("CDP %s failed: %s" % (method, msg["error"]))
                return msg.get("result", {})
            self._dispatch(msg)
        raise RuntimeError("CDP %s timeout" % method)

    def pump(self, seconds):
        """在给定时间内持续接收并分发事件"""
        end = time.time() + seconds
        self.ws.settimeout(0.3)
        while time.time() < end:
            try:
                raw = self.ws.recv()
            except websocket.WebSocketTimeoutException:
                continue
            except Exception:
                break
            if not raw:
                continue
            try:
                self._dispatch(json.loads(raw))
            except Exception:
                continue

    def _dispatch(self, msg):
        m = msg.get("method")
        if m and m in self._handlers:
            for fn in self._handlers[m]:
                try:
                    fn(msg.get("params", {}))
                except Exception:
                    pass


# ----------------------------------------------------------------------------
# 浏览器管理
# ----------------------------------------------------------------------------
def http_json(url, timeout=6):
    with urllib.request.urlopen(url, timeout=timeout) as r:
        return json.loads(r.read().decode("utf-8"))


def cdp_alive():
    try:
        http_json("http://127.0.0.1:%d/json/version" % CDP_PORT, timeout=3)
        return True
    except Exception:
        return False


def find_browser():
    for p in EDGE_CANDIDATES:
        if Path(p).exists():
            return p
    raise RuntimeError("找不到 Edge/Chrome，请安装浏览器或设置 AMP_PROFILE")


def launch_browser(url=TARGET_URL, fresh=False):
    """用独立持久化配置目录启动浏览器（该目录允许开调试端口）"""
    exe = find_browser()
    if PROFILE_DIR.exists() and fresh:
        shutil.rmtree(PROFILE_DIR, ignore_errors=True)
    PROFILE_DIR.mkdir(parents=True, exist_ok=True)

    args = [
        exe,
        "--remote-debugging-port=%d" % CDP_PORT,
        "--remote-allow-origins=*",
        "--user-data-dir=%s" % PROFILE_DIR,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=msEdgeSidebarV2",
        url,
    ]
    log("[*] 启动 %s  配置目录=%s" % (Path(exe).name, PROFILE_DIR))
    subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    for _ in range(40):
        time.sleep(1)
        if cdp_alive():
            log("[*] CDP 已就绪")
            return True
    raise RuntimeError("浏览器启动后 CDP 端口仍未就绪")


def ensure_browser():
    if cdp_alive():
        return False
    launch_browser()
    return True


def get_page():
    """取 arena.ai 页面；没有就新开一个"""
    try:
        targets = http_json("http://127.0.0.1:%d/json/list" % CDP_PORT)
    except Exception:
        return None
    pages = [t for t in targets if t.get("type") == "page" and t.get("url", "").startswith("http")]
    for t in pages:
        if "arena.ai" in t.get("url", ""):
            return t
    try:
        return http_json("http://127.0.0.1:%d/json/new?%s" % (CDP_PORT, TARGET_URL), timeout=10)
    except Exception:
        return pages[0] if pages else None


# ----------------------------------------------------------------------------
# 页面操作
# ----------------------------------------------------------------------------
def evaluate(cdp, expr, await_promise=True, timeout=None):
    r = cdp.call("Runtime.evaluate", {
        "expression": expr,
        "returnByValue": True,
        "awaitPromise": await_promise,
        "allowUnsafeEvalBlockedByCSP": True,
    }, timeout=timeout)
    if r.get("exceptionDetails"):
        d = r["exceptionDetails"]
        raise RuntimeError(d.get("exception", {}).get("description") or d.get("text", "eval error"))
    return r.get("result", {}).get("value")


def diagnose_auth(cdp):
    """判断当前是真实登录还是匿名访客（决定能否发消息）"""
    expr = """(async () => {
      const out = { cookieAuth: document.cookie.includes('arena-auth') };
      try {
        const r = await fetch('/api/me', { credentials: 'include' });
        const j = await r.json();
        out.status = r.status;
        out.user = j && j.user ? {
          id: j.user.id,
          supabaseUserId: j.user.supabaseUserId,
          email: j.user.email || '',
          username: j.user.username || null,
          emailProvider: j.user.emailProvider || null,
        } : null;
      } catch (e) { out.err = String(e.message); }
      out.loggedIn = Boolean(out.user && (out.user.email || out.user.username));
      return out;
    })()"""
    return evaluate(cdp, expr, await_promise=True, timeout=30)


READY_JS = """(() => {
  const ed = document.querySelector('.ProseMirror[contenteditable="true"]')
            || document.querySelector('[contenteditable="true"]')
            || document.querySelector('textarea[placeholder]');
  let edVisible = false;
  if (ed) { const r = ed.getBoundingClientRect(); edVisible = r.width > 40 && r.height > 10; }
  return {
    len: document.body ? document.body.innerText.length : 0,
    pm: edVisible,
    busy: /taking longer than expected/i.test(document.body ? document.body.innerText : ''),
  };
})()"""

RELOAD_BTN_JS = """(() => {
  const b = [...document.querySelectorAll('button')].find(x => /reload the page/i.test(x.innerText || ''));
  if (b) { b.click(); return true; } return false;
})()"""


def page_ready(cdp, want_editor=True, tries=40, verbose=False):
    """
    就绪判定。会话页(/agent/{id})正文加载慢，但只要编辑器可交互就能发消息，
    所以「编辑器可见」是硬条件，正文长度只作参考。
    页面主线程繁忙时 Runtime.evaluate 可能超时，这里单独容错并给出诊断。
    """
    consec_err = 0
    for i in range(tries):
        st = None
        try:
            st = evaluate(cdp, READY_JS, timeout=20)
            consec_err = 0
        except Exception as e:
            consec_err += 1
            if verbose and (consec_err == 1 or consec_err % 5 == 0):
                log("      [ready %d] eval 失败(%d): %s" % (i, consec_err, str(e)[:80]))
            if consec_err >= 6:
                try:
                    evaluate(cdp, RELOAD_BTN_JS, timeout=15)
                except Exception:
                    pass
                consec_err = 0
            time.sleep(1)
            continue

        if st.get("busy"):
            try:
                evaluate(cdp, RELOAD_BTN_JS, timeout=15)
            except Exception:
                pass
            time.sleep(2)
            continue

        if verbose and i % 5 == 0:
            log("      [ready %d] len=%s editor=%s" % (i, st.get("len"), st.get("pm")))

        if (not want_editor) or st.get("pm"):
            return True
        time.sleep(1)
    return False


def kill_modals(cdp):
    """
    arena.ai 首访会挂 Radix 弹窗（Terms / LogIn），其按钮是 pointer-events:none，
    合成事件无法触发，只能移除门户 DOM。
    """
    try:
        return evaluate(cdp, """(() => {
          let n = 0;
          for (const d of document.querySelectorAll('[role="dialog"]')) {
            let p = d, top = d;
            while (p && p.parentElement && p.parentElement !== document.body) { top = p.parentElement; p = p.parentElement; }
            (p && p.parentElement === document.body ? p : d).remove(); n++;
          }
          document.body.style.pointerEvents = 'auto';
          for (const el of document.querySelectorAll('*')) {
            if (getComputedStyle(el).pointerEvents === 'none') el.style.pointerEvents = 'auto';
          }
          return n;
        })()""", timeout=20)
    except Exception:
        return 0


CLOSE_PANEL_JS = """(() => {
  // 关闭评价/review 面板，让输入框回来
  let n = 0;
  const byLabel = [...document.querySelectorAll('button')]
    .filter(b => /close review panel|dismiss/i.test(b.getAttribute('aria-label') || ''));
  for (const b of byLabel) { try { b.click(); n++; } catch (e) {} }
  const txtNodes = [...document.querySelectorAll('div')].filter(d =>
    /Was this task successful/i.test(d.innerText || '') && (d.innerText || '').length < 200);
  for (const d of txtNodes) { try { d.remove(); n++; } catch (e) {} }
  return n;
})()"""

FIND_EDITOR_JS = """(() => {
  const sels = ['[contenteditable="true"]', 'textarea[placeholder]', '.ProseMirror'];
  for (const s of sels) {
    for (const e of document.querySelectorAll(s)) {
      const r = e.getBoundingClientRect();
      if (r.width > 40 && r.height > 10 && e.offsetParent !== null) {
        e.style.pointerEvents = 'auto';
        return { ok: true, sel: s, tag: e.tagName,
                 x: Math.round(r.x + r.width/2), y: Math.round(r.y + r.height/2),
                 w: Math.round(r.width), h: Math.round(r.height) };
      }
    }
  }
  return { ok: false };
})()"""

READ_EDITOR_JS = """(() => {
  const e = document.querySelector('.ProseMirror') || document.querySelector('[contenteditable="true"]')
            || document.querySelector('textarea[placeholder]');
  if (!e) return '';
  return (e.tagName === 'TEXTAREA' ? e.value : e.innerText) || '';
})()"""


def mouse_click(cdp, x, y):
    cdp.call("Input.dispatchMouseEvent", {"type": "mouseMoved", "x": x, "y": y, "buttons": 0})
    cdp.call("Input.dispatchMouseEvent", {"type": "mousePressed", "x": x, "y": y,
                                          "button": "left", "clickCount": 1, "buttons": 1})
    time.sleep(0.06)
    cdp.call("Input.dispatchMouseEvent", {"type": "mouseReleased", "x": x, "y": y,
                                          "button": "left", "clickCount": 1, "buttons": 0})


def key_combo(cdp, key, code, vk, modifiers=0):
    for t in ("keyDown", "keyUp"):
        cdp.call("Input.dispatchKeyEvent", {
            "type": t, "key": key, "code": code,
            "windowsVirtualKeyCode": vk, "nativeVirtualKeyCode": vk,
            "modifiers": modifiers,
        })


def press_enter(cdp):
    for t in ("keyDown", "keyUp"):
        p = {"type": t, "key": "Enter", "code": "Enter",
             "windowsVirtualKeyCode": 13, "nativeVirtualKeyCode": 13}
        if t == "keyDown":
            p["text"] = "\r"
        cdp.call("Input.dispatchKeyEvent", p)


def evaluate_soft(cdp, expr, await_promise=True, timeout=15, retries=4, default=None):
    """
    evaluate 的容错版本。

    为什么需要：arena.ai 在做流式渲染时页面主线程会长时间繁忙，
    Runtime.evaluate 会超时。这类超时**不代表操作失败**，
    不能让它中断整个流程（实测踩过：提交已成功，却因复检超时抛异常）。
    """
    last = None
    for i in range(retries):
        try:
            return evaluate(cdp, expr, await_promise=await_promise, timeout=timeout)
        except Exception as e:
            last = e
            time.sleep(1.2 * (i + 1))
    if default is not None:
        return default
    raise last


def submit_question(cdp, question):
    """
    返回 (ok, detail)。全程真实输入管线。

    为什么必须真实输入：直接改 .ProseMirror 的 innerHTML 会绕过 ProseMirror
    内部状态——DOM 上看得见文字，但 React 状态为空，提交处理器
    `if(!y.trim())return` 会直接返回，点了发送也不发请求（实测踩过）。
    """
    try:
        kill_modals(cdp)
    except Exception:
        pass
    try:
        n = evaluate_soft(cdp, CLOSE_PANEL_JS, timeout=15, default=0)
        if n:
            time.sleep(0.6)
    except Exception:
        pass

    # 1) 找编辑器（带重试 + 超时容错）
    ed = None
    for _ in range(20):
        try:
            ed = evaluate(cdp, FIND_EDITOR_JS, timeout=15)
        except Exception:
            time.sleep(1.5)
            continue
        if ed and ed.get("ok"):
            break
        try:
            kill_modals(cdp)
        except Exception:
            pass
        time.sleep(1)
    if not ed or not ed.get("ok"):
        return False, "编辑器不可见（页面未就绪）"

    # 2) 点入
    mouse_click(cdp, ed["x"], ed["y"])
    time.sleep(0.4)

    # 3) 清空已有内容，避免残留拼接
    key_combo(cdp, "a", "KeyA", 65, modifiers=2)
    time.sleep(0.2)
    key_combo(cdp, "Delete", "Delete", 46)
    time.sleep(0.25)

    # 4) 真实键入
    # 注意：ProseMirror 的 insertText 遇到 \n 会切分段落，导致回读校验失败。
    # 这里把换行压成空格，保证单行输入可靠（实测踩过这个坑）。
    flat = re.sub(r"\s*\n+\s*", " ", question or "").strip()
    cdp.call("Input.insertText", {"text": flat})
    time.sleep(0.9)

    try:
        typed = evaluate(cdp, READ_EDITOR_JS, timeout=15) or ""
    except Exception:
        typed = flat  # 页面忙时无法回读，按已键入处理
    probe_key = flat[:10]
    if typed and probe_key and probe_key not in typed:
        return False, "键入未生效（编辑器内容: %r）" % typed[:60]

    # 5) 提交：Enter 优先，退化点按钮
    press_enter(cdp)
    time.sleep(2.5)

    # 提交后页面主线程正在流式渲染，Runtime.evaluate 可能超时。
    # 这里必须容错：超时说明"页面忙"，恰恰意味着提交已生效，不应因此报错。
    still = None
    for _ in range(3):
        try:
            still = evaluate(cdp, READ_EDITOR_JS, timeout=12) or ""
            break
        except Exception:
            time.sleep(1.5)
    if still is None:
        return True, "已提交（页面繁忙，跳过编辑器复检）"

    if still and probe_key and probe_key in still:
        try:
            sb = evaluate(cdp, """(() => {
              const bs = [...document.querySelectorAll('button')].filter(x => /send message/i.test(x.getAttribute('aria-label')||''));
              if (!bs.length) return null;
              const b = bs[bs.length-1];
              b.disabled = false; b.style.pointerEvents = 'auto';
              const r = b.getBoundingClientRect();
              return { x: Math.round(r.x+r.width/2), y: Math.round(r.y+r.height/2) };
            })()""", timeout=15)
        except Exception:
            sb = None
        if sb:
            mouse_click(cdp, sb["x"], sb["y"])
            time.sleep(2.5)
    return True, "已提交"


# ----------------------------------------------------------------------------
# 探针注入（带构建指纹比对）
# ----------------------------------------------------------------------------
def inject_fresh(cdp, force_reload=False):
    """
    确保页面里跑的是【当前构建】的探针。

    实测教训：
      1) 「检测到 __MODEL_PROBE__ 就跳过」会让改了探针后页面仍跑旧版
         （新增的 __realtime_batch 指纹不生效）。
      2) 直接删 HUD / 清全局标记会干扰 React 状态，编辑器消失。
      3) Page.reload 虽能让 document-start 生效，但会打断会话的 realtime 连接。
    策略：优先就地注入当前版本（把旧实例挪到备用全局名，不碰它的 DOM）。
    """
    src = BUNDLE.read_text(encoding="utf-8")
    try:
        cdp.call("Page.addScriptToEvaluateOnNewDocument", {"source": src})
    except Exception:
        pass

    cur = None
    try:
        cur = evaluate(cdp, "window.__MODEL_PROBE__ ? window.__MODEL_PROBE__.version : null",
                       timeout=15)
    except Exception:
        pass

    if cur == PROBE_VERSION and not force_reload:
        return True, "already " + str(cur)

    if force_reload:
        try:
            cdp.call("Page.reload", {"ignoreCache": False})
            time.sleep(6)
            ver = None
            for _ in range(40):
                try:
                    ver = evaluate(cdp,
                                   "window.__MODEL_PROBE__ ? window.__MODEL_PROBE__.version : null",
                                   timeout=15)
                    if ver:
                        break
                except Exception:
                    pass
                time.sleep(1)
            try:
                page_ready(cdp, want_editor=True, tries=40)
            except Exception:
                pass
            return (ver == PROBE_VERSION), "reloaded -> %s" % ver
        except Exception as e:
            return False, "刷新注入失败: %s" % e

    # 就地注入：把旧实例挪到备用名，避免新实例 boot 时冲突
    if cur is not None:
        try:
            evaluate(cdp, """(() => {
              try {
                window.__MODEL_PROBE_OLD__ = window.__MODEL_PROBE__;
                delete window.__MODEL_PROBE__;
                delete window.__MODEL_PROBE_BOOTED__;
                return 1;
              } catch (e) { return String(e); }
            })()""", timeout=15)
            time.sleep(0.3)
        except Exception:
            pass

    wrapped = "(function(){ try {\n" + src + "\nreturn 1; } catch(e){ return String(e); } })()"
    try:
        evaluate(cdp, wrapped, timeout=25)
        time.sleep(0.8)
        ver = evaluate(cdp, "window.__MODEL_PROBE__ ? window.__MODEL_PROBE__.version : null",
                       timeout=15)
        if ver == PROBE_VERSION:
            return True, "injected " + str(ver)

        # 就地注入后版本仍不对 —— 说明页面里的旧实例未被替换
        # （新代码检测到 BOOTED 标记而跳过）。此时必须刷新页面，
        # 让 document-start 脚本以正确版本重新安装。
        #
        # 实测教训：旧版本没有 stream-header 监听器，导致永远拿不到
        # 真实模型名；就地注入无法修复，只能刷新。
        if ver is not None and ver != PROBE_VERSION:
            log("      版本不符（页面 %s ≠ 期望 %s），刷新页面重新注入…" % (ver, PROBE_VERSION))
            cdp.call("Page.reload", {"ignoreCache": False})
            time.sleep(6)
            ver2 = None
            for _ in range(40):
                try:
                    ver2 = evaluate(cdp,
                                    "window.__MODEL_PROBE__ ? window.__MODEL_PROBE__.version : null",
                                    timeout=15)
                    if ver2 == PROBE_VERSION:
                        break
                except Exception:
                    pass
                time.sleep(1)
            try:
                page_ready(cdp, want_editor=True, tries=40)
            except Exception:
                pass
            return (ver2 == PROBE_VERSION), "reloaded -> %s" % ver2

        return (ver is not None), "injected " + str(ver)
    except Exception as e:
        return False, "注入异常: %s" % e


# ----------------------------------------------------------------------------
# 探针读取与报告
# ----------------------------------------------------------------------------
READ_PROBE_JS = """(() => {
  const a = window.__MODEL_PROBE__;
  if (!a) return { error: 'probe-missing' };
  return {
    version: a.version,
    evidence: a.bus.evidence.map(e => ({source:e.source, modelId:e.modelId, family:e.family,
                                        weight:e.weight, detail:e.detail, url:e.url, slot:e.slot})),
    observations: a.bus.observations.map(o => ({url:o.url, ttftMs:o.ttftMs, totalMs:o.totalMs,
                  chunks:o.chunks, promptTokens:o.promptTokens, completionTokens:o.completionTokens,
                  reasoningTokens:o.reasoningTokens, modelSeen:o.modelSeen, frames:o.frames,
                  events:o.events, textHead:(o.text||'').slice(0,800)})),
    verdict: a.classify(),
    learned: a.learned().map(e => ({resolved:e.resolved, status:e.status, family:e.family, count:e.count})),
  };
})()"""


def read_probe(cdp):
    return evaluate(cdp, READ_PROBE_JS, timeout=30)


def print_verdict(v, obs=None):
    if not v:
        log("  (无判定)")
        return
    log("")
    log("=" * 68)
    log("  判定模式 : %s" % v.get("mode", "?"))
    log("  模型     : %s" % (v.get("label") or v.get("modelId") or "(未识别)"))
    log("  modelId  : %s" % (v.get("modelId") or "-"))
    front = v.get("frontier")
    log("  家族     : %s    代际: %s    前沿: %s" % (
        v.get("family") or "-", v.get("gen") or "-",
        front if front is not None else "-"))
    log("  置信度   : %.1f%%" % ((v.get("confidence") or 0) * 100))
    if v.get("note"):
        log("  说明     : %s" % v["note"])
    for a in (v.get("alternatives") or [])[:4]:
        log("    备选   : %s (%s) %.0f%%" % (
            a.get("modelId"), a.get("family"),
            (a.get("confidence") or 0) * 100))
    log("=" * 68)
    if obs:
        log("")
        log("  最近响应 : TTFT %sms / 总计 %sms / %s chunks" % (
            obs.get("ttftMs"), obs.get("totalMs"), obs.get("chunks")))
        log("  tokens   : in %s / out %s / reasoning %s" % (
            obs.get("promptTokens"), obs.get("completionTokens"), obs.get("reasoningTokens")))
        if obs.get("events"):
            log("  事件     : %s" % ", ".join(obs["events"][:8]))
        if obs.get("frames"):
            log("  协议帧   : %s" % ", ".join(obs["frames"][:8]))


def print_evidence(ev, limit=18):
    if not ev:
        return
    log("")
    log("  证据链（%d 条，显示最近 %d 条）:" % (len(ev), min(limit, len(ev))))
    for e in ev[-limit:]:
        tag = e.get("modelId") or e.get("family") or ""
        det = (e.get("detail") or "")[:70]
        log("    [%-22s] %-24s %s" % (e.get("source"), tag, det))


# ----------------------------------------------------------------------------
# 主流程
# ----------------------------------------------------------------------------
def run_ask(questions, out_json=None, timeout_s=180):
    if not BUNDLE.exists():
        log("[!] 找不到探针产物: %s" % BUNDLE)
        log("    请先运行:  node tools/build.mjs")
        return 2

    ensure_browser()
    page = get_page()
    if not page:
        log("[!] 无法获取页面")
        return 2

    cdp = CDP(page["webSocketDebuggerUrl"]).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")
        cdp.call("Network.enable", {"maxTotalBufferSize": 200 * 1024 * 1024,
                                    "maxResourceBufferSize": 50 * 1024 * 1024})

        net_hits = []

        def on_req(p):
            u = p.get("request", {}).get("url", "")
            if NET_NOISE.search(u):
                return
            net_hits.append({"method": p["request"].get("method"), "url": u,
                             "postData": (p["request"].get("postData") or "")[:1500]})

        def on_resp(p):
            h = p.get("response", {}).get("headers", {}) or {}
            mh = {k: v for k, v in h.items()
                  if re.search(r"model|provider|upstream|x-llm", k, re.I)}
            if mh:
                net_hits.append({"responseHeaders": mh,
                                 "url": p.get("response", {}).get("url", "")})

        cdp.on("Network.requestWillBeSent", on_req)
        cdp.on("Network.responseReceived", on_resp)

        # 先注入探针（保证当前构建），再等页面就绪
        ok_probe, probe_info = inject_fresh(cdp)
        if not ok_probe:
            log("[!] 探针注入失败: %s" % probe_info)
            return 5
        log("[*] 探针       : %s" % probe_info)

        if not page_ready(cdp, want_editor=True):
            log("[!] 页面未就绪（编辑器迟迟不出现）")
            return 3

        # 鉴权诊断
        try:
            auth = diagnose_auth(cdp)
            who = auth.get("user") or {}
            if auth.get("loggedIn"):
                log("[*] 登录状态 : 已登录（%s）" % (who.get("email") or who.get("username")))
            else:
                log("[*] 登录状态 : 匿名访客 (email=%r, username=%s)" % (
                    who.get("email", ""), who.get("username")))
                log("    -> 匿名会话无法发消息，请在该浏览器窗口里登录一次，然后重跑：")
                log("       python arena_probe.py --login")
                return 4
        except Exception as e:
            log("[*] 鉴权诊断跳过: %s" % e)

        results = []
        for idx, q in enumerate(questions, 1):
            log("")
            log("--- [%d/%d] %s" % (idx, len(questions), q))
            try:
                before = len(read_probe(cdp).get("observations") or [])
            except Exception:
                before = 0
            ok, detail = submit_question(cdp, q)
            log("    提交: %s" % detail)
            if not ok:
                results.append({"question": q, "ok": False, "detail": detail})
                continue

            verdict, obs, ev = None, None, []
            last_tag = None
            t0 = time.time()
            while time.time() - t0 < timeout_s:
                time.sleep(1.5)
                try:
                    snap = read_probe(cdp)
                except Exception:
                    continue
                v = snap.get("verdict") or {}
                obs_list = snap.get("observations") or []
                ev = snap.get("evidence") or []
                if len(obs_list) > before:
                    obs = obs_list[-1]
                tag = "%s|%d|%d" % (v.get("mode"), len(ev), len(obs_list))
                if tag != last_tag:
                    log("    [%ds] %s / 证据 %d / 观测 %d" % (
                        int(time.time() - t0), v.get("mode"), len(ev), len(obs_list)))
                    last_tag = tag
                verdict = v
                if v.get("mode") == "RESOLVED" and obs:
                    break

            print_verdict(verdict, obs)
            print_evidence(ev)
            results.append({"question": q, "ok": True, "verdict": verdict,
                            "observation": obs, "evidenceCount": len(ev)})
            time.sleep(1.5)

        if out_json:
            payload = {"at": time.strftime("%Y-%m-%dT%H:%M:%S"), "url": TARGET_URL,
                       "probeVersion": PROBE_VERSION,
                       "results": results, "networkHits": net_hits[-60:]}
            Path(out_json).write_text(json.dumps(payload, ensure_ascii=False, indent=2),
                                      encoding="utf-8")
            log("\n[*] 报告已写入 %s" % out_json)
        return 0
    finally:
        cdp.close()


def do_login():
    """启动浏览器供用户登录一次（持久化）"""
    if not cdp_alive():
        launch_browser(TARGET_URL)
    page = get_page()
    if not page:
        log("[!] 无法获取页面")
        return 2
    cdp = CDP(page["webSocketDebuggerUrl"]).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")
        page_ready(cdp, want_editor=False, tries=20)
        try:
            auth = diagnose_auth(cdp)
            who = auth.get("user") or {}
            if auth.get("loggedIn"):
                log("[*] 已经是登录状态：%s" % (who.get("email") or who.get("username")))
                return 0
        except Exception:
            pass
        log("")
        log("=" * 68)
        log("  请在弹出的浏览器窗口里完成登录（Google / 邮箱均可）")
        log("  配置目录: %s" % PROFILE_DIR)
        log("  登录后回到这里按 Enter 继续 —— 之后运行不再需要登录")
        log("=" * 68)
        try:
            input()
        except EOFError:
            time.sleep(30)
        auth = diagnose_auth(cdp)
        who = auth.get("user") or {}
        if auth.get("loggedIn"):
            log("[+] 登录成功：%s" % (who.get("email") or who.get("username")))
            return 0
        log("[!] 仍未检测到登录（email/username 为空）")
        return 4
    finally:
        cdp.close()


def do_serve():
    ensure_browser()
    page = get_page()
    if not page:
        log("[!] 无法获取页面")
        return 2
    cdp = CDP(page["webSocketDebuggerUrl"]).connect()
    try:
        cdp.call("Runtime.enable")
        cdp.call("Page.enable")
        page_ready(cdp, want_editor=True)
        ok_probe, info = inject_fresh(cdp)
        log("[*] 探针: %s" % info)
        log("[*] 交互模式：输入问题回车提交，Ctrl+C 退出")
        while True:
            try:
                q = input("ask> ").strip()
            except (EOFError, KeyboardInterrupt):
                break
            if not q:
                continue
            ok, detail = submit_question(cdp, q)
            log("    提交: %s" % detail)
            if not ok:
                continue
            for _ in range(120):
                time.sleep(1.5)
                snap = read_probe(cdp)
                v = snap.get("verdict") or {}
                if v.get("mode") == "RESOLVED":
                    print_verdict(v, (snap.get("observations") or [None])[-1])
                    break
            else:
                log("    (超时未出判定)")
        return 0
    finally:
        cdp.close()


def main():
    ap = argparse.ArgumentParser(
        description="arena.ai 模型探针独立驱动器（CDP 驱动真实浏览器）",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    ap.add_argument("--ask", action="append", default=[], help="要提问的内容（可重复）")
    ap.add_argument("--file", help="从文件读取问题（每行一个）")
    ap.add_argument("--login", action="store_true", help="启动浏览器供登录一次")
    ap.add_argument("--serve", action="store_true", help="交互式 REPL")
    ap.add_argument("--fresh", action="store_true", help="重建浏览器配置目录（会丢登录态）")
    ap.add_argument("--reload", action="store_true", help="强制刷新页面以注入最新探针")
    ap.add_argument("--json", dest="out_json", help="把结果写入 JSON")
    ap.add_argument("--timeout", type=int, default=180, help="单题等待上限（秒）")
    args = ap.parse_args()

    if args.fresh:
        launch_browser(fresh=True)
    if args.login:
        return do_login()
    if args.serve:
        return do_serve()

    questions = list(args.ask)
    if args.file:
        questions += [l.strip() for l in Path(args.file).read_text(encoding="utf-8").splitlines()
                      if l.strip()]
    if not questions:
        questions = ["用一句话说明什么是二分查找。"]

    return run_ask(questions, out_json=args.out_json, timeout_s=args.timeout)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("\n[中断]")
        sys.exit(130)
    except Exception as e:
        log("[!] 异常: %s" % e)
        import traceback
        traceback.print_exc()
        sys.exit(1)
