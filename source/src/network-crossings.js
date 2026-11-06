// Crossings are derived from centreline geometry. They never alter road nodes.
const crossingEpsilon=1e-6;
const streetTypes=new Set(['highway','arterial','secondary','local','path']);
export const roadStackLevel=f=>Number.isInteger(f.stackLevel)?f.stackLevel:f.structure==='tunnel'?-1:['elevated','bridge'].includes(f.structure)?1:0;
export const isStreetRoad=f=>f.kind==='road'&&streetTypes.has(f.type)&&f.geometryType!=='polygon';
export const crossingRoads=features=>features.filter(f=>f.kind==='road'&&f.type!=='bus'&&f.geometryType!=='polygon');
const crossingCross=(a,b)=>a[0]*b[1]-a[1]*b[0];
const crossingSubtract=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const crossingDistance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function crossingPoint(a,b,c,d){
 const u=crossingSubtract(b,a),v=crossingSubtract(d,c),den=crossingCross(u,v);
 if(Math.abs(den)<crossingEpsilon){
  // Collinear continuations share a node; overlapping parallel roads do not
  // manufacture a sequence of junctions along the overlap.
  if(Math.abs(crossingCross(crossingSubtract(c,a),u))>crossingEpsilon)return null;
  const p=[a,b].find(p=>crossingDistance(p,c)<crossingEpsilon||crossingDistance(p,d)<crossingEpsilon);return p?[...p]:null;
 }
 const offset=crossingSubtract(c,a),t=crossingCross(offset,v)/den,s=crossingCross(offset,u)/den;
 return t>=-crossingEpsilon&&t<=1+crossingEpsilon&&s>=-crossingEpsilon&&s<=1+crossingEpsilon?[a[0]+u[0]*Math.max(0,Math.min(1,t)),a[1]+u[1]*Math.max(0,Math.min(1,t))]:null;
}
export function buildNetworkCrossings(features){
 const segments=[],grid=new Map(),nodes=new Map(),cellSize=128;
 for(const f of crossingRoads(features))for(const part of [f.points,...(f.additionalParts||[])])for(let i=1;i<part.length;i++){
  const a=part[i-1],b=part[i];if(crossingDistance(a,b)<crossingEpsilon)continue;
  segments.push({f,a,b,index:segments.length,minX:Math.min(a[0],b[0]),maxX:Math.max(a[0],b[0]),minY:Math.min(a[1],b[1]),maxY:Math.max(a[1],b[1])});
 }
 function addArm(n,f,q){
  const vector=crossingSubtract(q,n.point),len=Math.hypot(...vector);if(len<crossingEpsilon)return;
  const direction=vector.map(v=>v/len);
  if(!n.arms.some(a=>a.feature.id===f.id&&Math.abs(crossingCross(a.direction,direction))<1e-7&&a.direction[0]*direction[0]+a.direction[1]*direction[1]>0))n.arms.push({feature:f,direction});
 }
 for(const s of segments){
  const candidates=new Set(),cells=[];
  for(let x=Math.floor(s.minX/cellSize);x<=Math.floor(s.maxX/cellSize);x++)for(let y=Math.floor(s.minY/cellSize);y<=Math.floor(s.maxY/cellSize);y++){
   const key=x+':'+y;cells.push(key);for(const other of grid.get(key)||[])candidates.add(other);
  }
  for(const t of candidates){
   if(s.f.id===t.f.id||s.maxX+crossingEpsilon<t.minX||t.maxX+crossingEpsilon<s.minX||s.maxY+crossingEpsilon<t.minY||t.maxY+crossingEpsilon<s.minY)continue;
   const p=crossingPoint(s.a,s.b,t.a,t.b);if(!p)continue;
   const key=Math.round(p[0]*100)+':'+Math.round(p[1]*100);let n=nodes.get(key);
   if(!n){n={point:p,roads:new Map(),arms:[]};nodes.set(key,n);}
   for(const seg of [s,t]){n.roads.set(seg.f.id,seg.f);addArm(n,seg.f,seg.a);addArm(n,seg.f,seg.b);}
  }
  for(const key of cells){if(!grid.has(key))grid.set(key,[]);grid.get(key).push(s);}
 }
 return [...nodes.values()].map(n=>({...n,roads:[...n.roads.values()]})).sort((a,b)=>a.point[0]-b.point[0]||a.point[1]-b.point[1]);
}
export function junctionSectors(junction,level,widthFor=f=>f.width){
 const arms=[];
 for(const arm of junction.arms.filter(a=>isStreetRoad(a.feature)&&roadStackLevel(a.feature)===level)){
  const angle=Math.atan2(arm.direction[1],arm.direction[0]),width=widthFor(arm.feature);
  const prior=arms.find(a=>Math.abs(crossingCross(a.direction,arm.direction))<1e-6&&a.direction[0]*arm.direction[0]+a.direction[1]*arm.direction[1]>.999);
  if(prior){if(width>prior.width)Object.assign(prior,{...arm,angle,width});}else arms.push({...arm,angle,width});
 }
 if(arms.length<3||new Set(arms.map(a=>a.feature.id)).size<2)return [];
 arms.sort((a,b)=>a.angle-b.angle||a.feature.id.localeCompare(b.feature.id));
 // Keep acute corners near the join. Intersecting unbounded edges produces spikes
 // when two arms are almost parallel, particularly at unequal widths.
 const reach=Math.max(...arms.map(a=>a.width))/2;
 const corners=arms.map((a,i)=>{
  const b=arms[(i+1)%arms.length],u=a.direction,v=b.direction;
  const left=[-u[1]*a.width/2,u[0]*a.width/2],right=[v[1]*b.width/2,-v[0]*b.width/2];
  const den=crossingCross(u,v),offset=crossingSubtract(right,left);
  const bound=t=>Math.max(0,Math.min(reach,t));
  const t=den>crossingEpsilon?bound(crossingCross(offset,v)/den):0;
  const q=den>crossingEpsilon?bound(crossingCross(offset,u)/den):0;
  return left.map((value,k)=>junction.point[k]+(value+u[k]*t+right[k]+v[k]*q)/2);
 });
 const centroid=corners.reduce((sum,p)=>[sum[0]+p[0]/corners.length,sum[1]+p[1]/corners.length],[0,0]);
 const center=corners.length===4?crossingPoint(corners[0],corners[2],corners[1],corners[3])||centroid:centroid;
 return arms.map((a,i)=>({feature:a.feature,points:[center,corners[(i+arms.length-1)%arms.length],corners[i]],outer:corners}));
}

export function roadFlatEnds(junctions){
 const byRoad=new Map();
 for(const junction of junctions){
  const ends=[];
  for(const f of junction.roads.filter(isStreetRoad)){
   const parts=[f.points,...(f.additionalParts||[])];
   parts.forEach((part,index)=>{
    for(const side of ['start','end']){
     const start=side==='start',point=start?part[0]:part.at(-1);
     if(!point||crossingDistance(point,junction.point)>crossingEpsilon)continue;
     const distinct=p=>crossingDistance(p,point)>crossingEpsilon;
     const next=start?part.find(distinct):part.findLast(distinct);
     if(!next)continue;
     const distance=crossingDistance(next,point),direction=crossingSubtract(next,point).map(n=>n/distance);
     ends.push({f,index,side,direction});
    }
   });
  }
  // The junction fill owns the footprint at a T. A round cap from any of its
  // terminal segments can extend beyond that footprint and show through.
  const teeLevels=new Set([...new Set(ends.map(end=>roadStackLevel(end.f)))].filter(level=>junctionSectors(junction,level).length===3));
  for(const end of ends){
   const continues=ends.some(other=>other.f.id!==end.f.id&&other.f.structure!==end.f.structure&&
    end.direction[0]*other.direction[0]+end.direction[1]*other.direction[1]<-.95);
   if(!continues&&!teeLevels.has(roadStackLevel(end.f)))continue;
   if(!byRoad.has(end.f.id))byRoad.set(end.f.id,new Set());
   byRoad.get(end.f.id).add(`${end.index}:${end.side}`);
  }
 }
 return byRoad;
}

export function crossingRelation(a,b){
 const delta=roadStackLevel(a)-roadStackLevel(b);
 if(delta)return delta>0?'above':'below';
 return isStreetRoad(a)&&isStreetRoad(b)?'connected':'same-level-crossing';
}
