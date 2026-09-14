#!/usr/bin/env python3
"""Download exact public upstream recipe inputs; never execute upstream recipes.
Writes only beneath this script's directory. Existing byte-identical downloads are reused.
"""
import concurrent.futures, hashlib, json, pathlib, re, subprocess, tarfile
ROOT = pathlib.Path(__file__).resolve().parent
REV = '4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6'
versions = dict(line.split('=', 1) for line in (ROOT/'upstream/versions.properties').read_text().splitlines())
recipe = (ROOT/'upstream/recipes/posix.sh').read_text()
inputs = []
for line_no, line in enumerate(recipe.splitlines(), 1):
    if '$CURL https://' not in line or 'main/THIRD-PARTY' in line: continue
    url = line.split('$CURL ', 1)[1].split(' |', 1)[0]
    url = re.sub(r'\$\(without_patch \$(VERSION_\w+)\)', lambda m: versions[m[1]].rsplit('.',1)[0], url)
    url = re.sub(r'\$\(without_prerelease \$(VERSION_\w+)\)', lambda m: versions[m[1]].split('-')[0], url)
    url = re.sub(r'\$\{(VERSION_\w+)//\./([-_])\}', lambda m: versions[m[1]].replace('.',m[2]), url)
    url = re.sub(r'\$\{(VERSION_\w+)\}', lambda m: versions[m[1]], url)
    if '$' in url: raise ValueError(url)
    component = re.findall(r'mkdir \$\{DEPS\}/([\w-]+)', '\n'.join(recipe.splitlines()[:line_no]))[-1]
    ispatch = '.patch' in url
    filename = f'{component}-{line_no}.patch' if ispatch else f'{component}-'+url.rsplit('/',1)[1]
    inputs.append({'component':component,'url':url,'recipeLine':line_no,'path':'libvips/sources/'+filename,'kind':'patch' if ispatch else 'source'})
inputs.append({'component':'sharp-libvips','url':f'https://codeload.github.com/lovell/sharp-libvips/tar.gz/{REV}','path':'libvips/sources/sharp-libvips-1.3.2.tar.gz','kind':'recipe-source','revision':REV})

def fetch(item):
    target=ROOT.parent/item['path']
    if not target.exists():
        result=subprocess.run(['curl','--fail','--location','--silent','--show-error','--retry','2','--max-time','180',item['url'],'-o',str(target)],capture_output=True,text=True)
        if result.returncode:
            item['status']='unavailable';item['error']=result.stderr.strip();return item
    data=target.read_bytes();item['sha256']=hashlib.sha256(data).hexdigest();item['bytes']=len(data);item['status']='downloaded'
    docs=[]
    if item['kind']=='source':
        try:
            with tarfile.open(target) as archive:
                for member in archive.getmembers():
                    base=pathlib.PurePosixPath(member.name).name
                    if not member.isfile(): continue
                    legal_name = re.match(r'(?i)^(copying|copyright|licen[sc]e|notice|patents|ftl\.txt|gplv2\.txt|readme\.ijg)([._-].*)?$',base)
                    extra = item['component']=='freetype' and any(member.name.endswith('/'+x) for x in ['src/bdf/README','src/pcf/README','src/gzip/zlib.h','src/base/fthash.c','include/freetype/internal/fthash.h'])
                    if not (legal_name or '/LICENSES/' in member.name or extra): continue
                    # Preserve all nested legal documents, not only a guessed top-level license.
                    rel='/'.join(member.name.split('/')[1:])
                    if '..' in pathlib.PurePosixPath(rel).parts: raise ValueError(rel)
                    out=ROOT/'texts'/item['component']/rel;out.parent.mkdir(parents=True,exist_ok=True)
                    raw=archive.extractfile(member).read();out.write_bytes(raw)
                    docs.append({'path':out.relative_to(ROOT.parent).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'url':item['url'],'revision':member.name.split('/')[0],'archiveMember':member.name})
            item['documents']=docs
        except tarfile.TarError as e: item['status']='invalid-archive';item['error']=str(e)
    print(item['component'],item['status'],item.get('bytes'),len(docs),flush=True)
    return item
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
    result=list(pool.map(fetch,inputs))
(ROOT/'source-inputs.json').write_text(json.dumps(result,indent=2)+'\n')
print('Summary',len(result),'inputs;',sum(i['status']=='downloaded' for i in result),'downloaded')
