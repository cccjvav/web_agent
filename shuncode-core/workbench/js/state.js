export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];

export const SITES = {
  chatgpt: { name: 'ChatGPT', url: 'https://chatgpt.com/' },
  arena: { name: 'Arena', url: 'https://arena.ai/agent' },
  deepseek: { name: 'DeepSeek', url: 'https://chat.deepseek.com/' },
  workbuddy: { name: 'WorkBuddy', url: 'https://www.workbuddy.cn/app' },
  trae: { name: 'Trae', url: 'https://work.trae.cn/' },
  qwen: { name: 'Qwen', url: 'https://qwenwork.cn/app/chat' },
  manus: { name: 'Manus', url: 'https://manus.im/app' },
  shunova: { name: 'Shunova', url: 'https://shunova.cc/' }
};

export const state = {
  mode: 'code',
  status: null,
  messages: [],
  history: [],
  sending: false,
  tabs: [{ id: 'welcome', title: '欢迎', kind: 'welcome' }],
  activeTab: 'welcome',
  files: {},
  monaco: null,
  editor: null,
  dirty: {},
  stats: { calls: 0, fail: 0, totalMs: 0 },
  loggedIn: true,
  custom: null,
  stayOnBridge: false,
  selectedClient: 'arena'
};

/** Filled by sibling modules; call through here to avoid import cycles. */
export const ui = {};
