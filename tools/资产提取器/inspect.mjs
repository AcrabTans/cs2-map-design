import fs from 'node:fs';
import path from 'node:path';
import {openCok,parsePrefab} from './cok-reader.mjs';
import {parseBinaryPrefab} from './binary-prefab.mjs';
const source=process.argv[2],work=process.argv[3],blob=openCok(source),peers=[blob];
const suffix=path.basename(source).replace(/^Blob_/,'');const companion=path.join(path.dirname(source),'Prefabs_'+suffix);if(companion!==source&&fs.existsSync(companion))peers.push(openCok(companion));
const entries=[...blob.entries.values()],names=new Set(entries.filter(e=>e.name.endsWith('.Geometry')).map(e=>e.name.replace(/_[a-f0-9]{30,32}\.Geometry$/,'').replace(/_LOD\d+$/,'')));
const cids=new Map(),prefabs=new Map(),geometries=new Map(),locales={};let binary=0;const binaryBuildings=[];
for(const c of peers)for(const e of c.entries.values()){
 if(e.name.endsWith('.cid'))cids.set(c.read(e.name).toString('utf8').trim(),e.name.slice(0,-4));
 if(e.name.endsWith('.Geometry'))geometries.set(e.name,c);
 if(e.name.endsWith('.Prefab')){const b=c.read(e.name);if(b[0]===123){prefabs.set(e.name,parsePrefab(b.toString('utf8')));}else{binary++;const p=parseBinaryPrefab(b);prefabs.set(e.name,p);if(String(p.$type).includes('BuildingPrefab'))binaryBuildings.push(e.name);}}
}
const ref=o=>cids.get(o?.$fstrref?.replace(/^CID:/,'')),array=o=>o?.$rcontent||[],part=(p,n)=>array(p.components).find(c=>c.name===n),assets=[],errors=[],excluded=[];
for(const [file,p]of prefabs)if(String(p.$type).includes('BuildingPrefab')&&p.m_LotWidth>0&&p.m_LotDepth>0){
 if(part(p,'ServiceUpgrade')){excluded.push({name:p.name,reason:'ServiceUpgrade'});continue;}
 try{const meshes=array(p.m_Meshes).map(m=>{const r=prefabs.get(ref(m.m_Mesh)),geometry=ref(r?.m_GeometryAsset);if(!geometries.has(geometry))throw Error('缺少主模型或外部引用');const q=m.m_Rotation?.value||{x:0,y:0,z:0,w:1},v=m.m_Position||{x:0,y:0,z:0};return {geometry,position:[v.x,v.y,v.z],rotation:[q.x,q.y,q.z,q.w],bounds:r.m_Bounds,vertices:r.m_VertexCount,indices:r.m_IndexCount};});if(!meshes.length)throw Error('没有独立主模型');const w=part(p,'Workplace');let kind=/residential|mixed|lowrent/i.test(p.name)?'residential':/office/i.test(p.name)?'other':/commercial|shop|mall| 3[ABC]$/i.test(p.name)?'commercial':'municipal';if(part(p,'School')||/Library|Academy|Kindergarten/i.test(p.name))kind='education';if(part(p,'Hospital'))kind='hospital';if(part(p,'PoliceStation'))kind='police';if(part(p,'FireStation'))kind='fire';assets.push({id:p.name,name:p.name,type:kind,lot:[p.m_LotWidth*8,p.m_LotDepth*8],maxResidents:null,maxEmployees:Number.isInteger(w?.m_Workplaces)?w.m_Workplaces:null,meshes});}catch(e){errors.push({name:p.name,error:e.message});}
}
for(const c of [...peers,...(fs.existsSync(path.join(path.dirname(source),'Locale.cok'))?[openCok(path.join(path.dirname(source),'Locale.cok'))]:[])])for(const e of c.entries.values())if(e.name.endsWith('.loc')&&(/zh-HANS/.test(e.name)||peers.includes(c))){
 try{const b=c.read(e.name);let at=2;function str(){let n=0,s=0,v;do{v=b[at++];n|=(v&127)<<s;s+=7;if(s>28)throw Error('string');}while(v&128);const x=b.subarray(at,at+n).toString('utf8');at+=n;return x;}str();const code=str();str();const count=b.readUInt32LE(at);at+=4;for(let i=0;i<count;i++){const k=str(),v=str();if(code==='zh-HANS'&&k.startsWith('Assets.NAME['))locales[k]=v;}}catch{}
}
for(const a of assets){const label=locales[`Assets.NAME[${a.name}]`]||'';if(/住宅|住房|商住/.test(label))a.type='residential';else if(/办公/.test(label))a.type='other';else if(/商业|商店/.test(label))a.type='commercial';}
fs.writeFileSync(path.join(work,'index.json'),JSON.stringify({modelGroups:names.size,models:entries.filter(e=>e.name.endsWith('.Geometry')).length,binaryPrefabs:binary,binaryBuildings,excluded,errors}));
fs.writeFileSync(path.join(work,'names.json'),JSON.stringify(locales));
fs.writeFileSync(path.join(work,'direct.json'),JSON.stringify({assets,errors,excluded}));
console.log(JSON.stringify({modelGroups:names.size,directBuildings:assets.length,binaryPrefabs:binary}));
