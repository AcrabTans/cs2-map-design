// Carto exports game network segments, not streets. Keep the original records
// alongside each editable chain so a layer refresh/export can recover them.
export const {mergeCartoRoadChains,splitCartoRoad}=(()=>{
const tolerance=.01;
const near=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<=tolerance;
const direction=f=>String(f.attributes?.Direction||'Both').toLowerCase();
const reversible=f=>direction(f)==='both';
const key=f=>JSON.stringify([f.carto.dataset,f.attributes.Name,f.type,f.structure,f.stackLevel??null,f.width,
 f.attributes.Asset,f.attributes.Category,f.attributes.Direction,f.attributes.Form,f.attributes.Lane,f.attributes.Limit,f.attributes.Width,f.attributes.Object]);
const eligible=f=>f.kind==='road'&&f.geometryType!=='polygon'&&f.carto?.layers.includes('Network_Centerline')&&
 !f.carto.segments&&f.attributes?.Name&&f.attributes.P_Ver!==1&&f.points.length>=2;
const endpoint=(f,side)=>side===0?f.points[0]:f.points.at(-1);
const endpointKey=(p,k)=>Math.round(p[0]/tolerance)+':'+Math.round(p[1]/tolerance)+'|'+k;
const pointDistance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function leads(f,side){const p=endpoint(f,side);const q=(side===0?f.points.slice(1):f.points.slice(0,-1).reverse()).find(q=>pointDistance(p,q)>tolerance);return q?[q[0]-p[0],q[1]-p[1]]:null;}
function canJoin(a,b){
 if(a.f===b.f||!near(endpoint(a.f,a.side),endpoint(b.f,b.side))||(!reversible(a.f)&&a.side===b.side))return false;
 const u=leads(a.f,a.side),v=leads(b.f,b.side);
 // Exclude hairpin/overlapping parallel endpoints, not ordinary curved streets.
 return u&&v&&(u[0]*v[0]+u[1]*v[1])/Math.hypot(...u)/Math.hypot(...v)<.7;
}

function mergeCartoRoadChains(features){
 const candidates=features.filter(eligible),ends=new Map(),links=new Map();
 for(const f of candidates){const k=key(f);for(const side of [0,1]){const at=endpointKey(endpoint(f,side),k);if(!ends.has(at))ends.set(at,[]);ends.get(at).push({f,side});}}
 for(const pair of ends.values())if(pair.length===2&&canJoin(...pair)){
  const [a,b]=pair;for(const [from,to] of [[a,b],[b,a]]){if(!links.has(from.f))links.set(from.f,[null,null]);links.get(from.f)[from.side]=to;}
 }
 const visited=new Set(),replacement=new Map();let removed=0;
 function walk(start,side){
  const chain=[];let f=start,enter=side,pointCount=0,outlineCount=0;
  while(f&&!visited.has(f)){
   const n=f.points.length-(chain.length?1:0),o=f.outlineParts?.length||0;
   if(pointCount+n>5000||outlineCount+o>1000)break;
   visited.add(f);chain.push({f,reversed:enter===1});pointCount+=n;outlineCount+=o;
   const next=links.get(f)?.[1-enter];f=next?.f;enter=next?.side;
  }
  if(chain.length<2)return;
  const first=chain[0].f,points=[],outlineParts=[],segments=[];
  for(const {f,reversed} of chain){
   const ps=reversed?f.points.slice().reverse():f.points;
   points.push(...(points.length?ps.slice(1):ps));
   if(f.outlineParts)outlineParts.push(...f.outlineParts);
   segments.push({id:f.id,recordId:f.carto.recordId,points:f.points,attributes:f.attributes,reversed,
    ...(f.outlineParts?{outlineParts:f.outlineParts,outlineAttributes:f.outlineAttributes||f.attributes}:{})});
  }
  const merged={...first,points,carto:{...first.carto,layers:outlineParts.length?['Network_Centerline','Network_Boundary']:['Network_Centerline'],segments}};
  if(outlineParts.length){merged.outlineParts=outlineParts;merged.outlineAttributes=first.outlineAttributes||first.attributes;}
  else{delete merged.outlineParts;delete merged.outlineAttributes;}
  replacement.set(first,merged);for(const {f} of chain.slice(1))replacement.set(f,null);removed+=chain.length-1;
 }
 // Visit open ends first, retaining source direction for one-way roads. Then
 // visit closed circuits (or pieces left by the geometry size limit).
 for(const f of candidates){if(visited.has(f))continue;const ports=links.get(f)||[];if(!ports[0])walk(f,0);else if(!ports[1]&&reversible(f))walk(f,1);}
 for(const f of candidates)if(!visited.has(f))walk(f,0);
 return {features:features.flatMap(f=>replacement.has(f)?(replacement.get(f)?[replacement.get(f)]:[]):[f]),removed};
}

// Reconstruct per-record geometry. For ordinary vertex moves (the node count
// stays the same), the original segment boundaries remain meaningful. If a
// user inserts/removes nodes, keep the edited continuous geometry on export.
function splitCartoRoad(f,{original=false,exporting=false}={}){
 const segments=f.carto?.segments;if(!segments?.length)return [f];
 const count=segments.reduce((n,s)=>n+s.points.length-1,1);
 if(!original&&count!==f.points.length)return [f];
 const base=segments[0].attributes||{},changes={};
 for(const [k,v] of Object.entries(f.attributes||{}))if(v!==base[k])changes[k]=v;
 const sourcePoints=segments.flatMap((s,i)=>{const ps=s.reversed?s.points.slice().reverse():s.points;return i?ps.slice(1):ps;});
 const unchanged=count===f.points.length&&sourcePoints.every((p,i)=>p[0]===f.points[i][0]&&p[1]===f.points[i][1]);
 let offset=0,outlineOffset=0;
 return segments.map(s=>{
  let points=original||unchanged?s.points:f.points.slice(offset,offset+s.points.length);offset+=s.points.length-1;
  if(!original&&!unchanged&&s.reversed)points=points.slice().reverse();
  const out={...f,id:s.id,points,attributes:{...s.attributes,...changes},carto:{...f.carto,recordId:s.recordId,layers:s.outlineParts?['Network_Centerline','Network_Boundary']:['Network_Centerline']}};
  delete out.carto.segments;delete out.outlineParts;delete out.outlineAttributes;
  if(s.outlineParts){const n=s.outlineParts.length;out.outlineParts=original?s.outlineParts:(f.outlineParts?.slice(outlineOffset,outlineOffset+n)||s.outlineParts);out.outlineAttributes={...s.outlineAttributes,...changes};outlineOffset+=n;}
  // Transient marker used only by the export writer, not serialized into a project.
  if(exporting)out.sourceGeometryUnchanged=original||unchanged;
  return out;
 });
}
return {mergeCartoRoadChains,splitCartoRoad};
})();
