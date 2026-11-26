import assert from 'node:assert/strict';
import test from 'node:test';
import {readZip} from '../src/archive.js';
import {packMapData} from '../src/map-data-export.js';
import {initialProject} from '../src/model.js';

function fixtureTiff(size,values){
 const tags=[[256,3,size],[257,3,size],[258,3,16],[273,4,0],[278,4,size],
  [279,4,size*size*2],[339,3,2],[42113,2,7]];
 const noDataOffset=8+2+tags.length*12+4,pixelsOffset=noDataOffset+7;
 tags[3][2]=pixelsOffset;
 const bytes=new Uint8Array(pixelsOffset+size*size*2),view=new DataView(bytes.buffer);
 view.setUint16(0,0x4949);view.setUint16(2,42,true);view.setUint32(4,8,true);
 view.setUint16(8,tags.length,true);
 for(const [index,[number,type,value]] of tags.entries()){
  const offset=10+index*12;
  view.setUint16(offset,number,true);view.setUint16(offset+2,type,true);
  view.setUint32(offset+4,type===2?value:1,true);
  view.setUint32(offset+8,type===2?noDataOffset:value,true);
 }
 bytes.set(new TextEncoder().encode('-32768'),noDataOffset);
 for(let i=0;i<size*size;i++)view.setInt16(pixelsOffset+2*i,values[i%values.length],true);
 return bytes;
}

const decode=(files,name)=>new TextDecoder().decode(files.get(name));

test('map data preserves multipart geometry and aggregates real raster pixels',async()=>{
 const project=initialProject();
 const points=[[50,60],[120,60],[120,130],[50,130]];
 const hole=[[60,70],[70,70],[70,80],[60,80]];
 const frame=[200000,0,200000+project.mapSize,project.mapSize];
 project.features=[
  {id:'park',kind:'zone',type:'park',name:'滨水公园',points,additionalParts:[hole]},
  {id:'road',kind:'road',type:'local',name:'滨河路',points:[[6,3],[8,9]],
   attributes:{Elevation:6},carto:{layers:['Network_Centerline'],frame,crs:'EPSG:32631'}}
 ];
 const elevation=fixtureTiff(64,[-32768,5,10,0]);
 const depth=fixtureTiff(128,[-32768,6,0,2]);
 const {bytes,hasTerrain}=await packMapData(project,new Map([['elevation',elevation],['depth',depth]]));
 assert.equal(hasTerrain,true);
 const files=await readZip(bytes),manifest=JSON.parse(decode(files,'map.json'));
 assert.equal(manifest.objectCount,2);
 assert.equal(manifest.verticalReference.datum,'game-origin');
 assert.deepEqual(manifest.coordinates.projectedFrame,{bounds:frame,crs:'EPSG:32631'});
 assert.equal(manifest.terrainGrid.cellSizeM,224);
 assert.deepEqual(files.get(manifest.terrain.elevation.file),elevation);
 assert.deepEqual(files.get(manifest.terrain.depth.file),depth);
 const byLayer=Object.fromEntries(manifest.layers.map(layer=>[layer.key,JSON.parse(decode(files,layer.file))]));
 assert.deepEqual(byLayer.zone[0].geometry,{type:'polygon',parts:[points,hole]});
 assert.equal(byLayer['road:local'][0].attributes.Elevation,6);
 assert.equal(byLayer['road:local'][0].geometry.parts[0][0].length,2);
 const rows=decode(files,manifest.terrainGrid.file).trimEnd().split('\n');
 assert.equal(rows.length,4097);
 assert.equal(rows[1],'0,0,112,112,,,,0.5,6');
 assert.equal(rows[2],'0,1,336,112,5,5,5,0.5,2');
});

test('previews alone do not provide numeric terrain',async()=>{
 const project=initialProject();
 project.rasters=[{id:'elevation',data:'preview'}];
 const {bytes,hasTerrain}=await packMapData(project,new Map());
 const files=await readZip(bytes),manifest=JSON.parse(decode(files,'map.json'));
 assert.equal(hasTerrain,false);
 assert.equal(manifest.verticalReference.seaLevelEstimateM,null);
 assert.deepEqual(manifest.terrain,{elevation:{status:'preview-only'},depth:{status:'missing'}});
 assert.equal(manifest.terrainGrid,null);
 assert.deepEqual([...files.keys()],['map.json','README.md']);
});
