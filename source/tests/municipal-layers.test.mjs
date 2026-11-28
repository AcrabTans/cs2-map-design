import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor,municipalClass,visibleInEditor,layerKey} from '../src/model.js';
import {municipalMarkerStyle} from '../src/municipal-facilities.js';
import {cartoBuildingType} from '../src/carto.js';
const f=(name,geometryType='point',category='')=>({id:'x',kind:'building',type:'municipal',name,geometryType,attributes:{Category:category},points:geometryType==='point'?[[100,100]]:[[100,100],[110,100],[110,110]],notes:''});
test('municipal facilities, station signs and aviation stops have distinct non-destructive classes',()=>{
 assert.equal(municipalClass(f('机场','polygon','Public, Transportation')),'air-facilities');
 assert.equal(municipalClass(f('轨道总站','polygon')),'rail-facilities');
 assert.equal(municipalClass(f('市中心火车站','point','StopPassengerTrain')),'rail-stops');
 assert.equal(municipalClass(f('机场','point','StopPassengerAirplane')),'air-stops');
 assert.equal(municipalClass(f('MX01 地铁站位预留')),'metro-stops');
 assert.equal(municipalClass(f('UT01 变电与配电站','polygon','Public, Power')),'power-grid');
 assert.equal(layerKey(f('机场')),'building:municipal');
});

test('Carto categories identify transit stops, utility equipment and public-service symbols',()=>{
 const cases=[['城市火车站','StopBus','bus-stops'],['城市火车站','StopSubway','metro-stops'],['电杆','UtilityPylon','power-grid'],['焚烧厂','PowerPlant, Waste','waste'],['处理厂','Sewage, Water','sewage'],['邮箱','PostBox','postal'],['无线电塔','Communication','communications'],['停车场','Public, Parking','parking'],['跨线口','LevelCrossing','level-crossings'],['停机坪','Helipad','helipads']];
 for(const [name,category,id] of cases){
  assert.equal(cartoBuildingType({Name:name,Category:category}),'municipal');
  assert.equal(municipalClass(f(name,'point',category)),id);
  assert.ok(municipalMarkerStyle(id)?.path);
 }
 assert.equal(new Set(cases.map(([, , id])=>municipalMarkerStyle(id).path)).size,cases.length);
 assert.equal(cartoBuildingType({Name:'街角加油站',Category:'StoreGasStation'}),'other');
 const project=prepareEditor(initialProject());
 project.settings.editor.layers['building:municipal'].visible=true;
 project.settings.editor.municipalVisibility={'utilities':false,'transit-stops':false,'metro-stops':true};
 const reopened=prepareEditor(project);
 assert.equal(visibleInEditor(reopened,f('电杆','point','UtilityPylon')),false);
 assert.equal(visibleInEditor(reopened,f('公交','point','StopBus')),false);
 assert.equal(visibleInEditor(reopened,f('地铁','point','StopSubway')),true);
});
test('municipal filters persist, signal visibility is opt-in, and parent/source switches still win',()=>{
 let p=prepareEditor(initialProject());p.settings.editor.layers['building:municipal'].visible=true;
 const light=f('Traffic Light 123','point','TrafficLight'),station=f('Station','point','StopPassengerTrain');
 assert.equal(visibleInEditor(p,light),false);assert.equal(visibleInEditor(p,station),true);
 p.settings.editor.municipalVisibility['traffic-lights']=true;p.settings.editor.municipalVisibility['rail-stops']=false;
 p.features=[light];p=prepareEditor(p);assert.equal(visibleInEditor(p,light),true);assert.equal(visibleInEditor(p,station),false);
 p.settings.editor.layers['building:municipal'].visible=false;assert.equal(visibleInEditor(p,light),false);
});
