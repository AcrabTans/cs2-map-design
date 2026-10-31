import test from 'node:test';
import assert from 'node:assert/strict';
import {ProjectFileWriter,chooseProjectSaveTarget} from '../src/project-file.js';
const fileHandle=(name)=>{let disk=new Uint8Array();return {name,getFile:async()=>new File([disk],name),createWritable:async()=>({write:async data=>{disk=new Uint8Array(data);},close:async()=>{}})};};
test('first save selects a location, subsequent saves overwrite without a picker',async()=>{
 let picks=0;const handle=fileHandle('map.cs2map');
 const target=await chooseProjectSaveTarget(new ProjectFileWriter(),{pick:async()=>{picks++;return handle;}});
 await target.writer.save(new Uint8Array([1]));
 const second=await chooseProjectSaveTarget(target.writer,{pick:async()=>{throw Error('must not pick');}});
 await second.writer.save(new Uint8Array([2,3]));assert.equal(picks,1);assert.deepEqual(new Uint8Array(await (await handle.getFile()).arrayBuffer()),new Uint8Array([2,3]));
});
test('save as selects another target and cancellation leaves the current writer intact',async()=>{
 const old=fileHandle('old.cs2map'),writer=new ProjectFileWriter();writer.attach(old,new Uint8Array());
 const next=await chooseProjectSaveTarget(writer,{asNew:true,pick:async()=>fileHandle('new.cs2map')});assert.notEqual(next.writer,writer);assert.equal(next.name,'new.cs2map');
 await assert.rejects(chooseProjectSaveTarget(writer,{asNew:true,pick:async()=>{throw new Error('cancelled');}}));assert.equal(writer.handle,old);
 await assert.rejects(chooseProjectSaveTarget(new ProjectFileWriter()),/Chrome/);
});
