import test from 'node:test';
import assert from 'node:assert/strict';
import {createEditScheduler,createSnapIndex,createRoadSegmentIndex,createCrossingCache,createFeatureViewportIndex} from '../src/edit-performance.js';
import fs from 'node:fs';
import vm from 'node:vm';
import {networkDisplay} from '../src/network-display.js';
import {initialProject,prepareEditor,geometryParts,nearestGeometryEdge,insertGeometryNodes} from '../src/model.js';
import {featureHistorySnapshot,restoreFeatureHistory} from '../src/desktop-runtime.js';
test('viewport query keeps crossing features and matches map source ordering',()=>{
 const features=[{id:'outside',kind:'road',points:[[2000,2000],[3000,2000]],width:16,corridor:24},{id:'crossing',kind:'road',points:[[0,500],[10000,500]],width:20,corridor:40},{id:'inside',kind:'building',points:[[500,520],[550,520],[550,550]]},{id:'outline',kind:'building',points:[[3000,3000],[3500,3000],[3500,3200]],outlineParts:[[[500,500],[600,500],[600,600]]]}];
 const index=createFeatureViewportIndex(features);
 assert.deepEqual(index.query([450,490,650,650]).map(f=>f.id),['crossing','inside','outline']);
 assert.deepEqual(index.query([10500,10000,11000,11000]),[]);
});
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
 const context={project,drag:{id:'moving',moved:true,kind:'node'},selectedNode:0,view:{scale:1},svg:{querySelectorAll:()=>[old]},$:()=>host,createEditScheduler:paint=>({cancel(){},flush:paint}),networkDisplay,geometryParts,isPolygonFeature:()=>false,featurePath:f=>JSON.stringify(f.points),featureDisplayColor:()=>'',node:(tag,attrs,parent)=>{const n={tag,attrs,children:[]};parent.children.push(n);return n;}};
 vm.createContext(context);vm.runInContext(part,context);
 for(let i=0;i<100;i++){project.features[0].points[0][0]=100+i;context.paintDragPreview();}
 assert.equal(old.style.visibility,'hidden');assert.equal(host.children.length,1);
 assert(host.children[0].children.some(n=>n.attrs.d?.includes('199')));
 context.clearDragPreview();assert.equal(old.style.visibility,'');
});

test('single-object history restores geometry and removed objects in order without copying neighbours',()=>{
 const first={id:'before'},last={id:'after'};
 const project={features:[first,{id:'edit',name:'Original',points:[[1,2],[3,4]]},last]};
 const before=featureHistorySnapshot(project,'edit');
 project.features[1].name='Renamed';project.features[1].points[0][0]=9;
 const after=restoreFeatureHistory(project,before);
 assert.deepEqual(project.features[1],{id:'edit',name:'Original',points:[[1,2],[3,4]]});
 restoreFeatureHistory(project,after);
 assert.deepEqual(project.features[1],{id:'edit',name:'Renamed',points:[[9,2],[3,4]]});
 const deleted=featureHistorySnapshot(project,'edit');
 project.features.splice(1,1);
 const redo=restoreFeatureHistory(project,deleted);
 assert.deepEqual(project.features.map(f=>f.id),['before','edit','after']);
 restoreFeatureHistory(project,redo);
 assert.deepEqual(project.features,[first,last]);
 assert.equal(project.features[0],first);assert.equal(project.features[1],last);
});

test('road segment snapping inserts distinct junctions in order and keeps the original geometry',()=>{
 const road={id:'road',kind:'road',points:[[100,100],[900,100]],additionalParts:[[[100,400],[900,400]]]};
 const index=createRoadSegmentIndex([road]);
 const a=index.nearest([800,108],20),b=index.nearest([300,98],20);
 const c=index.nearest([600,405],20),endpoint=index.nearest([101,100],20);
 assert.deepEqual(c.point,[600,400]);assert.equal(c.partIndex,1);
 assert.equal(index.nearest([500,250],20),null);
 const edited=insertGeometryNodes(road,[a,b,c,b]);
 assert.deepEqual(edited.points,[[100,100],[300,100],[800,100],[900,100]]);
 assert.deepEqual(edited.additionalParts[0],[[100,400],[600,400],[900,400]]);
 assert.deepEqual(road.points,[[100,100],[900,100]]);
 assert.equal(insertGeometryNodes(road,[{...endpoint,t:0}]),road);
});
test('edge insertion can split the closing edge of a selected district',()=>{
 const district={id:'d',kind:'district',points:[[100,100],[300,100],[300,300],[100,300]]};
 const hit=nearestGeometryEdge(district,[96,180]);
 assert.equal(hit.index,3);
 assert.deepEqual(insertGeometryNodes(district,[hit]).points.at(-1),[100,180]);
});
