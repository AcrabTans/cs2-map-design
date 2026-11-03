import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor,layerKey,groupForLayer,visibleInEditor} from '../src/model.js';
test('Carto zoning has an independent toggle and manual planning blocks remain in Area',()=>{
 let p=prepareEditor(initialProject());const imported={kind:'zone',carto:{layers:['Zoning_Boundary']}},manual={kind:'zone'};
 assert.equal(layerKey(imported),'zoning:boundary');assert.equal(groupForLayer(layerKey(manual)),'area');
 p.settings.editor.groups.zoning=false;assert.equal(visibleInEditor(p,imported),false);assert.equal(visibleInEditor(p,manual),true);
 p=prepareEditor(p);assert.equal(p.settings.editor.groups.zoning,false);
 p.settings.editor.groups.zoning=true;p.settings.editor.groups.area=false;assert.equal(visibleInEditor(p,imported),true);assert.equal(visibleInEditor(p,manual),false);
 p.settings.editor.layers['zoning:boundary'].visible=false;assert.equal(visibleInEditor(p,imported),false);
});
test('old combined visibility migrates without showing previously hidden zoning',()=>{
 const p=prepareEditor(initialProject());delete p.settings.editor.groups.zoning;delete p.settings.editor.layers['zoning:boundary'];p.settings.editor.layers.zone.visible=false;
 const upgraded=prepareEditor(p);assert.equal(upgraded.settings.editor.layers['zoning:boundary'].visible,false);
});

test('traffic-light POIs are excluded while other transport facilities remain visible',()=>{
 const p=prepareEditor(initialProject());p.settings.editor.layers['building:municipal'].visible=true;const signal={kind:'building',type:'municipal',geometryType:'point',name:'Traffic Light 117642',attributes:{Category:'TrafficLight'}};
 assert.equal(visibleInEditor(p,signal),false);
 assert.equal(visibleInEditor(p,{...signal,name:'红绿灯',attributes:{}}),false);
 assert.equal(visibleInEditor(p,{...signal,name:'Station',attributes:{Category:'StopPassengerTrain'}}),true);
});
