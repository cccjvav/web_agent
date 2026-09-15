import { $, ui } from './state.js';

async function api(path, method = 'GET', body) {
  const response = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || '请求失败');
  return result;
}
async function action(callback) {
  try { await callback(); await refreshOperations(); }
  catch (error) { $('#ops-status').textContent = error.message; }
}
function button(label, callback) {
  const node = document.createElement('button'); node.type = 'button'; node.className = 'vs-btn'; node.textContent = label;
  node.onclick = () => action(callback); return node;
}
async function review(id) {
  const job = await api(`/operations/${encodeURIComponent(id)}`);
  $('#ops-review').textContent = JSON.stringify(job, null, 2);
  const controls = $('#ops-controls'); controls.replaceChildren();
  if (job.status === 'waiting-approval') controls.append(button('已审阅完整参数，批准执行一次', async () => {
    if (!confirm('这会执行所展示的完整请求。外部工具可能有副作用，取消不能撤销。确认批准一次？')) return;
    controls.replaceChildren();
    $('#ops-status').textContent = '正在执行；不要重复提交。可刷新查看状态。';
    await api(`/operations/${id}/approve`, 'POST', { confirm: true }); await review(id);
  }));
  if (['waiting-approval', 'running'].includes(job.status)) controls.append(button('拒绝 / 请求停止', async () => {
    await api(`/operations/${id}/cancel`, 'POST', {}); await review(id);
  }));
}
async function refreshOperations() {
  const data = await api('/operations');
  const servers = $('#ops-servers'), requests = $('#ops-requests'); servers.replaceChildren(); requests.replaceChildren();
  for (const server of data.servers) {
    const row = document.createElement('div'), text = document.createElement('pre'); text.className = 'url-box';
    text.textContent = JSON.stringify(server, null, 2); row.append(text, button('移除此接入（中止连接）', () => api(`/external/servers/${server.serverId}`, 'DELETE'))); servers.append(row);
  }
  for (const job of data.requests) requests.append(button(`${job.kind} · ${job.status} · ${job.requestId}`, () => review(job.requestId)));
  $('#ops-status').textContent = `${data.servers.length} 个接入；${data.requests.length} 条进程内请求。waiting-approval 不代表执行成功。`;
}
function initOperations() {
  let checkId = null, checkGeneration = 0;
  async function connectionAction(callback) {
    const generation = ++checkGeneration;
    try { await callback(generation); }
    catch (error) { if (generation === checkGeneration) $('#connection-check-result').textContent = error.message; }
  }
  $('#btn-create-connection-check').onclick = () => connectionAction(async generation => {
    checkId = null;
    const text = $('#connection-observation').value; $('#connection-observation').value = '';
    const result = await api('/connection-checks', 'POST', JSON.parse(text));
    if (generation !== checkGeneration) return;
    checkId = result.checkId;
    $('#connection-check-result').textContent = JSON.stringify({ ...result, toolRequest: { name: 'confirm_connection', arguments: { challenge: result.challenge } } }, null, 2);
  });
  $('#btn-refresh-connection-check').onclick = () => connectionAction(async generation => {
    if (!checkId) throw new Error('请先创建本机核对；页面刷新后需重新创建');
    const result = await api('/connection-checks/' + checkId);
    if (generation === checkGeneration) $('#connection-check-result').textContent = JSON.stringify(result, null, 2);
  });
  $('#btn-clear-connection-check').onclick = () => connectionAction(async generation => {
    checkId = null; await api('/connection-checks', 'DELETE');
    if (generation === checkGeneration) $('#connection-check-result').textContent = '已清除核对记录（不会注销MCP或改变权限）';
  });
  let stdioPreview = null, launchRequest = 0;
  $('#ops-stdio-config').oninput = () => { launchRequest++; stdioPreview = null; $('#btn-stdio-start').disabled = true; };
  $('#btn-stdio-preview').onclick = () => action(async () => {
    const ticket = ++launchRequest;
    stdioPreview = null; $('#btn-stdio-start').disabled = true;
    const launch = JSON.parse($('#ops-stdio-config').value);
    $('#ops-stdio-config').value = JSON.stringify({ ...launch, env: undefined }, null, 2);
    const result = await api('/external/stdio/preview', 'POST', launch);
    if (ticket !== launchRequest) return;
    $('#ops-stdio-review').textContent = JSON.stringify(result, null, 2);
    stdioPreview = result.previewId; $('#btn-stdio-start').disabled = false;
  });
  $('#btn-stdio-start').onclick = () => action(async () => {
    if (!stdioPreview || !confirm('启动本身会执行所审阅程序，拥有当前系统用户权限。不是OS沙箱。确认信任该程序、参数和依赖，并启动一次？')) return;
    const previewId = stdioPreview; stdioPreview = null; $('#btn-stdio-start').disabled = true;
    await api('/external/stdio/start', 'POST', { previewId, confirmed: true });
  });
  $('#btn-operations').onclick = () => { ui.openModal('operations'); action(refreshOperations); };
  $('#btn-ops-refresh').onclick = () => action(refreshOperations);
  $('#btn-ops-add').onclick = () => action(async () => {
    const token = $('#ops-token').value; $('#ops-token').value = '';
    await api('/external/servers', 'POST', { name: $('#ops-name').value, url: $('#ops-url').value, token });
  });
  $('#btn-ops-preview').onclick = () => action(async () => {
    const result = await api('/workflows/preview', 'POST', { definition: JSON.parse($('#ops-workflow').value) });
    $('#ops-review').textContent = JSON.stringify(result, null, 2); $('#ops-controls').replaceChildren();
  });
  $('#btn-ops-submit').onclick = () => action(async () => {
    const job = await api('/workflows/request', 'POST', { definition: JSON.parse($('#ops-workflow').value), requestKey: crypto.randomUUID() }); await review(job.requestId);
  });
}
Object.assign(ui, { initOperations, refreshOperations });
