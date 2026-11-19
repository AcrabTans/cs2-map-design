import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createZip} from '../src/archive.js';
import {inspectDesktopCokFiles,scanDesktopMods} from '../src/mod-catalog.js';
import {createCokBatch,extractCokPackage,isOfficialModAuthor} from '../src/asset-extractor.js';
import {combineCokLods,encodeCokLod} from '../src/cok-lod.js';
import {openCokLodGlb,readCokLodGlb} from '../src/lod-glb.js';

test('desktop catalog keeps current versions, pairs archives and separates external building models',async()=>{
 const file=(id,name,size)=>({id,name,size,kind:'file'});
 const folder=(id,name)=>({id,name,kind:'directory'});
 const prefab=(name,type,fields)=>({name:name+'.Prefab',data:JSON.stringify({name,$type:'Game.Prefabs.'+type,...fields})});
 const meshRef=$fstrref=>({m_Mesh:{$fstrref}});
 const building=(name,ref)=>prefab(name,'BuildingPrefab',{m_LotWidth:1,m_LotDepth:2,m_Meshes:{$rcontent:[meshRef(ref)]}});
 const blob=createZip([{name:'House.Geometry',data:'geometry'}, {name:'House.Geometry.cid',data:'geometry'}]);
 const defs=createZip([building('House','CID:mesh'),building('External','UnityGUID:outside'),
  prefab('House Mesh','RenderPrefab',{m_GeometryAsset:{$fstrref:'CID:geometry'}}),{name:'House Mesh.Prefab.cid',data:'mesh'},
  prefab('Walkway','PathwayPrefab',{})]);
 const manifest=new TextEncoder().encode(JSON.stringify({displayName:'Traffic',author:'Local Author',isCodeMod:true}));
 const bytes=new Map([['blob',blob],['defs',defs],['manifest',manifest]]);
 const folders={
  root:[folder('old','112_2'),folder('new','112_10'),folder('code','113_1')],
  new:[file('blob','Blob.cok',blob.length),file('defs','Prefabs.cok',defs.length)],
  code:[file('program','Traffic.dll',20),file('manifest','mod.json',manifest.length)]
 };
 const original=globalThis.window;
 const api={assetEntries:async id=>{assert.notEqual(id,'old');return folders[id];},
  assetCacheMods:async()=>[{id:'112',version:'2',author:'Previous Author',title:'Previous Title'},
   {id:'112',version:'10',author:'Current Author',title:'Current Title'}],
  read:async(id,start,end)=>bytes.get(id).slice(start,end)};
 globalThis.window={mapDesktop:api};
 try{
  const rows=await scanDesktopMods(api,folder('root','pdx_mods'),()=>{});
  assert.equal(rows.length,2);
  const pack=rows.find(row=>row.type==='建筑资产');
  assert.equal(pack.mod,'112 / 10');
  assert.equal(pack.modId,'112');
  assert.equal(pack.name,'Current Title');
  assert.equal(pack.author,'Current Author');
  assert.equal(pack.buildingCount,2);
  assert.equal(pack.supported,1);
  const [direct]=await inspectDesktopCokFiles([{...file('defs','import.cok',defs.length),
   modMetadata:{id:'112',version:'10',author:'Current Author',title:'Current Title'}}]);
  assert.equal(direct.name,pack.name);
  assert.equal(direct.buildingCount,2);
  assert.equal(direct.modId,'112');
  assert.deepEqual(pack.otherAssets,[{name:'Walkway',type:'路网'}]);
  assert.deepEqual(pack.notes,['1 栋引用包外游戏本体模型']);
  const attributed={...pack.input,modId:pack.modId,author:pack.author};
  const result=await extractCokPackage(attributed,{},{
   formats:['lod2'],onProgress:()=>{},write:async(name,data)=>{
    assert.match(name,/^Current Title-[a-f0-9]+-lod2\.glb$/);
    const view=new DataView(data.buffer);
    assert.equal(view.getUint32(0,true),0x46546c67);
    assert.equal(view.getUint32(8,true),data.length);
    const json=JSON.parse(new TextDecoder().decode(data.subarray(20,20+view.getUint32(12,true))));
    assert.deepEqual(json.extras.assets.map(a=>[a.name,a.status]),[['House','missing']]);
    assert.equal(json.extras.packAuthor,'Current Author');
    assert.equal(json.extras.modUrl,'https://mods.paradoxplaza.com/mods/112/Windows');
    return name;
   }
  });
  assert.equal(result.results[0].missing,1);
  const writes=[];
  const batch=createCokBatch(async(name,bytes)=>{
   writes.push(name);
   const merged=readCokLodGlb(bytes);
   assert.equal(merged.packs.size,2);
   assert.equal(merged.doc.extras.packSources[0].author,'Current Author');
   assert.equal(merged.doc.extras.packSources[0].modUrl,'https://mods.paradoxplaza.com/mods/112/Windows');
   assert.equal(merged.doc.extras.packSources[1].author,undefined);
   return name;
  });
  const options={formats:['lod1','lod2'],onProgress:()=>{}};
  await batch.collect(attributed,{},options);
  await batch.collect({...pack.input,file:{...pack.input.file,name:'Another.cok'}},{},options);
  assert.deepEqual(writes,[]);
  assert.deepEqual((await batch.finish(()=>{})).map(result=>[result.format,result.packs,result.missing]),[['lod1',2,2],['lod2',2,2]]);
  assert.deepEqual(writes,['合并资产包-lod1.glb','合并资产包-lod2.glb']);
  const program=rows.find(row=>row.mod==='113 / 1');
  assert.equal(program.type,'代码 Mod');
  assert.equal(program.author,'Local Author');
 }finally{globalThis.window=original;}
});

test('combined LOD files keep same-name assets separate and stream only selected geometry',async()=>{
 const part=(packId,x)=>{
  const positions=new Float32Array([x,0,0,x,1,0,x,0,1]),indices=new Uint32Array([0,1,2]);
  const buffers=[new Uint8Array(positions.buffer),new Uint8Array(indices.buffer)];
  const doc={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{children:[1]},{mesh:0}],
   meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],
   accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5125,count:3,type:'SCALAR'}],
   bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:12}],
   extras:{format:'cs2-building-lod',version:1,lod:'lod2',packId,assets:[{id:'House',status:'available',node:0,scene:0}]}};
  return {doc,buffers,length:48,count:1,missing:0};
 };
 const combined=combineCokLods([part('one',1),part('two',2)]);
 const bytes=encodeCokLod(combined),slices=[];
 const {doc,packs,access}=await openCokLodGlb({size:bytes.length,slice(start,end){
  slices.push([start,end]);
  return {arrayBuffer:async()=>bytes.slice(start,end).buffer};
 }});
 const binStart=bytes.length-combined.length;
 assert.deepEqual(slices,[[0,20],[20,binStart-8],[binStart-8,binStart]]);
 for(const [i,id] of ['one','two'].entries()){
  const record=packs.get(id).get('House');
  const node=doc.nodes[doc.nodes[record.node].children[0]];
  const primitive=doc.meshes[node.mesh].primitives[0];
  assert.deepEqual(doc.scenes[record.scene].nodes,[record.node]);
  assert.equal((await access(primitive.attributes.POSITION,'VEC3',[5126]))[0],i+1);
  assert.deepEqual([...(await access(primitive.indices,'SCALAR',[5125]))],[0,1,2]);
  assert.deepEqual(slices.slice(-2),[[binStart+i*48,binStart+i*48+36],[binStart+i*48+36,binStart+(i+1)*48]]);
 }
 assert(isOfficialModAuthor(' Cities: Skylines Official '));
 assert(!isOfficialModAuthor('Cities: Skylines Official Fan'));
});
