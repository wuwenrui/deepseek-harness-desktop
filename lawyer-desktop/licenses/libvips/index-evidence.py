#!/usr/bin/env python3
"""Index preserved evidence and verify every byte; no build or installation writes."""
import hashlib, io, json, pathlib, subprocess, tarfile, urllib.request
ROOT=pathlib.Path(__file__).resolve().parent
LICENSES=ROOT.parent
DESKTOP=LICENSES.parent
REV='4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6'
sha=lambda b:hashlib.sha256(b).hexdigest()
def dump(path,value): path.write_text(json.dumps(value,indent=2)+'\n')
inputs=json.loads((ROOT/'source-inputs.json').read_text())
rust=json.loads((ROOT/'rust-source-inputs.json').read_text())
sources=[];docs=[]
for item in inputs+rust:
    assert item['status'] in ['downloaded','lock-checksum-verified'],item
    p=LICENSES/item['path'];assert sha(p.read_bytes())==item['sha256']
    revision=item.get('revision')
    if not revision:
        revision=item['url'].rsplit('/',1)[-1]
        if item['kind']=='source':
            with tarfile.open(p) as t: revision=t.getmembers()[0].name.split('/')[0]
    sources.append({k:item[k] for k in ['path','sha256','url']}|{'revision':revision})
    docs.extend({k:d[k] for k in ['path','sha256','url','revision']} for d in item.get('documents',[]))
dump(ROOT/'sources.json',sources)
origins={
 'LGPL-3.0.txt':('https://www.gnu.org/licenses/lgpl-3.0.txt','LGPL-3.0 2007-06-29'),
 'GPL-3.0.txt':('https://www.gnu.org/licenses/gpl-3.0.txt','GPL-3.0 2007-06-29'),
 'MPL-2.0.txt':('https://www.mozilla.org/media/MPL/2.0/index.815ca599c9df.txt','MPL-2.0'),
 'tag-v1.3.2.json':('https://api.github.com/repos/lovell/sharp-libvips/git/tags/3338b03c138b3e1328e0a20b6543b99ab4438d8f','3338b03c138b3e1328e0a20b6543b99ab4438d8f'),
 'release-v1.3.2.json':('https://api.github.com/repos/lovell/sharp-libvips/releases/tags/v1.3.2','v1.3.2')}
for p in sorted((ROOT/'upstream').rglob('*')):
    if not p.is_file():continue
    rel=p.relative_to(ROOT/'upstream').as_posix()
    if rel.startswith('librsvg/'):
        url='https://download.gnome.org/sources/librsvg/2.62/librsvg-2.62.90.tar.xz';revision='librsvg-2.62.90'
    elif rel.startswith('lcms/'):
        url='https://github.com/mm2/Little-CMS/releases/download/lcms2.19.1/lcms2-2.19.1.tar.gz';revision='lcms2-2.19.1'
    else:url,revision=origins.get(rel,(f'https://raw.githubusercontent.com/lovell/sharp-libvips/{REV}/'+rel.replace('recipes/','build/'),REV))
    docs.append({'path':p.relative_to(LICENSES).as_posix(),'sha256':sha(p.read_bytes()),'url':url,'revision':revision})
entries=[];native=[];npm_evidence=[]
for arch in ['arm64','x64']:
    name=f'@img/sharp-libvips-darwin-{arch}'
    installed=DESKTOP/'node_modules'/name
    manifest=installed/'package.json';meta=json.loads(manifest.read_text())
    assert meta['version']=='1.3.2'
    npm_url=f'https://registry.npmjs.org/{name}/-/sharp-libvips-darwin-{arch}-1.3.2.tgz'
    raw=urllib.request.urlopen(npm_url).read()
    localdocs=[]
    with tarfile.open(fileobj=io.BytesIO(raw)) as t:
        for file in ['README.md','versions.json','package.json']:
            b=(installed/file).read_bytes();assert t.extractfile('package/'+file).read()==b,(arch,file)
            p=ROOT/'installed'/arch/('manifest.json' if file=='package.json' else file)
            p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b)
            localdocs.append({'path':p.relative_to(LICENSES).as_posix(),'sha256':sha(b),'url':npm_url,'revision':'1.3.2'})
        bfile=installed/meta['exports']['./binary']
        b=bfile.read_bytes();assert t.extractfile('package/'+meta['exports']['./binary'].removeprefix('./')).read()==b
        npm_evidence.append({'name':name,'version':'1.3.2','url':npm_url,'tarballSha256':sha(raw),'installedBinarySha256':sha(b),'installedDocsAndBinaryMatchNpm':True})
    sharp=DESKTOP/'node_modules'/f'@img/sharp-darwin-{arch}'/'lib'/f'sharp-darwin-{arch}-0.35.3.node'
    for p in [bfile,sharp]:
        native.extend([p.relative_to(DESKTOP).as_posix(), 'SHA256 '+sha(p.read_bytes()), subprocess.check_output(['otool','-L',str(p)],text=True).replace(str(DESKTOP)+'/', '')])
    entries.append({'name':name,'version':'1.3.2','license':meta['license'],'manifestSha256':sha(manifest.read_bytes()),'documents':sorted(localdocs+docs,key=lambda d:d['path']),'evidence':{'upstreamCommit':REV,'installedNpmMatch':True,'sourceIndex':'libvips/sources.json','sourceInputs':'libvips/source-inputs.json','rustSourceInputs':'libvips/rust-source-inputs.json','releaseReview':'libvips/RELEASE.md','sourceAvailability':'Exact recipe inputs and all 348 crates in released librsvg Cargo.lock archived locally; must be offered with release. Runtime feature-resolved closure and recipient replacement acceptance still require verification.','notComplianceApproval':True}})
(ROOT/'evidence').mkdir(exist_ok=True)
(ROOT/'evidence/native-linkage.txt').write_text('\n'.join(native)+'\n')
dump(ROOT/'evidence/npm-origin.json',npm_evidence)
dump(LICENSES/'libvips-index.json',entries)
for entry in entries:
    for doc in entry['documents']:assert sha((LICENSES/doc['path']).read_bytes())==doc['sha256']
print(json.dumps({'packages':len(entries),'uniqueDocuments':len({d['path'] for e in entries for d in e['documents']}),'sourceAttachments':len(sources),'sourceBytes':sum((LICENSES/s['path']).stat().st_size for s in sources),'allHashesVerified':True}))
