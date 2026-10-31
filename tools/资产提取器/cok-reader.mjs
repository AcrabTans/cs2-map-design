import fs from 'node:fs';
import {inflateRawSync,zstdDecompressSync} from 'node:zlib';
import {MeshoptDecoder} from './依赖/vendor/meshopt_decoder.mjs';
const CRC_TABLE=Uint32Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?(n>>>1)^0xedb88320:n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const n of bytes)crc=(crc>>>8)^CRC_TABLE[(crc^n)&255];return (crc^0xffffffff)>>>0;}

export function openCok(file){
 const fd=fs.openSync(file,'r'),length=fs.fstatSync(fd).size;
 const chunk=(offset,size)=>{if(offset<0||size<0||offset+size>length)throw Error('ZIP range invalid');const b=Buffer.alloc(size);let n=0;while(n<size){const got=fs.readSync(fd,b,n,size-n,offset+n);if(!got)throw Error('Truncated ZIP');n+=got;}return b;};
 const safe64=(b,p)=>{const n=b.readBigUInt64LE(p);if(n>BigInt(Number.MAX_SAFE_INTEGER))throw Error('ZIP64 value exceeds safe range');return Number(n);};
 try{
 const tail=chunk(Math.max(0,length-65557),Math.min(length,65557));let eocd=-1;
 for(let i=tail.length-22;i>=0;i--)if(tail.readUInt32LE(i)===0x06054b50&&i+22+tail.readUInt16LE(i+20)===tail.length){eocd=i;break;}
 if(eocd<0)throw Error('ZIP directory not found');
 if(tail.readUInt16LE(eocd+4)||tail.readUInt16LE(eocd+6))throw Error('Split ZIP not supported');
 let count=tail.readUInt16LE(eocd+10),directorySize=tail.readUInt32LE(eocd+12),directoryOffset=tail.readUInt32LE(eocd+16);
 if(count===65535||directorySize===0xffffffff||directoryOffset===0xffffffff){
  const endOffset=length-tail.length+eocd,locator=chunk(endOffset-20,20);
  if(locator.readUInt32LE(0)!==0x07064b50||locator.readUInt32LE(4)!==0||locator.readUInt32LE(16)!==1)throw Error('Invalid or split ZIP64 locator');
  const record=chunk(safe64(locator,8),56);
  if(record.readUInt32LE(0)!==0x06064b50||safe64(record,4)<44||record.readUInt32LE(16)||record.readUInt32LE(20)||safe64(record,24)!==safe64(record,32))throw Error('Invalid or split ZIP64 directory');
  count=safe64(record,32);directorySize=safe64(record,40);directoryOffset=safe64(record,48);
 }
 if(directorySize>256*1024*1024||count>1000000||count*46>directorySize)throw Error('Excessive ZIP directory');
 const bytes=chunk(directoryOffset,directorySize);let at=0;const entries=new Map();
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
 function read(name){const e=entries.get(name);if(!e)throw Error('Missing file '+name);if(e.flags&1||![0,8].includes(e.method)||e.size>256*1024*1024)throw Error('Unsupported ZIP entry');const h=chunk(e.offset,30);if(h.readUInt32LE(0)!==0x04034b50)throw Error('Invalid ZIP entry header');const start=e.offset+30+h.readUInt16LE(26)+h.readUInt16LE(28);let data=chunk(start,e.compressed);if(e.method===8)data=inflateRawSync(data,{maxOutputLength:e.size});if(data.length!==e.size||crc32(data)!==e.crc)throw Error('ZIP CRC mismatch '+name);return data;}

 return {entries,read,close:()=>fs.closeSync(fd)};
 }catch(error){fs.closeSync(fd);throw error;}
}

export function parsePrefab(s){
 let at=0;const ws=()=>{while(/\s/.test(s[at]||'!'))at++;};
 function value(){ws();const ch=s[at];
  if(ch==='{'){at++;const o={},values=[];ws();while(s[at]!=='}'){const v=value();ws();if(typeof v==='string'&&s[at]===':'){at++;o[v]=value();}else values.push(v);ws();if(s[at]===',')at++;else if(s[at]!=='}')throw Error('Expected object delimiter at '+at);ws();}at++;if(values.length)o.$values=values;return o;}
  if(ch==='['){at++;const a=[];ws();while(s[at]!==']'){a.push(value());ws();if(s[at]===',')at++;else if(s[at]!==']')throw Error('Expected array delimiter');ws();}at++;return a;}
  if(ch==='"'){const start=at++;while(at<s.length){if(s[at]==='\\'){at+=2;continue;}if(s[at++]==='"')return JSON.parse(s.slice(start,at));}throw Error('Unterminated string');}
  if(s.startsWith('$fstrref:',at)){at+=9;return {$fstrref:value()};}
  const m=/^(?:true|false|null|-?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/.exec(s.slice(at));if(!m)throw Error('Invalid value at '+at+': '+s.slice(at,at+50));at+=m[0].length;return JSON.parse(m[0]);
 }const out=value();ws();if(at!==s.length)throw Error('Trailing data');return out;
}

export async function decodeGeometry(b){
 await MeshoptDecoder.ready;
 const version=b.readUInt16LE(0),count=b.readUInt32LE(2),flags=b.readUInt32LE(6);
 if(version!==1||flags!==3)throw Error('Unsupported geometry format '+version+' / '+flags);
 if(count>1000)throw Error('Excessive mesh count');const meta=[];
 for(let i=0;i<count;i++){const off=10+i*88;meta.push({formats:b.readBigUInt64LE(off).toString(16),flags:b.readUInt32LE(off+8),sizes:Array.from({length:14},(_,a)=>b.readUInt32LE(off+12+a*4)),indexBytes:b.readUInt32LE(off+68),meshFlags:b.readUInt32LE(off+72),vertexCount:b.readUInt32LE(off+76),indexCount:b.readUInt32LE(off+80),subMeshCount:b.readUInt32LE(off+84)});}
 let at=10+count*88+meta.reduce((n,m)=>n+m.subMeshCount*40,0);const parts=meta.map(m=>({vertexCount:m.vertexCount,indexCount:m.indexCount}));
 for(let i=0;i<count;i++){
  const m=meta[i],d=zstdDecompressSync(b.subarray(at,at+m.indexBytes));at+=m.indexBytes;
  const stride=(m.meshFlags&1)?4:2,out=new Uint8Array(m.indexCount*stride);MeshoptDecoder.decodeIndexBuffer(out,m.indexCount,stride,d);
  const values=stride===2?new Uint16Array(out.buffer):new Uint32Array(out.buffer);let max=0;for(const v of values)max=Math.max(max,v);if(max>=m.vertexCount)throw Error('Index out of range');
  if(m.vertexCount>65536&&stride!==4)throw Error('Large vertex buffer requires 32-bit indices');
  parts[i].indices=Array.from(values);parts[i].indexStride=stride;parts[i].maxReferencedVertex=max;parts[i].referencedVertexCount=new Set(values).size;
 }
 for(let attr=0;attr<14;attr++)for(let i=0;i<count;i++){
  const m=meta[i],size=m.sizes[attr];if(!size)continue;const compressed=b.subarray(at,at+size);at+=size;if(attr!==0)continue;
  if((BigInt('0x'+m.formats)&15n)!==0n)throw Error('Position format is not Float32');
  const d=zstdDecompressSync(compressed),out=new Uint8Array(m.vertexCount*12);MeshoptDecoder.decodeVertexBuffer(out,m.vertexCount,12,d);const floats=new Float32Array(out.buffer);parts[i].vertices=Array.from({length:m.vertexCount},(_,v)=>Array.from(floats.subarray(v*3,v*3+3)));
 }
 if(at!==b.length)throw Error('Unconsumed geometry bytes '+at+'/'+b.length);
 const min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
 for(const p of parts)for(const v of p.vertices)for(let k=0;k<3;k++){if(!Number.isFinite(v[k]))throw Error('Nonfinite position');min[k]=Math.min(min[k],v[k]);max[k]=Math.max(max[k],v[k]);}
 return {meta,bounds:{min,max},parts};
}
