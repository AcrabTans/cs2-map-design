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

export function createCrossingCache(compute){
 let previous=null,result=null;
 return {get(features){const roads=features.filter(f=>f.kind==='road'&&f.type!=='bus');
  if(!previous||roads.length!==previous.length||roads.some((f,i)=>f!==previous[i])){result=compute(roads);previous=roads;}
  return result;
 },invalidate(){previous=null;result=null;}};
}
