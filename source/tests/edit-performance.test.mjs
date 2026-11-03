import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditScheduler,createSnapIndex,createCrossingCache} from '../src/edit-performance.js';
import fs from 'node:fs';
import vm from 'node:vm';
import {networkDisplay} from '../src/network-display.js';
import {initialProject,prepareEditor} from '../src/model.js';
test('drag bursts paint once per frame and release flushes the latest geometry',()=>{
 const callbacks=new Map();let token=0,painted=[],x=0;
 const scheduler=createEditScheduler(()=>painted.push(x),{frame:cb=>{callbacks.set(++token,cb);return token;},cancelFrame:id=>callbacks.delete(id)});
 for(x=1;x<=100;x++)scheduler.schedule();x=100;
 assert.equal(callbacks.size,1);scheduler.flush();assert.deepEqual(painted,[100]);assert.equal(callbacks.size,0);
 scheduler.schedule();scheduler.cancel();assert.equal(callbacks.size,0);
});
test('indexed snapping agrees with a brute force search, excluding hidden and moving features',()=>{
 const fs=Array.from({length:800},(_,i)=>({id:String(i),kind:'road',points:[[i*13,i%30*75],[i*13+10,i%30*75+8]]}));
 fs.push({id:'hidden',kind:'road',points:[[100,100]]},{id:'moving',kind:'road',points:[[100,101]]});
 const visible=f=>f.id!=='hidden',index=createSnapIndex(fs,{visible,exclude:'moving'});
 for(let i=0;i<200;i++){
  const p=[i*51,i%30*70],radius=85;let near=null,best=radius;
  for(const f of fs.filter(f=>visible(f)&&f.id!=='moving'))for(const q of f.points){const d=Math.hypot(q[0]-p[0],q[1]-p[1]);if(d<best){best=d;near=q;}}
  assert.deepEqual(index.nearest(p,radius),near);
 }
});
test('crossing results survive view-only renders but invalidate on edits, visibility and replaced objects',()=>{
 let calls=0;const cache=createCrossingCache(fs=>({calls:++calls,ids:fs.map(f=>f.id)}));
 const a={id:'a',kind:'road'},b={id:'b',kind:'road'};
 assert.equal(cache.get([a,b]),cache.get([a,b]));assert.equal(calls,1);
 cache.invalidate();cache.get([a,b]);assert.equal(calls,2);
 cache.get([a]);assert.equal(calls,3);cache.get([{...a}]);assert.equal(calls,4);
});
test('road drag paints only the edited road, hides its old casing and restores it at release',()=>{
 const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8'),part=app.slice(app.indexOf('function paintDragPreview(){'),app.indexOf('function municipalCounts(){'));
 const project=prepareEditor(initialProject());project.features=[{id:'moving',kind:'road',type:'arterial',structure:'ground',width:40,corridor:72,points:[[100,100],[200,200]],name:'A'}];
 const old={style:{visibility:''}},host={children:[],contains:()=>false,replaceChildren(){this.children=[];}};
 const context={project,drag:{id:'moving',moved:true,kind:'node'},selectedNode:0,view:{scale:1},svg:{querySelectorAll:()=>[old]},$:()=>host,createEditScheduler:paint=>({cancel(){},flush:paint}),networkDisplay,isPolygonFeature:()=>false,featurePath:f=>JSON.stringify(f.points),featureDisplayColor:()=>'',node:(tag,attrs,parent)=>{const n={tag,attrs,children:[]};parent.children.push(n);return n;}};
 vm.createContext(context);vm.runInContext(part,context);
 for(let i=0;i<100;i++){project.features[0].points[0][0]=100+i;context.paintDragPreview();}
 assert.equal(old.style.visibility,'hidden');assert.equal(host.children.length,1);
 assert(host.children[0].children.some(n=>n.attrs.d?.includes('199')));
 context.clearDragPreview();assert.equal(old.style.visibility,'');
});
