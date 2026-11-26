import assert from 'node:assert/strict';
import test from 'node:test';
import {terrainContours,drawTerrainContours} from '../src/terrain-contours.js';
import {estimateSeaLevel} from '../src/terrain.js';

const raster=(width,sample)=>({width,height:width,values:Float32Array.from({length:width*width},(_,i)=>sample(i%width,Math.floor(i/width)))});

test('contours use real elevation and join along a continuous slope',()=>{
 const {interval,levels}=terrainContours(raster(101,x=>x));
 assert.equal(interval,5);
 assert.deepEqual(levels.map(item=>item.level),Array.from({length:19},(_,i)=>(i+1)*5));
 for(const {level,paths} of levels){
  assert.equal(paths.length,1);
  assert.equal(paths[0].length,101);
  assert(paths[0].every(([x])=>Math.abs(x-(level+.5)/101)<1e-9));
 }
 const labels=[],widths=[];
 const context=new Proxy({fillText:text=>labels.push(text),stroke(){widths.push(this.lineWidth);}},{get:(target,key)=>target[key]??(()=>{})});
 drawTerrainContours(context,4096,{interval,levels});
 assert.deepEqual([...new Set(labels)],['20 m','40 m','60 m','80 m']);
 assert.equal(labels.length,12);
 assert.equal(widths.length,19);
 assert(widths[0]<widths[3]);
 assert.equal(widths[0],widths[2]);
});

test('closed hill contours do not cross the water mask',()=>{
 const hill=raster(101,(x,y)=>Math.max(0,100-Math.hypot(x-50,y-50)*3));
 const full=terrainContours(hill);
 assert(full.levels.every(({paths})=>paths.every(path=>path[0]===path.at(-1))));
 const water=raster(101,x=>x<50?3:NaN),masked=terrainContours(hill,water);
 assert(masked.levels.length>0);
 assert(masked.levels.every(({paths})=>paths.every(path=>path.every(([x])=>x>=.5))));
});

test('flat or entirely submerged areas have no invented contours',()=>{
 assert.deepEqual(terrainContours(raster(16,()=>12)),{interval:0,levels:[]});
 assert.deepEqual(terrainContours(raster(16,x=>x),raster(16,()=>1)),{interval:0,levels:[]});
});

test('contours are traced at round heights relative to the selected sea level',()=>{
 const relative=terrainContours(raster(101,x=>x));
 assert.deepEqual(terrainContours(raster(101,x=>x+95),null,95),relative);
});

test('sea level comes from edge water at matching raster coordinates',()=>{
 const elevation=raster(128,(x,y)=>x<32?90:x>=48&&x<80&&y>=48&&y<80?190:105);
 const depth=raster(64,(x,y)=>x<16?5:x>=24&&x<40&&y>=24&&y<40?10:NaN);
 assert.equal(estimateSeaLevel(elevation,depth),95);
 assert.equal(estimateSeaLevel(elevation,raster(64,(x,y)=>x>=24&&x<40&&y>=24&&y<40?10:NaN)),null);
 assert.equal(estimateSeaLevel(elevation,null),null);
 const mixedElevation=raster(64,x=>x<16?90:120);
 const mixedWater=raster(64,x=>x<16||x>=48?5:NaN);
 assert.equal(estimateSeaLevel(mixedElevation,mixedWater),null);
});
