import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportScheduler} from '../src/network-display.js';
test('120 navigation events update the camera once per frame and rebuild once after settling',()=>{
 const frames=new Map(),timers=new Map();let serial=0,moves=0,rebuilds=0;
 const scheduler=createViewportScheduler(()=>moves++,()=>rebuilds++,{frame:f=>{frames.set(++serial,f);return serial;},cancelFrame:id=>frames.delete(id),later:f=>{timers.set(++serial,f);return serial;},cancelLater:id=>timers.delete(id)});
 for(let i=0;i<120;i++)scheduler.schedule();
 assert.equal(frames.size,1);assert.equal(timers.size,1);assert.equal(rebuilds,0);
 const draw=[...frames.values()][0];frames.clear();draw();assert.equal(moves,1);assert.equal(rebuilds,0);
 const settle=[...timers.values()][0];timers.clear();settle();assert.equal(rebuilds,1);
 scheduler.schedule();scheduler.cancel();assert.equal(frames.size,0);assert.equal(timers.size,0);
});

test('sublayer colors override display without changing source colors and retain bridge/tunnel shades',async()=>{
 const {initialProject,prepareEditor,featureDisplayColor,roadStyleColors}=await import('../src/model.js');
 const {networkDisplay}=await import('../src/network-display.js');
 let p=prepareEditor(initialProject());const f={kind:'building',type:'education',color:'#112233'};
 p.settings.editor.layers['building:education'].color='#bb9247';assert.equal(featureDisplayColor(p,f),'#bb9247');assert.equal(f.color,'#112233');
 p=prepareEditor(p);assert.equal(featureDisplayColor(p,f),'#bb9247');delete p.settings.editor.layers['building:education'].color;assert.equal(featureDisplayColor(p,f),'#112233');
 const e=p.settings.editor;e.layers['road:highway'].color='#13bb4b';Object.assign(e.roadStyles.highway,roadStyleColors('#13bb4b'));
 const road={kind:'road',type:'highway',color:'#123456',width:40,structure:'bridge'};
 assert.equal(networkDisplay(road,e,1).color,e.roadStyles.highway.elevatedColor);road.structure='tunnel';assert.equal(networkDisplay(road,e,1).color,e.roadStyles.highway.tunnelColor);
 const route={kind:'route',type:'bus',color:'#123456'};e.layers['route:bus'].color='#2695bc';assert.equal(networkDisplay(route,e,1).color,'#2695bc');delete e.layers['route:bus'].color;assert.equal(networkDisplay(route,e,1).color,'#123456');
});
