import test from 'node:test';
import assert from 'node:assert/strict';
import {BUILTIN_BUILDING_PACKS} from './fixtures/building-packs.js';
import {buildingPacksFor,readBuildingLibrary,validateBuildingPacks,makeBuildingAssetFeature,buildingAssetLot,buildingAssetFits,rotateBuildingAsset,moveBuildingAsset} from '../src/building-assets.js';
import {prepareEditor,initialProject,SIZE,area} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {cartoExportRecords} from '../src/carto-export.js';
test('catalog contains three building packs with metric footprints',()=>{
 const packs=validateBuildingPacks(BUILTIN_BUILDING_PACKS);assert.equal(packs.length,3);assert.equal(packs[0].assets.length,11);assert.equal(packs[1].assets.length,1);
 assert.equal(packs[2].assets.length,168);
 for(const pack of packs.slice(0,2))for(const a of pack.assets){assert(!/Store|Shelter|Prop/.test(a.code));const f=makeBuildingAssetFeature(pack,a,[6000,7000],0,a.id);assert(buildingAssetFits(f));assert(Math.abs(area(f.points)-a.area)<.2);assert(Math.abs(area(buildingAssetLot(f))-a.lot[0]*a.lot[1])<1e-6);}
});
test('rotation preserves geometry dimensions and template; movement moves both footprint and lot',()=>{
 const p=BUILTIN_BUILDING_PACKS[0],a=p.assets[4],original=structuredClone(a);let f=makeBuildingAssetFeature(p,a,[500,700],0,'one');const before=area(f.points);
 for(let i=0;i<24;i++)f=rotateBuildingAsset(f,f.assetPlacement.rotation+15);
 f.points.forEach((pt,i)=>pt.forEach((v,k)=>assert(Math.abs(v-makeBuildingAssetFeature(p,a,[500,700],0,'one').points[i][k])<1e-7)));
 assert.equal(f.assetPlacement.rotation,0);assert(Math.abs(area(f.points)-before)<1e-5);const moved=moveBuildingAsset(f,[900,1200]);assert.deepEqual(moved.poi,[900,1200]);assert(Math.abs(buildingAssetLot(moved)[0][0]-buildingAssetLot(f)[0][0]-400)<1e-6);assert.deepEqual(a,original);
});
test('out of bounds lot is rejected even when building footprint itself could fit',()=>{
 const p=BUILTIN_BUILDING_PACKS[0],a=p.assets[0],f=makeBuildingAssetFeature(p,a,[12,20],0,'edge');assert(!buildingAssetFits(f,SIZE));assert.throws(()=>prepareEditor({...initialProject(),features:[f]}),/占地超出/);
 const rotated=rotateBuildingAsset(makeBuildingAssetFeature(p,a,[19.2,19.2],0,'edge'),45);assert(!buildingAssetFits(rotated));
});
test('import and project roundtrip retain custom catalog, placement and independent instances',async()=>{
 const custom=structuredClone(BUILTIN_BUILDING_PACKS[1]);custom.id='custom-demo';custom.name='测试资产包';const imported=readBuildingLibrary({format:'cs2-building-assets',version:1,packs:[custom]});
 const one=makeBuildingAssetFeature(custom,custom.assets[0],[3000,4000],30,'one'),two=makeBuildingAssetFeature(custom,custom.assets[0],[3500,4200],75,'two');one.name='自定义建筑名';
 const p=prepareEditor({...initialProject(),assetPacks:imported,features:[one,two]});const doc=await unpackProject(packProject(p));assert.deepEqual(doc.project.features,p.features);assert.deepEqual(doc.project.assetPacks,imported);assert.equal(buildingPacksFor(doc.project).length,1);
 const moved=moveBuildingAsset(doc.project.features[0],[3001,4001]);assert.notDeepEqual(moved.points,doc.project.features[1].points);assert.equal(doc.project.features[1].assetPlacement.rotation,75);
 const records=cartoExportRecords(p).records;assert.equal(records.Building_Boundary.length,2);assert.equal(records.POI_Location.length,2);assert.equal(records.Building_Boundary[0].attributes.Asset,custom.assets[0].code);
});
test('malformed catalogs and placement metadata cannot enter a project',()=>{
 assert.throws(()=>readBuildingLibrary({format:'cs2-building-assets',version:1,packs:[]}),/包含建筑/);
 const bad=structuredClone(BUILTIN_BUILDING_PACKS);bad[0].assets[0].height=-1;assert.throws(()=>validateBuildingPacks(bad),/高度/);
 const p=BUILTIN_BUILDING_PACKS[0],f=makeBuildingAssetFeature(p,p.assets[0],[4000,5000],0,'one');f.assetPlacement.rotation=Infinity;assert.throws(()=>prepareEditor({...initialProject(),features:[f]}),/摆放信息/);
});

test('population capacities keep missing values blank, preserve explicit zero and survive project saves',async()=>{
 const legacy=structuredClone(BUILTIN_BUILDING_PACKS[1]);delete legacy.assets[0].maxResidents;delete legacy.assets[0].maxEmployees;
 const blank=readBuildingLibrary({format:'cs2-building-assets',version:1,packs:[legacy]});assert.equal(blank[0].assets[0].maxResidents,null);assert.equal(blank[0].assets[0].maxEmployees,null);assert.equal(legacy.assets[0].maxResidents,undefined);
 const a=blank[0].assets[0];a.maxResidents=0;a.maxEmployees=85;
 const known=makeBuildingAssetFeature(blank[0],a,[4000,5000],15,'known'),unknown=makeBuildingAssetFeature(legacy,legacy.assets[0],[5000,6000],0,'unknown');
 const doc=await unpackProject(packProject({...initialProject(),assetPacks:blank,features:[known,unknown]}));
 assert.equal(doc.project.features[0].assetPlacement.maxResidents,0);assert.equal(doc.project.features[0].assetPlacement.maxEmployees,85);assert.equal(doc.project.assetPacks[0].assets[0].maxEmployees,85);assert.equal(doc.project.features[1].assetPlacement.maxResidents,null);assert.equal(doc.project.features[1].assetPlacement.maxEmployees,null);
 const oldInstance=structuredClone(known);delete oldInstance.assetPlacement.maxResidents;delete oldInstance.assetPlacement.maxEmployees;assert.doesNotThrow(()=>prepareEditor({...initialProject(),features:[oldInstance]}));
 for(const value of [-1,1.5,'30',Infinity]){const bad=structuredClone(blank);bad[0].assets[0].maxResidents=value;assert.throws(()=>validateBuildingPacks(bad),/人数上限/);const f=structuredClone(known);f.assetPlacement.maxEmployees=value;assert.throws(()=>prepareEditor({...initialProject(),features:[f]}),/人数上限/);}
});

test('Synthetic buildings retain multipart footprints, exact source codes and capacities after saving',async()=>{
 const pack=BUILTIN_BUILDING_PACKS[2];assert.equal(pack.assets.length,168);assert.equal(pack.assets.filter(a=>a.type==='residential').length,156);
 assert.equal(pack.assets.find(a=>a.code==='SyntheticFacility0').maxEmployees,12);assert.equal(pack.assets.find(a=>a.code==='SyntheticFacility1').maxEmployees,0);assert(pack.assets.every(a=>a.maxResidents===null));
 const features=pack.assets.map((a,i)=>makeBuildingAssetFeature(pack,a,[2000+(i%12)*800,2000+Math.floor(i/12)*700],15*(i%24),String(i)));
 const p=prepareEditor({...initialProject(),assetPacks:[pack],features}),doc=await unpackProject(packProject(p));assert.deepEqual(doc.project.features,p.features);assert.deepEqual(doc.project.assetPacks,p.assetPacks);assert.equal(buildingPacksFor(doc.project).length,1);
 assert(features.some(f=>f.additionalParts?.length>10));assert.equal(cartoExportRecords(p).records.Building_Boundary.length,168);
});


test('asset cleanup protects placements by default and only removes explicitly selected packs',async()=>{
 const {removeProjectAssetPacks}=await import('../src/building-assets.js');
 const project={assetPacks:[{id:'a'},{id:'b'}],features:[{id:'placed',assetPlacement:{packId:'a'}},{id:'road',kind:'road'}]};
 assert.throws(()=>removeProjectAssetPacks(project,['a']),/已摆放/);
 assert.throws(()=>removeProjectAssetPacks(project,['missing']),/已变化/);
 const unused=removeProjectAssetPacks(project,['b']);assert.deepEqual(unused.assetPacks,[{id:'a'}]);assert.equal(unused.features.length,2);
 const removed=removeProjectAssetPacks(project,['a'],{removePlaced:true});assert.deepEqual(removed.assetPacks,[{id:'b'}]);assert.deepEqual(removed.features,[{id:'road',kind:'road'}]);assert.equal(project.features.length,2);assert.equal(project.assetPacks.length,2);
});
