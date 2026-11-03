import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor,municipalClass,visibleInEditor,layerKey} from '../src/model.js';
const f=(name,geometryType='point',category='')=>({id:'x',kind:'building',type:'municipal',name,geometryType,attributes:{Category:category},points:geometryType==='point'?[[100,100]]:[[100,100],[110,100],[110,110]],notes:''});
test('municipal facilities, station signs and aviation stops have distinct non-destructive classes',()=>{
 assert.equal(municipalClass(f('机场','polygon','Public, Transportation')),'air-facilities');
 assert.equal(municipalClass(f('轨道总站','polygon')),'rail-facilities');
 assert.equal(municipalClass(f('市中心火车站','point','StopPassengerTrain')),'rail-stops');
 assert.equal(municipalClass(f('机场','point','StopPassengerAirplane')),'air-stops');
 assert.equal(municipalClass(f('MX01 地铁站位预留')),'transit-stops');
 assert.equal(municipalClass(f('UT01 变电与配电站','polygon')),'utilities');
 assert.equal(layerKey(f('机场')),'building:municipal');
});
test('municipal filters persist, signal visibility is opt-in, and parent/source switches still win',()=>{
 let p=prepareEditor(initialProject());p.settings.editor.layers['building:municipal'].visible=true;
 const light=f('Traffic Light 123','point','TrafficLight'),station=f('Station','point','StopPassengerTrain');
 assert.equal(visibleInEditor(p,light),false);assert.equal(visibleInEditor(p,station),true);
 p.settings.editor.municipalVisibility['traffic-lights']=true;p.settings.editor.municipalVisibility['rail-stops']=false;
 p.features=[light];p=prepareEditor(p);assert.equal(visibleInEditor(p,light),true);assert.equal(visibleInEditor(p,station),false);
 p.settings.editor.layers['building:municipal'].visible=false;assert.equal(visibleInEditor(p,light),false);
});
