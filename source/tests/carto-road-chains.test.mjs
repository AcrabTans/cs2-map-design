import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeCartoRoadChains,splitCartoRoad} from '../src/carto-road-chains.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {cartoExportRecords,exportCarto} from '../src/carto-export.js';
import {inspectCartoFolder,mergeCartoImport} from '../src/carto.js';
import {readZip} from '../src/archive.js';

const frame=[158853.44317933184,-7168,173189.44317933184,7168];
function road(recordId,points,overrides={}){
 const width=12,attributes={Name:'长街',Asset:'Small Road',Category:'Small',Object:'Road',Direction:'Both',Form:'Normal',Lane:2,Limit:50,Width:width,Length:100,Elevation:recordId,...overrides};
 return {id:'carto-road-'+recordId,kind:'road',type:'local',structure:'ground',width,corridor:20,name:attributes.Name,notes:'',points,attributes,carto:{dataset:'city',recordId,layers:['Network_Centerline'],crs:'EPSG:32631',frame,encoding:'utf-8'}};
}

test('connected matching segments join in geometric order and retain every non-shared node and source attribute',()=>{
 const a=road(1,[[100,100],[150,100],[200,100]]),b=road(2,[[300,100],[250,100],[200,100]]),c=road(3,[[300,100],[400,100]]);
 const {features,removed}=mergeCartoRoadChains([b,a,c]);assert.equal(removed,2);assert.equal(features.length,1);
 const chain=features[0];assert.deepEqual(chain.points,[[100,100],[150,100],[200,100],[250,100],[300,100],[400,100]]);
 assert.deepEqual(splitCartoRoad(chain).map(f=>[f.id,f.points,f.attributes.Elevation]),[a,b,c].map(f=>[f.id,f.points,f.attributes.Elevation]));
 const validated=prepareEditor({...initialProject(),features});
 const exported=cartoExportRecords(validated).records.Network_Centerline;
 assert.equal(exported.length,3);assert.deepEqual(exported.map(r=>r.attributes.Elevation),[1,2,3]);
});

test('ambiguous junctions, incompatible widths/lanes, distinct names, and opposing one-way endpoints stay separate',()=>{
 const sources=[road(1,[[100,100],[200,100]]),road(2,[[200,100],[300,100]]),road(3,[[200,100],[200,200]]),road(4,[[300,100],[400,100]],{Lane:4}),road(5,[[400,100],[500,100]],{Name:'其他街'}),road(6,[[600,100],[700,100]],{Direction:'Forward'}),road(7,[[800,100],[700,100]],{Direction:'Forward'})];
 assert.equal(mergeCartoRoadChains(sources).removed,0);
 const forward=[road(8,[[100,400],[200,400]],{Direction:'Forward'}),road(9,[[200,400],[300,400]],{Direction:'Forward'})];
 assert.deepEqual(mergeCartoRoadChains(forward.reverse()).features[0].points,[[100,400],[200,400],[300,400]]);
});

test('source segment attributes survive Carto export, re-import, and partial outline replacement',async()=>{
 const chain=mergeCartoRoadChains([road(1,[[100,100],[200,100]]),road(2,[[200,100],[300,100]])]).features[0];
 const bytes=exportCarto(prepareEditor({...initialProject(),features:[chain]})).bytes,entries=await readZip(bytes);
 const inspect=omit=>inspectCartoFolder([...entries].filter(([p])=>!p.split('/').at(-1).startsWith(omit+'.')).map(([p,b])=>({name:p.split('/').at(-1),webkitRelativePath:p,size:b.length,arrayBuffer:async()=>b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),text:async()=>new TextDecoder().decode(b)})));
 const complete=await inspect('none');assert.equal(complete.features.length,1);assert.equal(complete.features[0].carto.segments.length,2);
 let p=mergeCartoImport(initialProject(),complete,[]).project;
 p=mergeCartoImport(p,await inspect('Network_Centerline'),[]).project;
 assert.equal(p.features.length,1);assert.deepEqual(p.features[0].carto.segments.map(s=>s.attributes.Elevation),[1,2]);assert.equal(p.features[0].outlineParts.length,2);
});
