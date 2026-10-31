import test from 'node:test';
import assert from 'node:assert/strict';
import {lightHistorySnapshot,restoreHistorySnapshot} from '../src/desktop-runtime.js';
import {registerNativeLod,nativeLodResources} from '../src/native-lod.js';
import {initialProject} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
test('undo snapshots keep resources outside repeated serialized edit state',()=>{
 const data='data:model/gltf-binary;base64,'+'A'.repeat(4*1024*1024),p={...initialProject(),assetPacks:[{id:'test',name:'Test',lods:{lod2:data},assets:[]}],rasters:[{id:'depth',data:'X'.repeat(1024*1024),opacity:80}]};
 const snap=lightHistorySnapshot(p);assert(snap.state.length<10000);assert.equal(snap.assetPacks[0].lods.lod2,data);p.rasters[0].opacity=10;assert.equal(restoreHistorySnapshot(snap).rasters[0].opacity,80);
});
test('native LOD import reads headers only and accessor requests read a bounded binary slice',async()=>{
 const size=180*1024*1024,positions=Buffer.alloc(36),binSize=128;
 const doc={asset:{version:'2.0'},extras:{format:'cs2-building-lod',version:1,lod:'lod1',packId:'test',assets:[]},buffers:[{byteLength:binSize}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}]};
 let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const header=Buffer.alloc(20),bh=Buffer.alloc(8);header.writeUInt32LE(0x46546c67);header.writeUInt32LE(2,4);header.writeUInt32LE(size,8);header.writeUInt32LE(json.length,12);header.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(size-28-json.length);bh.writeUInt32LE(0x004e4942,4);
 let read=0;const segments=[[0,header],[20,json],[20+json.length,bh],[28+json.length,positions]],file={size,nativeId:'fake-test',slice(start,end){const b=Buffer.alloc(end-start);read+=b.length;for(const [offset,data]of segments){const lo=Math.max(start,offset),hi=Math.min(end,offset+data.length);if(hi>lo)data.copy(b,lo-start,lo-offset,hi-offset);}return {arrayBuffer:async()=>new Uint8Array(b).buffer,text:async()=>b.toString('utf8')};}};
 const ref=await registerNativeLod(file);assert(read<4096);const before=read;assert.equal((await nativeLodResources.get(ref).access(0)).length,9);assert.equal(read-before,36);
});
