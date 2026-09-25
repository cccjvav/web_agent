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
    name: '其它 MCP 客户端（待核对）',
    url: null,
    needsPlus: null,
    needsTunnel: null,
    supportsMcp: null,
    verification: 'unverified',
    connectMode: 'paste-url',
    summary: '先确认具体客户端版本、账户和传输/认证能力。复制提示词只是候选配置材料，普通对话不等于建立MCP连接。',
    steps: [
      '查实际客户端的MCP配置入口与认证要求，不按产品名字推断兼容性或订阅条件',
      '根据本机或云端请求位置选择可达地址；仅在客户端明确支持时使用复制内容，不公开密钥',
      '先完成认证、发现工具、只读调用workspace_info并核对Bridge记录；不以聊天回复代替工具结果'
    ]
  },
  {
    id: 'chatgpt-free',
    name: 'ChatGPT 普通粘贴（不是MCP配置）',
    url: 'https://chatgpt.com/',
    needsPlus: null,
    needsTunnel: null,
    supportsMcp: false,
    connectMode: 'unsupported-mcp',
    summary: '仅把链接贴进普通聊天不等于注册MCP连接、认证或授权。请核对当前版本和账户是否提供正式连接器入口；本卡不提供连接提示词。',
    steps: [
      '不要把带密钥URL贴进 ChatGPT 输入框或公开对话来代替连接配置',
      '核对当前官方文档和账户中的MCP入口、订阅、权限要求；不保证菜单位置或功能开放范围',
      '也可选择本机 Chat 或已核对的兼容客户端，不能关闭主机鉴权来绕过客户端限制'
    ]
  },
  {
    id: 'chatgpt-plus',
    name: 'OAuth MCP 连接器（ChatGPT等候选）',
    url: 'https://chatgpt.com/',
    needsPlus: null,
    needsTunnel: null,
    supportsMcp: null,
    verification: 'unverified',
    connectMode: 'oauth-connector',
    summary: '主机提供OAuth连接能力，不专属某厂商，默认关闭，需先在本机工作台Bridge区开启。具体客户端版本、账户和订阅是否支持须另验；使用规范/mcp地址而非带密钥URL。',
    steps: [
      'OAuth配对默认关闭：先在本机工作台Bridge区点“开启OAuth配对”；关闭会让已发出的OAuth授权全部失效，URL密钥连接不受影响',
      '先核对实际客户端是否支持主机的Streamable HTTP、OAuth和S256 PKCE，以及客户端注册/认证方式',
      '在经过核对的连接器入口填写可达的规范https://<主机>/mcp地址，不带密钥；不假定旧菜单或/plugins页面仍有效',
      '启动Bridge后在本机查看配对码，只输入主机实际授权页；配对码适用于兼容OAuth客户端，不公开或贴入普通聊天',
      '核对权限范围后再授权，只读工具成功并有主机记录后才考虑写入；不为方便直接授予全部操作权限'
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
      '认证：OAuth（默认关闭，先在本机工作台Bridge区开启）。在本机工作台看配对码，不要把密钥贴到聊天里。'
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
