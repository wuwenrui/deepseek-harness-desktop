#!/usr/bin/env python3
"""Archive all registry source candidates in the released librsvg Cargo.lock.
This is a conservative source superset, not a claim every crate is linked.
No compilation, cargo execution, or dependency installation is performed.
"""
import concurrent.futures, hashlib, json, pathlib, subprocess, tarfile, tomllib, re
ROOT=pathlib.Path(__file__).resolve().parent
packages=tomllib.loads((ROOT/'upstream/librsvg/Cargo.lock').read_text())['package']

def fetch(p):
    name=p['name'];version=p['version'];url=f'https://static.crates.io/crates/{name}/{name}-{version}.crate'
    target=ROOT/'sources/rust'/f'{name}-{version}.crate';target.parent.mkdir(parents=True,exist_ok=True)
    item={'name':name,'version':version,'url':url,'revision':version,'path':target.relative_to(ROOT.parent).as_posix(),'lockChecksum':p['checksum']}
    if not target.exists():
        r=subprocess.run(['curl','-fLsS','--retry','2','--max-time','120',url,'-o',str(target)],capture_output=True,text=True)
        if r.returncode: item.update(status='unavailable',error=r.stderr.strip());return item
    item['sha256']=hashlib.sha256(target.read_bytes()).hexdigest()
    if item['sha256']!=p['checksum']: raise ValueError(f'Cargo.lock checksum mismatch {name}')
    item['status']='lock-checksum-verified';docs=[]
    with tarfile.open(target) as t:
        for m in t.getmembers():
            if not m.isfile() or not re.match(r'(?i)^(copying|copyright|licen[sc]e|notice|patents)([._-].*)?$',pathlib.PurePosixPath(m.name).name): continue
            rel='/'.join(m.name.split('/')[1:])
            if '..' in pathlib.PurePosixPath(rel).parts: raise ValueError(rel)
            out=ROOT/'texts/rust'/f'{name}-{version}'/rel;out.parent.mkdir(parents=True,exist_ok=True)
            raw=t.extractfile(m).read();out.write_bytes(raw)
            docs.append({'path':out.relative_to(ROOT.parent).as_posix(),'sha256':hashlib.sha256(raw).hexdigest(),'url':url,'revision':version,'archiveMember':m.name})
    item['documents']=docs
    print(name,version,'verified',flush=True)
    return item
with concurrent.futures.ThreadPoolExecutor(max_workers=12) as pool:
    result=list(pool.map(fetch,[p for p in packages if p.get('source','').startswith('registry+')]))
(ROOT/'rust-source-inputs.json').write_text(json.dumps(result,indent=2)+'\n')
print('Total',len(result),'verified',sum(x['status']=='lock-checksum-verified' for x in result))
