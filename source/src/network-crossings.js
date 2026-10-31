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
 const segments=[],grid=new Map(),nodes=new Map(),cellSize=512;
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
 const maxRadius=Math.max(...arms.map(a=>a.width))*4;
 const corners=arms.map((a,i)=>{
  const b=arms[(i+1)%arms.length],u=a.direction,v=b.direction;
  const left=[-u[1]*a.width/2,u[0]*a.width/2],right=[v[1]*b.width/2,-v[0]*b.width/2],den=crossingCross(u,v);
  let p;
  if(Math.abs(den)<1e-6)p=[(left[0]+right[0])/2,(left[1]+right[1])/2];
  else{const t=crossingCross(crossingSubtract(right,left),v)/den;p=[left[0]+u[0]*t,left[1]+u[1]*t];}
  // Acute angles must not create long spikes beyond the junction.
  const len=Math.hypot(...p);if(len>maxRadius)p=p.map(v=>v*maxRadius/len);
  return p.map((v,k)=>v+junction.point[k]);
 });
 return arms.map((a,i)=>({feature:a.feature,points:[junction.point,corners[(i+arms.length-1)%arms.length],corners[i]],outer:corners}));
}
export function crossingRelation(a,b){
 const delta=roadStackLevel(a)-roadStackLevel(b);
 if(delta)return delta>0?'above':'below';
 return isStreetRoad(a)&&isStreetRoad(b)?'connected':'same-level-crossing';
}
