import {geometryParts,segmentProjection} from './model.js';

// A screen gesture paints at most once per animation frame. Release flushes the
// final frame before the expensive, authoritative geometry pass.
export function createEditScheduler(paint,{frame=requestAnimationFrame,cancelFrame=cancelAnimationFrame}={}){
 let pending=null;
 return {schedule(){if(pending===null)pending=frame(()=>{pending=null;paint();});},flush(){if(pending!==null){cancelFrame(pending);pending=null;paint();}},cancel(){if(pending!==null)cancelFrame(pending);pending=null;}};
}

export function createSnapIndex(features,{visible=()=>true,exclude=null,cellSize=128}={}){
 const cells=new Map();
 for(const f of features){
  if(f.id===exclude||f.kind==='note'||!visible(f))continue;
  for(const part of [f.points,...(f.additionalParts||[])])for(const p of part){
   const key=Math.floor(p[0]/cellSize)+':'+Math.floor(p[1]/cellSize);
   if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);
  }
 }
 return {nearest(point,radius){let best=radius,result=null;
  for(let x=Math.floor((point[0]-radius)/cellSize);x<=Math.floor((point[0]+radius)/cellSize);x++)for(let y=Math.floor((point[1]-radius)/cellSize);y<=Math.floor((point[1]+radius)/cellSize);y++)for(const p of cells.get(x+':'+y)||[]){
   const d=Math.hypot(p[0]-point[0],p[1]-point[1]);if(d<best){best=d;result=p;}
  }
  return result?[...result]:null;
 }};
}

export function createRoadSegmentIndex(roads,cellSize=256){
 const cells=new Map();
 for(const feature of roads)for(const [partIndex,points]of geometryParts(feature).entries()){
  for(let index=0;index<points.length-1;index++){
   const a=points[index],b=points[index+1],segment={feature,partIndex,index,a,b};
   for(let x=Math.floor(Math.min(a[0],b[0])/cellSize);x<=Math.floor(Math.max(a[0],b[0])/cellSize);x++){
    for(let y=Math.floor(Math.min(a[1],b[1])/cellSize);y<=Math.floor(Math.max(a[1],b[1])/cellSize);y++){
     const key=x+':'+y;
     if(!cells.has(key))cells.set(key,[]);
     cells.get(key).push(segment);
    }
   }
  }
 }
 return {nearest(point,radius){
  const nearby=new Set();
  for(let x=Math.floor((point[0]-radius)/cellSize);x<=Math.floor((point[0]+radius)/cellSize);x++){
   for(let y=Math.floor((point[1]-radius)/cellSize);y<=Math.floor((point[1]+radius)/cellSize);y++){
    for(const segment of cells.get(x+':'+y)||[])nearby.add(segment);
   }
  }
  let best=null,limit=radius;
  for(const {feature,partIndex,index,a,b}of nearby){
   const hit=segmentProjection(point,a,b);
   if(hit.distance<limit){best={...hit,feature,partIndex,index};limit=hit.distance;}
  }
  return best;
 }};
}

export function createCrossingCache(compute){
 let previous=null,result=null;
 return {get(features){const roads=features.filter(f=>f.kind==='road'&&f.type!=='bus');
  if(!previous||roads.length!==previous.length||roads.some((f,i)=>f!==previous[i])){result=compute(roads);previous=roads;}
  return result;
 },invalidate(){previous=null;result=null;}};
}

// Static bounding-box grid. The query preserves original drawing order and
// includes full geometry of features that cross the requested viewport.
export function createFeatureViewportIndex(features,cellSize=512){
 const cells=new Map(),bounds=[];
 for(const [index,f] of features.entries()){
  let x0=Infinity,y0=Infinity,x1=-Infinity,y1=-Infinity;
  for(const part of [f.points,...(f.additionalParts||[]),...(f.outlineParts||[])])for(const [x,y] of part){x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);}
  const pad=f.kind==='road'?Math.max(f.width||0,f.corridor||0)/2:f.assetPlacement?Math.hypot(...f.assetPlacement.lot)/2:12;
  const b=[x0-pad,y0-pad,x1+pad,y1+pad];bounds.push(b);
  for(let x=Math.floor(b[0]/cellSize);x<=Math.floor(b[2]/cellSize);x++)for(let y=Math.floor(b[1]/cellSize);y<=Math.floor(b[3]/cellSize);y++){
   const k=x+':'+y;if(!cells.has(k))cells.set(k,[]);cells.get(k).push(index);
  }
 }
 return {query(b){const candidates=new Set();
  for(let x=Math.floor(b[0]/cellSize);x<=Math.floor(b[2]/cellSize);x++)for(let y=Math.floor(b[1]/cellSize);y<=Math.floor(b[3]/cellSize);y++)for(const i of cells.get(x+':'+y)||[])candidates.add(i);
  return [...candidates].filter(i=>{const a=bounds[i];return a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];}).sort((a,b)=>a-b).map(i=>features[i]);
 }};
}
