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
   v={$type:type()};if(t<=2){const id=i32();refs.set(id,v);}
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
