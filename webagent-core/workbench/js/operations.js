import { $, ui, state } from './state.js';

async function api(path, method = 'GET', body, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, {once:true});
  // Approval has a 60s server cancellation budget; transport abort never rolls back effects.
  const timeout = path.endsWith('/approve') ? 70000 : method === 'POST' && ['/external/servers','/external/stdio/start'].includes(path) ? 40000 : 10000;
  const timer = setTimeout(onAbort, timeout);
  try {
    const response = await fetch(`/api${path}`, {method,signal:controller.signal,headers:{'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
    const result = await response.json();
    if (controller.signal.aborted) throw new Error('请求中断，结果未确认；请查询原请求，不要重放。');
    if (!response.ok || result?.ok === false || result?.success === false) throw new Error(result?.error || '请求失败');
    return result;
  } finally {clearTimeout(timer);signal?.removeEventListener('abort',onAbort);}
}
async function action(callback) {
  try { if (await callback() === false) return false; await refreshOperations(); return true; }
  catch (error) { $('#ops-status').textContent = error.message; return false; }
}
function button(label, callback) {
  const node = document.createElement('button'); node.type = 'button'; node.className = 'vs-btn'; node.textContent = label;
  node.onclick = () => action(callback); return node;
}
let reviewGeneration = 0, reviewController = null, workflowSubmitting = false;
function invalidateReview(message) {
  const ticket = ++reviewGeneration;
  if (reviewController) reviewController.abort();
  reviewController = null;
  $('#ops-controls').replaceChildren();
  $('#ops-review').textContent = message;
  return ticket;
}
async function actOnReview(id, ticket, operation) {
  if (ticket !== reviewGeneration) return false;
  if (operation === 'approve' && !confirm('这会执行所展示的完整请求。外部工具可能有副作用，取消不能撤销。确认批准一次？')) return false;
  // Consume the displayed review before the POST; detached/double-clicked buttons cannot replay it.
  const actionTicket = invalidateReview(`请求 ${id}：已发送${operation === 'approve' ? '批准' : '停止'}请求，结果尚未确认。可重新读取同一请求；不要重复提交。`);
  try {
    await api(`/operations/${encodeURIComponent(id)}/${operation}`, 'POST', operation === 'approve' ? {confirm:true} : {});
    if (actionTicket !== reviewGeneration) return false;
    return await review(id);
  } catch (_) {
    if (actionTicket !== reviewGeneration) return false;
    $('#ops-review').textContent = `请求 ${id}：未取得确认结果，请重新读取同一请求并核对已有副作用；不要重复批准或新建审批。`;
    throw new Error('审批/停止结果未确认，请查询同一请求；没有自动重试。');
  }
}
async function review(id) {
  const ticket = invalidateReview('正在读取请求；旧审批控件已失效。');
  const controller = new AbortController(); reviewController = controller;
  try {
    const job = await api(`/operations/${encodeURIComponent(id)}`, 'GET', undefined, controller.signal);
    if (ticket !== reviewGeneration) return false;
    if (controller.signal.aborted) throw new Error('请求读取超时');
    if (!job || job.requestId !== id || !['waiting-approval','running','succeeded','failed','unknown','cancelled','denied','expired'].includes(job.status)
      || !job.input || typeof job.input !== 'object' || Array.isArray(job.input)) throw new Error('请求详情无效或ID不匹配');
    $('#ops-review').textContent = JSON.stringify(job, null, 2);
    const controls = $('#ops-controls');
    if (job.status === 'waiting-approval') controls.append(button('已审阅完整参数，批准执行一次', () => actOnReview(id, ticket, 'approve')));
    if (['waiting-approval','running'].includes(job.status)) controls.append(button('拒绝 / 请求停止', () => actOnReview(id, ticket, 'cancel')));
    return true;
  } catch (error) {
    if (ticket !== reviewGeneration) return false;
    $('#ops-review').textContent = `请求 ${id} 读取失败，不能沿用旧审批；请重新选择并读取。`;
    throw error;
  } finally {if(ticket === reviewGeneration) reviewController = null;}
}
let checkpointGeneration = 0, checkpointListGeneration = 0, operationsListGeneration = 0;
function checkpointBinding() {
  return { workspaceRoot: state.status?.workspaceRoot, hostInstanceId: state.status?.identity?.hostInstanceId };
}
function sameCheckpointBinding(binding) {
  const current = checkpointBinding();
  return Boolean(binding.workspaceRoot && binding.hostInstanceId && binding.workspaceRoot === current.workspaceRoot && binding.hostInstanceId === current.hostInstanceId);
}
function validCheckpointRecord(record) {
  return record && typeof record.id === 'string' && record.id.length > 0
    && ['ready','running','consumed'].includes(record.state) && Array.isArray(record.paths)
    && record.paths.length > 0 && record.paths.length <= 12
    && record.paths.every(path => typeof path === 'string' && path.length > 0)
    && new Set(record.paths).size === record.paths.length;
}
function validCheckpointPreview(preview, id) {
  return validCheckpointRecord(preview) && preview.id === id && preview.state === 'ready'
    && typeof preview.previewId === 'string' && preview.previewId.length > 0
    && Array.isArray(preview.files) && preview.files.length === preview.paths.length
    && preview.files.every((file,index) => file && file.path === preview.paths[index]
      && typeof file.expectedHash === 'string' && /^[a-f0-9]{64}$/.test(file.expectedHash)
      && typeof file.targetHash === 'string' && /^[a-f0-9]{64}$/.test(file.targetHash)
      && typeof file.changed === 'boolean' && file.changed === (file.expectedHash !== file.targetHash) && typeof file.diff === 'string' && file.diff.length > 0);
}
function validCheckpointRestore(record, preview) {
  if (!validCheckpointRecord(record) || record.id !== preview.id || record.state !== 'consumed'
    || record.paths.length !== preview.paths.length || record.paths.some((path,index) => path !== preview.paths[index])) return false;
  const result = record.result;
  if (!result || !Array.isArray(result.files) || result.files.length !== preview.files.length
    || !result.files.every((file,index) => file && file.path === preview.files[index].path
      && ['restored','unchanged','not-started','unknown'].includes(file.status))) return false;
  if (result.status === 'succeeded') return result.success === true && result.files.every((file,index) => file.status === (preview.files[index].changed ? 'restored' : 'unchanged'));
  return result.success === false && ['failed','unknown'].includes(result.status)
    && (result.status === 'unknown' ? result.files.some(file => file.status === 'unknown') : !result.files.some(file => file.status === 'unknown'));
}
async function reviewCheckpoint(id) {
  const generation = ++checkpointGeneration, binding = checkpointBinding();
  const controls = $('#checkpoint-controls'); controls.replaceChildren();
  $('#checkpoint-review').textContent = '正在读取完整差异；旧恢复控件已失效。';
  try {
    const preview = await api(`/checkpoints/${encodeURIComponent(id)}/preview`, 'POST', binding);
    if (generation !== checkpointGeneration) return false;
    if (!sameCheckpointBinding(binding) || !validCheckpointPreview(preview,id)) throw new Error('检查点预览无效、ID不匹配或工作区绑定已变化');
    $('#checkpoint-review').textContent = JSON.stringify(preview, null, 2);
    controls.append(button('已审阅全部差异，恢复一次', async () => {
      if (generation !== checkpointGeneration) return false;
      if (!sameCheckpointBinding(binding)) {
        ++checkpointGeneration; controls.replaceChildren();
        $('#checkpoint-review').textContent = '工作区绑定已变化；请重新读取差异，未发送恢复。'; return false;
      }
      if (!confirm('将按上方差异覆盖所选文件。不是原子事务，中途失败会保留部分恢复。已另行保留未保存草稿，确认恢复一次？')) return false;
      const restoringGeneration = ++checkpointGeneration; controls.replaceChildren();
      $('#checkpoint-review').textContent = `检查点 ${id}：恢复请求已发送；结果未知时不要重放。刷新列表查看逐文件记录。`;
      try {
        const result = await api(`/checkpoints/${encodeURIComponent(id)}/restore`, 'POST', { ...binding, previewId: preview.previewId, confirmed: true });
        if (restoringGeneration !== checkpointGeneration) return false;
        if (!sameCheckpointBinding(binding) || !validCheckpointRestore(result,preview)) throw new Error('恢复响应无效或与所审阅文件不一致');
        $('#checkpoint-review').textContent = JSON.stringify(result, null, 2);
      } catch (_) {
        if (restoringGeneration !== checkpointGeneration) return false;
        $('#checkpoint-review').textContent = `检查点 ${id}：未取得可信完成结果。刷新列表并核对磁盘；不要重放已执行/未知的恢复。`;
        return false;
      }
    }));
    return true;
  } catch (error) {
    if (generation !== checkpointGeneration) return false;
    $('#checkpoint-review').textContent = `检查点 ${id} 预览失败：${error.message}；不能恢复，请重新审阅。`;
    return false;
  }
}
async function refreshCheckpoints() {
  const generation = ++checkpointListGeneration, list = $('#checkpoint-list');
  list.replaceChildren(); list.textContent = '正在刷新检查点…';
  try {
    const entries = await api('/checkpoints');
    if (generation !== checkpointListGeneration) return false;
    if (!Array.isArray(entries) || !entries.every(validCheckpointRecord) || new Set(entries.map(entry => entry.id)).size !== entries.length) throw new Error('检查点列表格式无效');
    const rows = entries.map(entry => {
      const row = document.createElement('div'), text = document.createElement('pre'); text.className = 'url-box';
      text.textContent = JSON.stringify(entry, null, 2); row.append(text);
      if (entry.state === 'ready') row.append(button('只预览此检查点恢复差异', () => generation === checkpointListGeneration ? reviewCheckpoint(entry.id) : false));
      if (entry.state !== 'running') row.append(button('移除此检查点', async () => {
        if (generation !== checkpointListGeneration) return false;
        ++checkpointGeneration; $('#checkpoint-controls').replaceChildren();
        const result = await api(`/checkpoints/${encodeURIComponent(entry.id)}/remove`, 'POST', checkpointBinding());
        if (result?.removed !== true) throw new Error('检查点移除未确认，请刷新列表核对');
      }));
      return row;
    });
    list.textContent = ''; list.replaceChildren(...rows); return true;
  } catch (error) {
    if (generation !== checkpointListGeneration) return false;
    list.replaceChildren(); list.textContent = '检查点刷新失败：' + error.message; return false;
  }
}
async function refreshOperationList() {
  const generation = ++operationsListGeneration, servers = $('#ops-servers'), requests = $('#ops-requests');
  servers.replaceChildren(); requests.replaceChildren(); $('#ops-status').textContent = '正在刷新接入与审批列表…';
  try {
    const data = await api('/operations');
    if (generation !== operationsListGeneration) return false;
    if (!data || !Array.isArray(data.servers) || !Array.isArray(data.requests)
      || !data.servers.every(server => server && typeof server.serverId === 'string' && server.serverId)
      || !data.requests.every(job => job && typeof job.requestId === 'string' && job.requestId && typeof job.kind === 'string'
        && ['waiting-approval','running','succeeded','failed','unknown','cancelled','denied','expired'].includes(job.status))
      || new Set(data.servers.map(server => server.serverId)).size !== data.servers.length
      || new Set(data.requests.map(job => job.requestId)).size !== data.requests.length) throw new Error('接入或审批列表格式无效');
    const rows = data.servers.map(server => {
      const row = document.createElement('div'), text = document.createElement('pre'); text.className = 'url-box';
      text.textContent = JSON.stringify(server, null, 2);
      row.append(text, button('移除此接入（中止连接）', () => generation === operationsListGeneration ? api(`/external/servers/${encodeURIComponent(server.serverId)}`, 'DELETE') : false)); return row;
    });
    const buttons = data.requests.map(job => button(`${job.kind} · ${job.status} · ${job.requestId}`, () => generation === operationsListGeneration ? review(job.requestId) : false));
    servers.replaceChildren(...rows); requests.replaceChildren(...buttons);
    $('#ops-status').textContent = `${data.servers.length} 个接入；${data.requests.length} 条进程内请求。waiting-approval 不代表执行成功。`;
    return true;
  } catch (error) {
    if (generation !== operationsListGeneration) return false;
    servers.replaceChildren(); requests.replaceChildren(); $('#ops-status').textContent = '审批列表刷新失败：' + error.message; return false;
  }
}
async function refreshOperations() {
  const results = await Promise.all([refreshCheckpoints(), refreshOperationList()]);
  return results.every(Boolean);
}
let checkpointCreating = false;
async function createCheckpoint() {
  if (checkpointCreating) { ui.toast('检查点正在创建，请等待并核对原请求，不要重复创建。'); return false; }
  checkpointCreating = true;
  const button = $('#btn-checkpoint-create'); button.disabled = true;
  const generation = ++checkpointGeneration, binding = checkpointBinding();
  const paths = $('#checkpoint-paths').value.split(/\r?\n/).map(value => value.trim()).filter(Boolean);
  let dispatched = false;
  $('#checkpoint-controls').replaceChildren();
  $('#checkpoint-review').textContent = '准备创建新的检查点；尚未发送。';
  try {
    if (!sameCheckpointBinding(binding)) throw new Error('请先刷新并确认当前工作区和主机');
    if (!paths.length || paths.length > 12 || paths.some(path => path.length > 2048) || new Set(paths).size !== paths.length) throw new Error('请选择1–12条不重复的已有文件路径，每条不超过2048字符');
    if (!confirm('确认创建新的检查点，把所选已有文件的当前磁盘原文暂存于本机内存？这不是永久备份，重启/过期会丢失。上次结果未知时请先查询列表，不要当成失败重新创建。')) {
      $('#checkpoint-review').textContent = '已取消创建，未发送请求。'; return false;
    }
    if (!sameCheckpointBinding(binding)) throw new Error('工作区绑定已变化，请重新确认');
    dispatched = true;
    $('#checkpoint-review').textContent = '正在创建检查点，尚未取得确认；响应丢失时先刷新列表核对，不要重复创建。';
    const record = await api('/checkpoints', 'POST', { ...binding, paths, confirmed: true });
    if (generation !== checkpointGeneration) return false;
    if (!sameCheckpointBinding(binding) || !validCheckpointRecord(record) || record.state !== 'ready' || record.result !== null || record.paths.length !== paths.length) throw new Error('创建响应无效或工作区绑定已变化');
    // Server paths are canonical: aliases may differ from the submitted spelling.
    $('#checkpoint-review').textContent = JSON.stringify(record, null, 2);
    const refreshed = await refreshCheckpoints();
    if (generation !== checkpointGeneration) return false;
    if (!sameCheckpointBinding(binding)) {
      $('#checkpoint-review').textContent = `检查点 ${record.id} 已获创建确认，但工作区绑定现已变化；请在原工作区核对，不能据此操作当前工作区。`;
      return false;
    }
    if (!refreshed) $('#checkpoint-review').textContent = JSON.stringify({ ...record, note:'创建已确认，但列表刷新失败或被新刷新取代；按此ID核对，不要重建。' }, null, 2);
    return true;
  } catch (error) {
    if (generation !== checkpointGeneration) return false;
    $('#checkpoint-review').textContent = dispatched
      ? '检查点创建未确认，可能已经建立；请刷新列表核对原请求和文件路径，不要重复创建。没有自动重试。'
      : `未发送创建请求：${error.message}。`;
    return false;
  } finally {checkpointCreating = false;button.disabled = false;}
}
function initOperations() {
  $('#btn-checkpoint-refresh').onclick = refreshCheckpoints;
  $('#btn-checkpoint-create').onclick = createCheckpoint;
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
  $('#btn-operations').onclick = () => { ui.openModal('operations'); return refreshOperations(); };
  $('#btn-ops-refresh').onclick = refreshOperations;
  $('#btn-ops-add').onclick = () => action(async () => {
    const publicHttps = $('#ops-public-https').checked;
    if (publicHttps && !confirm('登记将连接该公网HTTPS主机并发送初始化信息及可选Bearer凭据。后续批准的工具参数也会离开本机。确认信任该服务？')) return;
    const token = $('#ops-token').value; $('#ops-token').value = '';
    await api('/external/servers', 'POST', { name: $('#ops-name').value, url: $('#ops-url').value, token, publicHttps, confirmedPublic:publicHttps, workspaceRoot:state.status?.workspaceRoot, hostInstanceId:state.status?.identity?.hostInstanceId });
  });
  $('#btn-ops-preview').onclick = () => action(async () => {
    const ticket = invalidateReview('正在预览草稿；旧审批控件已失效。');
    try {
      const result = await api('/workflows/preview', 'POST', { definition: JSON.parse($('#ops-workflow').value) });
      if (ticket !== reviewGeneration) return false;
      $('#ops-review').textContent = JSON.stringify(result, null, 2);
    } catch (error) {if(ticket !== reviewGeneration) return false;$('#ops-review').textContent = '预览失败，当前没有可批准的审阅结果。';throw error;}
  });
  $('#btn-ops-submit').onclick = () => action(async () => {
    if (workflowSubmitting) { ui.toast('审批提交进行中，请等待结果并查询原请求，不要重复提交。'); return false; }
    workflowSubmitting = true;
    const ticket = invalidateReview('正在提交新审批，尚未执行；若响应丢失，请先刷新列表核对，不要重复创建。');
    let submitted = false;
    try {
      const definition = JSON.parse($('#ops-workflow').value);
      submitted = true;
      const job = await api('/workflows/request', 'POST', {definition,requestKey:crypto.randomUUID()});
      if (ticket !== reviewGeneration) return false;
      if (!job || typeof job.requestId !== 'string' || !job.requestId) throw new Error('审批提交响应无效');
      return await review(job.requestId);
    } catch (_) {
      if (ticket !== reviewGeneration) return false;
      $('#ops-review').textContent = submitted ? '审批提交未确认；请先刷新列表并核对已有请求，不要再次创建；尚未自动批准或重试。' : '工作流JSON无效，未提交审批。';
      throw new Error(submitted ? '审批提交未确认，请核对原请求。' : '工作流JSON无效，未提交审批。');
    } finally {workflowSubmitting = false;}
  });
}
Object.assign(ui, { initOperations, refreshOperations });
