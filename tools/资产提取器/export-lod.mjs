import fs from 'node:fs';
import {openCok,decodeGeometry} from './cok-reader.mjs';
const [source,work,output,slug,label,...levels]=process.argv.slice(2);
const z=openCok(source),defs=JSON.parse(fs.readFileSync(work+'/definitions.json','utf8')),names=JSON.parse(fs.readFileSync(work+'/names.json','utf8'));
const stem=name=>name.replace(/_[a-f0-9]{30,32}\.Geometry$/,'');
const geometries=new Map();for(const e of z.entries.values())if(e.name.endsWith('.Geometry')){const k=stem(e.name);if(!geometries.has(k))geometries.set(k,[]);geometries.get(k).push(e.name);}
for(const level of levels){
 if(!['lod1','lod2'].includes(level))throw Error('Invalid LOD');
 const doc={asset:{version:'2.0',generator:'CS2 local asset extractor'},scene:0,scenes:[],nodes:[],meshes:[],accessors:[],bufferViews:[],buffers:[],materials:[{pbrMetallicRoughness:{baseColorFactor:[.65,.72,.74,1],metallicFactor:0,roughnessFactor:1},doubleSided:true}],extras:{format:'cs2-building-lod',version:1,packId:slug,packName:label,lod:level,units:'metres',coordinates:'right-handed Y-up; Z=-gameZ',assets:[]}};
 const buffers=[],shared=new Map();let length=0,available=0;
 function accessor(array,type,componentType,bounds){const data=Buffer.from(array.buffer,array.byteOffset,array.byteLength),pad=(4-length%4)%4;if(pad){buffers.push(Buffer.alloc(pad));length+=pad;}const view=doc.bufferViews.push({buffer:0,byteOffset:length,byteLength:data.length})-1;buffers.push(data);length+=data.length;return doc.accessors.push({bufferView:view,componentType,count:array.length/(type==='VEC3'?3:1),type,...bounds})-1;}
 async function mesh(name){
  if(shared.has(name))return shared.get(name);
  const g=await decodeGeometry(z.read(name)),primitives=[];
  for(const part of g.parts){
   const positions=new Float32Array(part.vertices.length*3),indices=new Uint32Array(part.indices),normals=new Float32Array(positions.length),min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
   part.vertices.forEach((p,i)=>{for(let k=0;k<3;k++){const v=k===2?-p[k]:p[k];positions[i*3+k]=v;min[k]=Math.min(min[k],positions[i*3+k]);max[k]=Math.max(max[k],positions[i*3+k]);}});
   for(let i=0;i<indices.length;i+=3){[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];const a=indices[i]*3,b=indices[i+1]*3,c=indices[i+2]*3,u=[0,1,2].map(k=>positions[b+k]-positions[a+k]),v=[0,1,2].map(k=>positions[c+k]-positions[a+k]),n=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];for(const j of [a,b,c])for(let k=0;k<3;k++)normals[j+k]+=n[k];}
   for(let i=0;i<normals.length;i+=3){const n=Math.hypot(...normals.subarray(i,i+3));if(n)for(let k=0;k<3;k++)normals[i+k]/=n;else normals[i+1]=1;}
   primitives.push({attributes:{POSITION:accessor(positions,'VEC3',5126,{min,max}),NORMAL:accessor(normals,'VEC3',5126)},indices:accessor(indices,'SCALAR',5125),material:0});
  }
  const index=doc.meshes.push({name,primitives})-1;shared.set(name,index);return index;
 }
 for(const a of defs.assets){
  const selected=a.meshes.map(m=>{const base=stem(m.geometry).replace(/_LOD0$/,''),matches=geometries.get(base+'_'+level.toUpperCase())||[];return matches.length===1?matches[0]:null;});
  const metadata={id:a.name,code:a.name,name:names['Assets.NAME['+a.name+']']||a.name,type:a.type,lot:a.lot,maxResidents:a.maxResidents,maxEmployees:a.maxEmployees,status:selected.every(Boolean)?'available':'missing',missingMainMeshes:a.meshes.filter((_,i)=>!selected[i]).map(m=>m.geometry)};
  const children=[];
  if(metadata.status==='available'){
   for(let i=0;i<selected.length;i++){const m=a.meshes[i],q=m.rotation,v=m.position;children.push(doc.nodes.push({mesh:await mesh(selected[i]),translation:[v[0],v[1],-v[2]],rotation:[-q[0],-q[1],q[2],q[3]]})-1);}available++;
  }
  const node=doc.nodes.push({name:a.name,...(children.length?{children}:{}),extras:metadata})-1;
  const scene=doc.scenes.push({name:a.name,nodes:[node],extras:{assetId:a.id,status:metadata.status}})-1;doc.extras.assets.push({...metadata,node,scene});
 }
 const first=doc.extras.assets.find(a=>a.status==='available');if(first)doc.scene=first.scene;
 if(length)doc.buffers=[{byteLength:length}];else{delete doc.buffers;delete doc.bufferViews;delete doc.accessors;delete doc.meshes;}
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bin=Buffer.concat([...buffers,Buffer.alloc((4-length%4)%4)]),total=12+8+json.length+(length?8+bin.length:0);if(total>0xffffffff)throw Error('GLB exceeds 4GB');
 const header=Buffer.alloc(20);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(total,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);const parts=[header,json];if(length){const h=Buffer.alloc(8);h.writeUInt32LE(bin.length);h.writeUInt32LE(0x004e4942,4);parts.push(h,bin);}
 const file=output+'/'+slug+'-'+level+'.glb';fs.writeFileSync(file,Buffer.concat(parts));fs.writeFileSync(work+'/'+level+'-report.json',JSON.stringify({available,missing:defs.assets.length-available,assets:doc.extras.assets.map(a=>({id:a.id,status:a.status,missing:a.missingMainMeshes}))}));console.log(JSON.stringify({lod:level,available,missing:defs.assets.length-available,file}));
}
z.close();
