import test from 'node:test';
import assert from 'node:assert/strict';
import {packProject,unpackProject} from '../src/project-file.js';
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
test('folder saves retain existing library paths, write new packages and a usable manifest',async()=>{
 const writes=new Map();const directory=prefix=>({getDirectoryHandle:async name=>directory(prefix+name+'/'),getFileHandle:async name=>({createWritable:async()=>({write:async data=>writes.set(prefix+name,data),close:async()=>{}})})});
 const pack=BUILTIN_BUILDING_PACKS[1],context={handle:directory(''),name:'Demo',projectFile:'map.cs2map',assetPaths:new Map([[pack.id,'assets/original.cs2assets']]),assetsDirectory:'assets'};
 await saveFolderLibraries(context,[pack,BUILTIN_BUILDING_PACKS[0]]);
 assert.equal(JSON.parse(writes.get('assets/original.cs2assets')).packs[0].id,pack.id);assert.equal(writes.size,3);assert.equal(JSON.parse(writes.get('project.folder.json')).projectFile,'map.cs2map');
});
