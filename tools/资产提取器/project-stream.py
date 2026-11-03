import sys,json,math
from pathlib import Path
import numpy as np
import shapely
from shapely.geometry import Polygon,MultiPolygon
from robust_union import projection_union
out=Path(sys.argv[1])
assets=[];checks=[];cache={}
cachepath=out/'projection-cache.jsonl'
if cachepath.exists():
 for cachedline in cachepath.read_text(encoding='utf-8').splitlines():
  try:
   row=json.loads(cachedline);cache[row['key']]=row
  except (ValueError,KeyError):pass
for line in sys.stdin:
 a=json.loads(line);key=a.pop('projectionKey');triangles=[];verts=[]
 if key in cache:
  row=cache[key];row['check']['modelWarnings']=a.get('modelWarnings',row['check'].get('modelWarnings',[]));assets.append(row['asset']);checks.append(row['check']);print('projected',len(assets),row['asset']['code'],'(cached)',file=sys.stderr,flush=True);continue
 for m in a.pop('decodedMeshes'):
  q=np.array(m['rotation'],dtype=float);q/=np.linalg.norm(q);v=np.array(m['vertices'],dtype=float)
  t=2*np.cross(np.broadcast_to(q[:3],v.shape),v);v=v+q[3]*t+np.cross(np.broadcast_to(q[:3],v.shape),t)+np.array(m['position'])
  verts.append(v);ix=np.array(m['indices'],dtype=np.int64).reshape(-1,3);ps=v[ix][:,:,[0,2]]
  cross=(ps[:,1,0]-ps[:,0,0])*(ps[:,2,1]-ps[:,0,1])-(ps[:,1,1]-ps[:,0,1])*(ps[:,2,0]-ps[:,0,0]);ps=ps[np.abs(cross)>1e-9]
  triangles.append(shapely.polygons(ps))
 try:g,recovery=projection_union(np.concatenate(triangles))
 except Exception as error:raise RuntimeError('Projection failed: '+a['name']) from error
 rawarea=g.area
 if recovery:print('precision recovery',a['name'],json.dumps(recovery),file=sys.stderr,flush=True)
 healed=g.buffer(.002,join_style=2).buffer(-.002,join_style=2)
 if not healed.is_empty and abs(healed.area-rawarea)<max(.02,rawarea*.002):g=healed
 original=g
 for tol in [.05,.01,.002,0]:
  simple=original.simplify(tol,preserve_topology=True)
  if simple.is_valid and not simple.is_empty and abs(simple.area-rawarea)<=max(.1,rawarea*.01):
   g=simple;break
 else:raise Exception('Projection validation failed '+a['name'])
 parts=list(g.geoms) if g.geom_type=='MultiPolygon' else [g]
 rings=[]
 for p in parts:
  if p.geom_type!='Polygon':raise Exception('Unexpected geometry '+p.geom_type)
  for r in [p.exterior,*p.interiors]:rings.append([[round(float(x),4),round(float(-z),4)] for x,z in list(r.coords)[:-1]])
 v=np.concatenate(verts);height=float(v[:,1].max()-v[:,1].min())
 asset={k:a[k] for k in ['id','name','type','lot','maxResidents','maxEmployees']};asset.update({k:a[k] for k in ['isExtension','parentAssetCode','parentAssetCodes'] if k in a});asset['code']=a['name'];asset['height']=round(height,4);asset['area']=round(g.area,2);asset['rings']=rings
 assets.append(asset);checks.append({'code':asset['code'],'rings':len(rings),'vertices':sum(map(len,rings)),'areaError':g.area-rawarea,'precisionRecovery':recovery,'modelWarnings':a.get('modelWarnings',[])})
 row={'key':key,'asset':asset,'check':checks[-1]}
 with cachepath.open('a',encoding='utf-8') as f:f.write(json.dumps(row,ensure_ascii=False)+'\n')
 print('projected',len(assets),a['name'],file=sys.stderr,flush=True)
(out/'projected.json').write_text(json.dumps({'assets':assets,'checks':checks},ensure_ascii=False),encoding='utf-8')
