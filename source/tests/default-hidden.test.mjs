import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor} from '../src/model.js';
import {mergeCartoImport} from '../src/carto.js';
import {packProject,unpackProject} from '../src/project-file.js';
const municipal={id:'m',kind:'building',type:'municipal',geometryType:'point',name:'Utility',notes:'',points:[[500,500]],poi:[500,500],carto:{dataset:'map',layers:['POI_Location'],recordId:1,crs:'EPSG:32631',encoding:'utf-8',frame:[0,0,14336,14336]}};
test('municipal and Zoning start unchecked and Carto import does not auto-enable them',()=>{
 const p=prepareEditor(initialProject());assert.equal(p.settings.editor.groups.zoning,false);assert.equal(p.settings.editor.layers['building:municipal'].visible,false);
 const zoning={id:'z',kind:'zone',type:'villa',name:'Zoning',notes:'',points:[[100,100],[200,100],[200,200]],carto:{...municipal.carto,layers:['Zoning_Boundary']}};
 const result=mergeCartoImport(p,{dataset:'map',features:[municipal,zoning],sourceLayers:['POI_Location','Zoning_Boundary']},[]).project;
 assert.equal(result.settings.editor.groups.zoning,false);assert.equal(result.settings.editor.layers['building:municipal'].visible,false);
});
test('old defaults migrate once; subsequent explicit choices survive project save/open and import',async()=>{
 const old=prepareEditor(initialProject());delete old.settings.editor.visibilityDefaultsVersion;old.settings.editor.groups.zoning=true;old.settings.editor.layers['building:municipal'].visible=true;
 const migrated=prepareEditor(old);assert.equal(migrated.settings.editor.groups.zoning,false);assert.equal(migrated.settings.editor.layers['building:municipal'].visible,false);
 migrated.settings.editor.groups.zoning=true;migrated.settings.editor.layers['building:municipal'].visible=true;
 const saved=await unpackProject(packProject(migrated));assert.equal(saved.project.settings.editor.groups.zoning,true);assert.equal(saved.project.settings.editor.layers['building:municipal'].visible,true);
 const updated=mergeCartoImport(saved.project,{dataset:'map',features:[municipal],sourceLayers:['POI_Location']},[]).project;assert.equal(updated.settings.editor.layers['building:municipal'].visible,true);
});
