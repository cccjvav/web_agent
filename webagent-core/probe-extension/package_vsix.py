"""Build an explicit allowlist VSIX using Conda Python's standard library; no downloads."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
import hashlib
import zipfile
import tempfile
import subprocess
import sys


def verify_archive(output):
    """Run only a synthetic offline calculation from the extracted shipping payload."""
    with tempfile.TemporaryDirectory(prefix='probe-vsix-check-') as directory:
        with zipfile.ZipFile(output) as archive:
            archive.extractall(directory)
        extension = Path(directory) / 'extension'
        for folder in ['engine', 'trace-engine']:
            hashes = json.loads((extension / folder / 'source-hashes.json').read_text())
            for name, digest in hashes.items():
                if hashlib.sha256((extension / folder / name).read_bytes()).hexdigest() != digest:
                    raise ValueError('Packaged engine hash mismatch')
        sample = {'schema': 'webagent-model-observation/v1', 'requestId': 'package-fixture',
                  'observedAt': '2026-09-15T00:00:00Z', 'origin': 'https://arena.ai',
                  'truncated': False, 'evidence': [], 'text': 'data: {"model":"package-fixture-model"}\n\n'}
        script = ('const {analyze}=require(' + json.dumps(str(extension / 'analysis.js')) + ');'
                  + 'analyze(' + json.dumps(sample) + ').then(r=>{'
                  + 'if(r.candidate.modelId!=="package-fixture-model" || r.modelIdentityVerified!==false) throw Error("Packaged analysis mismatch");'
                  + 'console.log("Packaged offline analysis passed");}).catch(e=>{console.error(e);process.exitCode=1;});')
        trace = {'schemaVersion': 1, 'runId': 'run_fixture', 'exportedAt': '2026-09-15T00:00:00Z',
                 'checkedAt': '2026-09-15T00:00:00Z', 'historical': True, 'scope': 'synthetic',
                 'calls': [{'spanId': 'fixture', 'model': 'trace-fixture-model', 'provider': 'fixture'}]}
        script += ('analyze(' + json.dumps(trace) + ').then(r=>{'
                   + 'if(r.calls.length!==1 || r.calls[0].reference.source!=="local.history.model") throw Error("Packaged trace analysis mismatch");'
                   + 'console.log("Packaged trace analysis passed");}).catch(e=>{console.error(e);process.exitCode=1;});')
        script += ('const {createHistory}=require(' + json.dumps(str(extension / 'history.js')) + ');'
                   + 'let data;const state={get:()=>data,update:async(k,v)=>{data=v}};'
                   + 'createHistory(state).save({schema:"webagent-model-analysis/v1",candidate:{modelId:"history-fixture"}})'
                   + '.then(()=>createHistory(state).list()).then(r=>{if(r.length!==1)throw Error("Packaged history mismatch");console.log("Packaged history passed");})'
                   + '.catch(e=>{console.error(e);process.exitCode=1;});')
        subprocess.run(['node', '-e', script], cwd=directory, check=True, timeout=30)


def build(verify=False):
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    output = root / 'dist' / f"{manifest['name']}-{manifest['version']}.vsix"
    output.parent.mkdir(exist_ok=True)
    identity = escape(manifest['name'])
    version = escape(manifest['version'])
    vsix = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="{identity}" Version="{version}" Publisher="webagent"/><DisplayName>WebAgent Probe Companion</DisplayName><Description xml:space="preserve">Offline model-reference analysis and local connection diagnostics.</Description><Tags>diagnostics</Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>
</PackageManifest>'''
    content_types = '''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="mjs" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>'''
    trace_sources = ['evidence.js', 'usage.js']
    sources = ['registry.js', 'classify.js', 'probe.js', 'learned.js', 'interceptor.js']
    local_files = ['package.json', 'extension.js', 'client.js', 'analysis.js', 'traceInput.js', 'history.js', 'referenceInput.js', 'historyTransfer.js', 'historyClustering.js', 'liveClient.js', 'liveCommands.js', 'analysisWorker.mjs', 'README.md', 'LICENSE']
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('extension.vsixmanifest', vsix)
        archive.writestr('[Content_Types].xml', content_types)
        for name in local_files:
            source = root / name
            if source.is_symlink():
                raise ValueError('Package inputs must not be symlinks')
            archive.write(source, 'extension/' + name)
        source_root = root.parent.parent / 'arena-model-probe' / 'src'
        hashes = {}
        for name in sources:
            source = source_root / name
            if source.is_symlink():
                raise ValueError('Engine source must not be a symlink')
            data = source.read_bytes()
            hashes[name] = hashlib.sha256(data).hexdigest()
            archive.writestr('extension/engine/' + name, data)
        trace_hashes = {}
        for name in trace_sources:
            source = root.parent.parent / 'arena-trace-inspector' / name
            if source.is_symlink():
                raise ValueError('Trace engine source must not be a symlink')
            data = source.read_bytes()
            trace_hashes[name] = hashlib.sha256(data).hexdigest()
            archive.writestr('extension/trace-engine/' + name, data)
        archive.writestr('extension/trace-engine/package.json', '{"type":"module"}')
        archive.writestr('extension/trace-engine/source-hashes.json', json.dumps(trace_hashes, sort_keys=True))
        archive.writestr('extension/engine/package.json', '{"type":"module"}')
        archive.writestr('extension/engine/source-hashes.json', json.dumps(hashes, sort_keys=True))
    with zipfile.ZipFile(output) as archive:
        expected = {'extension.vsixmanifest', '[Content_Types].xml'} | {'extension/' + name for name in local_files} | {'extension/engine/' + name for name in sources + ['package.json', 'source-hashes.json']}
        expected |= {'extension/trace-engine/' + name for name in trace_sources + ['package.json', 'source-hashes.json']}
        if set(archive.namelist()) != expected or archive.testzip() is not None:
            raise ValueError('Unexpected VSIX payload or corrupt archive')
    if verify:
        verify_archive(output)
    print(output)
    return output


if __name__ == '__main__':
    build(verify='--verify' in sys.argv[1:])
