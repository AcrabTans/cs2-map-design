import {MeshoptDecoder} from '../../tools/资产提取器/依赖/vendor/meshopt_decoder.mjs';

// COK archive layouts and prefab tags mirror the standalone extractor.
const cokUtf8=new TextDecoder();
class CokBytes extends Uint8Array {
 get view(){return new DataView(this.buffer,this.byteOffset,this.byteLength);}
 readUInt16LE(at=0){return this.view.getUint16(at,true);}
 readUInt32LE(at=0){return this.view.getUint32(at,true);}
 readBigUInt64LE(at=0){return this.view.getBigUint64(at,true);}
 readBigInt64LE(at=0){return this.view.getBigInt64(at,true);}
 readInt32LE(at=0){return this.view.getInt32(at,true);}
 readInt16LE(at=0){return this.view.getInt16(at,true);}
 readInt8(at=0){return this.view.getInt8(at);}
 readFloatLE(at=0){return this.view.getFloat32(at,true);}
 readDoubleLE(at=0){return this.view.getFloat64(at,true);}
 toString(encoding='utf8'){
  if(encoding==='utf16le')return new TextDecoder('utf-16le').decode(this);
  if(encoding==='hex')return Array.from(this,b=>b.toString(16).padStart(2,'0')).join('');
  if(encoding==='latin1'){
   let text='';
   for(let i=0;i<this.length;i+=8192)text+=String.fromCharCode(...this.subarray(i,i+8192));
   return text;
  }
  return cokUtf8.decode(this);
 }
}

const COK_CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
function cokCrc32(bytes){let crc=0xffffffff;for(const n of bytes)crc=(crc>>>8)^COK_CRC_TABLE[(crc^n)&255];return (crc^0xffffffff)>>>0;}

export async function openThirdPartyCok(file){
 const length=file.size;
 const chunk=async(offset,size)=>{
  if(!Number.isSafeInteger(offset)||!Number.isSafeInteger(size)||offset<0||size<0||offset+size>length)throw Error('资产包 ZIP 数据范围无效');
  const bytes=new CokBytes(await file.slice(offset,offset+size).arrayBuffer());
  if(bytes.length!==size)throw Error('资产包读取不完整');
  return bytes;
 };
 const safe64=(b,p)=>{const n=b.readBigUInt64LE(p);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('ZIP64 value exceeds safe range');return Number(n);};
 const tail=await chunk(Math.max(0,length-65557),Math.min(length,65557));let eocd=-1;
 for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){eocd=i;break;}
 if(eocd<0)throw Error('ZIP directory not found');
 if(tail.readUInt16LE(eocd+4)||tail.readUInt16LE(eocd+6))throw Error('Split ZIP not supported');
 let count=tail.readUInt16LE(eocd+10),directorySize=tail.readUInt32LE(eocd+12),directoryOffset=tail.readUInt32LE(eocd+16);
 if(count===65535||directorySize===0xffffffff||directoryOffset===0xffffffff){
  const endOffset=length-tail.length+eocd,locator=await chunk(endOffset-20,20);
  if(locator.readUInt32LE(0)!==0x07064b50||locator.readUInt32LE(4)!==0||locator.readUInt32LE(16)!==1)throw Error('Invalid or split ZIP64 locator');
  const record=await chunk(safe64(locator,8),56);
  if(record.readUInt32LE(0)!==0x06064b50||safe64(record,4)<44||record.readUInt32LE(16)||record.readUInt32LE(20)||safe64(record,24)!==safe64(record,32))throw Error('Invalid or split ZIP64 directory');
  count=safe64(record,32);directorySize=safe64(record,40);directoryOffset=safe64(record,48);
 }
 if(directorySize>256*1024*1024||count>1000000||count*46>directorySize)throw Error('Excessive ZIP directory');
 const bytes=await chunk(directoryOffset,directorySize);let at=0;const entries=new Map();
 for(let i=0;i<count;i++){
  if(bytes.readUInt32LE(at)!==0x02014b50)throw Error('Invalid ZIP directory');
  const flags=bytes.readUInt16LE(at+8),method=bytes.readUInt16LE(at+10),crc=bytes.readUInt32LE(at+16),n=bytes.readUInt16LE(at+28),extra=bytes.readUInt16LE(at+30),comment=bytes.readUInt16LE(at+32),name=bytes.subarray(at+46,at+46+n).toString('utf8');
  let compressed=bytes.readUInt32LE(at+20),size=bytes.readUInt32LE(at+24),offset=bytes.readUInt32LE(at+42),disk=bytes.readUInt16LE(at+34);
  if(at+46+n+extra+comment>bytes.length)throw Error('Truncated ZIP directory');
  if([compressed,size,offset].includes(0xffffffff)||disk===65535){
   let found=false;
   for(let pos=at+46+n,end=pos+extra;pos+4<=end;){
    const tag=bytes.readUInt16LE(pos),len=bytes.readUInt16LE(pos+2);pos+=4;if(pos+len>end)throw Error('Invalid ZIP extra field');
    if(tag===1){let cursor=pos;const next=()=>{if(cursor+8>pos+len)throw Error('Truncated ZIP64 extra');const value=safe64(bytes,cursor);cursor+=8;return value;};
     if(size===0xffffffff)size=next();if(compressed===0xffffffff)compressed=next();if(offset===0xffffffff)offset=next();
     if(disk===65535){if(cursor+4>pos+len)throw Error('Truncated ZIP64 disk');disk=bytes.readUInt32LE(cursor);}found=true;break;
    }pos+=len;
   }if(!found)throw Error('Missing ZIP64 extra');
  }
  if(disk)throw Error('Split ZIP not supported');
  if(entries.has(name))throw Error('Duplicate ZIP path '+name);
  entries.set(name,{name,flags,method,crc,compressed,size,offset});at+=46+n+extra+comment;
 }
 async function read(name){
  const entry=entries.get(name);
  if(!entry||entry.flags&1||![0,8].includes(entry.method)||entry.size>256*1024*1024||entry.compressed>256*1024*1024)throw Error('不支持的资产包条目：'+name);
  const header=await chunk(entry.offset,30);
  if(header.readUInt32LE(0)!==0x04034b50)throw Error('资产包条目头无效');
  const start=entry.offset+30+header.readUInt16LE(26)+header.readUInt16LE(28);
  let data=await chunk(start,entry.compressed);
  if(entry.method===8){
   const reader=new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw')).getReader(),parts=[];
   let length=0;
   try{
    while(true){
     const {value,done}=await reader.read();
     if(done)break;
     length+=value.length;
     if(length>entry.size)throw Error('资产包条目解压长度异常');
     parts.push(value);
    }
   }finally{await reader.cancel().catch(()=>{});}
   data=new CokBytes(length);
   let at=0;
   for(const part of parts){data.set(part,at);at+=part.length;}
  }
  if(data.length!==entry.size||cokCrc32(data)!==entry.crc)throw Error('资产包条目校验失败：'+name);
  return data;
 }
 return {entries,read};
}

export function parsePrefab(s){
 let at=0;const ws=()=>{while(/\s/.test(s[at]||'!'))at++;};
 function value(depth=0){if(depth>150)throw Error('建筑定义嵌套过深');ws();const ch=s[at];
  if(ch==='{'){at++;const o=Object.create(null),values=[];ws();while(s[at]!=='}'){const v=value(depth+1);ws();if(typeof v==='string'&&s[at]===':'){at++;o[v]=value(depth+1);}else values.push(v);ws();if(s[at]===',')at++;else if(s[at]!=='}')throw Error('Expected object delimiter at '+at);ws();}at++;if(values.length)o.$values=values;return o;}
  if(ch==='['){at++;const a=[];ws();while(s[at]!==']'){a.push(value(depth+1));ws();if(s[at]===',')at++;else if(s[at]!==']')throw Error('Expected array delimiter');ws();}at++;return a;}
  if(ch==='"'){const start=at++;while(at<s.length){if(s[at]==='\\'){at+=2;continue;}if(s[at++]==='"')return JSON.parse(s.slice(start,at));}throw Error('Unterminated string');}
  if(s.startsWith('$fstrref:',at)){at+=9;return {$fstrref:value(depth+1)};}
  const m=/^(?:true|false|null|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(at));if(!m)throw Error('Invalid value at '+at+': '+s.slice(at,at+50));at+=m[0].length;return JSON.parse(m[0]);
 }const out=value();ws();if(at!==s.length)throw Error('Trailing data');return out;
}

export async function decodeCokGeometry(b,decompress){
 await MeshoptDecoder.ready;
 const version=b.readUInt16LE(0),count=b.readUInt32LE(2),flags=b.readUInt32LE(6);
 if(version!==1||flags!==3)throw Error('Unsupported geometry format '+version+' / '+flags);
 if(count===0||count>1000)throw Error('Excessive mesh count');const meta=[];
 for(let i=0;i<count;i++){const off=10+i*88;meta.push({formats:b.readBigUInt64LE(off).toString(16),flags:b.readUInt32LE(off+8),sizes:Array.from({length:14},(_,a)=>b.readUInt32LE(off+12+a*4)),indexBytes:b.readUInt32LE(off+68),meshFlags:b.readUInt32LE(off+72),vertexCount:b.readUInt32LE(off+76),indexCount:b.readUInt32LE(off+80),subMeshCount:b.readUInt32LE(off+84)});}
 const decodedSize=meta.reduce((total,m)=>total+m.vertexCount*12+m.indexCount*((m.meshFlags&1)?4:2),0);
 if(decodedSize>128*1024*1024||meta.reduce((total,m)=>total+m.indexCount,0)>3000000)throw Error('模型网格过大');
 let at=10+count*88+meta.reduce((n,m)=>n+m.subMeshCount*40,0);const parts=meta.map(m=>({vertexCount:m.vertexCount,indexCount:m.indexCount}));
 for(let i=0;i<count;i++){
  const m=meta[i],stride=(m.meshFlags&1)?4:2;
  if(!m.indexCount||m.indexCount%3||m.indexCount*stride>96*1024*1024||at+m.indexBytes>b.length)throw Error('无效的模型索引');
  const d=await decompress(b.subarray(at,at+m.indexBytes)),out=new Uint8Array(m.indexCount*stride);at+=m.indexBytes;MeshoptDecoder.decodeIndexBuffer(out,m.indexCount,stride,d);
  const values=stride===2?new Uint16Array(out.buffer):new Uint32Array(out.buffer);let max=0;for(const v of values)max=Math.max(max,v);if(max>=m.vertexCount)throw Error('Index out of range');
  if(m.vertexCount>65536&&stride!==4)throw Error('Large vertex buffer requires 32-bit indices');
  parts[i].indices=values;
 }
 for(let attr=0;attr<14;attr++)for(let i=0;i<count;i++){
  const m=meta[i],size=m.sizes[attr];if(!size)continue;const compressed=b.subarray(at,at+size);at+=size;if(attr!==0)continue;
  if((BigInt('0x'+m.formats)&15n)!==0n)throw Error('Position format is not Float32');
  if(!m.vertexCount||m.vertexCount*12>96*1024*1024)throw Error('模型顶点数量无效');
  const d=await decompress(compressed),out=new Uint8Array(m.vertexCount*12);
  MeshoptDecoder.decodeVertexBuffer(out,m.vertexCount,12,d);parts[i].vertices=new Float32Array(out.buffer);
 }
 if(at!==b.length)throw Error('Unconsumed geometry bytes '+at+'/'+b.length);
 for(const part of parts)if(!part.vertices||part.vertices.some(value=>!Number.isFinite(value)))throw Error('模型顶点数据无效');
 return parts;
}

// Read Odin binary data as inert values: no game types are loaded or executed.
// Format reference: TeamSirenix/odin-serializer, BinaryEntryType/BinaryDataReader.
export function parseBinaryPrefab(b){
 let at=0;const types=new Map(),refs=new Map();
 const take=n=>{if(n<0||at+n>b.length)throw Error('Truncated binary Prefab at '+at);const v=b.subarray(at,at+n);at+=n;return v;};
 const u8=()=>take(1)[0],i32=()=>take(4).readInt32LE(),str=()=>{const flag=u8(),n=i32();if(flag>1||n<0||n>10000000)throw Error('Invalid string');return take(n*(flag+1)).toString(flag?'utf16le':'latin1');};
 function type(){const t=u8();if(t===47){const id=i32(),s=str();types.set(id,s);return s;}if(t===48){const id=i32();if(!types.has(id))throw Error('Missing type '+id);return types.get(id);}if(t===46)return null;throw Error('Invalid type token '+t);}
 function entry(depth=0){
  if(depth>150)throw Error('Prefab nesting too deep');
  const t=u8();let name=null;
  if([1,3,9,11,13,15,17,19,21,23,25,27,29,31,33,35,37,39,41,43,45,50].includes(t))name=str();
  let v;
  if(t>=1&&t<=4){
   v=Object.assign(Object.create(null),{$type:type()});if(t<=2){const id=i32();refs.set(id,v);}
   const values=[];
   while(b[at]!==5){const [k,x]=entry(depth+1);if(k===null)values.push(x);else {if(Object.hasOwn(v,k))throw Error('Duplicate field '+k);v[k]=x;}}
   at++;if(values.length){if(values.length===1&&Array.isArray(values[0]))v.$rcontent=values[0];else v.$values=values;}
  }else if(t===6){const n=Number(take(8).readBigInt64LE());if(n<0||n>1000000)throw Error('Invalid array length');v=[];for(let i=0;i<n;i++){const [k,x]=entry(depth+1);if(k!==null)throw Error('Named array value');v.push(x);}if(u8()!==7)throw Error('Array terminator');
  }else if(t===8){const n=i32(),size=i32();if(n<0||size<1||n*size>256*1024*1024)throw Error('Invalid primitive array');v={$primitive:take(n*size).toString('hex'),size};
  }else if(t===9||t===10){const id=i32();if(!refs.has(id))throw Error('Missing reference '+id);v=refs.get(id);
  }else if(t===11||t===12)v={$index:i32()};
  else if(t===13||t===14||t===41||t===42)v={$guid:take(16).toString('hex')};
  else if(t===15||t===16)v=take(1).readInt8();
  else if(t===17||t===18)v=u8();
  else if(t===19||t===20)v=take(2).readInt16LE();
  else if(t===21||t===22||t===37||t===38)v=take(2).readUInt16LE();
  else if(t===23||t===24)v=i32();
  else if(t===25||t===26)v=take(4).readUInt32LE();
  else if(t===27||t===28)v=Number(take(8).readBigInt64LE());
  else if(t===29||t===30)v=Number(take(8).readBigUInt64LE());
  else if(t===31||t===32)v=take(4).readFloatLE();
  else if(t===33||t===34)v=take(8).readDoubleLE();
  else if(t===35||t===36)v={$decimal:take(16).toString('hex')};
  else if(t===39||t===40)v=str();
  else if(t===43||t===44)v=!!u8();
  else if(t===45||t===46)v=null;
  else if(t===50||t===51)v={$fstrref:str()};
  else throw Error('Unsupported binary token '+t+' at '+(at-1));
  return [name,v];
 }
 const [,root]=entry();if(at!==b.length)throw Error('Unconsumed Prefab bytes '+at+'/'+b.length);return root;
}
