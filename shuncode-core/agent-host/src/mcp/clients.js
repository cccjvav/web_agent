const { CONNECT_LINE, getBootstrapPrompt } = require('./instructions');

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
      '新开 DeepSeek 对话下任务。右侧 BRIDGE 应出现工具调用'
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
    name: 'ChatGPT 免费聊天栏',
    url: 'https://chatgpt.com/',
    needsPlus: false,
    needsTunnel: true,
    supportsMcp: false,
    connectMode: 'unsupported-mcp',
    summary: '普通免费聊天栏加不了自定义 MCP 连接器，贴 URL 通常也不会真去调工具。',
    steps: [
      '不要指望免费 ChatGPT 普通对话改你的磁盘',
      '用本机 Chat（无需账号）或 Arena / 其它支持 MCP 的网页 Agent',
      '若该对话明确带 Agent/开发者模式且能加连接器，按「ChatGPT Plus」那张卡片'
    ]
  },
  {
    id: 'chatgpt-plus',
    name: 'ChatGPT Plus 开发者模式',
    url: 'https://chatgpt.com/',
    needsPlus: true,
    needsTunnel: true,
    supportsMcp: true,
    connectMode: 'oauth-connector',
    summary: '可选。Plus/Pro 在设置里开开发者模式，加 MCP 连接器。用 OAuth 配对，URL 里不带长期密钥。',
    steps: [
      '启动 Bridge，记下配对码（只显示在本机）',
      'ChatGPT 设置 → 应用 → 高级 → 开发者模式',
      '新建连接器，MCP URL 填「规范地址」/mcp（不要把密钥写进 URL）',
      '授权方式选 OAuth；浏览器打开配对页，输入本机配对码',
      '权限选允许所有操作，否则补丁和命令会被 ChatGPT 拦下',
      '免费账号没有这一步'
    ]
  }
];

function hydrateClient(client, urls) {
  const mcpUrl = urls.mcpUrl || '';
  const canonical = urls.mcpCanonicalUrl || mcpUrl.replace(/\/mcp\/[^/]+$/, '/mcp');
  let prompt = '';
  if (client.connectMode === 'paste-url') {
    prompt = getBootstrapPrompt(mcpUrl);
  } else if (client.connectMode === 'oauth-connector') {
    prompt = [
      `MCP 规范地址（给连接器用）：${canonical}`,
      '认证：OAuth。在本机工作台看配对码，不要把密钥贴到聊天里。'
    ].join('\n');
  } else if (client.connectMode === 'extension-http') {
    prompt = mcpUrl;
  } else if (client.connectMode === 'unsupported-mcp') {
    prompt = '';
  }
  return {
    ...client,
    prompt,
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
