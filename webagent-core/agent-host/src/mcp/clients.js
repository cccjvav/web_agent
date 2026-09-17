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
    name: 'DeepSeek 第三方扩展（候选）',
    url: 'https://chat.deepseek.com/',
    needsPlus: null,
    needsTunnel: null,
    supportsMcp: null,
    verification: 'unverified',
    connectMode: 'extension-http',
    repoUrl: 'https://github.com/zhu1090093659/deepseek-pp',
    summary: '第三方候选，当前安装包、站点、订阅和MCP兼容性未验证。连接方式取决于实际扩展版本，不保证填入地址即可使用。',
    steps: [
      '先核对实际扩展版本、来源、许可证及权限；参考 docs/guides/网页DeepSeek使用指南.md，不按旧商店ID盲装',
      '区分扩展本机请求与云端请求；云端需要可达的认证地址，本机能否用回环取决于浏览器权限，不一律要求隧道',
      '确认支持Streamable HTTP及实际认证流程后，再复制MCP地址到经过核对的连接配置，不公开密钥',
      '复制规则只是参考，不会建立连接、自动注入工具或授予权限；401/403不能靠关闭鉴权解决',
      '先确认认证和工具发现，再只读调用workspace_info及已知测试文件，核对真实Bridge记录；后续写入逐次授权，不额外安装Shell Native Host'
    ]
  },
  {
    id: 'chat-plus',
    name: 'Chat Plus 第三方扩展（候选）',
    url: 'https://github.com/aiguicai/Chat-Plus',
    needsPlus: null,
    needsTunnel: null,
    supportsMcp: null,
    verification: 'unverified',
    connectMode: 'extension-http',
    repoUrl: 'https://github.com/aiguicai/Chat-Plus',
    summary: '社区候选，当前构建方式、许可证、支持站点、订阅与MCP兼容性未验证。本项目不内置或自动安装该扩展。',
    steps: [
      '先核对选定版本的来源、许可证、权限和安装说明；参考 docs/guides/网页ChatPlus使用指南.md，不保证旧构建命令仍有效',
      '区分扩展本机请求与云端请求；是否需要隧道取决于请求发起位置及浏览器权限',
      '确认支持Streamable HTTP与认证后，再复制MCP地址到经过核对的连接配置；不要公开密钥或关闭鉴权',
      '复制规则不等于注入工具成功，更不是权限授权；不要为接入额外安装MCP-Gateway或Shell通道',
      '确认认证、列工具，再只读调用workspace_info和已知文件，核对Bridge真实记录；写入与执行需另外授权'
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
      '可评估未验收的第三方候选（见docs/guides/网页ChatPlus使用指南.md），不保证安装或兼容；也可选本机 Chat / Arena'
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
