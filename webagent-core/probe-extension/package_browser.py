"""Build one browser collector plus Probe references. No source tree is overwritten."""
from pathlib import Path
import hashlib
import json
import zipfile
import tempfile
import subprocess
import shutil
import sys


def replace_once(text, old, new):
    if text.count(old) != 1:
        raise ValueError('Browser integration anchor changed: ' + old[:60])
    return text.replace(old, new, 1)


def build(verify=False):
    root = Path(__file__).resolve().parent
    source = root.parent.parent / 'arena-trace-inspector'
    names = ['manifest.json', 'background.js', 'core.js', 'evidence.js', 'usage.js', 'history.js',
             'restore.js', 'trace-reader.js', 'hud-preferences.js', 'view-model.js', 'panel.js',
             'hud-layout.js', 'conversation-rename.js', 'hud.js', 'popup.js', 'popup.css', 'popup.html']
    payload = {name: (source / name).read_bytes() for name in names}
    hashes = {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}
    manifest = json.loads(payload['manifest.json'])
    manifest.update(name='WebAgent Arena Inspector', version='0.3.0', description='Arena trace 标签、调用统计与 Probe 模型参考；显式监听、离线导入 VS Code。')
    payload['manifest.json'] = json.dumps(manifest, ensure_ascii=False, indent=2).encode()
    background = payload['background.js'].decode()
    background = "import {referencesForRun} from './browserReference.mjs';\n" + background
    background = replace_once(background, 'enabled: true, ...s.view', 'enabled: true, ...s.view, probeReferences: referencesForRun(s.view.run)')
    background = replace_once(background, 'function publish(tabId, state) {', 'function publish(tabId, state) {\n  state.probeReferences = referencesForRun(state.run);')
    payload['background.js'] = background.encode()
    view = payload['view-model.js'].decode()
    view = replace_once(view, 'return {runId: run?.runId', 'return {probeReferences: (state.probeReferences || []).filter(r => r.runId === run?.runId), runId: run?.runId')
    payload['view-model.js'] = view.encode()
    panel = payload['panel.js'].decode()
    panel = replace_once(panel, '      if(options.onRename){', '''      for (const ref of view.probeReferences || []) {
        result.append(el('p','footnote','Probe参考 · span '+ref.spanId+' · '+(ref.family || '未知家族')+' · 启发式分数 '+ref.heuristicScore+'（非概率）'));
      }
      if ((view.probeReferences || []).length) result.append(el('p','footnote','参考最多显示100次调用；服务端标签仍单独保留。无正文，不运行行为或 tokenizer 推断。'));
      if(options.onRename){''')
    payload['panel.js'] = panel.encode()
    reference = (root / 'browserReference.mjs').read_text().replace('../../arena-model-probe/src/', './engine/')
    payload['browserReference.mjs'] = reference.encode()
    for name in ['classify.js', 'registry.js', 'learned.js']:
        payload['engine/' + name] = (root.parent.parent / 'arena-model-probe/src' / name).read_bytes()
    payload['README.md'] = (root / '浏览器整合说明.md').read_bytes()
    payload['package.json'] = b'{"type":"module","private":true}'
    payload['source-hashes.json'] = json.dumps({'inspectorInputs': hashes, 'payload': {name: hashlib.sha256(data).hexdigest() for name, data in payload.items()}}, indent=2).encode()
    output = root / 'dist' / 'webagent-arena-inspector-0.3.0.zip'
    output.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name, data in payload.items():
            archive.writestr('webagent-arena-inspector/' + name, data)
    if verify:
        with tempfile.TemporaryDirectory(prefix='unified-inspector-') as temp:
            with zipfile.ZipFile(output) as archive:
                archive.extractall(temp)
            directory = Path(temp) / 'webagent-arena-inspector'
            for name, digest in json.loads((directory / 'source-hashes.json').read_text())['payload'].items():
                if hashlib.sha256((directory / name).read_bytes()).hexdigest() != digest:
                    raise ValueError('Browser payload hash mismatch')
            shutil.copytree(source / 'tests', directory / 'tests')
            tests = sorted(str(p) for p in (directory / 'tests').glob('*.test.mjs'))
            subprocess.run(['node', '--test', *tests], cwd=directory, check=True, timeout=90)
    print(output)
    return output


if __name__ == '__main__':
    build(verify="--verify" in sys.argv[1:])
