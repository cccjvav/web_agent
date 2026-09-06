const { CONNECT_LINE, getBootstrapPrompt, getPageRulesPrompt } = require('./instructions');

const CLIENTS = [
  {
    id: 'chat',
    name: '本机 Chat',
    url: null,
    needsPlus: false,
    needsTunnel: false,
    supportsMcp: false,
    connectMode: 'local-chat',
    summary: '工作台右侧 CHAT。不经过隧道，不需要任何网页账号或 Plus。',
    steps: [
      '打开本机工作台 http://127.0.0.1:3000',
      '右侧保持 CHAT，Agent ▾ 默认 Code',
      '直接下任务。工具在本机跑，改的是当前工作区'
    ]
  },
  {
    id: 'arena',
    name: 'Arena Agent',
    url: 'https://arena.ai/agent',
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: true,
    connectMode: 'paste-url',
    summary: '网页 Agent，能把 MCP URL 当工具后端。不需要 ChatGPT Plus。',
    steps: [
      '启动 Bridge，等到地址变成 https://….trycloudflare.com/mcp/…',
      '复制提示词（URL + 那句连接说明）',
      '打开 Arena 新对话，整段当作第一句发出',
      '再说具体任务。右侧 BRIDGE 应出现工具调用'
    ]
  },
  {
    id: 'deepseek',
    name: 'DeepSeek 网页',
    url: 'https://chat.deepseek.com/',
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: true,
    connectMode: 'extension-http',
    extensionId: 'kdmpkkahkhdmdhfkdihkopikgcocbpbf',
    storeUrl: 'https://chromewebstore.google.com/detail/deepseek++/kdmpkkahkhdmdhfkdihkopikgcocbpbf',
    summary: 'DeepSeek 网页自己调不了 MCP。用第三方扩展 DeepSeek++ 当手，把我们的 Streamable HTTP 填进侧边栏。无需 Plus。改磁盘走本机 agent-host，不必装扩展自带的 Shell Native Host。',
    steps: [
      '用 Chrome 或 Edge 打开 Chrome 网上应用店，安装 DeepSeek++（扩展 ID kdmpkkahkhdmdhfkdihkopikgcocbpbf）。不是 DeepSeek 官方产品',
      '启动 Bridge，等到地址变成 https://….trycloudflare.com/mcp/…',
      '点「复制」得到这一行 MCP 地址（带密钥），不要发到公开地方',
      '本机浏览器打开 https://chat.deepseek.com/ ，点 DeepSeek++ 侧边栏 → MCP',
      '添加远程服务，传输选 Streamable HTTP，URL 填刚复制的地址。不要装 deepseek-pp-shell-host',
      '点「复制规则」，贴进 DeepSeek++ 系统提示词或新对话第一句。不要贴进 MCP 地址框',
      '新开 DeepSeek 对话下任务。右侧 BRIDGE 应出现工具调用'
    ]
  },
  {
    id: 'chat-plus',
    name: 'Chat Plus 扩展（多网站）',
    url: 'https://github.com/aiguicai/Chat-Plus',
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: true,
    connectMode: 'extension-http',
    repoUrl: 'https://github.com/aiguicai/Chat-Plus',
    summary: '社区扩展，适配 ChatGPT / Gemini / DeepSeek / 豆包 / 通义 / Arena 等多个网页。把我们的 Streamable HTTP 填进扩展即可。无需 Plus，不必装 MCP-Gateway。GPL，不拷进本仓库。',
    steps: [
      '用 Git 克隆 https://github.com/aiguicai/Chat-Plus ，在该目录 npm install 后 npm run build:chrome。Chrome/Edge 开发者模式加载 dist/chrome。不是各家 AI 官方产品，许可证 GPL v3',
      '启动 Bridge，等到地址变成 https://….trycloudflare.com/mcp/…',
      '点「复制」得到这一行 MCP 地址（带密钥），不要发到公开地方',
      '打开 Chat Plus 侧边栏，添加 MCP 服务：传输选 Streamable HTTP，URL 填刚复制的地址。不要再装 aiguicai/MCP-Gateway',
      '点「复制规则」，贴进 Chat Plus 编排里的系统提示词。打开「注入工具信息」。不要贴进 MCP 地址框',
      '打开已适配的网页（ChatGPT、Gemini、DeepSeek、豆包、通义、Arena 等），给当前页启用工具',
      '新开对话下任务。右侧 BRIDGE 应出现工具调用'
    ]
  },
  {
    id: 'generic',
    name: '其它网页 Agent',
    url: null,
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: true,
    connectMode: 'paste-url',
    summary: 'WorkBuddy / Trae / Qwen / Manus / Claude 等：只要聊天栏能连自定义 MCP 或会跟提示词去调 Streamable HTTP，就可以。',
    steps: [
      '启动 Bridge，复制提示词',
      '在该网站新对话里整段贴上',
      '若该模型没有工具/MCP，它只能空谈，改不了磁盘——改用本机 Chat 或 Arena'
    ]
  },
  {
    id: 'chatgpt-free',
    name: 'ChatGPT 聊天栏（贴链接不行）',
    url: 'https://chatgpt.com/',
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: false,
    connectMode: 'unsupported-mcp',
    summary: '聊天栏里直接贴 MCP 地址、让它「登录」，免费和更高级账号都不会去调工具。要对接着自制 MCP 插件那张卡，或 Chat Plus 扩展当手。',
    steps: [
      '不要把 trycloudflare.com/mcp/… 贴进 ChatGPT 输入框当第一句',
      '任何档位的普通聊天栏都不会因此去连本机 MCP',
      '要对接着「ChatGPT 自制 MCP 插件」：设置里新建插件，服务器 URL + OAuth',
      '也可以装 Chat Plus 扩展当手（见网页ChatPlus使用指南.md），或改用本机 Chat / Arena / DeepSeek++'
    ]
  },
  {
    id: 'chatgpt-plus',
    name: 'ChatGPT 自制 MCP 插件',
    url: 'https://chatgpt.com/plugins',
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: true,
    connectMode: 'oauth-connector',
    summary: 'ChatGPT 设置里的自制插件/连接器会调 MCP。服务器 URL 填规范地址 /mcp（不要带密钥），身份验证选 OAuth，配对码只出现在本机 Bridge 页。不是把链接贴进聊天栏。',
    steps: [
      '启动 Bridge，记下本机配对码（不要发到公开地方）',
      'ChatGPT 设置 → 账户安全与登录 → 打开开发者模式',
      '设置 → 插件 → 新建插件（或打开 https://chatgpt.com/plugins ）',
      '连接选「服务器 URL」。填规范地址 https://….trycloudflare.com/mcp（不要把密钥写进 URL）。表单示例有时写 /sse；本机 GET /mcp 在 Accept: text/event-stream 时就是 SSE',
      '身份验证选 OAuth；勾选自定义 MCP 风险确认后创建。浏览器打开配对页，输入本机配对码',
      '插件权限选允许操作，否则补丁和命令会被 ChatGPT 拦下'
    ]
  }
];

function hydrateClient(client, urls) {
  const mcpUrl = urls.mcpUrl || '';
  const canonical = urls.mcpCanonicalUrl || mcpUrl.replace(/\/mcp\/[^/]+$/, '/mcp');
  let prompt = '';
  let rulesText = '';
  if (client.connectMode === 'paste-url') {
    prompt = getBootstrapPrompt(mcpUrl);
  } else if (client.connectMode === 'oauth-connector') {
    prompt = [
      `MCP 规范地址（给连接器用）：${canonical}`,
      '认证：OAuth。在本机工作台看配对码，不要把密钥贴到聊天里。'
    ].join('\n');
  } else if (client.connectMode === 'extension-http') {
    prompt = mcpUrl;
    rulesText = getPageRulesPrompt();
  } else if (client.connectMode === 'unsupported-mcp') {
    prompt = '';
  }
  return {
    ...client,
    prompt,
    rulesText,
    mcpUrl: client.connectMode === 'oauth-connector' ? canonical : mcpUrl,
    connectLine: CONNECT_LINE
  };
}

function listClients(urls = {}) {
  return CLIENTS.map((c) => hydrateClient(c, urls));
}

function getClient(id, urls = {}) {
  const found = CLIENTS.find((c) => c.id === id) || CLIENTS[1];
  return hydrateClient(found, urls);
}

module.exports = {
  CLIENTS,
  listClients,
  getClient
};
