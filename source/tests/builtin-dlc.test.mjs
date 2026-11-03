import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {BUILTIN_BUILDING_PACKS} from '../src/building-asset-data.js';
import {validateBuildingPacks,buildingPacksFor,includePlacedAsset,makeBuildingAssetFeature} from '../src/building-assets.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {registerNativeLod,nativeLodResources} from '../src/native-lod.js';
test('21 built-in packs contain 6280 classified assets with no LOD1; DLC model indexes match',async()=>{
 validateBuildingPacks(BUILTIN_BUILDING_PACKS);assert.equal(BUILTIN_BUILDING_PACKS.length,21);assert.equal(BUILTIN_BUILDING_PACKS.reduce((n,p)=>n+p.assets.length,0),6280);
 const dlcs=BUILTIN_BUILDING_PACKS.filter(p=>p.builtinGroup==='dlc');assert.equal(dlcs.length,11);let available=0;
 for(const p of dlcs){assert(p.assets.every(a=>a.catalogCategory&&a.catalogLabel));assert.equal(p.lods.lod1,undefined);
  const data=fs.readFileSync(new URL('../src/assets/'+p.id+'-lod2.glb',import.meta.url));const file={size:data.length,nativeId:'dlc-'+p.id,slice:(a,b)=>({text:async()=>data.subarray(a,b).toString('utf8'),arrayBuffer:async()=>data.subarray(a,b).buffer.slice(data.byteOffset+a,data.byteOffset+b)})};
  const ref=await registerNativeLod(file,{pack:p,level:'lod2'});const r=nativeLodResources.get(ref);assert.equal(r.meta.assets.length,p.assets.length);available+=r.meta.assets.filter(a=>a.status==='available').length;nativeLodResources.delete(ref);
 }assert.equal(available,588);
});
test('saving a placed DLC asset preserves the builtin reference without embedding all DLC assets or models',async()=>{
 const p=BUILTIN_BUILDING_PACKS.find(p=>p.id==='citystations'),a=p.assets[0];const project=includePlacedAsset(prepareEditor(initialProject()),p,a);project.features=[makeBuildingAssetFeature(p,a,[7000,7000],0,'dlc-placement')];
 const reopened=await unpackProject(packProject(project));assert.equal(reopened.project.assetPacks.length,1);assert.equal(reopened.project.assetPacks[0].assets.length,1);assert.equal(reopened.project.assetPacks[0].lods.lod2,p.lods.lod2);assert.equal(buildingPacksFor(reopened.project).length,21);
 const bad=structuredClone(p);bad.lods.lod2='builtin-lod:../../secret:lod2';assert.throws(()=>validateBuildingPacks([bad]));
});

test('nine official region packs ship projections and matching LOD2 only',async()=>{
 const packs=BUILTIN_BUILDING_PACKS.filter(p=>p.builtinGroup==='official');assert.equal(packs.length,9);assert.equal(packs.reduce((n,p)=>n+p.assets.length,0),4675);let count=0;
 for(const p of packs){assert.equal(p.lods.lod1,undefined);const data=fs.readFileSync(new URL('../src/assets/'+p.id+'-lod2.glb',import.meta.url));const file={size:data.length,nativeId:'official-'+p.id,slice:(a,b)=>({text:async()=>data.subarray(a,b).toString('utf8'),arrayBuffer:async()=>data.subarray(a,b).buffer.slice(data.byteOffset+a,data.byteOffset+b)})};const ref=await registerNativeLod(file,{pack:p,level:'lod2'});count+=nativeLodResources.get(ref).meta.assets.filter(a=>a.status==='available').length;nativeLodResources.delete(ref);}
 assert.equal(count,4069);
});
