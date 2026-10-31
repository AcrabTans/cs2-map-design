import {registerNativeLod,nativeLodResources} from './native-lod.js';
import {readBuildingLibrary} from './building-assets.js';
import {fromBase64,toBase64} from './project-file.js';
export function readLodGlb(input){
 const b=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(b.length<20||b.length>256*1024*1024||v.getUint32(0,true)!==0x46546c67||v.getUint32(4,true)!==2||v.getUint32(8,true)!==b.length)throw Error('LOD文件不是有效的GLB 2.0');
 let at=12,doc,bin;while(at+8<=b.length){const n=v.getUint32(at,true),type=v.getUint32(at+4,true);at+=8;if(n%4||at+n>b.length)throw Error('GLB数据不完整');if(type===0x4e4f534a){if(doc)throw Error('重复GLB目录');doc=JSON.parse(new TextDecoder().decode(b.subarray(at,at+n)));}else if(type===0x004e4942)bin=b.subarray(at,at+n);at+=n;}
 const meta=doc?.extras;if(at!==b.length||meta?.format!=='cs2-building-lod'||meta.version!==1||!['lod1','lod2'].includes(meta.lod)||typeof meta.packId!=='string'||!Array.isArray(meta.assets))throw Error('请选择提取器导出的建筑LOD文件');
 if((doc.buffers||[]).some(x=>x.uri)||(doc.images||[]).length||doc.extensionsRequired?.length)throw Error('LOD包含外部资源或不支持的扩展');
 for(const a of doc.accessors||[]){const view=doc.bufferViews?.[a.bufferView],size={5126:4,5125:4,5123:2}[a.componentType],count=a.type==='VEC3'?3:a.type==='SCALAR'?1:0,offset=(view?.byteOffset||0)+(a.byteOffset||0);if(!view||view.buffer!==0||view.byteStride||a.sparse||!size||!count||!Number.isInteger(a.count)||a.count<1||!bin||offset<0||offset+a.count*count*size>bin.length||a.count*count*size+(a.byteOffset||0)>view.byteLength)throw Error('LOD网格属性无效');}
 const ids=new Set();for(const a of meta.assets){if(typeof a.id!=='string'||ids.has(a.id)||!['available','missing'].includes(a.status))throw Error('LOD建筑索引无效');ids.add(a.id);if(!Number.isInteger(a.node)||!doc.nodes?.[a.node])throw Error('LOD节点缺失');}
 const values=index=>{const a=doc.accessors?.[index];if(!a)throw Error('LOD属性索引无效');const view=doc.bufferViews[a.bufferView],offset=(view.byteOffset||0)+(a.byteOffset||0),n=a.count*(a.type==='VEC3'?3:1),d=new DataView(bin.buffer,bin.byteOffset,bin.byteLength),out=[];for(let i=0;i<n;i++){const p=offset+i*(a.componentType===5123?2:4),v=a.componentType===5126?d.getFloat32(p,true):a.componentType===5123?d.getUint16(p,true):d.getUint32(p,true);if(!Number.isFinite(v))throw Error('LOD含无效坐标');out.push(v);}return out;};
 for(const mesh of doc.meshes||[])for(const p of mesh.primitives||[]){const a=doc.accessors?.[p.attributes?.POSITION],ix=doc.accessors?.[p.indices];if(!a||a.type!=='VEC3'||a.componentType!==5126||!ix||ix.type!=='SCALAR'||![5123,5125].includes(ix.componentType)||ix.count%3)throw Error('LOD三角面格式无效');values(p.attributes.POSITION);if(values(p.indices).some(n=>n>=a.count))throw Error('LOD顶点索引越界');}
 return {doc,bin,meta};
}
export async function attachLodFiles(packs,files){
 if(!packs.length&&!files.length)return [];
 const merged=packs.map(p=>({...p,...(p.lods?{lods:{...p.lods}}:{})})),seen=new Set();
 for(const file of files){if(file.size>256*1024*1024)throw Error('LOD文件超过256MB');let ref,meta,bytes;if(file.nativeId){ref=await registerNativeLod(file);meta=nativeLodResources.get(ref).meta;}else{bytes=new Uint8Array(await file.arrayBuffer());meta=readLodGlb(bytes).meta;}const pack=merged.find(p=>p.id===meta.packId);if(!pack)throw Error('LOD与投影资产包编号不匹配：'+meta.packId);const key=pack.id+':'+meta.lod;if(seen.has(key))throw Error('同一级LOD重复选择');seen.add(key);const ids=new Set(pack.assets.map(a=>a.id));if(meta.assets.length!==ids.size||meta.assets.some(a=>!ids.has(a.id)))throw Error('LOD建筑编号与投影不一致，请使用同次提取的文件');(pack.lods??={})[meta.lod]=ref||'data:model/gltf-binary;base64,'+toBase64(bytes);}
 for(const p of merged)if(p.lods?.lod1&&!p.lods?.lod2)throw Error('导入LOD1时必须同时具有LOD2');
 return readBuildingLibrary({format:'cs2-building-assets',version:1,packs:merged});
}
export async function readAssetSelection(files){
 const projections=files.filter(f=>/\.(cs2assets|json)$/i.test(f.name)),lods=files.filter(f=>/\.glb$/i.test(f.name));
 if(projections.length!==1||projections.length+lods.length!==files.length)throw Error('请选择一份投影资产包，可同时选择LOD2和LOD1');
 if(projections[0].size>256*1024*1024)throw Error('投影文件过大');
 return attachLodFiles(readBuildingLibrary(JSON.parse(await projections[0].text())),lods);
}
export function lodBytes(data){if(typeof data!=='string'||!data.startsWith('data:model/gltf-binary;base64,'))throw Error('LOD数据格式无效');return fromBase64(data.split(',')[1]);}
export function buildingBaseHeight(f,sample){return sample(f.poi||f.points[0])+(f.assetPlacement?.heightOffset||0);}
