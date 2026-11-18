function lodGlbHeader(bytes,size){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(bytes.length<20||view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||
  view.getUint32(8,true)!==size)throw Error('LOD 文件不是有效的 GLB 2.0');
 const jsonLength=view.getUint32(12,true);
 if(jsonLength<4||jsonLength%4||20+jsonLength>size||view.getUint32(16,true)!==0x4e4f534a)
  throw Error('GLB 模型目录无效');
 return 20+jsonLength;
}

function lodBinaryLength(bytes,length){
 if(bytes.length!==8)throw Error('GLB 缺少网格数据段');
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 if(length<4||length%4||view.getUint32(0,true)!==length||view.getUint32(4,true)!==0x004e4942)
  throw Error('GLB 网格数据段无效');
 return length;
}

export function readCokLodGlb(bytes){
 const jsonEnd=lodGlbHeader(bytes,bytes.length);
 const doc=JSON.parse(new TextDecoder().decode(bytes.subarray(20,jsonEnd)));
 const length=jsonEnd===bytes.length?0:lodBinaryLength(bytes.subarray(jsonEnd,jsonEnd+8),bytes.length-jsonEnd-8);
 const bin=bytes.subarray(jsonEnd+8);
 return indexCokLod(doc,length,(start,end)=>bin.subarray(start,end));
}

export async function openCokLodGlb(file){
 async function slice(start,end){
  const bytes=new Uint8Array(await file.slice(start,end).arrayBuffer());
  if(bytes.length!==end-start)throw Error('LOD 文件长度已改变，请重新加载');
  return bytes;
 }
 const end=lodGlbHeader(await slice(0,Math.min(file.size,20)),file.size);
 if(end>64*1024*1024)throw Error('LOD 模型目录超过 64 MiB');
 const [json,length]=await Promise.all([
  slice(20,end),
  end===file.size?0: slice(end,Math.min(file.size,end+8)).then(bytes=>lodBinaryLength(bytes,file.size-end-8))
 ]);
 const doc=JSON.parse(new TextDecoder().decode(json)),binStart=end+8;
 return indexCokLod(doc,length,(start,stop)=>slice(binStart+start,binStart+stop));
}

function indexCokLod(doc,binLength,read){
 const meta=doc?.extras;
 if(meta?.format!=='cs2-building-lod'||meta.version!==1||!['lod1','lod2'].includes(meta.lod)
  ||!Array.isArray(meta.assets)||!Array.isArray(doc.nodes))throw Error('请选择资产提取工具生成的 LOD 文件');
 if((doc.buffers||[]).some(item=>item.uri)||(doc.images||[]).length||doc.extensionsRequired?.length)throw Error('LOD 含有额外资源或扩展');
 const packs=new Map();
 for(const record of meta.assets){
  const packId=record.packId??meta.packId;
  if(typeof packId!=='string'||typeof record.id!=='string'||!['available','missing'].includes(record.status)||
   !Number.isInteger(record.node)||!doc.nodes[record.node])throw Error('LOD 建筑索引无效');
  if(!packs.has(packId))packs.set(packId,new Map());
  const index=packs.get(packId);
  if(index.has(record.id))throw Error('LOD 建筑编号重复');
  index.set(record.id,record);
 }
 function access(index,type,componentTypes){
  const a=doc.accessors?.[index],v=doc.bufferViews?.[a?.bufferView];
  const Ctor={5126:Float32Array,5125:Uint32Array,5123:Uint16Array}[a?.componentType];
  const first=v?.byteOffset??0,relative=a?.byteOffset??0;
  if(!binLength||!a||!v||a.type!==type||!componentTypes.includes(a.componentType)||v.buffer!==0||v.byteStride||a.sparse||
   !Number.isSafeInteger(a.count)||a.count<1||!Number.isSafeInteger(first)||first<0||
   !Number.isSafeInteger(relative)||relative<0)throw Error('LOD 网格属性无效');
  const count=a.count*(type==='VEC3'?3:1),length=count*Ctor.BYTES_PER_ELEMENT,start=first+relative,end=first+relative+length;
  if(start%Ctor.BYTES_PER_ELEMENT||!Number.isSafeInteger(v.byteLength)||relative+length>v.byteLength||end>binLength||length>96*1024*1024)
   throw Error('LOD 网格范围无效');
  const data=read(start,end),asArray=bytes=>new Ctor(bytes.buffer,bytes.byteOffset,count);
  return data instanceof Uint8Array?asArray(data):data.then(asArray);
 }
 return {doc,lod:meta.lod,packs,access};
}
