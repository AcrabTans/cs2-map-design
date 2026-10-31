import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {openCok} from '../cok-reader.mjs';
test('ZIP64 directory and per-entry sizes/offsets are read correctly',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-zip64-')),file=path.join(dir,'sample.cok');
 const name=Buffer.from('sample'),data=Buffer.from('hello'),local=Buffer.alloc(30),central=Buffer.alloc(46),extra=Buffer.alloc(28);
 local.writeUInt32LE(0x04034b50);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt32LE(0x3610a686,16);central.writeUInt32LE(0xffffffff,20);central.writeUInt32LE(0xffffffff,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(28,30);central.writeUInt32LE(0xffffffff,42);
 extra.writeUInt16LE(1);extra.writeUInt16LE(24,2);extra.writeBigUInt64LE(5n,4);extra.writeBigUInt64LE(5n,12);extra.writeBigUInt64LE(0n,20);
 const offset=local.length+name.length+data.length,size=central.length+name.length+extra.length,record=Buffer.alloc(56),locator=Buffer.alloc(20),end=Buffer.alloc(22);
 record.writeUInt32LE(0x06064b50);record.writeBigUInt64LE(44n,4);record.writeBigUInt64LE(1n,24);record.writeBigUInt64LE(1n,32);record.writeBigUInt64LE(BigInt(size),40);record.writeBigUInt64LE(BigInt(offset),48);
 locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(BigInt(offset+size),8);locator.writeUInt32LE(1,16);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(65535,8);end.writeUInt16LE(65535,10);end.writeUInt32LE(0xffffffff,12);end.writeUInt32LE(0xffffffff,16);
 fs.writeFileSync(file,Buffer.concat([local,name,data,central,name,extra,record,locator,end]));let z;
 try{z=openCok(file);assert.equal(z.read('sample').toString(),'hello');}finally{z?.close();fs.unlinkSync(file);fs.rmdirSync(dir);}
});
test('reads entries on demand and detects damaged content',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'cs2-cok-test-')),file=path.join(dir,'sample.cok');
 const name=Buffer.from('sample.Geometry'),data=Buffer.from('hello');
 const local=Buffer.alloc(30),central=Buffer.alloc(46),end=Buffer.alloc(22);
 local.writeUInt32LE(0x04034b50);local.writeUInt32LE(0x3610a686,14);local.writeUInt32LE(5,18);local.writeUInt32LE(5,22);local.writeUInt16LE(name.length,26);
 central.writeUInt32LE(0x02014b50);central.writeUInt32LE(0x3610a686,16);central.writeUInt32LE(5,20);central.writeUInt32LE(5,24);central.writeUInt16LE(name.length,28);
 end.writeUInt32LE(0x06054b50);end.writeUInt16LE(1,8);end.writeUInt16LE(1,10);end.writeUInt32LE(46+name.length,12);end.writeUInt32LE(30+name.length+5,16);
 fs.writeFileSync(file,Buffer.concat([local,name,data,central,name,end]));
 const original=fs.readFileSync;let z;
 try{
  fs.readFileSync=()=>{throw Error('Whole-file reads are forbidden');};
  z=openCok(file);assert.equal(z.read('sample.Geometry').toString(),'hello');assert.throws(()=>z.read('missing'));z.close();z=null;
  const fd=fs.openSync(file,'r+');fs.writeSync(fd,Buffer.from('x'),0,1,30+name.length);fs.closeSync(fd);
  z=openCok(file);assert.throws(()=>z.read('sample.Geometry'),/CRC/);
 }finally{if(z)z.close();fs.readFileSync=original;fs.unlinkSync(file);fs.rmdirSync(dir);}
});
