import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor,originForFeature,visibleInEditor,lockedInEditor} from '../src/model.js';
import {copyAsPlanning,createPlanningProject,mergePlanningProject,checkPlanningFrame,pickDistrict,districtPlanningStats} from '../src/planning.js';
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

test('district picking prefers nested small districts and accepts nearby edges',()=>{
 const large={kind:'district',id:'large',points:[[0,0],[100,0],[100,100],[0,100]]};
 const small={kind:'district',id:'small',level:'small',points:[[20,20],[80,20],[80,80],[20,80]]};
 assert.equal(pickDistrict([small,large],[50,50],5),small);
 assert.equal(pickDistrict([large,small],[104,50],5),large);
 assert.equal(pickDistrict([large,small],[107,50],5),undefined);
});
test('district statistics clip road length at the boundary and group planning objects',()=>{
 const district={kind:'district',id:'district',points:[[100,100],[300,100],[300,300],[100,300]],additionalParts:[[[180,180],[220,180],[220,220],[180,220]]]};
 const points=[[20,200],[380,200]];
 const features=[district,{kind:'road',type:'local',points},
  {kind:'road',type:'local',points,carto:{layers:['Network_Centerline']}},
  {kind:'zone',type:'villa',points:[[125,125],[145,125],[145,145],[125,145]]},
  {kind:'building',type:'police',geometryType:'point',points:[[200,200]],districtId:'district'},
  {kind:'building',type:'police',geometryType:'point',points:[[200,200]]}];
 const stats=districtPlanningStats({features},district);
 assert.equal(stats.area,38400);
 assert(Math.abs(stats.roads.get('local')-160)<1e-9);
 assert.equal(stats.zones.get('residential'),400);
 assert.equal(stats.buildings.get('police'),1);
});


test('isolated workspaces merge only staged additions and protect reference objects', async ()=>{
 const {mergePlanningWorkspace}=await import('../src/planning.js');
 const original=prepareEditor(initialProject());
 original.features=[{id:'reference',kind:'note',name:'工程现状',notes:'',points:[[200,200]]}];
 const candidate=structuredClone(original);
 candidate.features[0].name='只读参考在测试中被人为改掉';
 candidate.features.push({id:'new-note',kind:'note',name:'主场景',notes:'构图',points:[[300,300]],
  attributes:{PlanStage:'theme'}});
 const options={referenceIds:new Set(['reference']),id:'workspace-id',frame:null};
 const result=mergePlanningWorkspace(original,candidate,options);
 assert.equal(result.count,1);
 assert.equal(original.features.length,1);
 assert.equal(result.project.features[0].name,'工程现状');
 assert.equal(result.project.features[1].attributes.PlanWorkspace,'workspace-id');
 assert.equal(mergePlanningWorkspace(result.project,candidate,options).replaced,1);
 assert.throws(()=>mergePlanningWorkspace(result.project,candidate,{...options,id:'unrelated'}),/编号/);
});
