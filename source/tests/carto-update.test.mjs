import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor} from '../src/model.js';
import {exportCarto,cartoExportRecords,packCartoRecords} from '../src/carto-export.js';
import {readZip} from '../src/archive.js';
import {inspectCartoFolder,mergeCartoImport} from '../src/carto.js';
const road=(id,y)=>({id,kind:'road',type:'arterial',name:id,notes:'',points:[[100,y],[900,y]],width:40,corridor:64,structure:'ground'});
async function inspect(features,omit=[]){
 const entries=await readZip(exportCarto(prepareEditor({...initialProject(),features})).bytes);
 return inspectCartoFolder([...entries].filter(([path])=>!omit.some(layer=>path.split('/').at(-1).startsWith(layer+'.'))).map(([path,bytes])=>({name:path.split('/').at(-1),webkitRelativePath:path,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>new TextDecoder().decode(bytes)})));
}

test('Carto roundtrips distinguish neighborhood collectors, alleys and paths',async()=>{
 const roads=[
  {...road('collector',200),type:'local-wide',width:24,corridor:34,attributes:{Lane:4}},
  {...road('alley',300),type:'alley',width:8,corridor:12},
  {...road('path',400),type:'path',width:12,corridor:20}
 ];
 const reopened=mergeCartoImport(initialProject(),await inspect(roads),[]).project;
 assert.deepEqual(reopened.features.map(f=>[f.type,f.width]),[['local-wide',24],['alley',8],['path',12]]);
 assert.equal(reopened.features[0].attributes.Lane,4);
});
test('updating a same-map Carto snapshot replaces its old/deleted roads and retains separate hand-drawn planning',async()=>{
 const first=await inspect([road('existing-a',200),road('deleted-in-game',400)]);
 let project=mergeCartoImport(prepareEditor(initialProject()),first,[]).project;
 const planned=road('unfinished-planning',700);project.features.push(planned);
 const next=await inspect([road('existing-a',250),road('newly-built',600)]);
 assert.equal(first.dataset,next.dataset);
 const result=mergeCartoImport(project,next,[]);
 assert.equal(result.replaced,2);assert.equal(result.project.features.length,3);
 assert.deepEqual(result.project.features.find(f=>f.id===planned.id),planned);
 assert(!result.project.features.some(f=>f.name==='deleted-in-game'));
 assert(result.project.features.filter(f=>f.carto).every(f=>f.name!=='unfinished-planning'));
});

test('partial Carto updates keep the other half of paired roads and buildings',async()=>{
 const center=road('test-road',200);
 const building={id:'test-building',kind:'building',type:'other',name:'test-building',notes:'',
  points:[[200,300],[400,300],[400,500],[200,500]],poi:[310,420]};
 const complete=await inspect([center,building]);
 assert.equal(complete.pairedOutlines,1);
 assert.equal(complete.pairedPoi,1);
 const first=mergeCartoImport(initialProject(),complete,[]).project;
 const find=(project,layer)=>project.features.find(f=>f.carto.layers.includes(layer));
 for(const omitted of [['Network_Centerline','Building_Boundary'],['Network_Boundary','POI_Location']]){
  const update=await inspect([center,building],omitted);
  const result=mergeCartoImport(first,update,[]).project;
  const r=find(result,'Network_Centerline'),b=find(result,'Building_Boundary');
  assert.deepEqual(r.carto.layers,['Network_Centerline','Network_Boundary']);
  assert.deepEqual(b.carto.layers,['Building_Boundary','POI_Location']);
  assert.deepEqual(r.points,center.points);
  assert.deepEqual(b.poi,building.poi);
  assert.equal(result.features.length,2);
 }
 const empty=await inspect([],['Network_Centerline','Building_Boundary']);
 const preserved=mergeCartoImport(first,empty,[]).project;
 assert.deepEqual(find(preserved,'Network_Centerline').carto.layers,['Network_Centerline']);
 assert.deepEqual(find(preserved,'Building_Boundary').carto.layers,['Building_Boundary']);
 assert.equal(find(preserved,'Network_Boundary'),undefined);
 assert.equal(find(preserved,'POI_Location'),undefined);
});

test('Carto preview can be reused to package export without accumulating warnings',()=>{
 const project=prepareEditor({...initialProject(),features:[road('one',500)]});
 const preview=cartoExportRecords(project);
 const warnings=[...preview.warnings];
 const terrainFiles=new Map([['depth',new Uint8Array([1,2,3])]]);
 const result=packCartoRecords(preview,{terrainFiles,includeTerrain:true});
 assert.deepEqual(result.bytes,exportCarto(project,{terrainFiles,includeTerrain:true}).bytes);
 assert.deepEqual(preview.warnings,warnings);
});
