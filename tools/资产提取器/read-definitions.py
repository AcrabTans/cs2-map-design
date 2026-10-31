import sys,json,re,zipfile,struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent/'依赖/python'))
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
source=Path(sys.argv[1]);root=source.parents[3]
out=Path(sys.argv[2])
with zipfile.ZipFile(source,'r') as z:
    cidmap={z.read(n).decode().strip():n[:-4] for n in z.namelist() if n.endswith('.Geometry.cid')}
    names={re.sub(r'_LOD\d+$','',re.sub(r'_[0-9a-f]{30,32}\.Geometry$','',n)) for n in z.namelist() if n.endswith('.Geometry')}
e=UnityPy.load(str(root/'Cities2_Data/resources.assets'))
g=TypeTreeGenerator('2022.3.71f1');g.load_local_dll_folder(str(root/'Cities2_Data/Managed'));e.typetree_generator=g
cache={}
def read(o):
    if o.path_id not in cache:cache[o.path_id]=o.read_typetree()
    return cache[o.path_id]
def ptr(o,p):return o.assets_file.objects[p['m_PathID']]
def guid(t):
    b=struct.pack('<4i',*[t['m_GuidPart'+str(i)] for i in range(1,5)])
    return ''.join(f'{v:02x}'[::-1] for v in b)
assets=[];excluded=[];errors=[]
for o in list(e.objects):
    if o.type.name!='MonoBehaviour':continue
    raw=o.get_raw_data()
    if len(raw)<32:continue
    # MonoBehaviour name starts after the standard 28-byte header.
    n=struct.unpack_from('<i',raw,28)[0]
    if n<=0 or n>160:continue
    name=raw[32:32+n].decode('utf-8',errors='replace')
    if name not in names:continue
    try:
        t=read(o)
        if not (t.get('m_LotWidth',0)>0 and t.get('m_LotDepth',0)>0):excluded.append(name);continue
        components=[read(ptr(o,p)) for p in t.get('components',[]) if p.get('m_PathID')]
        meshes=[]
        for m in t.get('m_Meshes',[]):
            r=read(ptr(o,m['m_Mesh']));cid=guid(r['m_GeometryAsset']);geometry=cidmap.get(cid)
            if not geometry:raise Exception('Main geometry not in OldTown: '+r.get('m_Name','')+' '+cid)
            meshes.append({'geometry':geometry,'position':list(m['m_Position'].values()),'rotation':list(m['m_Rotation']['value'].values()),'bounds':r['m_Bounds'],'vertices':r['m_VertexCount'],'indices':r['m_IndexCount'],'requireState':m['m_RequireState']})
        if not meshes:raise Exception('No primary mesh')
        workplace=next((c for c in components if c.get('m_Name')=='Workplace'),{})
        jobs=workplace.get('m_Workplaces')
        if not isinstance(jobs,int) or jobs<0:jobs=None
        typ='residential' if re.match('(EU|NA)_(MixedOldTown|ResidentialLow)',name) else 'sports' if name.startswith('OutdoorSauna') else 'municipal'
        assets.append({'id':str(o.path_id),'name':name,'type':typ,'lot':[t['m_LotWidth']*8,t['m_LotDepth']*8],'maxResidents':None,'maxEmployees':jobs,'meshes':meshes,'componentNames':[c.get('m_Name') for c in components]})
    except Exception as ex:errors.append({'name':name,'error':str(ex)})
result={'assets':sorted(assets,key=lambda a:a['name']),'excluded':sorted(excluded),'errors':errors,'modelGroups':len(names)}
(out/'definitions.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
print(json.dumps({'buildings':len(assets),'excluded':len(excluded),'errors':errors,'categories':{k:sum(a['type']==k for a in assets) for k in set(a['type'] for a in assets)},'samples':assets[:1]},ensure_ascii=False))
