import {desktopFile} from './desktop-runtime.js';
import {cokPackageName,inspectCokPackage} from './asset-extractor.js';

const isCokFile=entry=>entry.kind==='file'&&/\.cok$/i.test(entry.name);
const modVersion=name=>/^(\d+)_(\d+)$/.exec(name);
const modNameSort=(a,b)=>a.name.localeCompare(b.name,'zh');
const modEntries=(api,folder)=>(api.assetEntries||api.entries)(folder.id);

async function catalogPackage(input,{mod='',code=false,author=''}={}){
 const {file,name}=input;
 try{
  const summary=await inspectCokPackage(input);
  const type=summary.buildingCount?'建筑资产':summary.otherAssets.length?'其他资产':'COK 资源';
  return {id:file.nativeId,name,mod,code,author,type,size:file.size,input,...summary};
 }catch(error){
  return {id:file.nativeId,name,mod,code,author,type:'读取失败',size:file.size,notes:[String(error.message||error)]};
 }
}

export async function inspectDesktopCokFiles(files){
 const rows=[];
 for(const file of files.filter(isCokFile).sort(modNameSort)){
  const source=desktopFile(file);
  rows.push(await catalogPackage({file:source,name:cokPackageName(source.name)||source.name}));
 }
 return rows;
}

function packageInputs(entries,title){
 const coks=entries.filter(isCokFile).sort(modNameSort),byName=new Map(coks.map(f=>[f.name.toLowerCase(),f]));
 const companions=new Map(),used=new Set();
 for(const file of coks){
  const key=file.name.toLowerCase();
  if(key.startsWith('prefabs')||key==='locale.cok')continue;
  const peers=[byName.get('prefabs_'+key.replace(/^blob_/,'')),key==='blob.cok'&&byName.get('prefabs.cok')].filter(Boolean);
  companions.set(file,peers);for(const peer of peers)used.add(peer);
 }
 const sources=coks.filter(f=>!used.has(f)&&f.name.toLowerCase()!=='locale.cok');
 const locale=byName.get('locale.cok');
 return sources.map(file=>({file:desktopFile(file),companions:(companions.get(file)||[]).map(desktopFile),
  locale:locale?desktopFile(locale):null,name:sources.length===1&&title||cokPackageName(file.name)||file.name}));
}

async function readModManifest(api,entries){
 const metadata=entries.find(f=>f.kind==='directory'&&f.name.toLowerCase()==='.metadata');
 const regular=entries.find(f=>f.kind==='file'&&f.name.toLowerCase()==='mod.json');
 let file=regular;
 if(!file&&metadata)file=(await modEntries(api,metadata)).find(f=>f.kind==='file'&&f.name.toLowerCase()==='mod.json');
 if(!file||file.size>1024*1024)return {};
 try{
  const meta=JSON.parse(await desktopFile(file).text());
  const authors=Array.isArray(meta.authors)?meta.authors:[];
  const author=[meta.author,...authors].filter(name=>typeof name==='string'&&name.trim()).map(name=>name.trim());
  return {title:[meta.displayName,meta.name,meta.title].find(v=>typeof v==='string'&&v.trim())?.trim(),
   author:[...new Set(author)].join('、'),code:meta.isCodeMod===true};
 }catch{return {};}
}

async function scanModFolder(api,folder,topEntries,exactAuthor,uniqueAuthor){
 const dir=topEntries||await modEntries(api,folder),meta=await readModManifest(api,dir),files=[];
 const packages=[];
 async function collect(entries,top){
  files.push(...entries.filter(entry=>entry.kind==='file'));
  packages.push(...packageInputs(entries,top?meta.title:''));
  if(topEntries)return;
  for(const child of entries.filter(entry=>entry.kind==='directory'&&!entry.name.startsWith('.')))
   await collect(await modEntries(api,child),false);
 }
 await collect(dir,true);
 const version=modVersion(folder.name),mod=version?version[1]+' / '+version[2]:folder.name;
 const program=files.find(f=>/\.dll$/i.test(f.name)&&!/_x86_64\.dll$/i.test(f.name));
 const code=meta.code||files.some(f=>/\.dll$/i.test(f.name));
 const author=exactAuthor||meta.author||uniqueAuthor||'';
 if(packages.length)return Promise.all(packages.map(input=>catalogPackage(input,{mod,code,author})));
 if(topEntries&&!files.length)return [];
 const loose=files.some(f=>/\.prefab$/i.test(f.name));
 return [{id:folder.id,name:meta.title||program?.name.replace(/\.dll$/i,'')||folder.name,mod,
  type:code?'代码 Mod':loose?'其他资产':'其他 Mod',code,author,notes:loose?['发现散装 Prefab，当前从 .cok 提取。']:[]}];
}

export async function scanDesktopMods(api,root,onProgress){
 const authorsRequest=api.assetCacheAuthors?.(root.id).catch(()=>[])||[];
 const [entries,authors]=await Promise.all([modEntries(api,root),authorsRequest]);
 const exactAuthors=new Map(),authorsById=new Map(),latest=new Map(),folders=[];
 for(const {id,version,author} of authors){
  if(!author)continue;
  exactAuthors.set(id+'_'+version,author);
  if(!authorsById.has(id))authorsById.set(id,new Set());
  authorsById.get(id).add(author);
 }
 for(const entry of entries){
  if(entry.kind!=='directory'||entry.name.startsWith('.'))continue;
  const version=modVersion(entry.name);
  if(!version){folders.push(entry);continue;}
  const held=latest.get(version[1]);
  if(!held||Number(version[2])>held.number)latest.set(version[1],{entry,number:Number(version[2])});
 }
 folders.push(...Array.from(latest.values(),item=>item.entry));
 folders.sort(modNameSort);
 const rootFiles=entries.some(f=>isCokFile(f)||f.kind==='file'&&/\.dll$/i.test(f.name));
 const groups=[...(rootFiles||!folders.length?[{folder:root,entries}]:[]),...folders.map(folder=>({folder}))];
 const batches=new Array(groups.length);
 let next=0,done=0;
 onProgress(0,groups.length);
 const worker=async()=>{
  while(next<groups.length){
   const i=next++,group=groups[i];
   const exactAuthor=exactAuthors.get(group.folder.name),known=authorsById.get(modVersion(group.folder.name)?.[1]);
   const uniqueAuthor=known?.size===1?[...known][0]:'';
   try{batches[i]=await scanModFolder(api,group.folder,group.entries,exactAuthor,uniqueAuthor);}
   catch(error){batches[i]=[{id:group.folder.id,name:group.folder.name,mod:group.folder.name,
    author:exactAuthor||uniqueAuthor,type:'读取失败',notes:[String(error.message||error)]}];}
   onProgress(++done,groups.length);
  }
 };
 await Promise.all(Array.from({length:Math.min(4,groups.length)},worker));
 return batches.flat();
}
