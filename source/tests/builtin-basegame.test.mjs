import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BUILTIN_BUILDING_PACKS} from '../src/building-asset-data.js';
import {buildingPacksFor,validateBuildingPacks,includePlacedAsset,makeBuildingAssetFeature,catalogPage} from '../src/building-assets.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {registerNativeLod,nativeLodResources} from '../src/native-lod.js';
import {ensureBuiltinLods} from '../src/builtin-lod.js';
import {MapView3D} from '../src/view-3d.js';
import * as THREE from '../src/vendor/three.module.min.js';
const builtin=BUILTIN_BUILDING_PACKS.find(p=>p.id==='blob');
test('all 1013 builtins are classified and browsing is paged; only LOD2 is offered',()=>{
 validateBuildingPacks([builtin]);assert.equal(builtin.assets.length,1013);assert.equal(new Set(builtin.assets.map(a=>a.catalogCategory)).size,20);
 assert(builtin.assets.every(a=>a.catalogCategory&&a.catalogLabel&&a.catalogSubcategory));assert.equal(builtin.lods.lod2,'builtin-lod:blob:lod2');assert.equal(builtin.lods.lod1,undefined);
 assert.equal(catalogPage(builtin).assets.length,32);assert.equal(catalogPage(builtin,{category:'maintenance'}).total,3);assert.equal(catalogPage(builtin,{query:'RoadMaintenanceDepot01'}).assets[0].type,'municipal');
 assert.equal(catalogPage(builtin,{category:'education'}).total,22);
});
test('placing one builtin saves only that asset; reopening keeps the full built-in shelf',async()=>{
 const a=builtin.assets.find(a=>a.code==='ElementarySchool02');const one=includePlacedAsset(prepareEditor(initialProject()),builtin,a);
 assert.equal(one.assetPacks[0].assets.length,1);assert.equal(buildingPacksFor(one).find(p=>p.id==='blob').assets.length,1013);
 const f=makeBuildingAssetFeature(builtin,a,[7000,7000],0,'builtin-school'),saved=await unpackProject(packProject({...one,features:[f]}));
 assert.equal(saved.project.assetPacks[0].assets.length,1);assert.equal(saved.project.assetPacks[0].lods.lod2,'builtin-lod:blob:lod2');assert.equal(saved.project.features[0].type,'education');
 assert.equal(buildingPacksFor(saved.project).find(p=>p.id==='blob').assets.length,1013);
});
test('native bundled LOD directory matches projection IDs; every available asset has valid geometry access',async()=>{
 const data=fs.readFileSync(new URL('../src/assets/blob-lod2.glb',import.meta.url));const file={size:data.length,nativeId:'builtin-test',slice:(a,b)=>({text:async()=>data.subarray(a,b).toString('utf8'),arrayBuffer:async()=>data.subarray(a,b).buffer.slice(data.byteOffset+a,data.byteOffset+b)})};
 const ref=await registerNativeLod(file,{pack:builtin,level:'lod2'}),r=nativeLodResources.get(ref);
 assert.equal(r.meta.assets.length,1013);assert.equal(r.meta.assets.filter(a=>a.status==='available').length,966);
 for(const record of r.meta.assets.filter(a=>a.status==='available')){const root=r.doc.nodes[record.node];assert(root.children?.length);for(const i of root.children){const mesh=r.doc.meshes[r.doc.nodes[i].mesh];for(const p of mesh.primitives){const pos=await r.access(p.attributes.POSITION),ix=await r.access(p.indices);assert(ix.every(i=>i<pos.length/3));}}}
 assert.equal(r.meta.assets.find(a=>a.code==='RoadMaintenanceDepot01').id,'RoadMaintenanceDepot01');nativeLodResources.delete(ref);
});
test('built-in LOD loads on request, reads only directory and placed geometry, and constructs a real 3D school',async()=>{
 const data=fs.readFileSync(new URL('../src/assets/blob-lod2.glb',import.meta.url));let bytes=0,picks=0;const previous=globalThis.window;
 globalThis.window={mapDesktop:{builtinLod:async()=>{picks++;return {id:'builtin-range-test',size:data.length,name:'blob-lod2.glb'};},read:async(id,start=0,end=data.length)=>{bytes+=end-start;return new Uint8Array(data.subarray(start,end));}}};
 try{
  assert(!nativeLodResources.has(builtin.lods.lod2));await ensureBuiltinLods([builtin]);await ensureBuiltinLods([builtin]);assert.equal(picks,1);assert(bytes<data.length/3);
  const viewer=Object.create(MapView3D.prototype);viewer.T=THREE;viewer.glbs=new Map();viewer.meshGeometries=new Map();
  const school=await viewer.lodNode(builtin,'lod2','ElementarySchool02');let meshes=0;school.traverse(n=>{if(n.isMesh){meshes++;assert(n.geometry.getAttribute('position').count>0);}});assert(meshes>0);assert(bytes<data.length/2);
 }finally{globalThis.window=previous;nativeLodResources.delete(builtin.lods.lod2);nativeLodResources.delete('native-lod:builtin-range-test');}
});

test('43 independent-lot extensions keep their parent, existing category and usable projection',()=>{
 const extensions=builtin.assets.filter(a=>a.isExtension);assert.equal(extensions.length,43);
 assert.equal(extensions.filter(a=>a.projectionSource==='ObjectSubAreas').length,4);
 for(const a of extensions){const parent=builtin.assets.find(p=>p.code===a.parentAssetCode);assert(parent);assert.equal(a.type,parent.type);assert.equal(a.catalogCategory,parent.catalogCategory);assert(a.rings.length&&a.area>0);}
 const a=extensions.find(a=>a.code==='HighSchool01 Sports Field');assert.deepEqual(a.lot,[208,160]);
 const f=makeBuildingAssetFeature(builtin,a,[7000,7000],0,'sports-extension');assert.equal(f.attributes.ParentAsset,'HighSchool01');assert.equal(f.attributes.Asset,a.code);
});
