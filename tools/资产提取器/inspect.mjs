import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import path from 'node:path';
import {openCok} from './cok-reader.mjs';
import {companionPrefabs,isBuildingDefinition,isSurfaceUpgrade,prefabItems,readChineseNames,readPrefab} from './prefab-metadata.mjs';
const source=process.argv[2],work=process.argv[3],blob=openCok(source),peers=[blob,...companionPrefabs(source).map(openCok)];
const entries=[...blob.entries.values()],names=new Set(entries.filter(e=>e.name.endsWith('.Geometry')).map(e=>e.name.replace(/_[a-f0-9]{30,32}\.Geometry$/,'').replace(/_LOD\d+$/,'')));
const cids=new Map(),prefabs=new Map(),geometries=new Map();let binary=0;const binaryBuildings=[];
for(const c of peers)for(const e of c.entries.values()){
 if(e.name.endsWith('.cid'))cids.set(c.read(e.name).toString('utf8').trim(),e.name.slice(0,-4));
 if(e.name.endsWith('.Geometry'))geometries.set(e.name,c);
 if(e.name.endsWith('.Prefab')){const data=c.read(e.name),prefab=readPrefab(data);prefabs.set(e.name,prefab);if(data[0]!==123){binary++;if(String(prefab.$type).includes('BuildingPrefab'))binaryBuildings.push(e.name);}}
}
const ref=o=>cids.get(o?.$fstrref?.replace(/^CID:/,'')),array=prefabItems,part=(p,n)=>array(p.components).find(c=>c.name===n),assets=[],errors=[],excluded=[];
const unityTargets=[...new Set([...prefabs.values()].filter(isBuildingDefinition).flatMap(p=>array(p.m_Meshes).map(m=>m.m_Mesh?.$fstrref).filter(v=>v?.startsWith('UnityGUID:')).map(v=>v.slice(10))))];
let unityModels={};if(unityTargets.length){
 fs.writeFileSync(path.join(work,'unity-model-requests.json'),JSON.stringify(unityTargets));
 const result=spawnSync(process.env.CS2_PYTHON||'python',[fileURLToPath(new URL('read-unity-models.py',import.meta.url)),source,work],{encoding:'utf8',windowsHide:true});
 if(result.status!==0)throw Error('游戏本体模型引用读取失败：'+result.stdout+' '+result.stderr);
 unityModels=JSON.parse(fs.readFileSync(path.join(work,'unity-models.json'),'utf8'));
}
for(const p of prefabs.values())if(isBuildingDefinition(p)){
 const upgrade=part(p,'ServiceUpgrade'),parentNames=upgrade?array(upgrade.m_Buildings).map(v=>prefabs.get(ref(v))?.name).filter(Boolean):[];
 if(isSurfaceUpgrade(p)){excluded.push({name:p.name,reason:'ServiceUpgradeSurfaceOnly: no primary mesh'});continue;}
 try{const meshes=array(p.m_Meshes).map(m=>{const external=unityModels[m.m_Mesh?.$fstrref?.replace(/^UnityGUID:/,'')],r=prefabs.get(ref(m.m_Mesh)),geometry=external?.geometry||ref(r?.m_GeometryAsset);if(!external&&!geometries.has(geometry))throw Error('缺少主模型或外部引用');const q=m.m_Rotation?.value||{x:0,y:0,z:0,w:1},v=m.m_Position||{x:0,y:0,z:0};return {geometry,...(external?{geometrySource:external.geometrySource}:{}),sourceModel:external?.sourceModel||r?.name,position:[v.x,v.y,v.z],rotation:[q.x,q.y,q.z,q.w],bounds:external?.bounds||r.m_Bounds,vertices:external?.vertices??r.m_VertexCount,indices:external?.indices??r.m_IndexCount};});if(!meshes.length)throw Error('没有独立主模型');const w=part(p,'Workplace');let kind=/residential|mixed|lowrent/i.test(p.name)?'residential':/office/i.test(p.name)?'other':/commercial|shop|mall| 3[ABC]$/i.test(p.name)?'commercial':'municipal';if(part(p,'School')||/Library|Academy|Kindergarten/i.test(p.name))kind='education';if(part(p,'Hospital'))kind='hospital';if(part(p,'PoliceStation'))kind='police';if(part(p,'FireStation'))kind='fire';assets.push({id:p.name,name:p.name,type:kind,lot:[p.m_LotWidth*8,p.m_LotDepth*8],maxResidents:null,maxEmployees:Number.isInteger(w?.m_Workplaces)?w.m_Workplaces:null,meshes,...(upgrade?{isExtension:true,parentAssetCode:parentNames[0]||null,parentAssetCodes:parentNames}: {})});}catch(e){errors.push({name:p.name,error:e.message});}
}
const locales=Object.fromEntries([...readChineseNames(peers,path.join(path.dirname(source),'Locale.cok'))].map(([key,value])=>['Assets.NAME['+key+']',value]));
for(const archive of peers)archive.close();
for(const a of assets){const label=locales[`Assets.NAME[${a.name}]`]||'';if(/住宅|住房|商住/.test(label))a.type='residential';else if(/办公/.test(label))a.type='other';else if(/商业|商店/.test(label))a.type='commercial';}
fs.writeFileSync(path.join(work,'index.json'),JSON.stringify({modelGroups:names.size,models:entries.filter(e=>e.name.endsWith('.Geometry')).length,binaryPrefabs:binary,binaryBuildings,excluded,errors}));
fs.writeFileSync(path.join(work,'names.json'),JSON.stringify(locales));
fs.writeFileSync(path.join(work,'direct.json'),JSON.stringify({assets,errors,excluded}));
console.log(JSON.stringify({modelGroups:names.size,directBuildings:assets.length,binaryPrefabs:binary}));
