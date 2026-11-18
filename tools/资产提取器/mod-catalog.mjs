import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {openCok} from './cok-reader.mjs';
import {companionPrefabs,isBuildingDefinition,isSurfaceUpgrade,prefabItems,readChineseNames,readPrefab} from './prefab-metadata.mjs';

const modVersion=name=>/^(\d+)_(\d+)$/.exec(name);
const sortedEntries=folder=>fs.readdirSync(folder,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name,'zh'));
const usableDirectory=entry=>entry.isDirectory()&&!entry.name.startsWith('.');
export const cleanPackageName=file=>path.basename(file,path.extname(file)).replace(/^Blob_/i,'').replace(/_[a-f0-9]{30,32}$/i,'').trim();

function* packageFiles(folder,recursive){
 for(const entry of sortedEntries(folder)){
  const file=path.join(folder,entry.name);
  if(entry.isFile())yield file;
  else if(recursive&&usableDirectory(entry))yield* packageFiles(file,true);
 }
}

function displayName(folder){
 for(const name of ['mod.json',path.join('.metadata','mod.json')]){
  try{
   const file=path.join(folder,name),info=fs.lstatSync(file);
   if(!info.isFile()||info.size>1024*1024)continue;
   const meta=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
   return {name:[meta.displayName,meta.name,meta.title].find(v=>typeof v==='string'&&v.trim())?.trim(),code:meta.isCodeMod===true};
  }catch(error){if(error.code&&error.code!=='ENOENT')throw error;}
 }
 return {};
}

function inspectPackage(file){
 const archives=[];
 try{
  for(const source of [file,...companionPrefabs(file)])archives.push(openCok(source));
  const buildings=new Map(),models=new Set(),otherAssets=new Map(),seen=new Set();
  let unread=0,external=0;
  for(const archive of archives)for(const entry of archive.entries.values()){
   if(!entry.name.endsWith('.Prefab')||seen.has(entry.name))continue;
   seen.add(entry.name);
   try{
    const prefab=readPrefab(archive.read(entry.name));
    const type=String(prefab?.$type||'').split(',')[0].split('.').at(-1);
    const name=typeof prefab?.name==='string'&&prefab.name?prefab.name:cleanPackageName(entry.name);
    if(isBuildingDefinition(prefab)&&!isSurfaceUpgrade(prefab)){
     const meshes=prefabItems(prefab.m_Meshes);
     buildings.set(name,name);
     if(meshes.length&&!models.has(name)){
      models.add(name);
      if(meshes.some(mesh=>mesh?.m_Mesh?.$fstrref?.startsWith('UnityGUID:')))external++;
     }
    }else if(/Road|Track|Pathway|NetPrefab|NetLane/.test(type))otherAssets.set(name,'路网');
    else if(/Tree|Plant|Vegetation/.test(type))otherAssets.set(name,'植被');
    else if(/Vehicle/.test(type))otherAssets.set(name,'载具');
    else if(/MapPrefab|Theme|ZonePrefab/.test(type))otherAssets.set(name,'地图／主题／区划');
    else if(/StaticObject|Prop|Surface|AreaPrefab/.test(type))otherAssets.set(name,'道具／地表');
   }catch{unread++;}
  }
  let labels=new Map();
  if(buildings.size||otherAssets.size){
   try{labels=readChineseNames(archives,path.join(path.dirname(file),'Locale.cok'));}catch{labels=new Map();}
   for(const name of buildings.keys())buildings.set(name,labels.get(name)||name);
  }
  const assets=[...otherAssets].map(([name,type])=>({name:labels.get(name)||name,type}));
  return {count:buildings.size,buildings:[...buildings.values()].sort((a,b)=>a.localeCompare(b,'zh')),assets,
   types:[...new Set(otherAssets.values())],eligible:models.size>0,
   note:[unread&&`有 ${unread} 条定义未能读取，数量为已识别数`, buildings.size>models.size&&`${buildings.size-models.size} 栋缺少独立主模型`,
    external&&`${external} 栋引用游戏本体模型`].filter(Boolean).join('。')};
 }catch(error){return {count:null,buildings:[],types:[],eligible:false,error:true,note:error.message};}
 finally{for(const archive of archives)archive.close();}
}

export function scanModCatalog(root,onRow=()=>{}){
 const entries=sortedEntries(root),cache=path.basename(root).toLowerCase()==='pdx_mods'||entries.some(entry=>usableDirectory(entry)&&modVersion(entry.name));
 const held=new Map(),folders=[];
 for(const entry of entries.filter(usableDirectory)){
  const version=cache&&modVersion(entry.name);
  if(!version){folders.push(entry.name);continue;}
  const current=held.get(version[1]);
  if(!current||Number(version[2])>Number(modVersion(current)[2]))held.set(version[1],entry.name);
 }
 const groups=[...(cache||entries.some(e=>e.isFile()&&/\.cok$/i.test(e.name))?[{folder:root,recursive:false}]:[]),
  ...[...folders,...held.values()].map(name=>({folder:path.join(root,name),recursive:true}))];
 if(!groups.length)groups.push({folder:root,recursive:false});
 const rows=[];
 for(const {folder,recursive} of groups){
  const version=modVersion(path.basename(folder));
  const mod=[version?.[1],version?.[2]&&'版本 '+version[2]].filter(Boolean).join(' / ')||path.basename(folder);
  const add=row=>{const full={mod,folder,...row};rows.push(full);onRow(full);};
  try{
   const files=[...packageFiles(folder,recursive)],meta=displayName(folder),code=meta.code||files.some(file=>/\.dll$/i.test(file));
   const archives=files.filter(file=>/\.cok$/i.test(file));
   const companions=new Set(archives.flatMap(companionPrefabs));
   const packages=archives.filter(file=>!companions.has(file)&&path.basename(file).toLowerCase()!=='locale.cok');
   for(const file of packages){
    const result=inspectPackage(file),fileName=cleanPackageName(file)||path.basename(file);
    const name=meta.name&&packages.length===1?meta.name:fileName;
    const relative=path.relative(folder,file);
    const hash=createHash('sha256').update(version?version[1]+'/'+relative:file).digest('hex').slice(0,12);
    const type=result.error?'读取失败':result.count?'建筑资产':result.types.length?'其他资产':'COK 资源';
    add({file,name,type,code,packageId:`mod-${version?version[1]+'-':''}${hash}`,bytes:fs.statSync(file).size,...result});
   }
   if(!packages.length&&(folder!==root||files.length||groups.length===1)){
    const loose=files.some(file=>/\.prefab$/i.test(file));
    const note=loose?'发现未打包的 Prefab 文件':'';
    const display=files.find(file=>/\.dll$/i.test(file)&&!/_x86_64\.dll$/i.test(file));
    add({name:meta.name||(display&&path.basename(display,'.dll'))||path.basename(folder),type:code?'代码 Mod':loose?'其他资产':'其他 Mod',
     code,types:[],count:null,buildings:[],eligible:false,note});
   }
  }catch(error){add({name:path.basename(folder),type:'读取失败',types:[],count:null,buildings:[],eligible:false,note:error.message});}
 }
 return rows;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 scanModCatalog(path.resolve(process.argv[2]),row=>console.log(JSON.stringify(row)));
}
