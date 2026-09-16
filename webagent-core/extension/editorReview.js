'use strict';
// Explicit local editor actions, not an Agent mutation or a multi-file transaction.
const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const LIMIT = 65536;
function diskSnapshot(vscode, doc) {
  if (!vscode.workspace.isTrusted || doc.isClosed || doc.uri.scheme !== 'file') throw Error('需要可信工作区内的本地文件。');
  const folder = vscode.workspace.getWorkspaceFolder(doc.uri);
  if (!folder || folder.uri.scheme !== 'file') throw Error('文件必须位于当前本地工作区。');
  const root = fs.realpathSync(folder.uri.fsPath), file = fs.realpathSync(doc.uri.fsPath);
  const relative = path.relative(root, file);
  if (!relative || relative === '..' || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw Error('拒绝工作区外文件或符号链接目标。');
  const fd = fs.openSync(file, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0) | (fs.constants.O_NONBLOCK || 0));
  try {
    const stat = fs.fstatSync(fd);
    if (!stat.isFile() || stat.size > LIMIT) throw Error('只支持64KiB以内的普通UTF-8文本文件。');
    const buffer = Buffer.alloc(LIMIT + 1); let size = 0, count;
    while (size < buffer.length && (count = fs.readSync(fd, buffer, size, buffer.length - size, null))) size += count;
    if (size > LIMIT) throw Error('读取期间文件超过64KiB。');
    const bytes = buffer.subarray(0, size);
    if (bytes.includes(0) || (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf)) throw Error('暂不支持二进制或带BOM文件。');
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } finally { fs.closeSync(fd); }
}
function registerEditorReview(vscode, context) {
  const snapshots = new Map(); let busy = false, disposed = false;
  function prune() {
    for (const [key, item] of snapshots) if (Date.now() >= item.expires) snapshots.delete(key);
    while (snapshots.size > 16) snapshots.delete(snapshots.keys().next().value);
  }
  function snapshot(text) {
    const uri = vscode.Uri.parse('webagent-review:/' + randomUUID());
    snapshots.set(uri.toString(), { text, expires: Date.now() + 15 * 60 * 1000 }); prune(); return uri;
  }
  context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider('webagent-review', {
    provideTextDocumentContent(uri) { prune(); return snapshots.get(uri.toString())?.text ?? '预览快照已过期，请从原文件重新预览。'; }
  }), { dispose() { disposed = true; snapshots.clear(); } });
  async function review(restore) {
    if (busy) throw Error('已有编辑审阅进行中，请先完成或关闭确认。');
    busy = true;
    try {
      const editor = vscode.window.activeTextEditor;
      if (!editor) throw Error('请先选中原始文件编辑器。');
      const doc = editor.document, version = doc.version, draft = doc.getText();
      if (Buffer.byteLength(draft) > LIMIT) throw Error('草稿超过64KiB。');
      const saved = diskSnapshot(vscode, doc);
      if (saved === draft) { await vscode.window.showInformationMessage('当前草稿与磁盘文本一致。'); return; }
      await vscode.commands.executeCommand('vscode.diff', snapshot(saved), snapshot(draft), 'Web Agent：磁盘版本 ↔ 草稿快照（只读）');
      if (!restore) return;
      const answer = await vscode.window.showWarningMessage('将此文件草稿恢复为刚才左侧的磁盘文本？不会主动保存；可用原生撤销恢复草稿。要求自动保存关闭。', { modal: true }, '恢复草稿');
      if (answer !== '恢复草稿') return;
      if (vscode.workspace.getConfiguration('files', doc.uri).get('autoSave', 'off') !== 'off') throw Error('请先关闭自动保存，再重新审阅；本次未修改。');
      if (disposed || doc.isClosed || doc.version !== version || doc.getText() !== draft || diskSnapshot(vscode, doc) !== saved) throw Error('文件、草稿或工作区已变化，已停止；请重新审阅。');
      const ok = await editor.edit(builder => builder.replace(new vscode.Range(doc.positionAt(0), doc.positionAt(draft.length)), saved), { undoStopBefore: true, undoStopAfter: true });
      if (!ok) throw Error('编辑器拒绝修改；请核对当前内容，不自动重试。');
      await vscode.window.showInformationMessage('已恢复草稿，未主动保存。选中原文件可用 Ctrl+Z 撤销本次编辑。');
    } finally { busy = false; }
  }
  for (const [command, restore] of [['webagent.previewEditorChanges', false], ['webagent.restoreEditorDraft', true]]) {
    context.subscriptions.push(vscode.commands.registerCommand(command, () => review(restore).catch(error => vscode.window.showErrorMessage(error.message))));
  }
}
module.exports = { diskSnapshot, registerEditorReview };
