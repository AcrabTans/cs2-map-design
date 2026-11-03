export const nativeLodResources=new Map();
export async function registerNativeLod(file,{pack,level}={}){
 const header=new DataView(await file.slice(0,20).arrayBuffer());if(header.byteLength<20||header.getUint32(0,true)!==0x46546c67||header.getUint32(4,true)!==2||header.getUint32(8,true)!==file.size||header.getUint32(16,true)!==0x4e4f534a)throw Error('LOD不是有效GLB文件');
 const length=header.getUint32(12,true);if(length>32*1024*1024||20+length>file.size)throw Error('LOD目录过大或不完整');
 const doc=JSON.parse(await file.slice(20,20+length).text()),meta=doc.extras;let offset=20+length,bytes=0;
 if(offset<file.size){const binHeader=new DataView(await file.slice(offset,offset+8).arrayBuffer());if(binHeader.byteLength!==8||binHeader.getUint32(4,true)!==0x004e4942)throw Error('LOD二进制块缺失');bytes=binHeader.getUint32(0,true);offset+=8;}
 if(offset+bytes!==file.size||meta?.format!=='cs2-building-lod'||meta.version!==1||!['lod1','lod2'].includes(meta.lod)||!Array.isArray(meta.assets)||(doc.buffers||[]).some(b=>b.uri)||(doc.images||[]).length)throw Error('LOD目录格式无效或包含外部资源');
 if(pack&&(meta.packId!==pack.id||meta.lod!==level||meta.assets.length!==pack.assets.length||meta.assets.some(a=>!pack.assets.some(b=>b.id===a.id))))throw Error('工程LOD资源与资产编号不匹配');

 for(const a of doc.accessors||[]){const v=doc.bufferViews?.[a.bufferView],size={5126:4,5125:4,5123:2}[a.componentType],count=a.type==='VEC3'?3:a.type==='SCALAR'?1:0;if(!v||v.buffer!==0||v.byteStride||a.sparse||!size||!count||!Number.isSafeInteger(a.count)||a.count<1||(v.byteOffset||0)+(a.byteOffset||0)+a.count*count*size>bytes||a.count*count*size+(a.byteOffset||0)>v.byteLength)throw Error('LOD属性目录无效');}
 const ref='native-lod:'+file.nativeId;nativeLodResources.set(ref,{file,doc,meta,offset,cacheId:ref,async access(index){const a=doc.accessors[index],v=doc.bufferViews[a.bufferView],size=a.componentType===5123?2:4,count=a.count*(a.type==='VEC3'?3:1),start=offset+(v.byteOffset||0)+(a.byteOffset||0),data=await file.slice(start,start+count*size).arrayBuffer(),Ctor=a.componentType===5126?Float32Array:a.componentType===5123?Uint16Array:Uint32Array,values=new Ctor(data);if(values.some(v=>!Number.isFinite(v)))throw Error('LOD含无效坐标');return values;}});return ref;
}
export async function desktopLodSaveMap(handle,packs){
 const items=[];for(const pack of packs||[])for(const [level,ref]of Object.entries(pack.lods||{})){const r=nativeLodResources.get(ref);if(r&&!ref.startsWith('builtin-lod:'))items.push({ref,fileId:r.file.nativeId,packId:pack.id,level});}
 return items.length?window.mapDesktop.prepareLods(handle.nativeId,items):{};
}
