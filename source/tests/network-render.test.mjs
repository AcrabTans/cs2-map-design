import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {initialProject,prepareEditor} from '../src/model.js';
import {networkDisplay} from '../src/network-display.js';
import {createCrossingCache} from '../src/edit-performance.js';
import {roadStackLevel,buildNetworkCrossings,junctionSectors,roadFlatEnds} from '../src/network-crossings.js';
const app=fs.readFileSync(new URL('../src/app.js',import.meta.url),'utf8');
const source=app.slice(app.indexOf('function renderNetworkFeature('),app.indexOf('function networkCrossingFields('));
function render(roads){
 const project=prepareEditor(initialProject());project.settings.corridors=false;
 const node=(tag,attrs={},parent)=>{const n={tag,attrs:{...attrs},children:[],setAttribute(k,v){this.attrs[k]=v;}};parent?.children.push(n);return n;};
 const roots=Object.fromEntries(['roadShapes','networkMasks','noteShapes','routeShapes','corridorShapes'].map(id=>[id,node('g')]));
 const pathData=ps=>ps.map((p,i)=>(i?'L':'M')+p.join(',')).join(' ');
 const context={node,$:id=>roots[id],project,view:{scale:1},fitScale:1,selected:null,networkJunctions:[],renderCrossingCache:createCrossingCache(buildNetworkCrossings),networkMaskBounds:{x:0,y:0,width:14336,height:14336},SIZE:14336,networkDisplay,roadStackLevel,buildNetworkCrossings,junctionSectors,roadFlatEnds,pathData,featurePath:f=>pathData(f.points),labelsVisibleInEditor:()=>false};
 vm.createContext(context);vm.runInContext(source,context);context.renderRoadNetwork(roads);
 const flatten=n=>[n,...n.children.flatMap(flatten)];return flatten(roots.roadShapes);
}
const road=(id,points,structure='elevated')=>({id,kind:'road',type:'highway',name:id,points,width:40,corridor:64,structure});
test('joined elevated segments paint both casings below both road surfaces, avoiding dark semicircle seams',()=>{
 const shapes=render([road('a',[[100,500],[500,500]]),road('b',[[500,500],[900,500]])]);
 const edge=shapes.map((n,i)=>n.attrs['data-network-edge']?i:-1).filter(i=>i>=0);
 const fill=shapes.map((n,i)=>n.tag==='path'&&n.attrs['data-network-type']==='highway'&&!n.attrs['data-network-edge']?i:-1).filter(i=>i>=0);
 assert.equal(edge.length,2);assert.equal(fill.length,2);assert(Math.max(...edge)<Math.min(...fill));
});
test('ground roads remain borderless and different elevations retain separate stacking groups',()=>{
 const shapes=render([road('ground',[[100,500],[900,500]],'ground'),road('bridge',[[500,100],[500,900]],'bridge')]);
 assert.equal(shapes.filter(n=>n.attrs['data-network-edge']).length,1);
 assert.deepEqual(shapes.filter(n=>n.attrs['data-network-level']!==undefined).map(n=>n.attrs['data-network-level']),[0,1]);
});

test('a ground to bridge or tunnel continuation has flat faces at the shared endpoint',()=>{
 for(const structure of ['bridge','tunnel']){
  const shapes=render([road('ground',[[100,500],[500,500]],'ground'),road('continued',[[500,500],[900,500]],structure)]);
  const surfaces=shapes.filter(n=>n.tag==='path'&&n.attrs['data-network-type']&&!n.attrs['data-network-edge']);
  assert.equal(surfaces.length,2);assert(surfaces.every(n=>n.attrs['stroke-linecap']==='butt'));
  assert(!shapes.some(n=>n.tag==='circle'&&n.attrs.cx===500));
 }
});

test('a wide terminating branch does not leave a round cap outside the T junction',()=>{
 const main={...road('main',[[100,500],[900,500]],'ground'),width:16};
 const branch={...road('branch',[[500,500],[520,750]],'ground'),type:'arterial',width:48};
 const shapes=render([main,branch]);
 const surface=shapes.find(n=>n.tag==='path'&&n.attrs['data-render-id']==='branch'&&n.attrs['data-network-type']);
 assert.equal(surface.attrs['stroke-linecap'],'butt');
 assert(!shapes.some(n=>n.tag==='circle'&&n.attrs.cx===500&&n.attrs.cy===500));
 assert(shapes.some(n=>n.tag==='circle'&&n.attrs.cx===520&&n.attrs.cy===750));
 assert.equal(shapes.filter(n=>n.attrs['data-junction-sector']).length,3);
});
