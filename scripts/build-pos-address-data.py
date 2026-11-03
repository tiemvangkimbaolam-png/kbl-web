"""Read only official NSO workbooks; emit a compact local lookup (no customer data)."""
from pathlib import Path
import sys, json, re, hashlib, collections, unicodedata, io, argparse, datetime
import openpyxl
import xlrd

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--mapping',type=Path,required=True)
parser.add_argument('--catalog',type=Path,required=True)
parser.add_argument('--output',type=Path,required=True)
parser.add_argument('--as-of',default='2026-11-03')
parser.add_argument('--compared-to',default='2025-11-30')
args=parser.parse_args()
snapshot=datetime.date.fromisoformat(args.as_of)
compared=datetime.date.fromisoformat(args.compared_to)
assert snapshot>=compared
root=args.output.parent
root.mkdir(parents=True,exist_ok=True)
clean=lambda s:re.sub(r'\s+',' ',str(s or '')).strip()
def key(s):
    return ''.join(c for c in unicodedata.normalize('NFD',clean(s).lower()) if not unicodedata.combining(c)).replace('đ','d')
def coded(s,width):
    text=clean(s);m=re.fullmatch(r'(.*?)\s*\((\d+)\)',text)
    assert m,(text,width)
    return m[2].zfill(width),clean(m[1])
def code(s,width):
    if isinstance(s,(int,float)):return str(int(s)).zfill(width)
    return clean(s).zfill(width)
digest=lambda p:hashlib.sha256(p.read_bytes()).hexdigest()

mapping=args.mapping; catalog=args.catalog
sheet=openpyxl.load_workbook(mapping,read_only=True,data_only=True).worksheets[1]
rows=[(i,r) for i,r in enumerate(sheet.values,1) if r[2] and str(r[2]).strip().isdigit()]
assert len(rows)==10571
current=xlrd.open_workbook(catalog,logfile=io.StringIO()).sheet_by_index(0)
assert current.nrows==3322 and current.row_values(0)[:4]==['Tỉnh','Tên Tỉnh','Xã','Tên Xã']
pn={}; wn={}
for i in range(1,current.nrows):
    r=current.row_values(i); pc=code(r[0],2);wc=code(r[2],5)
    assert wc not in wn
    pn[pc]=clean(r[1]);wn[wc]={'c':wc,'n':clean(r[3]),'p':pc,'law':clean(r[4])}
assert len(wn)==3321 and len(pn)==34
po={}; districts={}; old={}; specials=[];variants=collections.defaultdict(set); district_variants=collections.defaultdict(set); notes=[]
for row,r in rows:
    npc,npn=coded(r[0],2); nc=code(r[2],5)
    assert nc in wn and wn[nc]['p']==npc
    if not r[4]:
        specials.append({'oldDistrict':clean(r[6]),'oldProvince':clean(r[7]),'oldArea':clean(r[3]),'target':nc,'note':clean(r[5]),'row':row});continue
    opc,opn=coded(r[7],2);dc,dn=coded(r[6],3)
    if opc in po: assert key(po[opc])==key(opn) or key(opn)==key(po[opc]).removeprefix('tinh '),(row,opc,po[opc],opn)
    else: po[opc]=opn
    district_id=dc+'|'+key(dn)+'|'+opc
    districts.setdefault(district_id,{'id':district_id,'c':dc,'n':dn,'p':opc})
    district_variants[dc].add(district_id)
    note=clean(r[5])
    if note not in notes:notes.append(note)
    target=[nc,notes.index(note),row]
    oc=code(r[4],5); name=clean(r[3]);identity=(oc,key(name),district_id,opc)
    variants[oc].add(identity)
    unit=old.setdefault(identity,{'c':oc,'n':name,'d':district_id,'p':opc,'t':[]})
    if target not in unit['t']:unit['t'].append(target)
for unit in old.values():
    if len(variants[unit['c']])>1 or len(district_variants[districts[unit['d']]['c']])>1:unit['conflict']=True
assert len(po)==63,(len(variants),len(po))
meta={'schema':1,'mappingEffectiveDate':'2025-07-01','catalogAsOf':args.as_of,'retrievedAt':args.as_of,
      'sources':[{'url':'https://danhmuchanhchinh.nso.gov.vn/TAPTIN/BangChuyendoi%C4%90VHCmoi_cu_final.xlsx','sha256':digest(mapping),'sheet':'Tổng hợp_không merge ','rows':len(rows)},
                 {'url':'https://danhmuchanhchinh.nso.gov.vn/Doi_Chieu_Moi.aspx','export':'ctl00$PlaceHolderMain$cmdExcel','from':snapshot.strftime('%d/%m/%Y'),'compare':compared.strftime('%d/%m/%Y'),'sha256':digest(catalog),'rows':len(wn)}],
      'counts':{'oldProvince':len(po),'newProvince':len(pn),'oldWardCodes':len(variants),'oldWardEntries':len(old),'newWard':len(wn),'sourceRelations':len(rows)},
      'conflictingOldCodes':sorted(c for c,v in variants.items() if len(v)>1),
      'conflictingDistrictCodes':{c:[districts[x] for x in sorted(v)] for c,v in district_variants.items() if len(v)>1},
      'policy':'Only exact full old hierarchy and an entire-unit unique verified destination may convert automatically. Partial, conflicting, missing or stale records require confirmation. No fuzzy auto conversion.'}
data={'meta':meta,'oldProvinces':[{'c':c,'n':n} for c,n in po.items()], 'newProvinces':[{'c':c,'n':n} for c,n in pn.items()],
      'districts':list(districts.values()),'oldWards':list(old.values()),'newWards':list(wn.values()),'specials':specials,'notes':notes}
out=args.output
body=json.dumps(data,ensure_ascii=False,separators=(',',':'))
out.write_text('(function(d){if(typeof module===\'object\'&&module.exports)module.exports=d;if(typeof window!==\'undefined\')window.KBLAddressData=d;})('+body+');\n',encoding='utf-8',newline='\n')
(root/'data-proof.json').write_text(json.dumps({'meta':meta,'outputBytes':out.stat().st_size,'sha256':digest(out)},ensure_ascii=False,indent=2),encoding='utf-8')
print(json.dumps({'counts':meta['counts'],'blockedConflictingCodes':meta['conflictingOldCodes'],'bytes':out.stat().st_size,'sha256':digest(out)},ensure_ascii=False))
