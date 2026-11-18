import {openThirdPartyCok,parsePrefab,parseBinaryPrefab,decodeCokGeometry} from './cok-format.js';
import {readBuildingLibrary} from './building-assets.js';
import {buildCokLod,combineCokLods,encodeCokLod} from './cok-lod.js';
import {readCokLodGlb} from './lod-glb.js';

export const isOfficialModAuthor=author=>author?.trim().toLowerCase()==='cities: skylines official';

const cokItems=value=>value?.$rcontent||[];
export const cokPackageName=name=>name.replace(/\.cok$/i,'').replace(/^(?:Blob|Prefabs)_/i,'').replace(/_[\da-f]{30,32}$/i,'');
const cokPrefabCategory=type=>/Road|Track|Pathway|NetPrefab|NetLane/.test(type)?'路网':
 /Tree|Plant|Vegetation/.test(type)?'植被':/Vehicle/.test(type)?'载具':
 /MapPrefab|Theme|ZonePrefab/.test(type)?'地图／主题／区划':/StaticObject|Prop|Surface|AreaPrefab/.test(type)?'道具／地表':'';

function addCokLabels(data,labels){
 let at=2;
 const string=()=>{
  let length=0;
  for(let shift=0;shift<=28;shift+=7){
   const byte=data[at++];
   if(byte===undefined)break;
   length+=(byte&127)*2**shift;
   if(byte&128)continue;
   if(at+length>data.length)break;
   const value=data.subarray(at,at+length).toString();
   at+=length;
   return value;
  }
  throw Error('本地化条目无效');
 };
 string();if(string()!=='zh-HANS')return;string();
 const count=data.readUInt32LE(at);at+=4;
 for(let i=0;i<count;i++){
  const key=string(),value=string();
  if(key.startsWith('Assets.NAME[')&&key.endsWith(']')&&value.trim())labels.set(key.slice(12,-1),value.trim());
 }
}

async function readCokPackage({file,companions=[],locale=null}){
 const archives=await Promise.all([file,...companions].map(openThirdPartyCok));
 const entries=new Map(),references=new Map(),prefabs=new Map(),labels=new Map();
 const labelArchives=[...archives];
 if(locale)try{labelArchives.push(await openThirdPartyCok(locale));}catch{/* Labels are optional. */}
 for(const archive of archives)for(const name of archive.entries.keys())entries.set(name,archive);
 const read=name=>entries.get(name).read(name);
 const metadata=[...entries.keys()].filter(name=>/\.(cid|Prefab)$/.test(name));
 let unread=0;
 for(let i=0;i<metadata.length;i+=12){
  await Promise.all(metadata.slice(i,i+12).map(async name=>{
   try{
    const data=await read(name);
    if(name.endsWith('.cid'))references.set(data.toString().trim(),name.slice(0,-4));
    else prefabs.set(name,data[0]===123?parsePrefab(data.toString()):parseBinaryPrefab(data));
   }catch{unread++;}
  }));
 }
 for(const archive of labelArchives)for(const name of archive.entries.keys()){
  if(!name.endsWith('.loc')||archive===labelArchives.at(-1)&&labelArchives.length>archives.length&&!/zh-HANS/.test(name))continue;
  try{addCokLabels(await archive.read(name),labels);}catch{/* A broken label does not affect the model. */}
 }
 const ref=value=>references.get(value?.$fstrref?.replace(/^CID:/,'')),assets=[],names=[],otherAssets=[];
 const lodRenders=new Map();
 for(const prefab of prefabs.values()){
  if(typeof prefab.name!=='string'||!/_LOD[12](?: Mesh)?$/i.test(prefab.name))continue;
  const geometry=ref(prefab.m_GeometryAsset);
  if(!entries.has(geometry))continue;
  if(!lodRenders.has(prefab.name))lodRenders.set(prefab.name,new Set());
  lodRenders.get(prefab.name).add(geometry);
 }
 let external=0,missing=0;
 for(const [entry,prefab] of prefabs){
  const kind=String(prefab?.$type||'').split(',')[0].split('.').at(-1);
  const code=typeof prefab?.name==='string'&&prefab.name?prefab.name:cokPackageName(entry);
  const name=labels.get(code)||code;
  if(!kind.includes('BuildingPrefab')||!(prefab.m_LotWidth>0&&prefab.m_LotDepth>0)){
   const type=cokPrefabCategory(kind);
   if(type)otherAssets.push({type,name});
   continue;
  }
  const components=cokItems(prefab.components),component=name=>components.find(item=>item.name===name);
  const upgrade=component('ServiceUpgrade'),rawMeshes=cokItems(prefab.m_Meshes);
  if(upgrade&&!rawMeshes.length)continue;
  names.push(name);
  if(rawMeshes.some(item=>item.m_Mesh?.$fstrref?.startsWith('UnityGUID:'))){external++;continue;}
  const meshes=rawMeshes.map(item=>{
   const mesh=prefabs.get(ref(item.m_Mesh)),geometry=ref(mesh?.m_GeometryAsset);
   const p=item.m_Position||{x:0,y:0,z:0},q=item.m_Rotation?.value||{x:0,y:0,z:0,w:1};
   const lods={};
   if(typeof mesh?.name==='string'){
    const name=mesh.name.replace(/_LOD0(?= Mesh$|$)/i,'');
    for(const level of ['lod1','lod2']){
     const suffix='_'+level.toUpperCase();
     const sibling=/ Mesh$/i.test(name)?name.replace(/ Mesh$/i,suffix+' Mesh'):name+suffix;
     const linked=lodRenders.get(sibling);
     if(linked?.size===1)lods[level]=[...linked][0];
    }
   }
   return {geometry,lods,position:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w]};
  });
  if(!meshes.length||meshes.some(mesh=>!entries.has(mesh.geometry))){missing++;continue;}
  let type=/residential|mixed|lowrent|housing|住宅|住房|商住/i.test(name+' '+code)?'residential':
   /office|办公/i.test(name+' '+code)?'other':/commercial|shop|mall| 3[ABC]$|商业|商店/i.test(name+' '+code)?'commercial':
   /industrial|factory|工业|工厂/i.test(name+' '+code)?'industry':'municipal';
  if(component('School')||/School|Library|Academy|Kindergarten|学校|图书馆/i.test(name+' '+code))type='education';
  if(component('Hospital'))type='hospital';
  if(component('PoliceStation'))type='police';
  if(component('FireStation'))type='fire';
  const workers=component('Workplace')?.m_Workplaces;
  const parentAssetCodes=upgrade?cokItems(upgrade.m_Buildings).map(value=>prefabs.get(ref(value))?.name).filter(Boolean):[];
  assets.push({id:code,code,name,type,lot:[prefab.m_LotWidth*8,prefab.m_LotDepth*8],maxResidents:null,
   maxEmployees:Number.isInteger(workers)&&workers>=0?workers:null,meshes,
   ...(upgrade?{isExtension:true,parentAssetCode:parentAssetCodes[0]||null,parentAssetCodes}:{})});
 }
 const compare=(a,b)=>a.localeCompare(b,'zh');
 assets.sort((a,b)=>compare(a.code,b.code));
 names.sort(compare);otherAssets.sort((a,b)=>compare(a.type,b.type)||compare(a.name,b.name));
 return {archive:{entries,read},assets,summary:{names,otherAssets,buildingCount:names.length,supported:assets.length,
  notes:[external&&external+' 栋引用包外游戏本体模型',missing&&missing+' 栋缺少包内主模型',unread&&unread+' 条定义无法读取']
   .filter(Boolean)}};
}

export async function inspectCokPackage(input){
 return (await readCokPackage(input)).summary;
}

async function buildCokProjection(archive,meshes,codecs){
 const parts=[];
 let triangleCount=0,vertexBytes=0,minHeight=Infinity,maxHeight=-Infinity;
 for(const {geometry,rotation,position} of meshes){
  const norm=Math.hypot(...rotation);
  if(!norm||!position.every(Number.isFinite))throw Error('模型变换无效');
  const [qx,qy,qz,qw]=rotation.map(v=>v/norm);
  for(const {vertices,indices} of await decodeCokGeometry(await archive.read(geometry),codecs.decompress)){
   triangleCount+=indices.length/3;
   vertexBytes+=vertices.length/3*16;
   if(triangleCount>1000000||vertexBytes>128*1024*1024)throw Error('建筑网格超过大小上限');
   const xz=new Float64Array(vertices.length/3*2);
   for(let i=0,j=0;i<vertices.length;i+=3,j+=2){
    const x=vertices[i],y=vertices[i+1],z=vertices[i+2];
    const tx=2*(qy*z-qz*y),ty=2*(qz*x-qx*z),tz=2*(qx*y-qy*x);
    xz[j]=x+qw*tx+(qy*tz-qz*ty)+position[0];
    xz[j+1]=z+qw*tz+(qx*ty-qy*tx)+position[2];
    const height=y+qw*ty+(qz*tx-qx*tz)+position[1];
    minHeight=Math.min(minHeight,height);maxHeight=Math.max(maxHeight,height);
   }
   parts.push({xz,indices});
  }
 }
 const triangles=new Float64Array(triangleCount*6);
 let length=0;
 for(const {xz,indices} of parts)for(let i=0;i<indices.length;i+=3){
  const a=indices[i]*2,b=indices[i+1]*2,c=indices[i+2]*2;
  const ax=xz[a],ay=xz[a+1],bx=xz[b],by=xz[b+1],cx=xz[c],cy=xz[c+1];
  if(Math.abs((bx-ax)*(cy-ay)-(by-ay)*(cx-ax))<=1e-9)continue;
  triangles[length++]=ax;triangles[length++]=ay;triangles[length++]=bx;
  triangles[length++]=by;triangles[length++]=cx;triangles[length++]=cy;
 }
 const projection=await codecs.project(new Uint8Array(triangles.buffer,0,length*8));
 return {...projection,height:Math.round((maxHeight-minHeight)*10000)/10000};
}

function projectionLibrary(packs){
 const library={format:'cs2-building-assets',version:1,packs};
 readBuildingLibrary(library);
 return new TextEncoder().encode(JSON.stringify(library));
}

async function processCokPackage(input,codecs,{formats,save,onProgress}){
 const {archive,assets,summary}=await readCokPackage(input);
 if(!assets.length)throw Error(summary.notes.join('，')||'未找到可提取的包内建筑模型');
 const name=input.name||cokPackageName(input.file.name);
 const identity=new TextEncoder().encode(JSON.stringify([input.file.name,assets.map(asset=>asset.code).sort()]));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',identity));
 const token=Array.from(digest.subarray(0,8),x=>x.toString(16).padStart(2,'0')).join('');
 const pack={id:'cok-'+token,name,assetGroup:isOfficialModAuthor(input.author)?'official':'third-party'};
 const safe=[...name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')].slice(0,90).join('').replace(/[ .]+$/,'')||'资产包';
 const stem=safe+'-'+token,results=[];
 for(const format of formats){
  const progress=(done,total)=>onProgress(format,done,total);
  try{
   let contents;
   if(format==='projection'){
    const projections=[];
    progress(0,assets.length);
    for(const {meshes,...asset} of assets){
     try{projections.push({...asset,...await buildCokProjection(archive,meshes,codecs)});}
     catch(error){throw Error(asset.code+'：'+(error.message||error));}
     progress(projections.length,assets.length);
    }
    const projection={...pack,assets:projections};
    readBuildingLibrary({format:'cs2-building-assets',version:1,packs:[projection]});
    contents={projection,count:projections.length,missing:0};
   }else{
    contents=await buildCokLod(archive,assets,pack,format,codecs,progress);
   }
   results.push({format,...await save(format,stem,pack,contents),count:contents.count,missing:contents.missing});
  }catch(error){results.push({format,error:String(error.message||error)});}
 }
 return {results,notes:summary.notes};
}

export function extractCokPackage(input,codecs,{formats,write,onProgress}){
 return processCokPackage(input,codecs,{formats,onProgress,save:async(format,stem,pack,contents)=>{
  const projection=format==='projection';
  const filename=stem+(projection?'.cs2assets':'-'+format+'.glb');
  return {name:await write(filename,projection?projectionLibrary([contents.projection]):encodeCokLod(contents))};
 }});
}

export async function extractCokForMap(input,codecs,{formats,onProgress}){
 let projection;
 const lods=[];
 function* mapFormats(){
  yield 'projection';
  if(projection)yield* formats.filter(format=>format!=='projection');
 }
 const outcome=await processCokPackage(input,codecs,{formats:mapFormats(),onProgress,save(format,stem,pack,contents){
  if(format==='projection')projection=contents.projection;
  else lods.push(readCokLodGlb(encodeCokLod(contents)));
 }});
 return {...outcome,projection,lods};
}

export function createCokBatch(write){
 const groups=new Map();
 return {
  collect(input,codecs,{formats,onProgress}){
   return processCokPackage(input,codecs,{formats,onProgress,save(format,stem,pack,contents){
    if(!groups.has(format))groups.set(format,{parts:[],ids:new Set(),length:0,tooLarge:false});
    const group=groups.get(format);
    if(group.ids.has(pack.id))throw Error('建筑资产包编号重复，已收录一个副本');
    if(group.tooLarge)return;
    group.length+=contents.length||0;
    if(group.length>480*1024*1024){group.tooLarge=true;group.parts.length=0;return;}
    group.parts.push(contents);group.ids.add(pack.id);
   }});
  },
  async finish(onFormat){
   const results=[];
   for(const [format,group] of groups){
    onFormat(format);
    try{
     if(group.tooLarge)throw Error('合并后的三维模型超过大小上限，请减少所选包或分别输出');
     const projection=format==='projection',parts=group.parts;
     const name='合并资产包'+(projection?'.cs2assets':'-'+format+'.glb');
     const bytes=projection?projectionLibrary(parts.map(part=>part.projection)):encodeCokLod(combineCokLods(parts));
     results.push({format,name:await write(name,bytes),count:parts.reduce((n,p)=>n+p.count,0),missing:parts.reduce((n,p)=>n+p.missing,0),packs:parts.length});
    }catch(error){results.push({format,error:String(error.message||error)});}
    groups.delete(format);
   }
   return results;
  }
 };
}
