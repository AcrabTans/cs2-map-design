import {test} from 'node:test';
import assert from 'node:assert/strict';
import {parseBinaryPrefab} from '../binary-prefab.mjs';
const int=n=>{const b=Buffer.alloc(4);b.writeInt32LE(n);return b;};
const text=s=>Buffer.concat([Buffer.from([1]),int(s.length),Buffer.from(s,'utf16le')]);
const header=Buffer.concat([Buffer.from([2,47]),int(0),text('Game.Prefabs.BuildingPrefab, Game'),int(0)]);
const field=(tag,name,data)=>Buffer.concat([Buffer.from([tag]),text(name),data]);
test('reads typed lot, name, explicit zero employment and CID without executing types',()=>{
 const b=Buffer.concat([header,field(39,'name',text('Demo')),field(23,'m_LotWidth',int(4)),field(23,'m_Workplaces',int(0)),field(50,'m_Mesh',text('CID:abc')),Buffer.from([5])]);
 const p=parseBinaryPrefab(b);assert.equal(p.name,'Demo');assert.equal(p.m_LotWidth,4);assert.equal(p.m_Workplaces,0);assert.equal(p.m_Mesh.$fstrref,'CID:abc');assert.equal(p.maxResidents,undefined);
});
test('rejects truncated, trailing and unknown data',()=>{
 for(const b of [header,Buffer.concat([header,Buffer.from([5,0])]),Buffer.concat([header,Buffer.from([255,5])])])assert.throws(()=>parseBinaryPrefab(b));
});
