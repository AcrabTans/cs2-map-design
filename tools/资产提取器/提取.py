import argparse,hashlib,json,os,subprocess,sys,re,time,shutil
from pathlib import Path
sys.stdout.reconfigure(encoding='utf-8')
ROOT=Path(__file__).parent
DEFAULT=ROOT/'output'
def run(cmd,log):
 with log.open('a',encoding='utf-8') as f:
  p=subprocess.Popen(cmd,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True,encoding='utf-8',errors='replace',env={**os.environ,'PYTHONIOENCODING':'utf-8'},cwd=ROOT,creationflags=subprocess.CREATE_NO_WINDOW if os.name=='nt' else 0)
  for line in p.stdout:
   f.write(line);f.flush()
   try:
    info=json.loads(line)
    if info.get('lod'):print(info['lod'].upper()+'：可用 '+str(info['available'])+'，缺失 '+str(info['missing']),flush=True)
   except (ValueError,AttributeError):pass
   if line.startswith('projected '):
    count=int(line.split()[1])
    if count%10==0:print('已生成 '+str(count)+' 个建筑投影',flush=True)
  p.wait()
 if p.returncode:raise RuntimeError('步骤失败，详见 '+str(log))
def extract(source,output,label=None,formats=None):
 formats=list(dict.fromkeys(formats or ['projection']))
 if any(f not in ['projection','lod1','lod2'] for f in formats):raise ValueError('导出选项无效')
 source=Path(source).resolve();output=Path(output).resolve();output.mkdir(parents=True,exist_ok=True)
 if not source.is_file() or source.suffix.lower()!='.cok':raise ValueError('请选择 .cok 文件')
 # Archive entries are now read on demand; source size is not a memory allocation.
 game_data=source.parents[2] if len(source.parents)>2 else None
 if output==source.parent or (game_data and (game_data/'resources.assets').is_file() and (source.parents[3]==output or source.parents[3] in output.parents)):raise ValueError('输出目录必须在游戏目录之外')
 slug=re.sub('[^a-z0-9-]+','-',source.stem.removeprefix('Blob_').lower()).strip('-') or 'assets'
 work=ROOT/'工作缓存'/slug;work.mkdir(parents=True,exist_ok=True);log=work/'运行日志.txt';log.write_text('',encoding='utf-8')
 with source.open('rb') as f:before=hashlib.file_digest(f,'sha256').hexdigest()
 def step(name):print(name,flush=True)
 try:
  step('1/4 检查文件格式与配套定义')
  run([os.environ.get('CS2_NODE','node'),str(ROOT/'inspect.mjs'),str(source),str(work)],log)
  index=json.loads((work/'index.json').read_text(encoding='utf-8'));direct=json.loads((work/'direct.json').read_text(encoding='utf-8'))
  if index['binaryPrefabs'] or (direct['assets'] and not direct['errors']):
   (work/'definitions.json').write_text(json.dumps(direct),encoding='utf-8')
  else:
   data_dir=source.parents[2]
   if not (data_dir/'resources.assets').is_file():raise RuntimeError('没有完整的可读取建筑定义；请保留配套资源。')
   step('读取游戏内置建筑定义（只读）')
   run([sys.executable,str(ROOT/'read-definitions.py'),str(source),str(work)],log)
  defs=json.loads((work/'definitions.json').read_text(encoding='utf-8'))
  if defs.get('errors'):raise RuntimeError('建筑定义存在未解析项，未导出不完整资产库；详见缓存 definitions.json')
  if not defs['assets']:
   raise RuntimeError('未找到带独立主模型的建筑；没有生成空资产库。识别清单见 '+str(work/'index.json'))
  files=[]
  if 'projection' in formats:
   step('2/4 提取 '+str(len(defs['assets']))+' 栋建筑的主模型投影')
   run([os.environ.get('CS2_NODE','node'),str(ROOT/'project-all.mjs'),str(source),str(work)],log)
   step('3/4 生成投影资产库及总览图')
   run([sys.executable,str(ROOT/'finalize.py'),str(work),str(output),str(source),slug,label or source.stem.removeprefix('Blob_')],log)
   files.append(str(output/(slug+'.cs2assets')))
  levels=[f for f in ['lod2','lod1'] if f in formats]
  if levels:
   step('3/4 导出三维模型：'+', '.join(levels))
   run([os.environ.get('CS2_NODE','node'),str(ROOT/'export-lod.mjs'),str(source),str(work),str(output),slug,label or source.stem.removeprefix('Blob_'),*levels],log)
   files.extend(str(output/(slug+'-'+level+'.glb')) for level in levels)
  step('4/4 校验源文件未改变')
  result={'ok':True,'source':str(source),'assets':len(defs['assets']),'library':files[0],'files':files,'formats':formats,'log':str(log)}
 except Exception as e:result={'ok':False,'source':str(source),'error':str(e),'log':str(log)}
 with source.open('rb') as f:after=hashlib.file_digest(f,'sha256').hexdigest()
 result['sourceUnchanged']=before==after;result['sha256']=after
 if not result['sourceUnchanged']:result['ok']=False;result['error']='源文件校验发生变化，请检查游戏/Steam 是否正在更新'
 (work/'结果.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
 print(json.dumps(result,ensure_ascii=False),flush=True)
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description='本地建筑资产提取：不调用 AI、不修改游戏文件');p.add_argument('source');p.add_argument('--output',default=str(DEFAULT));p.add_argument('--name');p.add_argument('--formats',nargs='+',choices=['projection','lod2','lod1'],default=['projection']);a=p.parse_args();sys.exit(0 if extract(a.source,a.output,a.name,a.formats)['ok'] else 2)
