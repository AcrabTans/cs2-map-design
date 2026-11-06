import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_BUILDING_PACKS} from '../src/building-asset-data.js';
import {buildingPacksFor,validateBuildingPacks,includePlacedAsset,makeBuildingAssetFeature,catalogPage} from '../src/building-assets.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
const builtin=BUILTIN_BUILDING_PACKS.find(p=>p.id==='blob');
test('all 1013 builtins are classified and browsing is paged; projection-only catalog',()=>{
 validateBuildingPacks([builtin]);assert.equal(builtin.assets.length,1013);assert.equal(new Set(builtin.assets.map(a=>a.catalogCategory)).size,20);
 assert(builtin.assets.every(a=>a.catalogCategory&&a.catalogLabel&&a.catalogSubcategory));assert.equal(builtin.lods,undefined);
 assert.equal(catalogPage(builtin).assets.length,32);assert.equal(catalogPage(builtin,{category:'maintenance'}).total,3);assert.equal(catalogPage(builtin,{query:'RoadMaintenanceDepot01'}).assets[0].type,'municipal');
 assert.equal(catalogPage(builtin,{category:'education'}).total,22);
});
test('placing one builtin saves only that asset; reopening keeps the full built-in shelf',async()=>{
 const a=builtin.assets.find(a=>a.code==='ElementarySchool02');const one=includePlacedAsset(prepareEditor(initialProject()),builtin,a);
 assert.equal(one.assetPacks[0].assets.length,1);assert.equal(buildingPacksFor(one).find(p=>p.id==='blob').assets.length,1013);
 const f=makeBuildingAssetFeature(builtin,a,[7000,7000],0,'builtin-school'),saved=await unpackProject(packProject({...one,features:[f]}));
 assert.equal(saved.project.assetPacks[0].assets.length,1);assert.equal(saved.project.assetPacks[0].lods,undefined);assert.equal(saved.project.features[0].type,'education');
 assert.equal(buildingPacksFor(saved.project).find(p=>p.id==='blob').assets.length,1013);
});
test('43 independent-lot extensions keep their parent, existing category and usable projection',()=>{
 const extensions=builtin.assets.filter(a=>a.isExtension);assert.equal(extensions.length,43);
 assert.equal(extensions.filter(a=>a.projectionSource==='ObjectSubAreas').length,4);
 for(const a of extensions){const parent=builtin.assets.find(p=>p.code===a.parentAssetCode);assert(parent);assert.equal(a.type,parent.type);assert.equal(a.catalogCategory,parent.catalogCategory);assert(a.rings.length&&a.area>0);}
 const a=extensions.find(a=>a.code==='HighSchool01 Sports Field');assert.deepEqual(a.lot,[208,160]);
 const f=makeBuildingAssetFeature(builtin,a,[7000,7000],0,'sports-extension');assert.equal(f.attributes.ParentAsset,'HighSchool01');assert.equal(f.attributes.Asset,a.code);
});
