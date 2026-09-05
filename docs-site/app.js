/* Visual docs shell. Content comes from content.js (built from Markdown). */
(function () {
  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];

  const PAGES = [
    { id: 'map', label: '全景图', hint: '三层、三条路' },
    { id: 'guide', label: '架构导读', hint: '人话四层' },
    { id: 'impl', label: '代码直译', hint: '函数逐步' },
    { id: 'graph', label: '知识图谱', hint: '总览调用链' },
    { id: 'workflow', label: '工作流', hint: '组件说明' },
    { id: 'files', label: '文件夹说明书', hint: '行级 README' },
    { id: 'terms', label: '术语', hint: '先人话' }
  ];

  function route() {
    const hash = (location.hash || '#/map').replace(/^#\/?/, '');
    const [page, ...rest] = hash.split('/');
    return { page: page || 'map', rest, raw: hash };
  }

  function go(to) {
    location.hash = to.startsWith('#') ? to : `#/${to}`;
  }

  function renderNav(active) {
    const q = $('#q') ? $('#q').value : '';
    $('.nav').innerHTML = `
      <div class="brand">
        <div class="logo" aria-hidden="true"></div>
        <div>
          <h1>Web Agent</h1>
          <small>可读 · 可视的架构与源码导览</small>
        </div>
      </div>
      <input class="search" id="q" placeholder="搜标题、文件、术语…" value="${escapeAttr(q)}" />
      <div class="sec">导览</div>
      ${PAGES.map((p) => `
        <button type="button" class="item ${p.id === active ? 'on' : ''}" data-go="${p.id}">
          <span class="dot ${p.id === 'map' || p.id === 'guide' ? 'kitchen' : p.id === 'impl' ? 'shop' : 'remote'}"></span>
          ${p.label}
        </button>`).join('')}
      <div class="sec">正文仍在仓库根</div>
      <a class="item" href="../架构导读.md">架构导读.md</a>
      <a class="item" href="../技术实现.md">技术实现.md</a>
      <a class="item" href="../总览.md">总览.md</a>
    `;
    $('#q').addEventListener('input', onSearch);
    $$('.nav [data-go]').forEach((btn) => btn.addEventListener('click', () => go(btn.dataset.go)));
  }

  function escapeAttr(s) {
    return String(s || '').replace(/"/g, '&quot;');
  }

  function pageChrome(title, kicker, extra = '') {
    return `
      <div class="topbar">
        <div>
          <h2>${title}</h2>
          <p class="kicker">${kicker}</p>
        </div>
        ${extra}
      </div>`;
  }

  function renderMap() {
    $('.main').innerHTML = `
      ${pageChrome('本机车间，云上只下工单', '代码不出门。网页 AI 只能填工单；真正改磁盘的是你电脑上的 agent-host。')}
      <div class="hero-grid">
        <div class="card">
          <h3>电脑上同时活着谁</h3>
          <p class="muted" style="margin-top:0">同一进程、两套 Express、两扇门。点一层可跳到导读对应节。</p>
          <div class="arch">
            <div class="layer remote" data-jump="#/guide/临时门牌隧道">
              <div class="tag">远端</div>
              <div>
                <strong>网页 AI</strong>
                <p>Arena / DeepSeek++ / Chat Plus / ChatGPT 连接器。看不见 D:\\code。</p>
              </div>
              <span class="port">HTTPS</span>
            </div>
            <div class="connector">↓ Quick Tunnel 把 48271 映成 trycloudflare.com（本机 Chat 不需要）</div>
            <div class="layer kitchen" data-jump="#/guide/你电脑上同时活着谁">
              <div class="tag">车间</div>
              <div>
                <strong>agent-host</strong>
                <p>MCP、OAuth、callTool、补丁、PowerShell。入口 <code>src/index.js</code>。</p>
              </div>
              <span class="port">:48271</span>
            </div>
            <div class="connector">↓ 同一进程 · 店堂 3000 的 /api · /ws；后厨公网只收 /mcp</div>
            <div class="layer shop" data-jump="#/guide/三条路一把扳手">
              <div class="tag">店堂</div>
              <div>
                <strong>工作台 或 网页 VS Code</strong>
                <p>按钮改不了磁盘。Chat 打 POST /api/chat；Bridge 只开门、看卡片。</p>
              </div>
              <span class="port">:3000</span>
            </div>
          </div>
        </div>
        <div class="card">
          <h3>三个不能混的东西</h3>
          <div class="timeline">
            <div class="tl"><div class="n">1</div><div class="body"><b>Git 仓库 web_agent</b><p>工具箱。程序源码。</p></div></div>
            <div class="tl"><div class="n">2</div><div class="body"><b>工作区</b><p>默认 workspace/，也可以是 D:\\code\\my-app。扳手只能改这里。</p></div></div>
            <div class="tl"><div class="n">3</div><div class="body"><b>网页上的 AI</b><p>只会聊天、下工单。127.0.0.1 是它自己那台机器。</p></div></div>
          </div>
          <p class="faint">沙箱：<code>patchEngine.resolveSafePath</code>。逃出工作区就拒绝。</p>
        </div>
      </div>
      <div class="card">
        <h3>三条路，一把扳手 <code>tools/index.js callTool</code></h3>
        <div class="paths">
          <button type="button" class="chip on" data-path="a">A 本机 Chat</button>
          <button type="button" class="chip" data-path="b">B 网页 Agent</button>
          <button type="button" class="chip" data-path="c">C 网页 VS Code</button>
        </div>
        <div id="path-flow"></div>
        <p class="faint" style="margin-top:12px">Named / ngrok 下拉源码里不 spawn。Plan 没 Key 时是本机草案，不假装 97%。不要把愿望写成已经接上。</p>
      </div>
      <div class="hero-grid" style="margin-top:18px">
        <div class="card">
          <h3>一次打补丁怎么走</h3>
          <div class="flow" id="patch-flow"></div>
        </div>
        <div class="card">
          <h3>还不要写成已经接上</h3>
          <ul class="muted">
            <li>Quick Tunnel 只在 Cloudflare 时 <code>startQuickTunnel</code></li>
            <li>远程 tools/call 默认 Code</li>
            <li><code>sendCommandInput</code> 恒定失败，没有 PTY</li>
            <li>工作台 arenaConnect 打的是本机 /mcp，不是云上 Arena</li>
            <li>隧道带 Cloudflare 头时 48271 /api 404，不下发 secretKey</li>
            <li>默认只听 127.0.0.1；符号链接不能指到工作区外</li>
            <li>MCP CORS 白名单；外站 Origin 不能打本机 /api</li>
            <li>网页 VS Code 默认要登录口令，trusted-origins 不再是 *</li>
            <li>工作台保存走 write_file，写不进 .env，错 hash 会 409</li>
            <li>挂别人的 Git 仓库时，MCP 密钥和 API Key 会自动 gitignore</li>
            <li>Plan 没 Key 时是本机草案/拼接；有 Key 才调模型。没有假 97%</li>
            <li>Bridge「登录」是本机演示授权，不是 GitHub OAuth，没有「永久顺」</li>
          </ul>
        </div>
      </div>
    `;
    paintPath('a');
    paintPatch();
    $$('[data-jump]').forEach((el) => el.addEventListener('click', () => go(el.dataset.jump.replace('#/', ''))));
    $$('[data-path]').forEach((btn) => btn.addEventListener('click', () => {
      $$('[data-path]').forEach((b) => b.classList.toggle('on', b === btn));
      paintPath(btn.dataset.path);
    }));
  }

  const PATHS = {
    a: [
      ['你', '工作台右侧 CHAT'],
      ['js/chat.js', 'POST :3000 /api/chat'],
      ['runChat.js', '无 Key → runBuiltin'],
      ['callTool', 'Ask 只读 / Code 可写'],
      ['磁盘', '工作区文件变了']
    ],
    b: [
      ['云上聊天栏', 'HTTPS 工单'],
      ['trycloudflare', '/mcp/<密钥>；公网 /api 404'],
      ['mcp/server.js', 'requireAuth → handleRpc'],
      ['callTool', '默认 code'],
      ['磁盘', 'BRIDGE 经 /ws 出卡片']
    ],
    c: [
      ['run-webagent-vscode', 'ensure code-server'],
      ['agent-host', 'SKIP_WORKBENCH=1'],
      ['extension.js', '仍 POST :48271/api/chat'],
      ['callTool', '同一套扳手'],
      ['磁盘', '网页改盘仍走 B']
    ]
  };

  function paintPath(id) {
    const steps = PATHS[id];
    $('#path-flow').innerHTML = `<div class="flow">${steps.map((s, i) =>
      `<div class="step"><b>${s[0]}</b>${s[1]}</div>${i < steps.length - 1 ? '<span class="arrow">→</span>' : ''}`
    ).join('')}</div>`;
  }

  function paintPatch() {
    const steps = [
      ['tools/call 或 Chat', 'resolveToolName'],
      ['callTool', '模式锁 / 危险闸'],
      ['applyPatch', '沙箱 + 哈希'],
      ['tmp + rename', '原子替换'],
      ['eventBus', '工作台刷 Diff']
    ];
    $('#patch-flow').innerHTML = `<div class="flow">${steps.map((s, i) =>
      `<div class="step"><b>${s[0]}</b>${s[1]}</div>${i < steps.length - 1 ? '<span class="arrow">→</span>' : ''}`
    ).join('')}</div>`;
  }

  function renderGuide() {
    const g = window.DOCS.guide;
    const r = route();
    const focus = decodeURIComponent(r.rest.join('/') || '');
    const compact = (s) => String(s || '').replace(/[^\w\u4e00-\u9fff]+/g, '');
    $('.main').innerHTML = `
      ${pageChrome('架构导读', '每一节四层：人话 → 比喻 → 落在仓库哪 → 行业叫法。不先甩缩写。')}
      <div class="section-nav">
        ${g.sections.map((s) => `<a href="#/guide/${encodeURIComponent(s.title)}" class="${focus && s.title.includes(focus) ? 'on' : ''}">${s.title.replace(/^\d+\.\s*/, '')}</a>`).join('')}
      </div>
      <div class="prose">${g.introHtml}</div>
      ${g.sections.map((s) => `
        <article class="guide-sec card" id="${s.id}">
          <h3>${s.title}</h3>
          ${s.talkHtml || s.metaphorHtml || s.filesHtml || s.jargonHtml ? `
          <div class="four">
            <div class="layer-card l-talk"><div class="lbl">人话</div>${s.talkHtml || '<p class="faint">本节用人话+表格写在下面全文里。</p>'}</div>
            <div class="layer-card l-meta"><div class="lbl">比喻</div>${s.metaphorHtml || '<p class="faint">见全文。</p>'}</div>
            <div class="layer-card l-file"><div class="lbl">落在仓库哪</div>${s.filesHtml || '<p class="faint">见全文。</p>'}</div>
            <div class="layer-card l-jarg"><div class="lbl">行业叫法</div>${s.jargonHtml || '<p class="faint">见全文。</p>'}</div>
          </div>` : ''}
          <details style="margin-top:12px">
            <summary class="muted">本节全文</summary>
            <div class="prose" style="margin-top:10px">${s.html}</div>
          </details>
        </article>`).join('')}
    `;
    if (focus) {
      const needle = compact(focus);
      const hit = g.sections.find((s) => compact(s.title).includes(needle) || compact(s.id).includes(needle));
      if (hit) {
        const el = document.getElementById(hit.id);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
  }

  function renderProsePage(key, title, kicker) {
    const doc = window.DOCS[key];
    $('.main').innerHTML = `
      ${pageChrome(title, kicker)}
      <div class="layout-split">
        <nav class="toc">${doc.toc.map((t) =>
          `<a class="l${t.level}" href="#/${key === 'impl' ? 'impl' : key === 'overview' ? 'graph' : 'workflow'}/${t.id}">${t.text}</a>`
        ).join('')}</nav>
        <article class="prose card">${doc.html}</article>
      </div>
    `;
    const id = route().rest[0];
    if (id) {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  function renderFiles() {
    const idx = window.DOCS.fileIndex;
    const id = route().rest[0] || idx[0].id;
    const doc = window.DOCS.files[id] || window.DOCS.files[idx[0].id];
    const groups = [...new Set(idx.map((x) => x.group))];
    $('.main').innerHTML = `
      ${pageChrome('文件夹说明书', '第一阶段行级 README：每个函数的步骤与分支。解释以磁盘源码为准。')}
      <div class="layout-split">
        <div class="toc file-list">
          ${groups.map((g) => `
            <div class="g">${g}</div>
            ${idx.filter((x) => x.group === g).map((x) =>
              `<button type="button" class="${x.id === doc.id ? 'on' : ''}" data-file="${x.id}">${x.path.replace('webagent-core/agent-host/', '…/')}</button>`
            ).join('')}
          `).join('')}
        </div>
        <article class="prose card">
          <p class="faint">${doc.path}</p>
          ${doc.html}
        </article>
      </div>
    `;
    $$('[data-file]').forEach((b) => b.addEventListener('click', () => go(`files/${b.dataset.file}`)));
  }

  function renderTerms() {
    const terms = window.DOCS.terms || [];
    $('.main').innerHTML = `
      ${pageChrome('术语对照', '先人话。解释以本仓库行为为准，不是行业百科。')}
      <div class="terms">
        ${terms.map((t) => `<div class="term"><b>${t.term}</b><span>${t.meaning}</span></div>`).join('')}
      </div>
    `;
  }

  function onSearch() {
    const q = ($('#q').value || '').trim().toLowerCase();
    if (!q) return;
    const hits = [];
    window.DOCS.guide.sections.forEach((s) => {
      if (s.title.toLowerCase().includes(q)) hits.push({ label: '导读 · ' + s.title, to: 'guide/' + encodeURIComponent(s.title) });
    });
    window.DOCS.impl.toc.forEach((t) => {
      if (t.text.toLowerCase().includes(q)) hits.push({ label: '直译 · ' + t.text, to: 'impl/' + t.id });
    });
    window.DOCS.fileIndex.forEach((f) => {
      if (f.path.toLowerCase().includes(q) || f.id.includes(q)) hits.push({ label: '说明书 · ' + f.path, to: 'files/' + f.id });
    });
    (window.DOCS.terms || []).forEach((t) => {
      if (t.term.toLowerCase().includes(q) || t.meaning.toLowerCase().includes(q)) {
        hits.push({ label: '术语 · ' + t.term, to: 'terms' });
      }
    });
    if (!hits.length) return;
    const box = $('.main');
    if (q.length >= 2) {
      const existing = $('#search-hits');
      const html = `<div class="card" id="search-hits" style="margin-bottom:16px"><h3>搜索</h3>${hits.slice(0, 20).map((h) =>
        `<div><a href="#/${h.to}">${h.label}</a></div>`
      ).join('')}</div>`;
      if (existing) existing.outerHTML = html;
      else box.insertAdjacentHTML('afterbegin', html);
    }
  }

  function render() {
    const r = route();
    const page = PAGES.some((p) => p.id === r.page) ? r.page : 'map';
    renderNav(page);
    if (page === 'map') renderMap();
    else if (page === 'guide') renderGuide();
    else if (page === 'impl') renderProsePage('impl', '代码直译技术实现', '只描述当前仓库源码。没有的标未实现。if / try 分支在原文里。');
    else if (page === 'graph') renderProsePage('overview', '总览 · 知识图谱', '子 README 索引、三条路径、Install → Run。总图在全景页用图层画过一遍。');
    else if (page === 'workflow') renderProsePage('workflow', '组件说明', '从双击到文件被改。小白工作流。');
    else if (page === 'files') renderFiles();
    else if (page === 'terms') renderTerms();
  }

  window.addEventListener('hashchange', render);
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (!a) return;
    e.preventDefault();
    location.hash = a.getAttribute('href');
  });
  render();
})();
