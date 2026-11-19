import {decodeCokGeometry} from './cok-format.js';

export async function buildCokLod(archive,assets,pack,level,codecs,onProgress,checkpoint=()=>{}){
 const doc={asset:{version:'2.0',generator:'CS2 Map Design'},scene:0,scenes:[],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],
  materials:[{pbrMetallicRoughness:{baseColorFactor:[.65,.72,.74,1],metallicFactor:0},doubleSided:true}],
  extras:{format:'cs2-building-lod',version:1,packId:pack.id,packName:pack.name,lod:level,units:'metres',coordinates:'right-handed Y-up; Z=-gameZ',assets:[]}};
 if(pack.author)doc.extras.packAuthor=pack.author;
 if(pack.modUrl)doc.extras.modUrl=pack.modUrl;
 const stem=name=>name.replace(/(?:_[\da-f]{30,32})?\.Geometry$/i,'');
 const index=new Map(),shared=new Map(),buffers=[];
 for(const name of archive.entries.keys()){
  if(!name.endsWith('.Geometry'))continue;
  const key=stem(name);
  if(!index.has(key))index.set(key,[]);
  index.get(key).push(name);
 }
 let length=0,available=0;
 function accessor(array,type,componentType,bounds){
  const bytes=new Uint8Array(array.buffer,array.byteOffset,array.byteLength);
  if(length+bytes.length>480*1024*1024)throw Error('三维模型数据过大');
  const bufferView=doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:bytes.length})-1;
  buffers.push(bytes);length+=bytes.length;
  return doc.accessors.push({bufferView,componentType,type,count:array.length/(type==='VEC3'?3:1),...bounds})-1;
 }
 async function mesh(name){
  if(shared.has(name))return shared.get(name);
  const primitives=[];
  for(const part of await decodeCokGeometry(await archive.read(name),codecs.decompress)){
   const positions=new Float32Array(part.vertices),indices=new Uint32Array(part.indices),normals=new Float32Array(positions.length);
   const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   for(let i=0;i<positions.length;i+=3){
    positions[i+2]*=-1;
    for(let axis=0;axis<3;axis++){
     min[axis]=Math.min(min[axis],positions[i+axis]);
     max[axis]=Math.max(max[axis],positions[i+axis]);
    }
   }
   for(let i=0;i<indices.length;i+=3){
    [indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
    const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3;
    const u=[0,1,2].map(axis=>positions[b+axis]-positions[a+axis]),v=[0,1,2].map(axis=>positions[c+axis]-positions[a+axis]);
    const cross=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];
    for(const vertex of [a,b,c])for(let axis=0;axis<3;axis++)normals[vertex+axis]+=cross[axis];
   }
   for(let i=0;i<normals.length;i+=3){
    const size=Math.hypot(normals[i],normals[i+1],normals[i+2]);
    if(size)for(let axis=0;axis<3;axis++)normals[i+axis]/=size;
    else normals[i+1]=1;
   }
   primitives.push({attributes:{POSITION:accessor(positions,'VEC3',5126,{min,max}),NORMAL:accessor(normals,'VEC3',5126)},
    indices:accessor(indices,'SCALAR',5125),material:0});
  }
  const id=doc.meshes.push({name,primitives})-1;
  shared.set(name,id);return id;
 }
 onProgress(0,assets.length);
 for(const {meshes,...asset} of assets){
  await checkpoint();
  const matched=meshes.map(item=>item.lods?.[level]?[item.lods[level]]:index.get(stem(item.geometry).replace(/_LOD0$/i,'')+'_'+level.toUpperCase())||[]);
  const missingMainMeshes=meshes.filter((_,i)=>matched[i].length!==1).map(item=>item.geometry);
  const status=missingMainMeshes.length?'missing':'available';
  const children=[];
  if(status==='available'){
   for(const [i,item] of meshes.entries()){
    await checkpoint();
    const [x,y,z]=item.position,[qx,qy,qz,qw]=item.rotation,norm=Math.hypot(qx,qy,qz,qw);
    if(!norm||!item.position.every(Number.isFinite))throw Error(asset.code+' 模型变换无效');
    children.push(doc.nodes.push({mesh:await mesh(matched[i][0]),translation:[x,y,-z],rotation:[-qx/norm,-qy/norm,qz/norm,qw/norm]})-1);
   }
   available++;
  }
  const metadata={...asset,status,missingMainMeshes};
  const node=doc.nodes.push({name:asset.name,...(children.length?{children}:{}),extras:metadata})-1;
  const scene=doc.scenes.push({name:asset.name,nodes:[node],extras:{assetId:asset.id,status}})-1;
  doc.extras.assets.push({...metadata,node,scene});
  if(status==='available'&&available===1)doc.scene=scene;
  onProgress(doc.scenes.length,assets.length);
 }
 return {doc,buffers,length,count:available,missing:assets.length-available};
}

export function combineCokLods(parts){
 if(parts.length===1)return parts[0];
 const first=parts[0].doc,extras={...first.extras,assets:[]};
 delete extras.packId;
 delete extras.packName;
 delete extras.packAuthor;
 delete extras.modUrl;
 extras.packSources=parts.map(({doc:{extras:{packId,packName,packAuthor,modUrl}}})=>
  ({id:packId,name:packName,author:packAuthor,modUrl}));
 const doc={...first,extras,nodes:[],scenes:[],meshes:[],accessors:[],bufferViews:[]};
 const buffers=[];
 let length=0,count=0,missing=0;
 for(const part of parts){
  const {doc:source}=part;
  const node=doc.nodes.length,scene=doc.scenes.length,mesh=doc.meshes.length;
  const accessor=doc.accessors.length,view=doc.bufferViews.length;
  if(!count&&part.count)doc.scene=scene+source.scene;
  for(const entry of source.nodes)doc.nodes.push({...entry,
   ...(entry.children?{children:entry.children.map(i=>i+node)}:{}),
   ...(entry.mesh===undefined?{}:{mesh:entry.mesh+mesh})});
  for(const entry of source.scenes)doc.scenes.push({...entry,nodes:entry.nodes.map(i=>i+node)});
  for(const entry of source.meshes)doc.meshes.push({...entry,primitives:entry.primitives.map(p=>({...p,indices:p.indices+accessor,
   attributes:Object.fromEntries(Object.entries(p.attributes).map(([key,i])=>[key,i+accessor]))}))});
  for(const entry of source.accessors)doc.accessors.push({...entry,bufferView:entry.bufferView+view});
  for(const entry of source.bufferViews)doc.bufferViews.push({...entry,byteOffset:entry.byteOffset+length});
  for(const entry of source.extras.assets)extras.assets.push({...entry,packId:source.extras.packId,node:entry.node+node,scene:entry.scene+scene});
  for(const buffer of part.buffers)buffers.push(buffer);
  length+=part.length;count+=part.count;missing+=part.missing;
 }
 return {doc,buffers,length,count,missing};
}

export function encodeCokLod({doc,buffers,length}){
 if(length)doc.buffers=[{byteLength:length}];
 else for(const key of ['buffers','bufferViews','accessors','meshes'])delete doc[key];
 const json=new TextEncoder().encode(JSON.stringify(doc)),padded=(json.length+3)&~3;
 if(20+padded+(length?8+length:0)>512*1024*1024)throw Error('三维模型文件超过 512 MB，请减少所选包或分别输出');
 const bytes=new Uint8Array(20+padded+(length?8+length:0)),view=new DataView(bytes.buffer);
 view.setUint32(0,0x46546c67,true);view.setUint32(4,2,true);view.setUint32(8,bytes.length,true);
 view.setUint32(12,padded,true);view.setUint32(16,0x4e4f534a,true);
 bytes.fill(32,20,20+padded);bytes.set(json,20);
 if(length){
  const start=20+padded;
  view.setUint32(start,length,true);view.setUint32(start+4,0x004e4942,true);
  let offset=start+8;
  for(const buffer of buffers){bytes.set(buffer,offset);offset+=buffer.length;}
 }
 return bytes;
}
