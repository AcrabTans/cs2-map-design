import {openThirdPartyCok,parsePrefab,parseBinaryPrefab,decodeCokGeometry} from './cok-format.js';
import {readBuildingLibrary} from './building-assets.js';

async function readCokBuildings(archive){
 const references=new Map(),prefabs=new Map(),labels=new Map();
 for(const entry of archive.entries.values()){
  if(entry.name.endsWith('.cid'))references.set((await archive.read(entry.name)).toString().trim(),entry.name.slice(0,-4));
  else if(entry.name.endsWith('.Prefab')){
   const data=await archive.read(entry.name);
   prefabs.set(entry.name,data[0]===123?parsePrefab(data.toString()):parseBinaryPrefab(data));
  }else if(entry.name.endsWith('.loc')){
   const data=await archive.read(entry.name);
   let at=2;
   const string=()=>{
    let length=0;
    for(let shift=0;shift<=28;shift+=7){
     const n=data[at++];
     if(n===undefined)break;
     length+=(n&127)*2**shift;
     if(n&128)continue;
     if(length>data.length-at)break;
     const value=data.subarray(at,at+length).toString();
     at+=length;
     return value;
    }
    throw Error('资产包本地化内容无效');
   };
   try{
    string();
    const locale=string();
    if(locale!=='zh-HANS')continue;
    string();
    const count=data.readUInt32LE(at);at+=4;
    for(let i=0;i<count;i++){
     const key=string(),value=string();
     if(key.startsWith('Assets.NAME['))labels.set(key,value);
    }
   }catch{/* Optional localization does not affect geometry. */}
  }
 }
 const buildings=[];
 const list=value=>value?.$rcontent||[];
 const ref=value=>references.get(value?.$fstrref?.replace(/^CID:/,''));
 for(const prefab of prefabs.values()){
  if(!String(prefab.$type).includes('BuildingPrefab')||!(prefab.m_LotWidth>0&&prefab.m_LotDepth>0))continue;
  const code=prefab.name;
  const components=list(prefab.components);
  const component=name=>components.find(item=>item.name===name);
  const upgrade=component('ServiceUpgrade');
  const rawMeshes=list(prefab.m_Meshes);
  if(upgrade&&!rawMeshes.length)continue;
  if(!rawMeshes.length)throw Error(code+' 缺少独立主模型');
  const meshes=rawMeshes.map(item=>{
   if(item.m_Mesh?.$fstrref?.startsWith('UnityGUID:'))throw Error(code+' 引用了包外游戏模型');
   const mesh=prefabs.get(ref(item.m_Mesh)),geometry=ref(mesh?.m_GeometryAsset);
   if(!archive.entries.has(geometry))throw Error(code+' 缺少包内主模型');
   const p=item.m_Position||{x:0,y:0,z:0},q=item.m_Rotation?.value||{x:0,y:0,z:0,w:1};
   return {geometry,position:[p.x,p.y,p.z],rotation:[q.x,q.y,q.z,q.w]};
  });
  const label=labels.get('Assets.NAME['+code+']')?.trim();
  const name=label||code;
  let type=/residential|mixed|lowrent|housing|住宅|住房|商住/i.test(name+' '+code)?'residential':
   /office|办公/i.test(name+' '+code)?'other':/commercial|shop|mall| 3[ABC]$|商业|商店/i.test(name+' '+code)?'commercial':
   /industrial|factory|工业|工厂/i.test(name+' '+code)?'industry':'municipal';
  if(component('School')||/School|Library|Academy|Kindergarten|学校|图书馆/i.test(name+' '+code))type='education';
  if(component('Hospital'))type='hospital';
  if(component('PoliceStation'))type='police';
  if(component('FireStation'))type='fire';
  const workers=component('Workplace')?.m_Workplaces;
  const parentAssetCodes=upgrade?list(upgrade.m_Buildings).map(v=>prefabs.get(ref(v))?.name).filter(Boolean):[];
  buildings.push({
   id:code,code,name,type,lot:[prefab.m_LotWidth*8,prefab.m_LotDepth*8],maxResidents:null,
   maxEmployees:Number.isInteger(workers)&&workers>=0?workers:null,meshes,
   ...(upgrade?{isExtension:true,parentAssetCode:parentAssetCodes[0]||null,parentAssetCodes}:{})
  });
 }
 if(!buildings.length)throw Error('未找到带独立主模型的建筑');
 return buildings;
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

export async function extractCokLibrary(file,codecs,onProgress=()=>{}){
 const archive=await openThirdPartyCok(file);
 const buildings=await readCokBuildings(archive);
 const name=file.name.replace(/\.cok$/i,'');
 const identity=new TextEncoder().encode(JSON.stringify([file.name,buildings.map(a=>a.code).sort()]));
 const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',identity));
 const token=Array.from(digest.subarray(0,8),x=>x.toString(16).padStart(2,'0')).join('');
 const assets=[];
 onProgress(0,buildings.length);
 for(const {meshes,...asset} of buildings){
  try{assets.push({...asset,...await buildCokProjection(archive,meshes,codecs)});}
  catch(error){throw Error(asset.code+'：'+(error.message||error));}
  onProgress(assets.length,buildings.length);
 }
 const library={format:'cs2-building-assets',version:1,packs:[{id:'cok-'+token,name,assetGroup:'third-party',assets}]};
 readBuildingLibrary(library);
 const safeName=[...name.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_')].slice(0,90).join('').replace(/[ .]+$/,'')||'资产包';
 return {library,name:safeName+'-'+token+'.cs2assets',count:assets.length};
}
