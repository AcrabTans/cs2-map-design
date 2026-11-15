import {BUILTIN_BUILDING_PACKS as installedPacks} from '../src/building-asset-data.js';
import {createZip,readZip} from '../src/archive.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {packProject,packTauriProject,unpackProject} from '../src/project-file.js';
import {initialProject} from '../src/model.js';
import {readProjectFolder,folderRelativePath,saveFolderLibraries} from '../src/project-folder.js';
import {buildingPacksFor} from '../src/building-assets.js';
import {BUILTIN_BUILDING_PACKS} from './fixtures/building-packs.js';
const entry=(path,data)=>({path,file:new File([data],path.split('/').at(-1))});
const library=pack=>JSON.stringify({format:'cs2-building-assets',version:1,packs:[pack]});
test('folder opening loads project-scoped libraries and portable project saves retain them',async()=>{
 const pack=BUILTIN_BUILDING_PACKS[1],p=initialProject();p.title='Folder A';
 const a=await readProjectFolder([entry('a.cs2map',packProject(p)),entry('assets/sample.cs2assets',library(pack))]);
 assert.equal(a.fileName,'a.cs2map');assert.equal(a.project.assetPacks.length,1);assert.equal(a.assetPaths.get(pack.id),'assets/sample.cs2assets');
 assert.equal((await unpackProject(packProject(a.project))).project.assetPacks[0].id,pack.id);
 const b=await readProjectFolder([entry('b.cs2map',packProject(initialProject()))]);assert.equal(b.project.assetPacks.length,0);assert.equal(buildingPacksFor(b.project).some(p=>p.id===pack.id),false);
});
test('rejects ambiguous projects, duplicate asset ids and unsafe paths',async()=>{
 const bytes=packProject(initialProject()),pack=BUILTIN_BUILDING_PACKS[1];
 await assert.rejects(readProjectFolder([entry('a.cs2map',bytes),entry('b.cs2map',bytes)]));
 await assert.rejects(readProjectFolder([entry('a.cs2map',bytes),entry('assets/a.cs2assets',library(pack)),entry('assets/b.cs2assets',library(pack))]),/相同包编号/);
 for(const p of ['../x','/x','C:/x','a\\b'])assert.throws(()=>folderRelativePath(p));
});
test('staged folder libraries become visible only when their paths are committed in the project',async()=>{
 const writes=new Map();
 const directory=prefix=>({
  getDirectoryHandle:async name=>directory(prefix+name+'/'),
  getFileHandle:async name=>({
   getFile:async()=>new File([writes.get(prefix+name)||''],name),
   createWritable:async()=>({write:async data=>writes.set(prefix+name,data),close:async()=>{}})
  })
 });
 const pack=BUILTIN_BUILDING_PACKS[1],context={handle:directory('')};
 const assetFiles=await saveFolderLibraries(context,[pack]);
 assert.deepEqual(await saveFolderLibraries(context,[pack]),assetFiles);
 assert.equal(writes.size,1);
 const assets=[...writes].map(([path,data])=>entry(path,data));
 const open=workspace=>readProjectFolder([entry('map.cs2map',packProject(initialProject(),{workspace})),...assets]);
 assert.equal((await open({})).project.assetPacks.length,0);
 assert.deepEqual((await open({folderAssetFiles:assetFiles})).project.assetPacks.map(p=>p.id),[pack.id]);
 assert.equal((await open({folderAssetFiles:[]})).project.assetPacks.length,0);
});

test('legacy projects open with missing external or embedded LOD and retain the complete 2D asset',async()=>{
 const pack=structuredClone(BUILTIN_BUILDING_PACKS[1]);
 const project=initialProject();project.assetPacks=[pack];
 const original=await readZip(packProject(project));
 const envelope=JSON.parse(new TextDecoder().decode(original.get('project.json')));
 envelope.project.assetPacks[0].lods={lod1:{external:true,path:'old.assets/pack-lod1.glb'},lod2:{path:'Assets/pack-lod2.glb',mime:'model/gltf-binary'}};
 const old=createZip([{name:'project.json',data:new TextEncoder().encode(JSON.stringify(envelope))},{name:'Assets/pack-lod2.glb',data:new Uint8Array([0,1,2])}]);
 const opened=await readProjectFolder([entry('map.cs2map',old),entry('assets/pack-lod2.glb',new Uint8Array([0,1,2]))]);
 assert.deepEqual(opened.project.assetPacks[0].assets,project.assetPacks[0].assets);
 assert.equal(opened.project.assetPacks[0].lods,undefined);
 const resaved=await readZip(packProject(opened.project));
 assert(![...resaved.keys()].some(key=>key.endsWith('.glb')));
});

test('Tauri saves preserve GeoTIFF bytes, third-party assets and modified built-in definitions',async()=>{
 const builtin=installedPacks[0],asset=builtin.assets[0];
 const changed={...builtin.assets[1],name:'Local replacement'};
 const custom=BUILTIN_BUILDING_PACKS[1];
 const project=initialProject();project.assetPacks=[{...builtin,assets:[asset,changed]},custom];
 const terrain=new Uint8Array(8192).fill(13);
 const bytes=await packTauriProject(project,{terrainFiles:new Map([['depth',terrain]])});
 const opened=await unpackProject(bytes);
 assert.deepEqual(opened.terrainFiles.get('depth'),terrain);
 assert.deepEqual(opened.project.assetPacks.map(p=>p.assets.map(a=>a.id)),[[changed.id],custom.assets.map(a=>a.id)]);
 assert(bytes.length<packProject(project,{terrainFiles:new Map([['depth',terrain]])}).length);
});
