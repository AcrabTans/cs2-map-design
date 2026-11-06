import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_BUILDING_PACKS} from '../src/building-asset-data.js';
import {validateBuildingPacks,buildingPacksFor,includePlacedAsset,makeBuildingAssetFeature} from '../src/building-assets.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
test('21 built-in packs preserve 6280 two-dimensional building projections',()=>{
 validateBuildingPacks(BUILTIN_BUILDING_PACKS);
 assert.equal(BUILTIN_BUILDING_PACKS.length,21);
 assert.equal(BUILTIN_BUILDING_PACKS.reduce((n,p)=>n+p.assets.length,0),6280);
 assert.equal(BUILTIN_BUILDING_PACKS.filter(p=>p.builtinGroup==='dlc').length,11);
 assert.equal(BUILTIN_BUILDING_PACKS.filter(p=>p.builtinGroup==='official').length,9);
 assert(BUILTIN_BUILDING_PACKS.every(p=>!p.lods&&p.assets.every(a=>a.rings.length)));
});
test('saving a placed DLC asset keeps only the placed projection',async()=>{
 const p=BUILTIN_BUILDING_PACKS.find(p=>p.id==='citystations'),a=p.assets[0];const project=includePlacedAsset(prepareEditor(initialProject()),p,a);project.features=[makeBuildingAssetFeature(p,a,[7000,7000],0,'dlc-placement')];
 const reopened=await unpackProject(packProject(project));assert.equal(reopened.project.assetPacks.length,1);assert.equal(reopened.project.assetPacks[0].assets.length,1);assert.equal(reopened.project.assetPacks[0].lods,undefined);assert.equal(buildingPacksFor(reopened.project).length,21);
});
