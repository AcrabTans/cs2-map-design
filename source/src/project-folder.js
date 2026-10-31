import {attachLodFiles,lodBytes,readLodGlb} from './asset-3d.js';
import {unpackProject} from './project-file.js';
import {prepareEditor} from './model.js';
import {readBuildingLibrary} from './building-assets.js';

export function folderRelativePath(value){
 if(typeof value!=='string'||!value||value.startsWith('/')||value.includes('\\')||value.split('/').some(s=>!s||s==='.'||s==='..'||s.includes(':')))throw Error('项目文件路径无效');
 return value;
}
export async function readProjectFolder(entries){
 const files=new Map();for(const entry of entries){const p=folderRelativePath(entry.path);if(files.has(p))throw Error('项目文件重复');files.set(p,entry);}
 const descriptor=files.get('project.folder.json');let manifest=null;
 if(descriptor){manifest=JSON.parse(await descriptor.file.text());if(manifest.format!=='cs2-map-folder'||manifest.version!==1)throw Error('项目文件夹格式不支持');}
 const candidates=[...files.keys()].filter(p=>!p.includes('/')&&p.endsWith('.cs2map'));
 const projectPath=manifest?folderRelativePath(manifest.projectFile):candidates.length===1?candidates[0]:null;
 if(!projectPath||!files.has(projectPath))throw Error('项目文件夹应包含一个 .cs2map 工程，或有效的 project.folder.json');
 const entry=files.get(projectPath);if(entry.file.size>512*1024*1024)throw Error('工程文件超过 512 MB');
 const bytes=await entry.file.arrayBuffer(),doc=await unpackProject(bytes,{resolveExternal:entry.file.relativeFile}),packs=new Map((doc.project.assetPacks||[]).map(p=>[p.id,p])),assetPaths=new Map(),ids=new Set();
 const assetsDirectory=folderRelativePath(manifest?.assetsDirectory||'assets');
 for(const [p,e]of [...files].sort(([a],[b])=>a.localeCompare(b))){
  if(!p.startsWith(assetsDirectory+'/')||!p.endsWith('.cs2assets')||(Array.isArray(manifest?.assetFiles)&&!manifest.assetFiles.includes(p)))continue;
  if(e.file.size>256*1024*1024)throw Error('资产包文件超过 256 MB：'+p);
  for(const pack of readBuildingLibrary(JSON.parse(await e.file.text()))){if(ids.has(pack.id))throw Error('多个资产文件包含相同包编号：'+pack.id);ids.add(pack.id);const embedded=packs.get(pack.id);if(!pack.lods&&embedded?.lods&&pack.assets.length===embedded.assets.length&&pack.assets.every(a=>embedded.assets.some(b=>b.id===a.id)))pack.lods=embedded.lods;packs.set(pack.id,pack);assetPaths.set(pack.id,p);}
 }
 const sidecars=[...files].filter(([p])=>p.startsWith(assetsDirectory+'/')&&p.endsWith('.glb')&&(!Array.isArray(manifest?.lodFiles)||manifest.lodFiles.includes(p))).map(([,e])=>e.file);
 doc.project=prepareEditor({...doc.project,assetPacks:await attachLodFiles([...packs.values()],sidecars)});
 return {...doc,fileName:projectPath,projectEntry:entry,projectBytes:bytes,assetPaths,assetsDirectory};
}
export async function directoryProjectEntries(handle,prefix='',depth=0){
 const entries=[];for await(const [name,child]of handle.entries()){
  const path=prefix+name;
  if(child.kind==='file'){if((depth===0&&(/\.cs2map$/.test(name)||name==='project.folder.json'))||name.endsWith('.cs2assets')||name.endsWith('.glb'))entries.push({path,file:await child.getFile(),handle:child});}
  else if(depth<4&&(depth>0||name==='assets'))entries.push(...await directoryProjectEntries(child,path+'/',depth+1));
 }return entries;
}
export async function folderFileHandle(root,relative){
 const parts=folderRelativePath(relative).split('/');let dir=root;
 for(const name of parts.slice(0,-1))dir=await dir.getDirectoryHandle(name,{create:true});
 return dir.getFileHandle(parts.at(-1),{create:true});
}
export async function writeFolderFile(root,relative,data){
 const h=await folderFileHandle(root,relative),w=await h.createWritable();try{await w.write(data);await w.close();}catch(e){try{await w.abort();}catch{}throw e;}
}
export async function saveFolderLibraries(context,packs){
 const groups=new Map(),lodFiles=[];
 for(const pack of packs){
  let path=context.assetPaths.get(pack.id);
  if(!path){const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(pack.id)))).map(n=>n.toString(16).padStart(2,'0')).join('').slice(0,20);path=context.assetsDirectory+'/pack-'+hash+'.cs2assets';context.assetPaths.set(pack.id,path);}
  if(!groups.has(path))groups.set(path,[]);groups.get(path).push(pack);
 }
 for(const [path,assets]of groups){const plain=assets.map(({lods,...p})=>p);await writeFolderFile(context.handle,path,JSON.stringify({format:'cs2-building-assets',version:1,packs:plain}));for(const p of assets)for(const [level,data]of Object.entries(p.lods||{})){const index=assets.indexOf(p),suffix=assets.length>1?'-'+index:'',target=path.replace(/\.cs2assets$/i,'')+suffix+'-'+level+'.glb';await writeFolderFile(context.handle,target,lodBytes(data));lodFiles.push(target);}}
 await writeFolderFile(context.handle,'project.folder.json',JSON.stringify({format:'cs2-map-folder',version:1,name:context.name,projectFile:context.projectFile,assetsDirectory:context.assetsDirectory,assetFiles:[...groups.keys()],lodFiles},null,2));
}
