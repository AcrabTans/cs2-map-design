"""Resolve UnityGUID model references read-only via the game's PrefabsMap."""
import sys,json,os,re,struct,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.path.insert(0,str(ROOT/'依赖/python'))
import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

def game_root(source):
 candidates=[Path(os.environ['CS2_GAME_DIR'])] if os.environ.get('CS2_GAME_DIR') else []
 candidates.extend(source.parents)
 steam=[]
 if os.name=='nt':
  import winreg
  for hive,key,value in [(winreg.HKEY_LOCAL_MACHINE,r'SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\Steam App 949230','InstallLocation'),(winreg.HKEY_CURRENT_USER,r'Software\Valve\Steam','SteamPath')]:
   try:
    with winreg.OpenKey(hive,key) as k:
     v=Path(winreg.QueryValueEx(k,value)[0])
     if value=='SteamPath':steam.append(v)
     else:candidates.append(v)
   except OSError:pass
 steam.extend([Path('C:/Games/STEAM'),Path('C:/Program Files (x86)/Steam')])
 for s in list(steam):
  f=s/'steamapps/libraryfolders.vdf'
  if f.exists():steam.extend(Path(x.replace(chr(92)*2,chr(92))) for x in re.findall(r'"path"\s*"([^"]+)"',f.read_text('utf-8',errors='replace')))
 candidates.extend(s/'steamapps/common/Cities Skylines II' for s in steam)
 for p in candidates:
  if (p/'Cities2_Data/resources.assets').is_file():return p
 raise RuntimeError('UnityGUID 引用了游戏本体模型，但未找到游戏目录；可设置 CS2_GAME_DIR 为游戏安装目录')

def prefab_references(b):
 if len(b)<48 or b[32:42]!=b'PrefabsMap':raise ValueError('Invalid PrefabsMap header')
 at=44;n=struct.unpack_from('<I',b,at)[0];at+=4;keys=[]
 if n>1000000 or len(b)!=52+48*n:raise ValueError('PrefabsMap size invalid')
 for i in range(n):
  size=struct.unpack_from('<I',b,at)[0];at+=4
  if size!=32:raise ValueError('PrefabsMap GUID invalid')
  key=b[at:at+size].decode('ascii')
  if not re.fullmatch('[0-9a-fA-F]{32}',key):raise ValueError('Invalid UnityGUID')
  keys.append(key);at+=size
 if len(set(keys))!=n or struct.unpack_from('<I',b,at)[0]!=n:raise ValueError('PrefabsMap reference count invalid')
 return {k:struct.unpack_from('<iq',b,at+4+i*12) for i,k in enumerate(keys)}

def resolve(source,targets):
 root=game_root(source);env=UnityPy.load(str(root/'Cities2_Data/resources.assets'))
 gen=TypeTreeGenerator('2022.3.71f1');gen.load_local_dll_folder(str(root/'Cities2_Data/Managed'));env.typetree_generator=gen
 refs={}
 for o in env.objects:
  if o.type.name!='MonoBehaviour':continue
  b=o.get_raw_data()
  if len(b)<44 or struct.unpack_from('<i',b,28)[0]!=10 or b[32:42]!=b'PrefabsMap':continue
  mapping=prefab_references(b)
  for k in targets:
   if k in mapping:
    fileid,pid=mapping[k]
    if fileid:raise ValueError('External Unity assets file not supported')
    refs[k]=o.assets_file.objects[pid].read_typetree()
  break
 blobs=sorted((root/'Cities2_Data/Content/Game').glob('Blob*.cok'));geometry={}
 # Match geometry by exact content ID, never by guessed names.
 for path in blobs:
  with zipfile.ZipFile(path) as z:
   for name in z.namelist():
    if name.endswith('.Geometry.cid'):geometry[z.read(name).decode().strip()]=(str(path),name[:-4])
 result={}
 for key,t in refs.items():
  g=t['m_GeometryAsset'];raw=struct.pack('<4i',*[g['m_GuidPart'+str(i)] for i in range(1,5)]);cid=''.join(f'{v:02x}'[::-1] for v in raw)
  if cid not in geometry:raise ValueError('Unity model geometry not found: '+t.get('m_Name',''))
  path,name=geometry[cid];result[key]={'geometrySource':path,'geometry':name,'bounds':t['m_Bounds'],'vertices':t['m_VertexCount'],'indices':t['m_IndexCount'],'sourceModel':t.get('m_Name')}
 missing=set(targets)-set(result)
 if missing:raise ValueError('Unresolved UnityGUID: '+','.join(sorted(missing)))
 return result
if __name__=='__main__':
 source=Path(sys.argv[1]);work=Path(sys.argv[2]);targets=json.loads((work/'unity-model-requests.json').read_text('utf-8'))
 (work/'unity-models.json').write_text(json.dumps(resolve(source,targets),ensure_ascii=False),encoding='utf-8')
