import test from 'node:test';
import assert from 'node:assert/strict';
import {roadStackLevel,buildNetworkCrossings,junctionSectors,crossingRelation} from '../src/network-crossings.js';
import {initialProject,prepareEditor,area} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {exportCarto} from '../src/carto-export.js';
import {readZip} from '../src/archive.js';
import {inspectCartoFolder,mergeCartoImport} from '../src/carto.js';

const road=(id,type,points,extra={})=>({id,kind:'road',type,name:id,notes:'',points,width:40,corridor:64,structure:'ground',...extra});
const a=road('a','arterial',[[300,500],[700,500]]),b=road('b','secondary',[[500,300],[500,700]],{width:28});

test('unequal-width level crossing has four wedges that exactly fill the shared road rectangle',()=>{
 const before=JSON.stringify([a,b]),nodes=buildNetworkCrossings([a,b]);assert.equal(nodes.length,1);assert.deepEqual(nodes[0].point,[500,500]);
 const sectors=junctionSectors(nodes[0],0);assert.equal(sectors.length,4);assert.deepEqual(new Set(sectors.map(s=>s.feature.type)),new Set(['arterial','secondary']));
 assert.equal(sectors.reduce((n,s)=>n+area(s.points),0),40*28);for(const s of sectors){assert.deepEqual(s.points[0],[500,500]);for(const p of s.outer){assert.equal(Math.abs(p[0]-500),14);assert.equal(Math.abs(p[1]-500),20);}}
 assert.equal(JSON.stringify([a,b]),before);assert.equal(crossingRelation(a,b),'connected');
});
test('T junctions, bends at existing vertices and oblique junctions retain one shared node',()=>{
 const t=road('t','local',[[500,500],[500,700]],{width:20}),split={...a,points:[[300,500],[500,500],[700,500]]};
 const nodes=buildNetworkCrossings([split,t]);assert.equal(nodes.length,1);assert.equal(nodes[0].arms.length,3);assert.equal(junctionSectors(nodes[0],0).length,3);
 const oblique=road('o','local',[[350,350],[650,650]],{width:20}),x=buildNetworkCrossings([a,oblique])[0];assert.equal(junctionSectors(x,0).length,4);for(const s of junctionSectors(x,0))for(const p of s.points)assert(p.every(Number.isFinite));
 assert.equal(buildNetworkCrossings([a,road('parallel','local',[[300,510],[700,510]])]).length,0);
});
test('stacking separates ground, elevated and tunnels independently of feature creation order',()=>{
 const above={...b,structure:'elevated'},below={...b,structure:'tunnel'};
 assert.equal(roadStackLevel(a),0);assert.equal(roadStackLevel(above),1);assert.equal(roadStackLevel(below),-1);assert.equal(roadStackLevel({...above,stackLevel:3}),3);assert.equal(roadStackLevel({...above,stackLevel:0}),0);
 for(const pair of [[a,above],[above,a]]){const n=buildNetworkCrossings(pair)[0];assert.equal(junctionSectors(n,0).length,0);assert.equal(junctionSectors(n,1).length,0);}
 assert.equal(crossingRelation(above,a),'above');assert.equal(crossingRelation(a,above),'below');assert.equal(crossingRelation(a,below),'above');
 const third=road('upper','highway',[[300,300],[700,700]],{structure:'bridge'}),n=buildNetworkCrossings([a,b,third])[0];assert.equal(n.roads.length,3);assert.equal(junctionSectors(n,0).length,4);assert.equal(junctionSectors(n,1).length,0);
});
test('rail, subway, waterways and route lines do not become road interchanges',()=>{
 for(const type of ['rail','metro','waterway']){const r={...b,type},n=buildNetworkCrossings([a,r])[0];assert.equal(junctionSectors(n,0).length,0);assert.equal(crossingRelation(a,r),'same-level-crossing');}
 assert.equal(buildNetworkCrossings([a,{...b,kind:'route',type:'metro'}]).length,0);
});
test('acute angles and zero-length segments produce finite bounded sectors',()=>{
 const narrow=road('narrow','local',[[300,499.9],[700,500.1]],{width:20}),n=buildNetworkCrossings([{...a,points:[[300,500],[300,500],[700,500]]},narrow])[0];
 for(const s of junctionSectors(n,0))for(const p of s.points){assert(p.every(Number.isFinite));assert(Math.hypot(p[0]-500,p[1]-500)<=160.00001);}
});
test('custom crossing levels persist through project and Carto export/import, with legacy automatic defaults',async()=>{
 const p=prepareEditor({...initialProject(),features:[{...a,stackLevel:-2},{...b,structure:'bridge',stackLevel:0}]});
 const doc=await unpackProject(packProject(p));assert.deepEqual(doc.project.features,p.features);assert.equal(roadStackLevel(doc.project.features[1]),0);
 const files=await readZip(exportCarto(p).bytes),adapters=[...files].map(([name,bytes])=>({name:name.split('/').at(-1),webkitRelativePath:name,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>new TextDecoder().decode(bytes)}));
 const imported=mergeCartoImport(prepareEditor(initialProject()),await inspectCartoFolder(adapters),[]).project;
 assert.equal(imported.features.find(f=>f.name==='a').stackLevel,-2);assert.equal(imported.features.find(f=>f.name==='b').stackLevel,0);
 for(const stackLevel of [-21,21,.5,'1',null])assert.throws(()=>prepareEditor({...initialProject(),features:[{...a,stackLevel}]}),/交叉层级/);
 assert.doesNotThrow(()=>prepareEditor({...initialProject(),features:[a]}));
});
