'use strict';
// Assembles a Chat Completions *streaming* response (F102, review P2-2).
//
// runOpenAI asks every provider for `stream: true`. A provider that honours it answers with
// `text/event-stream`: one `data: {...}` event per token/tool-call fragment, closed by
// `data: [DONE]`. This module turns those fragments back into exactly the shape the buffered path
// produced (`{ choices: [{ message: { role, content, tool_calls } }] }`) so the same
// normalizeAssistantMessage validation applies afterwards, and reports each piece of visible
// assistant text through `onContent` as soon as it arrives. It parses text only — the transport,
// the 120 s deadline, cancellation and the 1 MiB budget stay in utils/requestScope.js.
//
// A provider that ignores `stream` answers with a JSON body instead; isEventStream() tells the two
// apart from the response Content-Type, so nothing here is applied to a buffered reply.

const STREAM_TOOL_CALL_MAX = 64;

function isResponseRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function headerValue(response, name) {
  const headers = response && response.headers;
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const key = Object.keys(headers).find(candidate => candidate.toLowerCase() === name);
  return key ? String(headers[key] || '') : '';
}

function isEventStream(response) {
  return /^\s*text\/event-stream\s*(?:;|$)/i.test(headerValue(response, 'content-type'));
}

function streamError(message, upstream) {
  const error = new Error(message);
  error.code = 'E_MODEL_STREAM';
  // The provider's in-band error object rides along for *classification only* (F103,
  // modelDiagnostics.js); it is never part of the message a user sees.
  if (upstream !== undefined) error.upstream = upstream;
  return error;
}

// Incremental SSE parser + Chat Completions chunk merger. push(text) may be called with arbitrary
// text boundaries (mid-line, mid-multibyte pieces are the transport's job, we only see strings);
// end() flushes the trailing line and returns the merged completion.
function createCompletionAssembler({ onContent } = {}) {
  const emitContent = typeof onContent === 'function' ? onContent : () => {};
  const calls = [];
  let pending = '', dataLines = [], content = '', role = '', finishReason = null;
  let sawChoice = false, done = false, events = 0;

  function mergeToolCall(part) {
    if (!isResponseRecord(part)) throw streamError('模型流式工具调用形状无效');
    let index = part.index;
    if (index === undefined || index === null) {
      // Providers that omit `index` send a fresh id when a new call starts and nothing but
      // argument fragments afterwards.
      index = typeof part.id === 'string' && part.id && !(calls.length && calls[calls.length - 1].id === part.id)
        ? calls.length : Math.max(0, calls.length - 1);
    }
    if (!Number.isInteger(index) || index < 0 || index >= STREAM_TOOL_CALL_MAX) throw streamError('模型流式工具调用序号无效');
    const slot = calls[index] || (calls[index] = { id: '', name: '', arguments: '' });
    if (part.id !== undefined && part.id !== null) {
      if (typeof part.id !== 'string') throw streamError('模型流式工具调用形状无效');
      if (!slot.id) slot.id = part.id;
    }
    if (part.function !== undefined && part.function !== null) {
      if (!isResponseRecord(part.function)) throw streamError('模型流式工具调用形状无效');
      const { name, arguments: args } = part.function;
      if (name !== undefined && name !== null) {
        if (typeof name !== 'string') throw streamError('模型流式工具调用形状无效');
        if (!slot.name && name) slot.name = name;
      }
      if (args !== undefined && args !== null) {
        if (typeof args !== 'string') throw streamError('模型流式工具调用形状无效');
        slot.arguments += args;
      }
    }
  }

  function mergeChunk(chunk) {
    if (!isResponseRecord(chunk)) throw streamError('模型流式响应块不是对象');
    // Provider-side failures arrive as an in-band event; never reflect the body (see runOpenAI).
    if (chunk.error !== undefined && chunk.error !== null) throw streamError('模型在流式响应中报告错误', chunk);
    if (chunk.choices === undefined || chunk.choices === null) return; // usage-only trailer
    if (!Array.isArray(chunk.choices)) throw streamError('模型流式响应块 choices 类型无效');
    if (!chunk.choices.length) return;
    const choice = chunk.choices[0];
    if (!isResponseRecord(choice)) throw streamError('模型流式响应块 choice 类型无效');
    sawChoice = true;
    if (typeof choice.finish_reason === 'string' && choice.finish_reason) finishReason = choice.finish_reason;
    const delta = choice.delta === undefined || choice.delta === null ? {} : choice.delta;
    if (!isResponseRecord(delta)) throw streamError('模型流式响应块 delta 类型无效');
    if (delta.role !== undefined && delta.role !== null) {
      if (typeof delta.role !== 'string') throw streamError('模型 delta.role 类型无效');
      if (!role) role = delta.role;
    }
    if (delta.content !== undefined && delta.content !== null) {
      if (typeof delta.content !== 'string') throw streamError('模型 delta.content 类型无效');
      if (delta.content) { content += delta.content; emitContent(delta.content); }
    }
    if (delta.tool_calls !== undefined && delta.tool_calls !== null) {
      if (!Array.isArray(delta.tool_calls)) throw streamError('模型 delta.tool_calls 类型无效');
      for (const part of delta.tool_calls) mergeToolCall(part);
    }
  }

  function dispatch() {
    if (!dataLines.length) return;
    const data = dataLines.join('\n');
    dataLines = [];
    if (done) return; // anything after [DONE] is ignored, as browsers do
    if (data.trim() === '[DONE]') { done = true; return; }
    let chunk;
    try { chunk = JSON.parse(data); } catch (_) { throw streamError('模型流式响应不是 JSON'); }
    events++;
    mergeChunk(chunk);
  }

  function consumeLine(rawLine) {
    const line = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
    if (line === '') { dispatch(); return; }
    if (line.startsWith(':')) return; // comment / keep-alive
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);
    if (field === 'data') dataLines.push(value);
    // event:, id:, retry: and unknown fields carry nothing for chat/completions.
  }

  return {
    push(text) {
      pending += String(text);
      let newline;
      while ((newline = pending.indexOf('\n')) !== -1) {
        const line = pending.slice(0, newline);
        pending = pending.slice(newline + 1);
        consumeLine(line);
      }
    },
    end() {
      if (pending) { consumeLine(pending); pending = ''; }
      dispatch();
      if (!events && !done) throw streamError('模型流式响应为空');
      if (!sawChoice) throw streamError('模型没有 message');
      for (let i = 0; i < calls.length; i++) if (!calls[i]) throw streamError('模型流式工具调用序号不连续'); // holes
      return {
        done,
        finishReason,
        data: {
          choices: [{
            finish_reason: finishReason,
            message: {
              role: role || 'assistant',
              content: content || null,
              ...(calls.length ? { tool_calls: calls.map(slot => ({ id: slot.id, type: 'function', function: { name: slot.name, arguments: slot.arguments } })) } : {})
            }
          }]
        }
      };
    },
    get content() { return content; },
    get done() { return done; }
  };
}

module.exports = { STREAM_TOOL_CALL_MAX, isEventStream, createCompletionAssembler };
