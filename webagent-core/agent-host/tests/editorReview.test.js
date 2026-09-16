'use strict';
const assert = require('assert'), fs = require('fs'), os = require('os'), path = require('path');
const { diskSnapshot, registerEditorReview } = require('../../extension/editorReview');
async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'editor-review-')), file = path.join(root, 'sample.txt');
  const commands = new Map(), errors = [], diffs = [], edits = [], subscriptions = [];
  let text = 'draft', answer = '恢复草稿', autoSave = 'off', onConfirm = () => {};
  const uri = { scheme: 'file', fsPath: file };
  const doc = { uri, version: 1, isClosed: false, getText: () => text, positionAt: n => n };
  let provider;
  const vscode = {
    Uri: { parse: value => ({ toString: () => value }) }, Range: class { constructor(start, end) { this.start = start; this.end = end; } },
    workspace: { isTrusted: true, getWorkspaceFolder: () => ({ uri: { scheme: 'file', fsPath: root } }), getConfiguration: () => ({ get: () => autoSave }),
      registerTextDocumentContentProvider(_scheme, p) { provider = p; return { dispose() {} }; } },
    window: { activeTextEditor: { document: doc, async edit(callback, options) { callback({ replace(range, value) { edits.push({ range, options, before: text }); text = value; doc.version++; } }); return true; } },
      async showWarningMessage() { onConfirm(); return answer; }, async showInformationMessage() {}, showErrorMessage(message) { errors.push(message); } },
    commands: { registerCommand(name, fn) { commands.set(name, fn); return { dispose() {} }; }, async executeCommand(command, left, right) { assert.equal(command, 'vscode.diff'); diffs.push([provider.provideTextDocumentContent(left), provider.provideTextDocumentContent(right)]); } }
  };
  const run = restore => commands.get(restore ? 'webagent.restoreEditorDraft' : 'webagent.previewEditorChanges')();
  try {
    fs.writeFileSync(file, 'saved'); registerEditorReview(vscode, { subscriptions });
    await run(false); assert.deepEqual(diffs.pop(), ['saved', 'draft']); assert.equal(edits.length, 0);
    answer = undefined; await run(true); assert.equal(edits.length, 0);
    answer = '恢复草稿'; autoSave = 'afterDelay'; await run(true); assert.equal(edits.length, 0); assert.match(errors.pop(), /自动保存/);
    autoSave = 'off'; onConfirm = () => { text = 'new draft'; doc.version++; }; await run(true); assert.equal(edits.length, 0); assert.match(errors.pop(), /已变化/);
    onConfirm = () => fs.writeFileSync(file, 'external'); await run(true); assert.equal(edits.length, 0); assert.match(errors.pop(), /已变化/);
    onConfirm = () => { vscode.workspace.isTrusted = false; }; await run(true); assert.equal(edits.length, 0); assert.match(errors.pop(), /可信/);
    vscode.workspace.isTrusted = true; onConfirm = () => {}; await run(true);
    assert.equal(text, 'external'); assert.equal(edits.length, 1); assert.deepEqual(edits[0].options, { undoStopBefore: true, undoStopAfter: true });
    assert.equal(fs.readFileSync(file, 'utf8'), 'external', 'command does not write disk');
    // The fake verifies edit options, NOT real VS Code undo behavior.
    for (const bytes of [Buffer.alloc(65537), Buffer.from([0xc3, 0x28]), Buffer.from([0xef, 0xbb, 0xbf, 65]), Buffer.from([0])]) {
      fs.writeFileSync(file, bytes); assert.throws(() => diskSnapshot(vscode, doc));
    }
    doc.uri.scheme = 'untitled'; assert.throws(() => diskSnapshot(vscode, doc)); doc.uri.scheme = 'file';
    assert.equal(errors.length, 0);
  } finally { for (const item of subscriptions) item.dispose(); fs.rmSync(root, { recursive: true, force: true }); }
  console.log('editorReview: read-only snapshots, explicit approval, drift/trust/autoSave guards and bounded UTF-8 passed; native UI undo not exercised');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
