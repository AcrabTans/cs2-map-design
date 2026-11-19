import test from 'node:test';
import assert from 'node:assert/strict';
import {createViewportScheduler,createZoomAnimator,wheelZoomFactor} from '../src/network-display.js';

function cameraHarness(){
 const frames=new Map();let time=0,serial=0,view={cx:500,cy:500,scale:1},updates=0;
 const camera=createZoomAnimator(()=>view,next=>{view=next;updates++;},()=>[.5,35],{frame:f=>{frames.set(++serial,f);return serial;},cancelFrame:id=>frames.delete(id),now:()=>time});
 const step=dt=>{time+=dt;const callbacks=[...frames.values()];frames.clear();callbacks.forEach(f=>f(time));};
 const settle=()=>{for(let i=0;i<200&&frames.size;i++)step(16);assert.equal(frames.size,0);};
 return {camera,step,settle,get view(){return view;},get updates(){return updates;},get pending(){return frames.size;}};
}
test('wheel steps animate between scales, accumulate to the exact target and hold the pointer anchor',()=>{
 const h=cameraHarness();h.camera.zoom(1.4,[600,450]);assert.equal(h.view.scale,1);h.step(16);
 assert(h.view.scale>1&&h.view.scale<1.4);
 assert(Math.abs((600-h.view.cx)*h.view.scale-100)<1e-9);
 assert(Math.abs((450-h.view.cy)*h.view.scale+50)<1e-9);
 // A second wheel event uses the outstanding target, not an unfinished frame.
 const point=[h.view.cx+100/h.view.scale,h.view.cy-50/h.view.scale];h.camera.zoom(1.4,point);h.settle();
 assert(Math.abs(h.view.scale-1.96)<1e-9);assert(h.updates>5);
 assert(Math.abs((600-h.view.cx)*h.view.scale-100)<1e-9);
});
test('reverse input responds immediately and cancellation prevents stale camera updates',()=>{
 const h=cameraHarness();h.camera.zoom(4);h.step(16);const scale=h.view.scale;
 h.camera.zoom(.8);h.step(16);assert(h.view.scale<scale);
 h.camera.cancel();const before={...h.view};h.step(1000);assert.deepEqual(h.view,before);assert.equal(h.pending,0);
 h.camera.zoom(1e6);h.settle();assert.equal(h.view.scale,35);
 h.camera.zoom(1e-6);h.settle();assert.equal(h.view.scale,.5);
});
test('zoom duration follows elapsed time on both 60 Hz and 120 Hz displays',()=>{
 const a=cameraHarness(),b=cameraHarness();a.camera.zoom(4);b.camera.zoom(4);
 for(let i=0;i<10;i++)a.step(16);for(let i=0;i<20;i++)b.step(8);
 assert(Math.abs(a.view.scale-b.view.scale)<1e-10);
 assert.equal(wheelZoomFactor(-1,1),wheelZoomFactor(-16,0));
 assert.equal(wheelZoomFactor(-1,2,640),wheelZoomFactor(-640,0));
});
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
