"""Build one browser collector plus Probe references. No source tree is overwritten."""
from pathlib import Path
import hashlib
import json
import zipfile
import tempfile
import subprocess
import shutil
import sys
import os


def replace_once(text, old, new):
    text = text.replace('\r\n', '\n')
    if text.count(old) != 1:
        raise ValueError('Browser integration anchor changed: ' + old[:60])
    return text.replace(old, new, 1)


def build(verify=False):
    root = Path(__file__).resolve().parent
    source = root.parent.parent / 'arena-trace-inspector'
    names = ['manifest.json', 'background.js', 'core.js', 'evidence.js', 'usage.js', 'history.js',
             'restore.js', 'trace-reader.js', 'hud-preferences.js', 'view-model.js', 'panel.js',
             'hud-layout.js', 'conversation-rename.js', 'hud.js', 'popup.js', 'popup.css', 'popup.html']
    checked = [source / name for name in names] + [root / name for name in ['browserReference.mjs','browserBridge.mjs','browserActions.js','browserIntegration.mjs','browserPopup.mjs','catalog.mjs','genericCapture.mjs','LICENSE','浏览器整合说明.md']] + [root.parent.parent / 'arena-model-probe/src' / name for name in ['idmap.js','classify.js','registry.js','learned.js','probe.js','interceptor.js']]
    for item in checked:
        if item.resolve() != item.absolute() or not item.is_file():
            raise ValueError('Browser input must be a regular non-symlink file: ' + str(item))
    payload = {name: (source / name).read_bytes() for name in names}
    hashes = {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}
    manifest = json.loads(payload['manifest.json'])
    manifest.update(name='WebAgent Arena Inspector', version='0.5.1', description='Arena trace 标签、调用统计与 Probe 模型参考；显式监听、离线导入 VS Code。')
    manifest['optional_host_permissions'] = ['http://127.0.0.1/*']
    manifest['content_scripts'][0]['js'].append('browserActions.js')
    payload['manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    background = payload['background.js'].decode()
    background = "import {referencesForRun, createStreamProbe} from './browserReference.mjs';\n" + background
    background = replace_once(background, 'enabled: true, ...s.view', 'enabled: true, ...s.view, probeReferences: referencesForRun(s.view.run)')
    background = replace_once(background, 'function publish(tabId, state) {', 'function publish(tabId, state) {\n  state.probeReferences = referencesForRun(state.run);')
    background = replace_once(background, '    s.streams.set(p.requestId, stream);', """    s.streams.set(p.requestId, stream);
    const probe = createStreamProbe(p.requestId), parser = stream.parser;
    stream.probe = probe;
    let lastReference = 0;
    stream.parser = {push(bytes) {
      parser.push(bytes); probe.push(bytes);
      if (sessions.get(tabId) === s && s.streams.get(p.requestId) === stream && Date.now() - lastReference >= 500) {
        lastReference = Date.now(); update(tabId, s, {probeStream: probe.snapshot()});
      }
    }};""")
    background = replace_once(background, '    s.streams.delete(p.requestId);\n  }', """    if (sessions.get(tabId) === s && s.streams.get(p.requestId) === stream) {
      stream.probe.finish(); update(tabId, s, {probeStream: stream.probe.snapshot()});
    }
    s.streams.delete(p.requestId);
  }""")
    background = "import {createIntegration} from './browserIntegration.mjs';\n" + background
    background = replace_once(background, 'chrome.runtime.onMessage.addListener((msg, sender, reply) => {', 'const integration = createIntegration({start,stop,restoreForTab,history,storageReady});\nchrome.runtime.onMessage.addListener((msg, sender, reply) => {\n  if (integration.handle(msg,sender,reply)) return true;')
    background = "import {createGenericCapture} from './genericCapture.mjs';\n" + background
    background = replace_once(background, 'async function onNetwork(tabId, method, p) {', "const genericCapture = createGenericCapture({command,isTrace:streamSession,publishUpdate(tabId) {const s=sessions.get(tabId);if(s){s.hasCapture=true;update(tabId,s,{probeStream:s.probeStream,probeCaptureNotice:s.probeCaptureNotice});}}});\nasync function onNetwork(tabId, method, p) {")
    background = replace_once(background, "  if (!s) return;\n  if (method === 'Network.responseReceived')", "  if (!s) return;\n  if (await genericCapture(tabId,s,method,p)) return;\n  if (method === 'Network.responseReceived')")
    background = replace_once(background, '  sessions.delete(tabId);', '  genericCapture.stop(s);\n  sessions.delete(tabId);')
    payload['background.js'] = background.encode()
    view = payload['view-model.js'].decode()
    view = replace_once(view, 'return {runId: run?.runId', 'return {probeStream: selectedRunId ? null : state.probeStream, probeReferences: (state.probeReferences || []).filter(r => r.runId === run?.runId), runId: run?.runId')
    view = replace_once(view, 'spanId:c.spanId,model:c.model,provider:c.provider', "spanId:c.spanId,model:c.model??'',provider:c.provider??''")
    payload['view-model.js'] = view.encode()
    panel = payload['panel.js'].decode()
    panel = replace_once(panel, '      if(options.onRename){', '''      if (view.probeStream) {
        const p = view.probeStream;
        result.append(el('p','footnote','Probe响应参考 · 请求 '+p.requestId+' · '+(p.modelId || p.family || '未知')+' · 启发式分数 '+p.heuristicScore+'（非概率；不与trace run强行关联）'+(p.truncated?' · 采样已截断':'')));
        for (const hint of p.protocol || []) result.append(el('p','footnote','协议参考 · '+hint.label));
        for (const hint of p.behavior || []) result.append(el('p','footnote','行为参考 · '+hint.source+' · '+(hint.family || '未知')));
      }
      for (const ref of view.probeReferences || []) {
        result.append(el('p','footnote','Probe参考 · span '+ref.spanId+' · '+(ref.family || '未知家族')+' · 启发式分数 '+ref.heuristicScore+'（非概率）'));
      }
      if ((view.probeReferences || []).length) result.append(el('p','footnote','轨迹参考最多100次调用；响应采样参考单独显示。未运行tokenizer基准测量。'));
      if(options.onRename){''')
    payload['panel.js'] = panel.encode()
    reference = (root / 'browserReference.mjs').read_text().replace('../../arena-model-probe/src/', './engine/')
    payload['browserReference.mjs'] = reference.encode()
    for name in ['browserBridge.mjs','browserActions.js','browserIntegration.mjs','browserPopup.mjs','catalog.mjs','genericCapture.mjs']:
        payload[name] = (root / name).read_text(encoding='utf-8').replace('../../arena-model-probe/src/', './engine/').encode()
    payload['popup.html'] = payload['popup.html'].decode().replace('</body>', '<script type="module" src="browserPopup.mjs"></script></body>').encode()
    for name in ['idmap.js', 'classify.js', 'registry.js', 'learned.js', 'probe.js', 'interceptor.js']:
        payload['engine/' + name] = (root.parent.parent / 'arena-model-probe/src' / name).read_bytes()
    payload['LICENSE'] = (root / 'LICENSE').read_bytes()
    payload['README.md'] = (root / '浏览器整合说明.md').read_bytes()
    payload['package.json'] = b'{"type":"module","private":true}'
    payload['source-hashes.json'] = json.dumps({'inspectorInputs': hashes, 'payload': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}, indent=2).encode()
    output = root / 'dist' / 'webagent-arena-inspector-0.5.1.zip'
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in payload.items():
            archive.writestr('webagent-arena-inspector/' + name, data)
    if verify:
        assert replace_once('first\r\nsecond', 'first\nsecond', 'ok') == 'ok'
        with tempfile.TemporaryDirectory(prefix='unified-inspector-') as temp:
            with zipfile.ZipFile(output) as archive:
                archive.extractall(temp)
            directory = Path(temp) / 'webagent-arena-inspector'
            for name, digest in json.loads((directory / 'source-hashes.json').read_text())['payload'].items():
                if hashlib.sha256((directory / name).read_bytes()).hexdigest() != digest:
                    raise ValueError('Browser payload hash mismatch')
            # Execute race fixtures against the actual extracted modules, not repository copies.
            for test_name, module_name in [('probeCaptureLifecycle.test.js', 'genericCapture.mjs'), ('probePairLifecycle.test.js', 'browserBridge.mjs')]:
                test_source = (root.parent / 'agent-host/tests' / test_name).read_text(encoding='utf-8')
                test_source = replace_once(test_source, "import('../../probe-extension/" + module_name + "')", "import('./" + module_name + "')")
                test_file = directory / (test_name + '.cjs')
                test_file.write_text(test_source, encoding='utf-8')
                subprocess.run(['node', str(test_file)], cwd=directory, check=True, timeout=30)
            shutil.copytree(source / 'tests', directory / 'tests')
            fixture = directory / 'tests' / 'background.test.mjs'
            with fixture.open('a', encoding='utf-8') as handle:
                handle.write(r'''
test('unified bundle keeps sampled response and trace references separate', async () => {
  fetchMode = 'ok';
  buffered = Buffer.from(sse() + 'data: {"model":"stream-only-fixture","secret":"PRIVATE_STREAM_FRAGMENT"}\n\n').toString('base64');
  await message('ATI_TOGGLE', 913); response(913); await tick(); await tick(); await tick();
  const state = await message('ATI_STATUS', 913);
  assert.equal(state.probeStream.modelId, 'stream-only-fixture');
  assert.equal(state.models[0].model, 'example-model');
  assert.equal(state.probeReferences[0].runId, 'run_test');
  assert.equal(JSON.stringify(state).includes('PRIVATE_STREAM_FRAGMENT'), false);
  await message('ATI_TOGGLE', 913);
});
''')
            tests = sorted(str(p) for p in (directory / 'tests').glob('*.test.mjs'))
            result = subprocess.run(['node', '--test', *tests], cwd=directory, timeout=90,
                                    capture_output=True, text=True, encoding='utf-8', errors='replace')
            print(result.stdout)
            if result.returncode:
                lines = result.stdout.splitlines()
                failed = next((i for i, line in enumerate(lines) if line.startswith('not ok')), 0)
                detail = ('\n'.join(lines[failed:failed + 35]) + result.stderr)[:1800]
                if os.environ.get('GITHUB_ACTIONS') == 'true':
                    print('::error title=Unified browser tests::' + detail.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A'))
                raise RuntimeError('Unified browser tests failed')
    print(output)
    return output


if __name__ == '__main__':
    build(verify="--verify" in sys.argv[1:])
