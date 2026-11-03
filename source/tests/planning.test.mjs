import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor,originForFeature,visibleInEditor,lockedInEditor} from '../src/model.js';
import {copyAsPlanning,createPlanningProject,mergePlanningProject,checkPlanningFrame} from '../src/planning.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {mergeCartoImport} from '../src/carto.js';
import {makeBuildingAssetFeature} from '../src/building-assets.js';
const frame={bounds:[0,0,14336,14336],crs:'EPSG:32631'};
const metadata=layers=>({dataset:'same-map',recordId:1,encoding:'utf-8',layers,frame:frame.bounds,crs:frame.crs});
const district={id:'game-area',kind:'district',type:'carto',level:'large',name:'Game Area',notes:'',color:'#477c89',points:[[100,100],[2000,100],[2000,2000],[100,2000]],carto:metadata(['Area_Boundary'])};
const road={id:'game-road',kind:'road',type:'arterial',name:'Game Road',notes:'',width:40,corridor:64,structure:'ground',points:[[300,500],[900,500]],districtId:district.id,carto:metadata(['Network_Centerline'])};
const base=()=>prepareEditor({...initialProject(),features:[district,road]});
test('source controls preserve objects; Carto defaults to locked and completed planning is separately hidden',async()=>{
 const p=base();assert.equal(lockedInEditor(p,p.features[1]),true);
 const copied=copyAsPlanning(p,road.id),f=copied.project.features.find(f=>f.id===copied.selectedId);
 assert.equal(originForFeature(f),'planning');assert.equal(lockedInEditor(copied.project,f),false);
 copied.project.settings.editor.origins.carto=false;assert.equal(visibleInEditor(copied.project,road),false);assert.equal(visibleInEditor(copied.project,f),true);
 f.planningStatus='built';assert.equal(visibleInEditor(copied.project,f),false);copied.project.settings.editor.showBuiltPlanning=true;assert.equal(visibleInEditor(copied.project,f),true);
 const saved=await unpackProject(packProject(copied.project));assert.equal(saved.project.features.length,4);assert.equal(saved.project.settings.editor.origins.carto,false);assert.equal(saved.project.settings.editor.showBuiltPlanning,true);
});
test('planning copies include referenced game districts with independent IDs and survive Carto refresh',()=>{
 const p=base(),copied=copyAsPlanning(p,road.id),planned=copied.project.features.find(f=>f.id===copied.selectedId);
 assert.notEqual(planned.districtId,district.id);assert(copied.project.features.some(f=>f.id===planned.districtId&&!f.carto));assert.equal(p.features.length,2);
 const result=mergeCartoImport(copied.project,{dataset:'same-map',sourceLayers:['Network_Centerline'],features:[{...road,id:'new-game-road',name:'Built in Game'}]},[]);
 assert(result.project.features.some(f=>f.id===planned.id));assert(!result.project.features.some(f=>f.id===road.id));assert.equal(result.replaced,1);
 assert.throws(()=>mergeCartoImport(copied.project,{dataset:'another-map',sourceLayers:[],features:[]},[]),/地图范围/);
});
test('standalone planning exports omit game state and basemaps, retain dependencies and overlay idempotently',async()=>{
 const p=base();p.features.push({...road,id:'drawn',name:'Unfinished Plan',carto:undefined});
 const exported=createPlanningProject(p);assert.equal(exported.project.features.length,2);assert(exported.project.features.every(f=>originForFeature(f)==='planning'));assert.equal(exported.project.rasters.length,0);assert.equal(exported.project.settings.base,'none');
 const doc=await unpackProject(packProject(exported.project,{workspace:{kind:'planning-layer',planningFrame:exported.frame}}));
 const merged=mergePlanningProject(base(),doc.project,{frame:doc.workspace.planningFrame});assert.equal(merged.project.features.filter(f=>f.carto).length,2);assert.equal(merged.project.features.length,4);
 const again=mergePlanningProject(merged.project,doc.project,{frame:exported.frame});assert.equal(again.project.features.length,4);assert.equal(again.replaced,2);
 assert.throws(()=>checkPlanningFrame(base(),{...frame,bounds:[10,0,14346,14336]}),/地图范围/);
});
test('planning export carries only referenced full asset packs',()=>{
 const p=base(),asset={id:'a',code:'Synthetic',name:'Test',type:'residential',lot:[16,16],height:8,area:64,rings:[[[-4,-4],[4,-4],[4,4],[-4,4]]]},pack={id:'used',name:'Used',assets:[asset]};
 p.assetPacks=[pack,{...pack,id:'unused'}];p.features.push(makeBuildingAssetFeature(pack,asset,[4000,4000],0,'placed'));
 const exported=createPlanningProject(prepareEditor(p));assert.deepEqual(exported.project.assetPacks.map(p=>p.id),['used']);assert.equal(exported.project.features[0].assetPlacement.assetId,'a');
});

test('Carto refresh freezes imported parent dependencies instead of breaking a hand-drawn subdistrict',()=>{
 const p=base();p.features.push({id:'planned-child',kind:'district',level:'small',name:'Plan',notes:'',color:'#83a67b',points:[[400,400],[800,400],[800,800],[400,800]],parentId:district.id});
 const result=mergeCartoImport(prepareEditor(p),{dataset:'same-map',sourceLayers:['Area_Boundary'],features:[]},[]);
 const child=result.project.features.find(f=>f.id==='planned-child');assert.notEqual(child.parentId,district.id);assert(result.project.features.some(f=>f.id===child.parentId&&!f.carto));assert(!result.project.features.some(f=>f.id===district.id));
});
