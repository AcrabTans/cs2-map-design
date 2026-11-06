const zipTextEncoder=new TextEncoder();
export function crc32(bytes){let crc=0xffffffff;for(const n of bytes){crc^=n;for(let i=0;i<8;i++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}return (crc^0xffffffff)>>>0;}
export function joinBytes(parts){const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let at=0;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
export function createZip(entries){
 const local=[],central=[];let offset=0;
 if(entries.length>65535)throw Error('文件数量超过 ZIP 限制');
 for(const {name,data,deflated}of entries){const path=zipTextEncoder.encode(name),bytes=typeof data==='string'?zipTextEncoder.encode(data):new Uint8Array(data),crc=crc32(bytes);
  const compressed=deflated instanceof Uint8Array&&deflated.length<bytes.length;
  const payload=compressed?deflated:bytes,method=compressed?8:0;
  if(!name||name.includes('..')||name.startsWith('/')||name.includes('\\')||path.length>65535)throw Error('归档文件名无效');
  const head=new Uint8Array(30+path.length),h=new DataView(head.buffer);h.setUint32(0,0x04034b50,true);h.setUint16(4,20,true);h.setUint16(6,0x800,true);h.setUint16(8,method,true);h.setUint32(14,crc,true);h.setUint32(18,payload.length,true);h.setUint32(22,bytes.length,true);h.setUint16(26,path.length,true);head.set(path,30);
  const dir=new Uint8Array(46+path.length),d=new DataView(dir.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(10,method,true);d.setUint32(16,crc,true);d.setUint32(20,payload.length,true);d.setUint32(24,bytes.length,true);d.setUint16(28,path.length,true);d.setUint32(42,offset,true);dir.set(path,46);
  local.push(head,payload);central.push(dir);offset+=head.length+payload.length;
 }
 const directory=joinBytes(central),end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,entries.length,true);v.setUint16(10,entries.length,true);v.setUint32(12,directory.length,true);v.setUint32(16,offset,true);
 return joinBytes([...local,directory,end]);
}
export async function readZip(input,{ignore=()=>false}={}){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input),v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),check=(o,n)=>{if(o<0||o+n>bytes.length)throw Error('工程归档不完整');};
 let end=-1;for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)if(v.getUint32(i,true)===0x06054b50){end=i;break;}if(end<0)throw Error('不是有效的工程归档');
 if(v.getUint16(end+4,true)||v.getUint16(end+6,true))throw Error('不支持分卷工程文件');
 const count=v.getUint16(end+10,true),dirLength=v.getUint32(end+12,true);let at=v.getUint32(end+16,true),total=0;check(at,dirLength);const files=new Map(),names=new Set();
 if(count>5000||at+dirLength>end)throw Error('工程归档目录无效');
 for(let i=0;i<count;i++){
  check(at,46);if(v.getUint32(at,true)!==0x02014b50)throw Error('工程归档目录损坏');const flags=v.getUint16(at+8,true),method=v.getUint16(at+10,true),crc=v.getUint32(at+16,true),compressed=v.getUint32(at+20,true),size=v.getUint32(at+24,true),n=v.getUint16(at+28,true),x=v.getUint16(at+30,true),c=v.getUint16(at+32,true),offset=v.getUint32(at+42,true);check(at,46+n+x+c);
  const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(at+46,at+46+n));at+=46+n+x+c;
  if(!name||name.startsWith('/')||name.includes('..')||name.includes('\\')||names.has(name)||flags&1||![0,8].includes(method))throw Error('工程归档包含无效文件或数据过大');
  check(offset,30);if(v.getUint32(offset,true)!==0x04034b50)throw Error('工程文件条目损坏');const start=offset+30+v.getUint16(offset+26,true)+v.getUint16(offset+28,true);check(start,compressed);names.add(name);if(ignore(name))continue;if((total+=size)>512*1024*1024)throw Error('工程归档数据过大');let data=bytes.slice(start,start+compressed);
  if(method===8){if(typeof DecompressionStream==='undefined')throw Error('当前浏览器不支持此压缩工程，请使用新版 Chrome / Edge');const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),chunks=[];let loaded=0;try{while(true){const {value,done}=await reader.read();if(done)break;if((loaded+=value.length)>size)throw Error('工程压缩数据长度异常');chunks.push(value);}}catch(error){await reader.cancel().catch(()=>{});throw error;}data=joinBytes(chunks);}
  if(data.length!==size||crc32(data)!==crc)throw Error('工程归档校验失败：'+name);if(!name.endsWith('/'))files.set(name,data);
 }
 return files;
}
