"""Build an explicit allowlist VSIX using Conda Python's standard library; no downloads."""
from pathlib import Path
from xml.sax.saxutils import escape
import json
import zipfile


def build():
    root = Path(__file__).resolve().parent
    manifest = json.loads((root / 'package.json').read_text(encoding='utf-8'))
    output = root / 'dist' / f"{manifest['name']}-{manifest['version']}.vsix"
    output.parent.mkdir(exist_ok=True)
    identity = escape(manifest['name'])
    version = escape(manifest['version'])
    vsix = f'''<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011">
<Metadata><Identity Language="en-US" Id="{identity}" Version="{version}" Publisher="webagent"/><DisplayName>WebAgent Probe Companion</DisplayName><Description xml:space="preserve">Local connection diagnostics, not model authentication.</Description><Tags>diagnostics</Tags><Categories>Other</Categories><GalleryFlags>Public</GalleryFlags><Properties><Property Id="Microsoft.VisualStudio.Code.Engine" Value="^1.90.0"/></Properties></Metadata>
<Installation><InstallationTarget Id="Microsoft.VisualStudio.Code"/></Installation><Dependencies/>
<Assets><Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true"/><Asset Type="Microsoft.VisualStudio.Services.Content.License" Path="extension/LICENSE" Addressable="true"/></Assets>
</PackageManifest>'''
    content_types = '''<?xml version="1.0" encoding="utf-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="json" ContentType="application/json"/><Default Extension="js" ContentType="application/javascript"/><Default Extension="md" ContentType="text/markdown"/><Default Extension="vsixmanifest" ContentType="text/xml"/><Override PartName="/extension/LICENSE" ContentType="text/plain"/></Types>'''
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        archive.writestr('extension.vsixmanifest', vsix)
        archive.writestr('[Content_Types].xml', content_types)
        for name in ['package.json', 'extension.js', 'client.js', 'README.md', 'LICENSE']:
            source = root / name
            if source.is_symlink():
                raise ValueError('Package inputs must not be symlinks')
            archive.write(source, 'extension/' + name)
    with zipfile.ZipFile(output) as archive:
        expected = {'extension.vsixmanifest', '[Content_Types].xml'} | {'extension/' + name for name in ['package.json', 'extension.js', 'client.js', 'README.md', 'LICENSE']}
        if set(archive.namelist()) != expected or archive.testzip() is not None:
            raise ValueError('Unexpected VSIX payload or corrupt archive')
    print(output)
    return output


if __name__ == '__main__':
    build()
