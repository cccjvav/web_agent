'use strict';
const vscode = require('vscode');
const { localBase, parseObservation, request } = require('./client');
function activate(context) {
  const output = vscode.window.createOutputChannel('WebAgent Probe · 连接核对');
  let pending = null, busy = false, disposed = false;
  const controllers = new Set();
  const allowed = () => !disposed && vscode.workspace.isTrusted && vscode.env.uiKind === vscode.UIKind.Desktop && !vscode.env.remoteName;
  const base = () => localBase(vscode.workspace.getConfiguration('webagent').get('agentHostUrl') || 'http://127.0.0.1:48271');
  const api = async (origin, method, route, body) => {
    if (!allowed()) throw new Error('Unavailable');
    const controller = new AbortController(); controllers.add(controller);
    try { return await request(origin, method, route, body, controller.signal); }
    finally { controllers.delete(controller); }
  };
  const show = value => {
    if (!allowed()) return;
    output.clear(); output.appendLine('仅核对连接，不验证实际模型/人物身份，不新增执行权限。');
    output.appendLine(JSON.stringify(value, null, 2)); output.show(true);
  };
  const identityView = identity => {
    if (!identity || typeof identity.hostInstanceId !== 'string' || identity.hostInstanceId.length > 128
      || typeof identity.workspaceRoot !== 'string' || identity.workspaceRoot.length > 4096
      || typeof identity.version !== 'string' || identity.version.length > 64) throw new Error('Invalid identity');
    return { hostInstanceId: identity.hostInstanceId, workspaceRoot: identity.workspaceRoot, version: identity.version };
  };
  const run = async action => {
    if (!allowed()) return vscode.window.showWarningMessage('请在受信任的本机桌面工作区使用；暂不支持 SSH/WSL/容器远程窗口。');
    if (busy) return vscode.window.showInformationMessage('上一项操作尚未结束；不会重复发送。');
    busy = true;
    try {
      if (action === 'diagnostics') {
        const result = await api(base(), 'GET', '/api/diagnostics');
        show({ identity: identityView(result.identity), note: '请核对主机工作区是否与当前窗口一致；未执行任何任务。' });
      } else if (action === 'import') {
        const text = await vscode.window.showInputBox({ title: '仅粘贴独立userscript生成的五字段摘要；不要粘贴原型dump或登录信息', password: true, ignoreFocusOut: true });
        if (text === undefined) return;
        const observation = parseObservation(text), origin = base();
        // Do not automatically replay a POST on timeout: the host may already have created it.
        pending = null; output.clear();
        const result = await api(origin, 'POST', '/api/connection-checks', observation);
        if (!allowed()) return;
        if (typeof result.checkId !== 'string' || typeof result.challenge !== 'string' || !/^[a-f0-9]{32}$/.test(result.checkId) || !/^[a-f0-9]{64}$/.test(result.challenge)
          || !Number.isFinite(result.expiresAt) || result.expiresAt <= Date.now() || result.expiresAt > Date.now() + 125000) throw new Error('Invalid check');
        const identity = identityView(result.identity);
        pending = { origin, checkId: result.checkId, challenge: result.challenge, expiresAt: result.expiresAt, hostInstanceId: identity.hostInstanceId };
        show({ status: 'waiting', checkId: pending.checkId, expiresAt: pending.expiresAt, identity, next: '显式选择复制核对请求，交给已连接MCP的外部客户端；本扩展不会自我确认。' });
      } else if (action === 'copy' || action === 'refresh') {
        if (!pending || pending.expiresAt <= Date.now()) { pending = null; throw new Error('Missing check'); }
        if (action === 'copy') {
          if (!pending.challenge) throw new Error('Already copied');
          const choice = await vscode.window.showWarningMessage('将一次性挑战写入系统剪贴板。只交给你已连接的MCP客户端；剪贴板历史可能保留它。', { modal: true }, '复制');
          if (choice !== '复制' || !allowed() || pending.expiresAt <= Date.now()) return;
          await vscode.env.clipboard.writeText(JSON.stringify({ name: 'confirm_connection', arguments: { challenge: pending.challenge } }));
          delete pending.challenge;
        } else {
          const result = await api(pending.origin, 'GET', '/api/connection-checks/' + pending.checkId);
          const identity = identityView(result.identity);
          if (identity.hostInstanceId !== pending.hostInstanceId || result.checkId !== pending.checkId || !['waiting', 'echo-confirmed'].includes(result.status)) throw new Error('Host/check changed');
          if (result.status === 'echo-confirmed') delete pending.challenge;
          show({ status: result.status, checkId: result.checkId, identity, modelIdentityVerified: false, permissionsChanged: false });
        }
      } else if (action === 'forget') { pending = null; output.clear(); }
      else if (action === 'bridge') {
        if (!vscode.extensions.getExtension('webagent.webagent-core')) throw new Error('Install WebAgent first');
        await vscode.commands.executeCommand('webagent.openBridge');
      }
    } catch (_) {
      if (!disposed) await vscode.window.showWarningMessage('操作未完成。检查本机主机、地址、摘要格式/时效或记录是否过期。不会自动重试；详情及敏感响应不会写入日志。');
    } finally { busy = false; }
  };
  context.subscriptions.push(output, { dispose() { disposed = true; pending = null; for (const controller of controllers) controller.abort(); controllers.clear(); } });
  for (const action of ['diagnostics', 'import', 'copy', 'refresh', 'forget']) context.subscriptions.push(vscode.commands.registerCommand('webagentProbe.' + action, () => run(action)));
  context.subscriptions.push(vscode.commands.registerCommand('webagentProbe.open', async () => {
    const choices = [['查看主机与工作区', 'diagnostics'], ['导入最小页面摘要', 'import'], ['复制一次性核对请求', 'copy'], ['查询核对结果', 'refresh'], ['丢弃本扩展当前记录（主机记录按TTL过期）', 'forget'], ['打开 WebAgent Bridge', 'bridge']];
    const choice = await vscode.window.showQuickPick(choices.map(([label, action]) => ({ label, action })), { title: 'Probe Companion · 非模型鉴定；只在点击后操作' });
    if (choice) await run(choice.action);
  }));
}
function deactivate() { /* VS Code disposes context subscriptions, including pending requests. */ }
module.exports = { activate, deactivate };
