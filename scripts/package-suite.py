"""Build three source-only archives with exact file hashes; no operational data."""
import argparse,hashlib,json,pathlib,zipfile,subprocess
ROOT=pathlib.Path(__file__).resolve().parents[1]
def safe(p):
    forbidden={'node_modules','.git','.next','.wrangler','dist','data','data_backup','profiles','work','output','outputs','__pycache__'}
    return not any(x in forbidden for x in p.parts) and p.name not in {'kbl-config.json','.dev.vars','settings.json'} and not p.name.endswith(('.sqlite','.sqlite-wal','.sqlite-shm','.log','.tsbuildinfo')) and not (p.name.startswith('.env') and not p.name.endswith('.example'))
def archive(target,folder,paths):
    manifest=[]
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
        for rel,p in sorted(paths,key=lambda x:x[0]):
            if not safe(pathlib.Path(rel)) or p.is_symlink():raise ValueError('Non-source file: '+rel)
            b=p.read_bytes();i=zipfile.ZipInfo(folder+'/'+rel,(2026,10,27,0,0,0));i.compress_type=zipfile.ZIP_DEFLATED;i.external_attr=0o100644<<16;z.writestr(i,b);manifest.append({'path':rel,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()})
        z.writestr(folder+'/SOURCE_MANIFEST.json',json.dumps(manifest,ensure_ascii=False,indent=2))
    with zipfile.ZipFile(target) as z:assert z.testzip() is None
    return {'file':target.name,'files':len(manifest),'bytes':target.stat().st_size,'sha256':hashlib.sha256(target.read_bytes()).hexdigest()}
def main():
    parser=argparse.ArgumentParser();parser.add_argument('--output',type=pathlib.Path,required=True);a=parser.parse_args();a.output.mkdir(parents=True,exist_ok=True)
    paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard','-z'],cwd=ROOT).decode().split('\0')
    web=[(r,ROOT/r) for r in set(paths) if r and (ROOT/r).is_file() and not r.startswith('.openai/') and safe(pathlib.Path(r))]
    win=[(str(p.relative_to(ROOT/'windows')),p) for p in (ROOT/'windows').rglob('*') if p.is_file() and safe(p.relative_to(ROOT/'windows'))]
    pos=[(str(p.relative_to(ROOT/'pos-source')),p) for p in (ROOT/'pos-source').rglob('*') if p.is_file() and safe(p.relative_to(ROOT/'pos-source'))]
    if not pos:raise ValueError('Missing recovered POS source')
    docs=['docs/BO_LIEN_THONG.md','docs/POS_SYNC.md','docs/WINDOWS_SETUP.md']
    for d in docs:
        if (ROOT/d).exists():win.append((d,ROOT/d));pos.append((d,ROOT/d))
    results=[archive(a.output/'KBL_WEBSITE_FULL.zip','KBL_WEBSITE',web),archive(a.output/'KBL_WINDOWS_FULL.zip','KBL_WINDOWS',win),archive(a.output/'KBL_POS_FULL_SOURCE.zip','KBL_POS',pos)]
    (a.output/'KBL_SOURCE_CHECKSUMS.json').write_text(json.dumps(results,indent=2))
    print(json.dumps(results))
if __name__=='__main__':main()
