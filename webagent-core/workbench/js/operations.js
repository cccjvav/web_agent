import { $, ui, state } from './state.js';
import { apiFetch } from './api.js';

async function api(path, method = 'GET', body, signal) {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  if (signal?.aborted) onAbort(); else signal?.addEventListener('abort', onAbort, {once:true});
  // Approval has a 60s server cancellation budget; transport abort never rolls back effects.
  const timeout = path.endsWith('/approve') ? 70000 : method === 'POST' && ['/external/servers','/external/stdio/start'].includes(path) ? 40000 : 10000;
  const timer = setTimeout(onAbort, timeout);
  try {
    const response = await apiFetch(`/api${path}`, {method,signal:controller.signal,headers:{'Content-Type':'application/json'},...(body ? {body:JSON.stringify(body)} : {})});
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
function button(label, callback, refresh = true) {
  const node = document.createElement('button'); node.type = 'button'; node.className = 'vs-btn'; node.textContent = label;
  node.onclick = () => refresh ? action(callback) : callback(); return node;
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
      let removalUsed = false;
      const removeButton = button('移除此接入（请求中止连接）', () => {
        if (generation !== operationsListGeneration || removalUsed) return false;
        if (externalPending.has('remove:' + server.serverId)) { ui.toast('此接入正在移除，请等待并核对原请求。'); return false; }
        removalUsed = true; removeButton.disabled = true;
        return removeExternalServer(server.serverId);
      }, false); row.append(text, removeButton); return row;
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
const externalPending = new Set();
let externalMutationGeneration = 0;
function externalHttpEndpoint(value, publicHttps) {
  if (typeof value !== 'string' || !value || value.length > 2048) throw new Error('Invalid endpoint');
  const url = new URL(value), local = ['127.0.0.1','[::1]','localhost'].includes(url.hostname);
  if (url.username || url.password || url.search || url.hash
    || (publicHttps ? url.protocol !== 'https:' || local : !['http:','https:'].includes(url.protocol) || !local)) throw new Error('Invalid endpoint');
  if (url.hostname === 'localhost') url.hostname = '127.0.0.1';
  return url.href;
}
function validExternalTools(tools) {
  return Array.isArray(tools) && tools.length <= 100
    && tools.every(tool => tool && typeof tool.name === 'string' && /^[a-zA-Z0-9_.-]{1,120}$/.test(tool.name)
      && tool.requiresApproval === true && tool.inputSchema && !Array.isArray(tool.inputSchema) && tool.inputSchema.type === 'object')
    && new Set(tools.map(tool => tool.name)).size === tools.length;
}
function validExternalRegistration(record, endpoint, publicHttps) {
  return record && typeof record.serverId === 'string' && record.serverId.length > 0
    && record.transport === 'http' && record.status === 'discovered' && record.endpoint === endpoint
    && record.publicHttps === publicHttps && validExternalTools(record.tools);
}
async function externalMutation(label, callback, key = 'register') {
  if (externalPending.has(key)) { ui.toast('此接入操作进行中，请等待并核对原请求。'); return false; }
  externalPending.add(key); $('#btn-ops-add').disabled = externalPending.has('register');
  const generation = ++externalMutationGeneration;
  const target = $('#ops-external-result'); target.textContent = `${label}：准备中，尚未发送。`;
  let dispatched = false;
  const send = (path, method, body) => {
    dispatched = true; if (generation === externalMutationGeneration) target.textContent = `${label}：请求已发送，结果尚未确认，请勿重复操作。`;
    return api(path, method, body);
  };
  try {
    const message = await callback(send);
    if (generation !== externalMutationGeneration) return false;
    if (message === false) { target.textContent = `${label}：已取消，未发送请求。`; return false; }
    target.textContent = message;
    const refreshed = await refreshOperationList();
    if (generation !== externalMutationGeneration) return false;
    if (!refreshed) target.textContent = message + '\n列表刷新失败或被更新的刷新取代；本次确认仍保留，按ID核对，不要重复操作。';
    return true;
  } catch (_) {
    if (generation !== externalMutationGeneration) return false;
    // Never echo transport/parser errors: an untrusted service may reflect the Bearer value.
    target.textContent = dispatched
      ? `${label}未确认；请求可能已生效。请刷新接入列表并核对原请求，不要重放。HTTP中断不证明外部服务未收到请求或进程已停止。`
      : `${label}未发送；请核对地址、令牌格式及当前工作区绑定。`;
    return false;
  } finally {externalPending.delete(key);$('#btn-ops-add').disabled = externalPending.has('register');}
}
function addExternalServer() {
  return externalMutation('HTTP接入登记', async send => {
    const binding = checkpointBinding();
    const input = {name:$('#ops-name').value,url:$('#ops-url').value,token:$('#ops-token').value,
      publicHttps:Boolean($('#ops-public-https').checked),...binding};
    const endpoint = externalHttpEndpoint(input.url,input.publicHttps);
    if (input.token.length > 4096 || /[\r\n]/.test(input.token) || (input.publicHttps && !sameCheckpointBinding(binding))) throw new Error('Invalid registration input');
    if (input.publicHttps && !confirm('登记将连接该公网HTTPS主机并发送初始化信息及可选Bearer凭据。后续批准的工具参数也会离开本机。确认信任该服务？')) return false;
    if (input.publicHttps && !sameCheckpointBinding(binding)) throw new Error('Binding changed');
    if ($('#ops-token').value === input.token) $('#ops-token').value = '';
    const record = await send('/external/servers','POST',{...input,confirmedPublic:input.publicHttps});
    if ((input.publicHttps && !sameCheckpointBinding(binding)) || !validExternalRegistration(record,endpoint,input.publicHttps)) throw new Error('Unconfirmed registration');
    return `接入 ${record.serverId} 已确认登记，发现 ${record.tools.length} 个工具。仅说明本次发现完成，每次调用仍须独立审批；不代表工具效果已验证。`;
  });
}
function removeExternalServer(id) {
  return externalMutation(`接入 ${id} 移除`, async send => {
    const result = await send(`/external/servers/${encodeURIComponent(id)}`,'DELETE');
    if (result?.removed !== true || (result.stopping !== undefined && result.stopping !== true)) throw new Error('Unconfirmed removal');
    return result.stopping === true
      ? `接入 ${id} 的登记记录已移除，已请求停止stdio进程；尚未确认进程退出，不代表副作用已撤回。`
      : `接入 ${id} 的登记记录已移除，已请求中止宿主连接；不代表外部服务已停止或副作用已撤回。`;
  }, 'remove:' + id);
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
let stdioBusy = false, stdioGeneration = 0, stdioPreview = null;
function sameStringList(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length
    && left.every((value,index) => typeof value === 'string' && value === right[index]);
}
function validLaunchStamp(stamp, maxBytes) {
  return stamp && typeof stamp.path === 'string' && stamp.path.length > 0
    && typeof stamp.sha256 === 'string' && /^[a-f0-9]{64}$/.test(stamp.sha256)
    && Number.isSafeInteger(stamp.bytes) && stamp.bytes >= 0 && stamp.bytes <= maxBytes;
}
function validStdioPreview(record, input) {
  const args = input.args === undefined ? [] : input.args, files = input.reviewFiles === undefined ? [] : input.reviewFiles;
  const env = input.env === undefined ? {} : input.env, launch = record?.launch;
  return record && typeof record.previewId === 'string' && record.previewId.length > 0 && record.transport === 'stdio'
    && record.requiresConfirmation === true && Number.isFinite(record.expiresAt) && record.expiresAt > Date.now()
    && launch && typeof launch.name === 'string' && typeof launch.program === 'string' && launch.program.length > 0
    && typeof launch.cwd === 'string' && launch.cwd.length > 0 && sameStringList(launch.args,args) && args.length <= 64
    && Array.isArray(launch.envKeys) && launch.envKeys.every(key => typeof key === 'string' && /^[A-Za-z_][A-Za-z0-9_]{0,79}$/.test(key))
    && new Set(launch.envKeys).size === launch.envKeys.length && env && typeof env === 'object' && !Array.isArray(env)
    && Object.keys(env).every(key => launch.envKeys.includes(key))
    && validLaunchStamp(record.programStamp,256 * 1024 * 1024) && record.programStamp.path === launch.program
    && Array.isArray(files) && files.length <= 8 && Array.isArray(record.reviewFiles) && record.reviewFiles.length === files.length
    && record.reviewFiles.every(stamp => validLaunchStamp(stamp,4 * 1024 * 1024));
}
function validStdioRegistration(record, preview) {
  const launch = record?.launch, reviewed = preview.launch;
  return record && typeof record.serverId === 'string' && record.serverId.length > 0 && record.transport === 'stdio'
    && record.status === 'discovered' && record.publicHttps === false && record.name === reviewed.name
    && launch && launch.program === reviewed.program && launch.cwd === reviewed.cwd
    && sameStringList(launch.args,reviewed.args) && sameStringList(launch.envKeys,reviewed.envKeys)
    && record.process?.ready === true && record.process.stopped === false && record.process.closed === false
    && Number.isSafeInteger(record.process.pid) && record.process.pid > 0 && validExternalTools(record.tools);
}
function invalidateStdio(message) {
  ++stdioGeneration; stdioPreview = null; $('#btn-stdio-start').disabled = true;
  $('#ops-stdio-review').textContent = message;
  return stdioGeneration;
}
async function previewStdioLaunch() {
  if (stdioBusy) { ui.toast('stdio请求进行中，请等待并核对原请求；不会再次预览或启动。'); return false; }
  stdioBusy = true; $('#btn-stdio-preview').disabled = true;
  const generation = invalidateStdio('正在读取启动预览，尚未发送启动。'), binding = checkpointBinding();
  try {
    const input = JSON.parse($('#ops-stdio-config').value);
    if (!input || typeof input !== 'object' || Array.isArray(input) || !sameCheckpointBinding(binding)) throw new Error('Invalid launch draft or binding');
    const draft = JSON.stringify({...input,env:undefined},null,2);
    $('#ops-stdio-config').value = draft;
    const record = await api('/external/stdio/preview','POST',input);
    if (generation !== stdioGeneration) return false;
    if ($('#ops-stdio-config').value !== draft || !sameCheckpointBinding(binding) || !validStdioPreview(record,input)) throw new Error('Unconfirmed preview');
    stdioPreview = {record,binding,draft};
    $('#ops-stdio-review').textContent = JSON.stringify(record,null,2);
    $('#btn-stdio-start').disabled = false;
    return true;
  } catch (_) {
    if (generation !== stdioGeneration) return false;
    invalidateStdio('启动预览未确认；请核对JSON、工作区与完整程序/参数/hash后重新预览。没有发送启动请求，错误正文不会回显环境密钥。');
    return false;
  } finally {stdioBusy = false;$('#btn-stdio-preview').disabled = false;}
}
async function startStdioLaunch() {
  if (stdioBusy) { ui.toast('stdio请求进行中，请查询原请求，不要再次启动。'); return false; }
  const selected = stdioPreview;
  const current = () => selected && stdioPreview === selected && sameCheckpointBinding(selected.binding)
    && $('#ops-stdio-config').value === selected.draft && selected.record.expiresAt > Date.now();
  if (!current()) { invalidateStdio('启动预览已失效、配置/绑定变化或已过期；未发送启动，请重新预览。'); return false; }
  if (!confirm('启动本身会执行所审阅程序，拥有当前系统用户权限。不是OS沙箱。确认信任该程序、参数和依赖，并启动一次？')) return false;
  if (!current()) { invalidateStdio('确认期间配置或绑定已变化；未发送启动，请重新预览。'); return false; }
  stdioBusy = true; $('#btn-stdio-preview').disabled = true;
  const generation = invalidateStdio('启动请求已发送，结果尚未确认。请勿重放；可刷新接入列表并移除正在连接的接入。');
  try {
    const record = await api('/external/stdio/start','POST',{previewId:selected.record.previewId,confirmed:true});
    if (generation !== stdioGeneration) return false;
    if (!sameCheckpointBinding(selected.binding) || !validStdioRegistration(record,selected.record)) throw new Error('Unconfirmed start');
    const message = `接入 ${record.serverId} 已确认启动并完成工具发现；仅为此时的进程/发现状态，不保证持续运行或工具效果。每次调用仍须审批。`;
    $('#ops-stdio-review').textContent = message;
    const refreshed = await refreshOperationList();
    if (generation !== stdioGeneration) return false;
    if (!refreshed) $('#ops-stdio-review').textContent = message + '\n列表刷新失败或被取代；保留此ID供核对，不要再次启动。';
    return true;
  } catch (_) {
    if (generation !== stdioGeneration) return false;
    $('#ops-stdio-review').textContent = '启动结果未确认，程序可能已经执行。请刷新接入列表并核对进程；不要重新预览后盲目重启。没有自动重试，断开HTTP不等于停止程序。';
    return false;
  } finally {stdioBusy = false;$('#btn-stdio-preview').disabled = false;}
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
  $('#ops-stdio-config').oninput = () => invalidateStdio('配置已编辑，旧预览失效。若已发送启动，请先查接入列表；修改草稿不会停止程序。');
  $('#btn-stdio-preview').onclick = previewStdioLaunch;
  $('#btn-stdio-start').onclick = startStdioLaunch;
  $('#btn-operations').onclick = () => { ui.openModal('operations'); return refreshOperations(); };
  $('#btn-ops-refresh').onclick = refreshOperations;
  $('#btn-ops-add').onclick = addExternalServer;
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
