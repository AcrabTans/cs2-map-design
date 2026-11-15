import {createRoadSegmentIndex} from './edit-performance.js';
import {SIZE,ZONES,area,distance,length,segmentProjection,roadInfo,geometryParts,isPolygonFeature,pointInPolygon} from './model.js';

const gridWidth=112,cellSize=SIZE/gridWidth,cellCount=gridWidth*gridWidth;
const directions=[[1,0],[0,1],[-1,0],[0,-1],[1,1],[-1,1],[-1,-1],[1,-1]];
const centerOf=id=>[(id%gridWidth+.5)*cellSize,(Math.floor(id/gridWidth)+.5)*cellSize];
const cellAt=([x,y])=>Math.min(gridWidth-1,Math.floor(y/cellSize))*gridWidth+
 Math.min(gridWidth-1,Math.floor(x/cellSize));
const terrainAt=(raster,[x,y])=>raster.values[
 Math.min(raster.height-1,Math.floor(y/SIZE*raster.height))*raster.width+
 Math.min(raster.width-1,Math.floor(x/SIZE*raster.width))];
export const masterPlanProfiles={
 balanced:['mid-res','mid-mix','industry','civic','reserve'],
 residential:['mid-res','mid-mix','civic','park','office'],
 industry:['industry','mid-res','innovation','depot','civic'],
 logistics:['port','depot','industry','mid-res','civic'],
 tourism:['tourism','mid-res','park','commerce','reserve']
};
const useNames=Object.fromEntries(ZONES.flatMap(([,uses])=>uses.map(([id,name])=>[id,name])));
const coastUses=new Set(['port','marina','shipyard','aquaculture']);
const edgeDistance=([x,y])=>Math.min(x,y,SIZE-x,SIZE-y);
const inBounds=([x,y])=>x>=0&&y>=0&&x<=SIZE&&y<=SIZE;
const inReserve=(point,rectangles)=>rectangles.some(([a,b])=>
 point[0]>=Math.min(a[0],b[0])&&point[0]<=Math.max(a[0],b[0])&&point[1]>=Math.min(a[1],b[1])&&point[1]<=Math.max(a[1],b[1]));

function markOccupied(cells,feature){
 const rings=geometryParts(feature);
 const bounds=rings.flat().reduce(([x0,y0,x1,y1],[x,y])=>
  [Math.min(x0,x),Math.min(y0,y),Math.max(x1,x),Math.max(y1,y)],[SIZE,SIZE,0,0]);
 const first=cellAt(bounds.slice(0,2)),last=cellAt(bounds.slice(2));
 for(let y=Math.floor(first/gridWidth);y<=Math.floor(last/gridWidth);y++){
  for(let x=first%gridWidth;x<=last%gridWidth;x++){
   const id=y*gridWidth+x,point=centerOf(id);
   if(rings.reduce((inside,ring)=>inside!==pointInPolygon(point,ring),false))cells[id]=1;
  }
 }
 cells[cellAt(feature.poi||feature.points[0])]=1;
}

function makeTerrainGrid(project,elevation,depth,reserves,maxGrade){
 const passable=new Uint8Array(cellCount),wet=new Uint8Array(cellCount);
 const height=new Float32Array(cellCount),roughness=new Float32Array(cellCount);
 const occupied=new Uint8Array(cellCount),built=new Uint8Array(cellCount),reservedCells=new Uint8Array(cellCount);
 const coast=new Uint16Array(cellCount).fill(65535);
 for(const f of project.features){
  if(f.kind==='zone')markOccupied(occupied,f);
  if(f.kind!=='building')continue;
  if(isPolygonFeature(f))markOccupied(built,f);
  else built[cellAt(f.points[0])]=1;
 }
 const samples=[[0,0],[-.32,-.32],[.32,-.32],[-.32,.32],[.32,.32]];
 const queue=[];
 for(let id=0;id<cellCount;id++){
  const center=centerOf(id);
  const points=samples.map(([x,y])=>[center[0]+x*cellSize,center[1]+y*cellSize]);
  const levels=points.map(point=>terrainAt(elevation,point));
  height[id]=levels[0];
  wet[id]=points.some(point=>terrainAt(depth,point)>0);
  if(wet[id]){coast[id]=0;queue.push(id);}
  roughness[id]=(Math.max(...levels)-Math.min(...levels))/(cellSize*.9);
  const [x,y]=center,half=cellSize/2;
  const reserved=reserves.some(([a,b])=>Math.max(a[0],b[0])>=x-half&&Math.min(a[0],b[0])<=x+half&&
   Math.max(a[1],b[1])>=y-half&&Math.min(a[1],b[1])<=y+half);
  reservedCells[id]=reserved;
  passable[id]=!wet[id]&&!built[id]&&!reserved&&levels.every(Number.isFinite)&&roughness[id]<=maxGrade;
 }
 for(let i=0;i<queue.length;i++){
  const id=queue[i];
  for(const next of gridNeighbors(id,4)){
   if(coast[next]!==65535)continue;
   coast[next]=coast[id]+1;queue.push(next);
  }
 }
 const links=new Float32Array(cellCount*8).fill(Infinity);
 const grid={passable,wet,built,reservedCells,height,roughness,occupied,coast,maxGrade,reserves,elevation,depth,links};
 for(let id=0;id<cellCount;id++){
  if(!passable[id])continue;
  for(const next of gridNeighbors(id,8)){
   if(next<=id||!passable[next])continue;
   const dx=next%gridWidth-id%gridWidth,dy=Math.floor(next/gridWidth)-Math.floor(id/gridWidth);
   if(dx&&dy&&(!passable[id+dx]||!passable[id+dy*gridWidth]))continue;
   const length=Math.hypot(dx,dy)*cellSize,grade=Math.abs(height[id]-height[next])/length;
   if(grade>maxGrade||!safeSurfaceLink(grid,centerOf(id),centerOf(next)))continue;
   const cost=length*(1+grade*12+(roughness[id]+roughness[next])*3+(occupied[id]+occupied[next])*4);
   links[id*8+directionIndex(dx,dy)]=cost;
   links[next*8+directionIndex(-dx,-dy)]=cost;
  }
 }
 return grid;
}

function* gridNeighbors(id,count){
 const x=id%gridWidth,y=Math.floor(id/gridWidth);
 for(let i=0;i<count;i++){
  const [dx,dy]=directions[i],nx=x+dx,ny=y+dy;
  if(nx>=0&&ny>=0&&nx<gridWidth&&ny<gridWidth)yield ny*gridWidth+nx;
 }
}

const directionIndex=(dx,dy)=>directions.findIndex(([x,y])=>x===dx&&y===dy);
function routeStep(grid,id,next){
 const dx=next%gridWidth-id%gridWidth,dy=Math.floor(next/gridWidth)-Math.floor(id/gridWidth);
 return grid.bridges?.get(id)?.get(next)??(grid.links[id*8+directionIndex(dx,dy)]??Infinity);
}

function safeSurfaceLink(grid,a,b){
 const length=distance(a,b),steps=Math.max(1,Math.ceil(length/12));
 let previous=terrainAt(grid.elevation,a);
 if(!Number.isFinite(previous))return false;
 for(let i=1;i<=steps;i++){
  const t=i/steps,point=[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t],height=terrainAt(grid.elevation,point);
  if(!Number.isFinite(height)||terrainAt(grid.depth,point)>0||inReserve(point,grid.reserves)||
   Math.abs(height-previous)>Math.max(1,length/steps*grid.maxGrade))return false;
  previous=height;
 }
 return true;
}

function addHighwayBridges(grid){
 const bridges=new Map();
 for(let id=0;id<cellCount;id++){
  if(!grid.passable[id])continue;
  const x=id%gridWidth,y=Math.floor(id/gridWidth);
  for(const [dx,dy]of directions){
   let wetCells=0;
   for(let step=1;step<=15;step++){
    const nx=x+dx*step,ny=y+dy*step;
    if(nx<0||ny<0||nx>=gridWidth||ny>=gridWidth)break;
    const next=ny*gridWidth+nx,point=centerOf(next);
    if(grid.built[next]||inReserve(point,grid.reserves))break;
    if(grid.wet[next]){wetCells++;continue;}
    if(!wetCells||next<=id||!grid.passable[next]||Math.abs(grid.height[id]-grid.height[next])>18)break;
    const length=distance(centerOf(id),point);
    if(length>1900)break;
    const samples=Math.ceil(length/32);
    if(Array.from({length:samples},(_,i)=>i/samples).some(t=>inReserve(
     [centerOf(id)[0]+(point[0]-centerOf(id)[0])*t,centerOf(id)[1]+(point[1]-centerOf(id)[1])*t],grid.reserves)))break;
    for(const [from,to]of [[id,next],[next,id]]){
     if(!bridges.has(from))bridges.set(from,new Map());
     bridges.get(from).set(to,900+length*3);
    }
    break;
   }
  }
 }
 grid.bridges=bridges;
}

function* routableNeighbors(grid,id){
 yield* gridNeighbors(id,8);
 const bridges=grid.bridges?.get(id);
 if(bridges)yield* bridges.keys();
}

function connectedLand(grid){
 const ids=new Int32Array(cellCount).fill(-1),sizes=[];
 for(let start=0;start<cellCount;start++){
  if(!grid.passable[start]||ids[start]!==-1)continue;
  const id=sizes.length,queue=[start];ids[start]=id;
  for(let i=0;i<queue.length;i++){
   for(const next of routableNeighbors(grid,queue[i])){
    if(ids[next]!==-1||!Number.isFinite(routeStep(grid,queue[i],next)))continue;
    ids[next]=id;queue.push(next);
   }
  }
  sizes.push(queue.length);
 }
 return {ids,largest:sizes.indexOf(Math.max(...sizes))};
}

function connectionCell(grid,point){
 if(!inBounds(point)||terrainAt(grid.depth,point)>0||inReserve(point,grid.reserves))return -1;
 const start=cellAt(point),choices=[start,...gridNeighbors(start,8)].sort((a,b)=>distance(point,centerOf(a))-distance(point,centerOf(b)));
 for(const id of choices){
  if(!grid.passable[id])continue;
  if(safeSurfaceLink(grid,point,centerOf(id)))return id;
 }
 return -1;
}

function flatNeighborhood(grid,id){
 let free=0;
 const x=id%gridWidth,y=Math.floor(id/gridWidth);
 for(let yy=Math.max(0,y-3);yy<=Math.min(gridWidth-1,y+3);yy++){
  for(let xx=Math.max(0,x-3);xx<=Math.min(gridWidth-1,x+3);xx++){
   const next=yy*gridWidth+xx;
   if(grid.passable[next]&&!grid.occupied[next]&&grid.roughness[next]<=.055)free++;
  }
 }
 return free/49;
}

function chooseCenters(grid,land,component,uses,access,spread,strict=false){
 const candidates=[];
 for(let id=0;id<cellCount;id++){
  if(land.ids[id]!==component||grid.occupied[id]||id%gridWidth%2||Math.floor(id/gridWidth)%2)continue;
  const flat=flatNeighborhood(grid,id);
  if(flat>=.28)candidates.push({id,flat,point:centerOf(id)});
 }
 const centers=[];
 for(const requested of uses){
  const coastal=coastUses.has(requested);
  const score=(candidate,use)=>{
   const {id,flat,point}=candidate;
   const separation=centers.reduce((best,c)=>Math.min(best,distance(point,c.point)),3500);
   if(separation<spread||coastUses.has(use)&&grid.coast[id]>7)return -Infinity;
   const accessDistance=access.reduce((best,a)=>Math.min(best,distance(point,a.point)),5000);
   return flat*3+separation/2300-accessDistance/12000-(coastUses.has(use)?grid.coast[id]*.2:0);
  };
  let best=null,rank=-Infinity,use=requested;
  for(const choice of coastal&&!strict?[requested,'depot']:[requested]){
   for(const candidate of candidates){
    const value=score(candidate,choice);
    if(value>rank){best=candidate;rank=value;use=choice;}
   }
   if(best)break;
  }
  if(best)centers.push({...best,use,requested});
 }
 return centers;
}

function routeHeap(){
 const heap=[];
 function push(id,priority){
  let i=heap.length;heap.push({id,priority});
  while(i){
   const p=(i-1)>>1;
   if(heap[p].priority<=priority)break;
   heap[i]=heap[p];i=p;
  }
  heap[i]={id,priority};
 }
 function pop(){
  const first=heap[0],tail=heap.pop();
  if(!heap.length)return first;
  let i=0;
  while(i*2+1<heap.length){
   let child=i*2+1;
   if(child+1<heap.length&&heap[child+1].priority<heap[child].priority)child++;
   if(heap[child].priority>=tail.priority)break;
   heap[i]=heap[child];i=child;
  }
  heap[i]=tail;
  return first;
 }
 return {push,pop,get size(){return heap.length;}};
}

function routeToNetwork(grid,start,network){
 if(network.has(start))return [start];
 const cost=new Float64Array(cellCount).fill(Infinity),parent=new Int32Array(cellCount).fill(-1);
 const heap=routeHeap();
 cost[start]=0;heap.push(start,0);
 while(heap.size){
  const {id,priority}=heap.pop();
  if(priority!==cost[id])continue;
  if(network.has(id)){
   const path=[id];
   while(parent[path.at(-1)]!==-1)path.push(parent[path.at(-1)]);
   return path.reverse();
  }
  for(const next of routableNeighbors(grid,id)){
   const nextCost=priority+routeStep(grid,id,next);
   if(nextCost>=cost[next])continue;
   cost[next]=nextCost;parent[next]=id;heap.push(next,nextCost);
  }
 }
 return [];
}

function collapseStraight(points){
 return points.filter((p,i)=>{
  if(!i||i===points.length-1)return true;
  const a=points[i-1],b=points[i+1];
  return (p[0]-a[0])*(b[1]-p[1])!==(p[1]-a[1])*(b[0]-p[0]);
 });
}

function traceRegion(region){
 const edges=new Map(),stride=gridWidth+1;
 const add=(from,to,dir)=>{
  if(!edges.has(from))edges.set(from,[]);
  edges.get(from).push({to,dir});
 };
 for(const id of region){
  const x=id%gridWidth,y=Math.floor(id/gridWidth),a=y*stride+x;
  if(!region.has(id-gridWidth))add(a,a+1,0);
  if(x===gridWidth-1||!region.has(id+1))add(a+1,a+stride+1,1);
  if(!region.has(id+gridWidth))add(a+stride+1,a+stride,2);
  if(!x||!region.has(id-1))add(a+stride,a,3);
 }
 const rings=[];
 const turnPriority=[1,0,3,2];
 while(edges.size){
  const start=edges.keys().next().value,vertices=[];
  let vertex=start,heading;
  do{
   vertices.push([vertex%stride*cellSize,Math.floor(vertex/stride)*cellSize]);
   const choices=edges.get(vertex);
   if(!choices?.length)break;
   let choice=0;
   if(heading!==undefined){
    for(const turn of turnPriority){
     const index=choices.findIndex(edge=>edge.dir===(heading+turn)%4);
     if(index!==-1){choice=index;break;}
    }
   }
   const [edge]=choices.splice(choice,1);
   if(!choices.length)edges.delete(vertex);
   vertex=edge.to;heading=edge.dir;
  }while(vertex!==start);
  if(vertex!==start||vertices.length<4)continue;
  const closed=[vertices.at(-1),...vertices,vertices[0]];
  const ring=collapseStraight(closed).slice(1,-1);
  if(ring.length>=4&&area(ring)>0)rings.push(ring);
 }
 return rings.sort((a,b)=>area(b)-area(a));
}

const districtUseProfiles={
 waterfront:{target:80,grade:.10,minWater:0,maxWater:700,road:1200},
 harbor:{target:110,grade:.065,minWater:0,maxWater:460,road:1000},
 center:{target:65,grade:.08,minWater:220,maxWater:Infinity,road:380},
 neighborhood:{target:80,grade:.12,minWater:260,maxWater:Infinity,road:720},
 industry:{target:105,grade:.075,minWater:350,maxWater:Infinity,road:600},
 rural:{target:120,grade:.09,minWater:180,maxWater:Infinity,road:1300},
 green:{target:100,grade:.25,minWater:0,maxWater:Infinity,road:1700}
};
const districtProfileByType={
 port:'harbor',shipyard:'harbor',marina:'waterfront',aquaculture:'waterfront',
 commerce:'center',office:'center','high-res':'center','high-mix':'center',civic:'center',station:'center',market:'center',
 industry:'industry',innovation:'industry',pharma:'industry',data:'industry',vehicle:'industry','used-car':'industry',
 depot:'industry',airport:'industry',power:'industry',waste:'industry',water:'industry',
 agriculture:'rural',racecourse:'rural',racetrack:'rural',
 reserve:'green',forest:'green',park:'green',tourism:'green'
};
const districtAdvice={
 harbor:'沿岸布置作业面，陆侧保留堆场和货运接入。',
 waterfront:'把临水面留给码头或亲水活动，向内陆安排配套。',
 center:'把主要出入口朝向现状干道，核心地块优先使用较平缓的地面。',
 neighborhood:'在较缓地面安排生活组团，内部水体、陡坡及现状设施保留。',
 industry:'优先保证成片用地和货运接入，靠近住宅处留出缓冲。',
 rural:'保留成片开敞用地，现状道路作为后续接入参考。',
 green:'利用岸线或坡地组织开放空间，保留现状水体与植被。'
};

// Favor frontage on a substantial connected water body for water-dependent uses.
function districtWaterDistance(grid){
 const sea=new Uint16Array(cellCount).fill(65535),seen=new Uint8Array(cellCount),queue=[];
 for(let id=0;id<cellCount;id++){
  if(!grid.wet[id]||seen[id])continue;
  const water=[id];seen[id]=1;
  for(let i=0;i<water.length;i++)for(const next of gridNeighbors(water[i],4)){
   if(grid.wet[next]&&!seen[next]){seen[next]=1;water.push(next);}
  }
  if(water.length<20)continue;
  for(const cell of water){sea[cell]=0;queue.push(cell);}
 }
 for(let i=0;i<queue.length;i++)for(const next of gridNeighbors(queue[i],4)){
  if(sea[next]===65535){sea[next]=sea[queue[i]]+1;queue.push(next);}
 }
 return sea;
}

function districtBoundary(region){
 const ring=traceRegion(region)[0];
 if(!ring)return null;
 const unique=new Set(ring.map(p=>p.join(',')));
 if(unique.size!==ring.length)return null;
 const direction=ring.reduce((sum,[x,y],i)=>{
  const [u,v]=ring[(i+1)%ring.length];
  return sum+x*v-u*y;
 },0);
 // Cut outer grid corners without extending the outline into neighboring land.
 return ring.flatMap((point,i)=>{
  const a=ring[(i+ring.length-1)%ring.length],b=ring[(i+1)%ring.length];
  const turn=(point[0]-a[0])*(b[1]-point[1])-(point[1]-a[1])*(b[0]-point[0]);
  if(turn*direction<=0)return [point];
  return [a,b].map(other=>{
   const fraction=Math.min(.43,145/distance(point,other));
   return point.map((n,k)=>n+(other[k]-n)*fraction);
  });
 });
}

function growDistrict(grid,site,profile,claimed,target){
 const heap=routeHeap(),region=new Set(),seen=new Set([site.id]);
 const radius=Math.sqrt(target)*cellSize*.93;
 const allowedGrade=Math.min(profile.grade,profile===districtUseProfiles.green?.25:grid.maxGrade);
 heap.push(site.id,0);
 while(heap.size&&region.size<target){
  const {id,priority}=heap.pop();
  region.add(id);
  for(const next of gridNeighbors(id,4)){
   if(seen.has(next)||claimed[next]||grid.reservedCells[next]||grid.wet[next])continue;
   const point=centerOf(next),distanceFromSite=distance(point,site.point);
   const grade=Math.abs(grid.height[id]-grid.height[next])/cellSize;
   if(distanceFromSite>radius||!Number.isFinite(grade)||grade>allowedGrade||grid.roughness[next]>allowedGrade)continue;
   seen.add(next);
   const coast=grid.coast[next]*cellSize;
   const terrain=grid.roughness[next]*12+grade*4;
   const shore=profile.maxWater===Infinity?Math.max(0,profile.minWater-coast)/240:Math.max(0,coast-profile.maxWater)/420;
   heap.push(next,priority+1+terrain+shore+grid.occupied[next]*.35+grid.built[next]*.4+distanceFromSite/radius*.35);
  }
 }
 if(region.size<Math.max(12,target*.40))return null;
 const outline=districtBoundary(region);
 if(!outline)return null;
 // The exterior ring intentionally includes interior pockets, while explicit
 // exclusions and previously allocated districts remain outside the boundary.
 const cells=[];
 for(let y=Math.max(0,Math.floor((site.point[1]-radius)/cellSize));y<=Math.min(gridWidth-1,Math.floor((site.point[1]+radius)/cellSize));y++){
  for(let x=Math.max(0,Math.floor((site.point[0]-radius)/cellSize));x<=Math.min(gridWidth-1,Math.floor((site.point[0]+radius)/cellSize));x++){
   const id=y*gridWidth+x;
   if(!pointInPolygon(centerOf(id),outline))continue;
   if(claimed[id]||grid.reservedCells[id])return null;
   cells.push(id);
  }
 }
 if(cells.filter(id=>grid.wet[id]).length>cells.length*.18)return null;
 return {outline,cells};
}

function describeDistrict(grid,site,profile,category,shape){
 const land=shape.cells.filter(id=>!grid.wet[id]);
 const elevations=land.map(id=>grid.height[id]).filter(Number.isFinite);
 const flat=land.filter(id=>grid.roughness[id]<=.055).length/land.length;
 const coast=Math.min(...land.map(id=>grid.coast[id]));
 const areas='约 '+Math.round(area(shape.outline)/10000)+' 公顷，区内高程约 '+Math.round(Math.min(...elevations))+
  '–'+Math.round(Math.max(...elevations))+' 米；约 '+Math.round(flat*100)+'% 陆地的局部坡度不超过 5.5%。';
 const water=coast<=1?'分区沿岸布置。':coast<=6?'靠近水岸，最近约 '+(coast*cellSize)+' 米。':'以离岸腹地为主。';
 const road=site.road?'中心距现状'+roadInfo(site.road.feature.type).name+'约 '+Math.round(site.road.distance/10)*10+' 米。':
  '中心周边 2 公里内未找到现状主路，后续需补足交通接入。';
 const retained=shape.cells.some(id=>grid.built[id]||grid.occupied[id]||grid.wet[id]||grid.roughness[id]>profile.grade)?
  '粗略边界内包含现状建设、用地或自然地形，细化时按实况保留。':'';
 return [areas,water,road,districtAdvice[category],retained].filter(Boolean).join('');
}

function planDistricts(project,grid,uses,districtCount,component,land,strict,manual,scales={},hints={}){
 const roads=createRoadSegmentIndex(project.features.filter(f=>f.kind==='road'&&
  ['arterial','secondary','local'].includes(f.type)&&f.geometryType!=='polygon'&&(!f.structure||f.structure==='ground')),512);
 const water=districtWaterDistance(grid),candidates=[];
 const claimed=new Uint8Array(cellCount);
 for(const f of project.features)if(f.kind==='interchange'||f.kind==='district'&&f.level!=='tile'&&f.notes?.startsWith('地形总规草案'))markOccupied(claimed,f);
 for(let id=0;id<cellCount;id++){
  if(grid.wet[id]||grid.built[id]||grid.reservedCells[id]||!Number.isFinite(grid.height[id])||
   component!==null&&land.ids[id]!==component||id%gridWidth%2||Math.floor(id/gridWidth)%2)continue;
  const point=centerOf(id),flat=flatNeighborhood(grid,id);
  const anchor=manual.reduce((min,link)=>Math.min(min,distance(point,link.point)),Infinity);
  candidates.push({id,point,flat,anchor,road:roads.nearest(point,2000),coast:grid.coast[id]*cellSize,water:water[id]*cellSize});
 }
 const districts=[];
 const countScale=Math.min(1.6,Math.max(.48,Math.sqrt(8/districtCount)));
 for(const requested of uses){
  const before=districts.length;
  for(const type of requested==='port'&&!strict?[requested,'depot']:[requested]){
   const category=districtProfileByType[type]||'neighborhood',profile=districtUseProfiles[category];
   const target=Math.round(profile.target*countScale*(scales[type]??1));
   const rank=[];
   for(const site of candidates){
    if(claimed[site.id]||grid.roughness[site.id]>Math.min(profile.grade,category==='green'?.25:grid.maxGrade))continue;
    if(profile.maxWater<Infinity&&site.water>profile.maxWater)continue;
    if(category!=='green'&&site.flat<.12)continue;
    const separation=districts.reduce((gap,d)=>Math.min(gap,distance(site.point,d.site)),2600);
    if(separation<Math.sqrt(target)*cellSize*.57)continue;
    const coastScore=profile.maxWater<Infinity?-site.water/300:category==='green'?
     Math.max(0,1-site.coast/1100)*2+Math.min(1,grid.roughness[site.id]/.13): -Math.max(0,profile.minWater-site.coast)/160;
    const roadScore=Math.max(-1.5,1.8-Math.abs((site.road?.distance??2300)-profile.road*.5)/profile.road);
    let compatibility=0;
    for(const other of districts){
     const otherCategory=districtProfileByType[other.type]||'neighborhood',gap=distance(site.point,other.site);
     const housingPair=category==='neighborhood'&&otherCategory==='industry'||category==='industry'&&otherCategory==='neighborhood';
     if(housingPair)compatibility-=Math.max(0,1-gap/3000)*2;
     if(category==='center'&&otherCategory==='neighborhood')compatibility+=Math.max(0,1-gap/2800);
    }
    const hint=hints[type];
    const accessScore=Math.max(0,1-site.anchor/3500)*.7+
     (hint?1.5*Math.max(0,1-distance(site.point,hint)/4200):0);
    const score=compatibility+accessScore+(category==='green'?1.4:4.3)*site.flat+coastScore+roadScore+separation/1250-
     grid.occupied[site.id]*1.9-Math.max(0,170-edgeDistance(site.point))/170;
    rank.push({site,score});
   }
   rank.sort((a,b)=>b.score-a.score);
   const rejected=[];
   for(const {site}of rank){
    if(rejected.length>=28)break;
    if(rejected.some(point=>distance(point,site.point)<380))continue;
    const shape=growDistrict(grid,site,profile,claimed,target);
    if(!shape){rejected.push(site.point);continue;}
    for(const id of shape.cells)claimed[id]=1;
    districts.push({name:useNames[type]+(useNames[type].endsWith('区')?' ':'片区 ')+(districts.length+1),type,requested,site:site.point,rings:[shape.outline],
     description:describeDistrict(grid,site,profile,category,shape)});
    break;
   }
   if(districts.length>before)break;
  }
 }
 return districts;
}

function existingAccess(project,grid,land,component,arterialOnly=false){
 const endpoints=project.features.filter(f=>f.kind==='road'&&(arterialOnly?['arterial','secondary']:['arterial','secondary','highway']).includes(f.type)&&
  f.geometryType!=='polygon'&&(!f.structure||f.structure==='ground')&&(f.stackLevel??0)===0)
  .flatMap(f=>[f.points[0],f.points.at(-1)]);
 endpoints.sort((a,b)=>edgeDistance(a)-edgeDistance(b));
 const result=[];
 for(const point of endpoints){
  if(result.some(link=>distance(link.point,point)<2200))continue;
  const id=connectionCell(grid,point);
  if(id<0||land.ids[id]!==component)continue;
  result.push({point,id});
  if(result.length===2)break;
 }
 return result;
}

function highwayAccessSets(project,grid,land,manual){
 if(manual.length>=2){
  if(new Set(manual.map(link=>link.id)).size!==manual.length)throw Error("有手动接点落在同一处，请拉开距离。");
  return [manual];
 }
 const key=point=>point.map(n=>Math.round(n*10)).join(',');
 const vertices=new Map();
 for(const points of project.features.filter(f=>f.kind==='road'&&f.type==='highway'&&f.geometryType!=='polygon').flatMap(geometryParts)){
  for(let i=0;i<points.length;i++){
   const point=points[i],id=key(point);
   if(!vertices.has(id))vertices.set(id,{point,neighbors:[]});
   if(i>0){
    const previous=vertices.get(key(points[i-1])),current=vertices.get(id);
    previous.neighbors.push(current);current.neighbors.push(previous);
   }
  }
 }
 const edges=[...vertices.values()].filter(({point})=>edgeDistance(point)<=cellSize*2)
  .sort((a,b)=>edgeDistance(a.point)-edgeDistance(b.point));
 const imported=[];
 for(const edge of edges){
  if(imported.filter(link=>distance(link.edge,edge.point)<850).length>=3)continue;
  const visited=new Set([edge]),queue=[edge];
  for(let i=0;i<queue.length;i++){
   const vertex=queue[i],id=connectionCell(grid,vertex.point);
   if(id>=0&&!imported.some(link=>distance(link.point,vertex.point)<240)){
    imported.push({point:vertex.point,id,edge:edge.point});break;
   }
   for(const neighbor of vertex.neighbors){
    if(visited.has(neighbor)||distance(edge.point,neighbor.point)>3500)continue;
    visited.add(neighbor);queue.push(neighbor);
   }
  }
 }
 const boundary=[];
 for(let id=0;id<cellCount;id++){
  if(!grid.passable[id])continue;
  const [x,y]=centerOf(id),edge=edgeDistance([x,y]);
  if(edge!==cellSize/2)continue;
  const point=[x===edge?0:SIZE-x===edge?SIZE:x,y===edge?0:SIZE-y===edge?SIZE:y];
  if(safeSurfaceLink(grid,[x,y],point))boundary.push({id,point,edge:point,candidate:true,flat:flatNeighborhood(grid,id)});
 }
 const pairs=[];
 const available=manual.length?manual:[...imported,...boundary];
 for(const [i,first]of available.entries()){
  const targets=manual.length?[...imported,...boundary]:available.slice(i+1);
  for(const second of targets){
   if(land.ids[first.id]!==land.ids[second.id])continue;
   const separation=distance(first.point,second.point);
   if(separation<2000||first.edge&&distance(first.edge,second.edge)<1800)continue;
   const score=Math.min(separation,12500)/1500+((first.flat??0)+(second.flat??0))*1.2
    -Number(!!first.candidate)*2.8-Number(!!second.candidate)*2.8;
   pairs.push({access:[first,second],score});
  }
 }
 pairs.sort((a,b)=>b.score-a.score);
 const sets=[];
 // Try a connected network when there are several distinct existing exits.
 if(!manual.length){
  const exits=[];
  for(const exit of imported){
   if(exits.every(other=>distance(other.edge,exit.edge)>=1800))exits.push(exit);
  }
  for(const component of new Set(exits.map(exit=>land.ids[exit.id]))){
   const group=exits.filter(exit=>land.ids[exit.id]===component).slice(0,5);
   if(group.length>=3)sets.push(group);
  }
 }
 for(const {access}of pairs){
  if(sets.some(set=>set.length===access.length&&access.every(exit=>set.some(other=>distance(exit.point,other.point)<650))))continue;
  sets.push(access);
  if(sets.length===10)break;
 }
 return sets;
}

function routedRoads(grid,root,targets,type){
 const network=new Set([root.id]),roads=[];
 for(const target of targets){
  const path=routeToNetwork(grid,target.id,network);
  if(!path.length)continue;
  for(const id of path)network.add(id);
  const points=path.map(centerOf);
  if(distance(target.point,points[0])>1e-6)points.unshift(target.point);
  if(path.at(-1)===root.id&&distance(root.point,points.at(-1))>1e-6)points.push(root.point);
  const roadType=type==='combined'?(roads.length<2?'arterial':'secondary'):type;
  if(points.length>1)roads.push({points:collapseStraight(points),type:roadType});
 }
 return roads;
}

const highwayHeadings=directions.map(([x,y])=>{
 const norm=Math.hypot(x,y);
 return [x/norm,y/norm];
});
const highwayTurnCost=highwayHeadings.map(([x,y])=>highwayHeadings.map(([u,v])=>1-x*u-y*v));

function highwayBearing(a,b){
 if(distance(a,b)<10)return 8;
 const angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
 const dx=Math.round(Math.cos(Math.round(angle/(Math.PI/4))*Math.PI/4));
 const dy=Math.round(Math.sin(Math.round(angle/(Math.PI/4))*Math.PI/4));
 return directionIndex(dx,dy);
}

function highwayDevelopment(grid){
 const development=new Float32Array(cellCount);
 for(let id=0;id<cellCount;id++){
  const x=id%gridWidth,y=Math.floor(id/gridWidth);
  for(let yy=Math.max(0,y-2);yy<=Math.min(gridWidth-1,y+2);yy++){
   for(let xx=Math.max(0,x-2);xx<=Math.min(gridWidth-1,x+2);xx++){
    const n=yy*gridWidth+xx;
    development[id]+=(grid.built[n]*45+grid.occupied[n]*16)/(1+(x-xx)**2+(y-yy)**2);
   }
  }
 }
 return development;
}

function highwayPath(grid,target,network,root,avoid,strength,relaxed){
 const start=target.id,slots=9,initial=start*slots+highwayBearing(target.point,centerOf(start));
 const arrival=highwayBearing(centerOf(root.id),root.point);
 const turnLimit=relaxed?1.01:.30;
 const cost=new Float64Array(cellCount*slots).fill(Infinity),parent=new Int32Array(cost.length).fill(-1);
 const heap=routeHeap(),estimate=new Float64Array(cellCount).fill(-1);
 const goals=[...network].map(centerOf);
 function heuristic(id){
  if(estimate[id]!==-1)return estimate[id];
  const [x,y]=centerOf(id);
  let nearest=Infinity;
  for(const [u,v]of goals)nearest=Math.min(nearest,(x-u)**2+(y-v)**2);
  return estimate[id]=Math.sqrt(nearest);
 }
 cost[initial]=0;heap.push(initial,heuristic(start));
 while(heap.size){
  const {id:state,priority}=heap.pop(),id=Math.floor(state/slots),heading=state%slots;
  if(priority>cost[state]+heuristic(id))continue;
  if(network.has(id)){
   if(id===root.id&&heading!==8&&arrival!==8&&highwayTurnCost[heading][arrival]>turnLimit)continue;
   const path=[];
   for(let step=state;step!==-1;step=parent[step])path.push(Math.floor(step/slots));
   return path.reverse();
  }
  const previous=parent[state]<0?-1:Math.floor(parent[state]/slots);
  const lastBridge=grid.bridges.get(id)?.has(previous);
  const x=id%gridWidth,y=Math.floor(id/gridWidth);
  for(const next of routableNeighbors(grid,id)){
   const base=routeStep(grid,id,next);
   if(!Number.isFinite(base))continue;
   const dx=next%gridWidth-x,dy=Math.floor(next/gridWidth)-y;
   const nextHeading=directionIndex(Math.sign(dx),Math.sign(dy)),nextState=next*slots+nextHeading;
   const bridge=grid.bridges.get(id)?.has(next);
   const turn=heading===8?0:highwayTurnCost[heading][nextHeading];
   if(turn>turnLimit||turn>.30&&(bridge||lastBridge))continue;
   const departure=avoid?(avoid[id]+avoid[next])/2:0;
   const terrainPenalty=(grid.preferred?.[next]||0)+grid.development[next]+(grid.coast[next]<2&&!bridge?35:0);
   const score=cost[state]+base+terrainPenalty+(bridge||lastBridge?850:420)*turn+Math.hypot(dx,dy)*cellSize*departure*strength;
   if(score>=cost[nextState])continue;
   parent[nextState]=state;cost[nextState]=score;
   heap.push(nextState,score+heuristic(next));
  }
 }
 return [];
}

function highwayNetwork(grid,access,avoid,strength){
 const [root,...targets]=access,network=new Set([root.id]),paths=[];
 let metres=0,cost=0;
 for(const target of targets){
  let path=highwayPath(grid,target,network,root,avoid,strength,false);
  if(!path.length)path=highwayPath(grid,target,network,root,avoid,strength,true);
  if(!path.length)return null;
  for(const [i,id]of path.entries()){
   network.add(id);
   if(!i)continue;
   const previous=path[i-1];
   metres+=distance(centerOf(previous),centerOf(id));
   cost+=routeStep(grid,previous,id);
  }
  paths.push({path,target});
 }
 return {paths,metres,cost};
}

function highwayCorridorCells(path){
 const cells=[path[0]];
 for(let i=1;i<path.length;i++){
  const id=path[i-1],next=path[i],dx=next%gridWidth-id%gridWidth,dy=Math.floor(next/gridWidth)-Math.floor(id/gridWidth);
  const span=Math.max(Math.abs(dx),Math.abs(dy)),step=Math.sign(dx)+Math.sign(dy)*gridWidth;
  for(let k=1;k<=span;k++)cells.push(id+k*step);
 }
 return cells;
}

function highwayCorridorDistances(paths){
 const distances=new Float32Array(cellCount).fill(Infinity),reach=8;
 const cells=new Set(paths.flatMap(({path})=>highwayCorridorCells(path)));
 for(const id of cells){
  const x=id%gridWidth,y=Math.floor(id/gridWidth);
  for(let ny=Math.max(0,y-reach);ny<=Math.min(gridWidth-1,y+reach);ny++){
   for(let nx=Math.max(0,x-reach);nx<=Math.min(gridWidth-1,x+reach);nx++){
    const target=ny*gridWidth+nx;
    distances[target]=Math.min(distances[target],(nx-x)**2+(ny-y)**2);
   }
  }
 }
 return distances;
}

function differentHighwayCorridor(paths,distances){
 return paths.some(({path})=>{
  let run=0;
  for(const id of highwayCorridorCells(path)){
   run=distances[id]>=9?run+1:0;
   if(run>=6)return true;
  }
  return false;
 });
}

function highwayAlternatives(grid,sets,makeDraft,junctions=[]){
 const options=[],previous=[];
 const routeFor=(access,avoid,strength)=>{
  const stops=[...junctions,...access];
  if(new Set(stops.map(link=>link.id)).size!==stops.length)return null;
  return highwayNetwork(grid,stops,avoid,strength);
 };
 let primary=null;
 function consider(route,access){
  if(!route||primary&&(route.metres>primary.metres*1.45||route.cost>primary.cost*1.65))return;
  if(!previous.every(field=>differentHighwayCorridor(route.paths,field)))return;
  const draft=makeDraft(route,access);
  if(!draft)return;
  primary??=route;
  options.push(draft);previous.push(highwayCorridorDistances(route.paths));
 }
 for(const access of sets){
  consider(routeFor(access,null,0),access);
  if(options.length===3)return options;
  if(!options.length)continue;
  if(sets.length>1&&options.length<2)continue;
  if(sets.length>1)break;
 }
 const access=options[0]?.access||sets[0];
 if(!access)return options;
 const weight=new Float32Array(cellCount);
 for(const strength of [1.7,3.2,4.8,6.5]){
  for(let id=0;id<cellCount;id++){
   const point=centerOf(id),toExit=Math.min(...access.map(exit=>distance(point,exit.point)));
   const exposure=Math.min(1,Math.max(0,(toExit-320)/1000));
   const overlap=previous.reduce((sum,field)=>sum+Math.max(0,1-Math.sqrt(field[id])/8)**2,0);
   weight[id]=exposure*overlap;
  }
  consider(routeFor(access,weight,strength),access);
  if(options.length===3)break;
 }
 return options;
}

function safeHighwayLine(grid,a,b,halfWidth,elevated=false){
 const span=distance(a,b);
 if(!span)return true;
 const nx=(b[1]-a[1])/span,ny=(a[0]-b[0])/span;
 const steps=Math.ceil(span/10);
 for(const offset of [-halfWidth,0,halfWidth]){
  const start=[a[0]+nx*offset,a[1]+ny*offset],end=[b[0]+nx*offset,b[1]+ny*offset];
  // The highway centerline may meet the map border at a diagonal.
  if(!inBounds(start)||!inBounds(end)){
   if(!offset)return false;
   if(!inBounds(start)&&!inBounds(end))continue;
  }
  if(!elevated&&!offset&&!safeSurfaceLink(grid,start,end))return false;
  for(let i=0;i<=steps;i++){
   const t=i/steps,point=[start[0]+(end[0]-start[0])*t,start[1]+(end[1]-start[1])*t];
   if(!inBounds(point))continue;
   if(grid.built[cellAt(point)]||!elevated&&terrainAt(grid.depth,point)>0||inReserve(point,grid.reserves))return false;
  }
 }
 return true;
}

function highwayDeflection(a,b,c){
 const ux=b[0]-a[0],uy=b[1]-a[1],vx=c[0]-b[0],vy=c[1]-b[1];
 return Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy));
}

function highwayArc(a,b,c,scale){
 const before=distance(a,b),after=distance(b,c);
 const u=[(b[0]-a[0])/before,(b[1]-a[1])/before],v=[(c[0]-b[0])/after,(c[1]-b[1])/after];
 const turn=Math.atan2(u[0]*v[1]-u[1]*v[0],u[0]*v[0]+u[1]*v[1]);
 if(Math.abs(turn)<.025||Math.abs(turn)>Math.PI*.8)return [];
 const tangent=Math.tan(Math.abs(turn)/2),side=Math.sign(turn);
 const trim=Math.min(before*.45,after*.45,420*tangent)*scale;
 if(trim<4)return [];
 const r=trim/tangent,entry=[b[0]-u[0]*trim,b[1]-u[1]*trim];
 const center=[entry[0]-side*u[1]*r,entry[1]+side*u[0]*r];
 const bearing=Math.atan2(entry[1]-center[1],entry[0]-center[0]);
 const steps=Math.max(3,Math.ceil(Math.abs(turn)/.14),Math.ceil(r*Math.abs(turn)/32));
 return Array.from({length:steps+1},(_,j)=>{
  const angle=bearing+turn*j/steps;
  return [center[0]+r*Math.cos(angle),center[1]+r*Math.sin(angle)];
 });
}

function softenHighway(grid,points,halfWidth,approach,departure){
 if(points.length<2)return points;
 const headed=approach||points[0],leaving=departure||points.at(-1);
 const shortened=[points[0]];
 for(let i=0;i<points.length-1;){
  let j=Math.min(i+12,points.length-1);
  for(;j>i+1;j--){
   if(distance(points[i],points[j])>1350)continue;
   const before=shortened.at(-2)||headed,after=points[j+1]||leaving;
   if(highwayDeflection(before,points[i],points[j])>Math.PI/4||
    highwayDeflection(points[i],points[j],after)>Math.PI/4)continue;
   if(points.slice(i+1,j).some(point=>segmentProjection(point,points[i],points[j]).distance>112))continue;
   if(safeHighwayLine(grid,points[i],points[j],halfWidth))break;
  }
  shortened.push(points[j]);i=j;
 }
 const straight=collapseStraight(shortened),curve=[straight[0]];
 for(let i=1;i<straight.length-1;i++){
  const a=straight[i-1],b=straight[i],c=straight[i+1];
  let rounded=false;
  for(const scale of [1,.72,.49,.28,.15]){
   const arc=highwayArc(a,b,c,scale);
   if(!arc.length)break;
   if(!safeHighwayLine(grid,curve.at(-1),arc[0],halfWidth)||
    !safeHighwayLine(grid,arc.at(-1),c,halfWidth)||
    arc.some((point,j)=>j&&!safeHighwayLine(grid,arc[j-1],point,halfWidth)))continue;
   curve.push(...arc);rounded=true;break;
  }
  if(!rounded)curve.push(b);
 }
 curve.push(straight.at(-1));
 return curve;
}

function roundHighwayBridgeJoin(grid,first,second,pinned,halfWidth){
 const before=first.points,after=second.points,b=before.at(-1);
 if(b!==after[0]||pinned.has(b.join(','))||!!first.structure===!!second.structure)return;
 const a=before.at(-2),c=after[1];
 for(const scale of [1,.68,.4]){
  const arc=highwayArc(a,b,c,scale);
  if(!arc.length)return;
  if(arc.some((point,i)=>i&&!safeHighwayLine(grid,arc[i-1],point,halfWidth,true)))continue;
  before.pop();after.shift();
  if(first.structure){before.push(...arc);after.unshift(arc.at(-1));}
  else{before.push(arc[0]);after.unshift(...arc);}
  return;
 }
}

function highwayCrossing(a,b,c,d){
 const x=b[0]-a[0],y=b[1]-a[1],u=d[0]-c[0],v=d[1]-c[1],det=x*v-y*u;
 if(Math.abs(det)<1e-8)return null;
 const m=c[0]-a[0],n=c[1]-a[1],t=(m*v-n*u)/det,k=(m*y-n*x)/det;
 return t>=-1e-8&&t<=1+1e-8&&k>=-1e-8&&k<=1+1e-8?[a[0]+x*t,a[1]+y*t]:null;
}

function highwayInterchanges(grid,roads,access,existing,joins,junctions=[]){
 const interchanges=[],crossings=[...junctions.map(link=>link.point),...joins];
 const segments=roads.flatMap((road,index)=>road.points.slice(1).map((point,i)=>[road.points[i],point,index,i]));
 for(const [a,b,index,i]of segments){
  for(const [c,d]of existing.segments){
   const point=highwayCrossing(a,b,c,d);
   if(point&&access.every(exit=>distance(point,exit.point)>1))crossings.push(point);
  }
  for(const [c,d,other,j]of segments){
   const sharesEndpoint=[a,b].some(point=>distance(point,c)<.01||distance(point,d)<.01);
   if(!sharesEndpoint&&(other>index||other===index&&j<i-1)){
    const point=highwayCrossing(a,b,c,d);
    if(point)crossings.push(point);
   }
  }
 }
 for(const point of crossings){
  if(existing.interchanges.some(f=>pointInPolygon(point,f.points)))continue;
  if(interchanges.some(f=>pointInPolygon(point,f.points)))continue;
  let best=null,bestScore=Infinity;
  for(const half of [160,128,100]){
   for(const dx of [0,-half*.45,half*.45]){
    for(const dy of [0,-half*.45,half*.45]){
     const [x,y]=point.map((value,i)=>value+[dx,dy][i]);
     const ring=[[x-half,y-half],[x+half,y-half],[x+half,y+half],[x-half,y+half]];
     if(ring.some(p=>!inBounds(p)))continue;
     const first=cellAt(ring[0]),last=cellAt(ring[2]);
     let score=Math.hypot(dx,dy)+200-half,valid=true,low=Infinity,high=-Infinity;
     for(let row=Math.floor(first/gridWidth);row<=Math.floor(last/gridWidth);row++){
      for(let col=first%gridWidth;col<=last%gridWidth;col++){
       const id=row*gridWidth+col;
       if(grid.built[id]||grid.reservedCells[id])valid=false;
       score+=grid.occupied[id]*8+grid.wet[id]*18;
      }
     }
     const steps=Math.ceil(half*2/24);
     for(let row=0;row<=steps;row++)for(let col=0;col<=steps;col++){
      const sample=[x-half+2*half*col/steps,y-half+2*half*row/steps],height=terrainAt(grid.elevation,sample);
      if(!Number.isFinite(height))valid=false;
      low=Math.min(low,height);high=Math.max(high,height);
      if(terrainAt(grid.depth,sample)>0)score+=3;
     }
     if(!valid||high-low>half*.25||score>200-half+165)continue;
     if(score<bestScore){best=ring;bestScore=score;}
    }
   }
  }
  if(!best)return null;
  interchanges.push({points:best});
 }
 return interchanges;
}

function highwayDraft(grid,{paths},access,halfWidth,existing,{type='highway',junctions=[]}={}){
 const roads=[],joins=new Set(paths.map(({path})=>path.at(-1))),root=access[0];
 const fixed=new Map(junctions.map(link=>[link.id,link.point]));
 const at=id=>fixed.get(id)||centerOf(id);
 const pinned=new Set([...joins,...fixed.keys()].map(id=>at(id).join(',')));
 const inJunction=point=>junctions.some(link=>distance(link.point,point)<=100);
 const emit=(points,approach,departure)=>{
  if(points.length>1)roads.push({points:softenHighway(grid,points,halfWidth,approach,departure),type});
 };
 for(const {path,target}of paths){
  const firstRoad=roads.length;
  let ground=[at(path[0])],approach=null;
  if(distance(target.point,ground[0])>1e-6)ground.unshift(target.point);
  for(let i=1;i<path.length;i++){
   const id=path[i],next=at(id);
   if(grid.bridges.get(path[i-1])?.has(id)){
    emit(ground,approach,next);
    approach=ground.at(-1);
    roads.push({points:[approach,next],type,structure:'elevated'});
    ground=[next];
   }else ground.push(next);
   if(i<path.length-1&&(joins.has(id)||fixed.has(id))){
    emit(ground,approach,at(path[i+1]));approach=ground.at(-2);ground=[next];
   }
  }
  if(path.at(-1)===root.id&&distance(root.point,ground.at(-1))>1e-6)ground.push(root.point);
  emit(ground,approach);
  for(let i=firstRoad+1;i<roads.length;i++)roundHighwayBridgeJoin(grid,roads[i-1],roads[i],pinned,halfWidth);
 }
 const warnings=[],bridges=roads.filter(road=>road.structure==='elevated').length;
 if(bridges)warnings.push('包含 '+bridges+' 处跨水桥位草案，请核对桥头高差和游戏内净空。');
 const sharp=points=>points.slice(1,-1).some((point,i)=>!inJunction(point)&&highwayDeflection(points[i],point,points[i+2])>Math.PI/10);
 if(roads.some(({points},i)=>sharp(points)||i&&points[0]===roads[i-1].points.at(-1)&&
  sharp([roads[i-1].points.at(-2),points[0],points[1]])))return null;
 if(!roads.length)return null;
 const interchanges=highwayInterchanges(grid,roads,access,existing,paths.slice(1).map(({path})=>at(path.at(-1))),junctions);
 if(!interchanges)return null;
 const metres=roads.reduce((sum,road)=>sum+length(road.points),0);
 const candidateAccess=access.filter(link=>link.candidate).map(link=>link.point);
 if(candidateAccess.length)warnings.push('地图边缘的候选出入口需在游戏里核对。');
 return {roads,interchanges,warnings,metres,access,candidateAccess,accessCount:access.length};
}

function masterRoadSegments(roads){
 return roads.flatMap(geometryParts).flatMap(points=>points.slice(1).map((point,i)=>[points[i],point]));
}

function masterRoadContext(project,names,additional=[]){
 const roads=project.features.filter(f=>f.kind==='road'&&names.includes(f.type)&&
  f.geometryType!=='polygon'&&f.structure!=='tunnel');
 return {segments:masterRoadSegments([...roads,...additional]),interchanges:project.features.filter(f=>f.kind==='interchange')};
}

function masterRoadAnchors(grid,points,label){
 const anchors=points.map(point=>({point,id:connectionCell(grid,point)}));
 if(anchors.some(anchor=>anchor.id<0))throw Error(label+'有点位落在水体、陡坡或避让地带，请移动点位。');
 if(new Set(anchors.map(anchor=>anchor.id)).size!==anchors.length)throw Error(label+'有点位过近，请拉开距离。');
 return anchors;
}

function corridorPreference(roads,type){
 const byType=roads.filter(road=>road.type===type);
 if(!byType.length)return null;
 const proximity=arterialHighwaySeparation({roads:byType});
 return Float32Array.from(proximity,value=>(1-value)*280);
}

function arterialHighwaySeparation(highway){
 if(!highway)return null;
 const segments=masterRoadSegments(highway.roads);
 const penalty=new Float32Array(cellCount);
 for(const [a,b]of segments){
  const x0=Math.max(0,Math.floor((Math.min(a[0],b[0])-260)/cellSize));
  const y0=Math.max(0,Math.floor((Math.min(a[1],b[1])-260)/cellSize));
  const x1=Math.min(gridWidth-1,Math.floor((Math.max(a[0],b[0])+260)/cellSize));
  const y1=Math.min(gridWidth-1,Math.floor((Math.max(a[1],b[1])+260)/cellSize));
  for(let y=y0;y<=y1;y++)for(let x=x0;x<=x1;x++){
   const id=y*gridWidth+x,gap=segmentProjection(centerOf(id),a,b).distance;
   penalty[id]=Math.max(penalty[id],1-gap/260);
  }
 }
 return penalty;
}

function planSmoothArterials(project,grid,land,manual,junctions,highway,centersHint=[]){
 const component=(junctions.length?land.ids[junctions[0].id]:manual.length?land.ids[manual[0].id]:land.largest);
 if([...manual,...junctions].some(link=>land.ids[link.id]!==component))return null;
 const access=manual.length?manual:existingAccess(project,grid,land,component,true);
 const scenicCenters=centersHint.map(point=>({point,id:connectionCell(grid,point)}))
  .filter(link=>link.id>=0&&land.ids[link.id]===component);
 const centers=scenicCenters.length>=2?scenicCenters:chooseCenters(grid,land,component,['mid-res','office','industry','mid-mix','civic'],access,1500);
 const halfWidth=(project.settings?.editor?.roadStyles?.arterial?.width??roadInfo('arterial').width)/2;
 const existing=masterRoadContext(project,['highway'],highway?.roads||[]);
 existing.interchanges.push(...(highway?.interchanges||[]));
 const avoid=arterialHighwaySeparation(highway);
 const bases=[];
 if(junctions.length)bases.push(junctions);
 else if(highway){
  const points=masterRoadSegments(highway.roads.filter(road=>road.structure!=='elevated')).flatMap(([a,b])=>{
   const count=Math.max(1,Math.ceil(distance(a,b)/300));
   return Array.from({length:count},(_,i)=>a.map((n,k)=>n+(b[k]-n)*(i+.5)/count));
  });
  const prefer=centers[0]?.point||[SIZE/2,SIZE/2];
  points.sort((a,b)=>distance(a,prefer)-distance(b,prefer));
  for(const point of points){
   if(edgeDistance(point)<450||bases.some(([prior])=>distance(prior.point,point)<900))continue;
   const id=connectionCell(grid,point);
   if(id<0||land.ids[id]!==component||!highwayInterchanges(grid,[],[],existing,[point]))continue;
   bases.push([{point,id}]);
   if(bases.length===4)break;
  }
 }else bases.push([]);
 const accessChoices=manual.length?[manual]:[access,...access.map(link=>[link]),[]];
 let best=null,bestScore=-Infinity;
 for(const joins of bases){
  for(const exits of accessChoices){
   const required=[...joins,...exits];
   const stopIds=new Set(required.map(link=>link.id));
   if(stopIds.size!==required.length)continue;
   const free=centers.filter(link=>!stopIds.has(link.id)&&required.every(other=>distance(other.point,link.point)>750));
   const options=[free.slice(0,3),free.slice(0,1),[]];
   for(const center of free.slice(1,4))options.push([center]);
   if(required.length===0)for(const center of free.slice(1))options.push([free[0],center]);
   const tried=new Set();
   for(const extra of options){
    const stops=[...required,...extra],key=stops.map(link=>link.id).join(',');
    if(stops.length<2||tried.has(key))continue;
    tried.add(key);
    const route=highwayNetwork(grid,stops,avoid,.85);
    if(!route)continue;
    const draft=highwayDraft(grid,route,stops,halfWidth,existing,{type:'arterial',junctions:joins});
    if(draft){
     if(!manual.length&&!exits.length)draft.warnings.push('未找到合适的现状主干道接点，本方案连接可建设区。');
     const plan={...draft,access:exits,accessCount:exits.length};
     if(!highway||manual.length>=2||draft.metres>=4500&&exits.length)return plan;
     const score=Math.min(draft.metres,12000)+exits.length*1500;
     if(score>bestScore){best=plan;bestScore=score;}
     break;
    }
   }
  }
 }
 return best;
}

function planMajorRoads(project,grid,land,{mode,highwayPoints,arterialPoints,interchangePoints,centersHint,preferredRoads}){
 const highwayAccess=masterRoadAnchors(grid,highwayPoints,'高速对外接点');
 const arterialAccess=masterRoadAnchors(grid,arterialPoints,'主干道对外接点');
 const junctions=masterRoadAnchors(grid,interchangePoints,'互通点');
 if(mode==='arterial'){
  grid.preferred=corridorPreference(preferredRoads,'arterial');
  const draft=planSmoothArterials(project,grid,land,arterialAccess,junctions,null,centersHint);
  if(!draft)throw Error('未找到平顺且满足接点的主干道方案。请调整接点、互通位置或避让范围。');
  return {...draft,districts:[]};
 }
 const sets=highwayAccessSets(project,grid,land,highwayAccess);
 if(!sets.length)throw Error('找不到可用的两处高速出入口，请尝试手动指定接点。');
 const halfWidth=(project.settings?.editor?.roadStyles?.highway?.width??roadInfo('highway').width)/2;
 const existing=masterRoadContext(project,['highway']);
 const highwayPreference=corridorPreference(preferredRoads,'highway');
 const arterialPreference=corridorPreference(preferredRoads,'arterial');
 grid.preferred=highwayPreference;
 const alternatives=highwayAlternatives(grid,sets,(route,access)=>{
  const draft=highwayDraft(grid,route,junctions.length?[...junctions,...access]:access,halfWidth,existing,{junctions});
  if(!draft)return null;
  const {roads,interchanges,warnings}=draft;
  if(mode==='highway')return {...draft,access,accessCount:access.length};
  grid.preferred=arterialPreference;
  const arterial=planSmoothArterials(project,grid,land,arterialAccess,junctions,draft,centersHint);
  grid.preferred=highwayPreference;
  if(!arterial)return null;
  return {...draft,roads:[...roads,...arterial.roads],warnings:[...warnings,...arterial.warnings],
   interchanges:[...interchanges,...arterial.interchanges],access,arterialAccess:arterial.access,
   accessCount:access.length+arterial.accessCount,arterialMetres:arterial.metres};
 },junctions);
 if(!alternatives.length)throw Error('未找到平顺且满足接点和互通用地的道路方案。请调整点位或避让范围。');
 const warnings=alternatives.length===1?['当前地形和接点只找到一套符合条件的方案。']:[];
 const [first]=alternatives;
 return {...first,districts:[],warnings:[...warnings,...first.warnings],highwayWarnings:warnings,alternatives};
}

export function generateMasterPlan(project,{elevation,depth,mode='combined',focus='balanced',districtCount=5,
 useCounts=null,maxGrade=.12,priorityUse='',accessPoints=[],highwayPoints=mode==='highway'?accessPoints:[],arterialPoints=mode==='arterial'?accessPoints:[],interchangePoints=[],reserves=[],districtScales,districtHints,centersHint=[],preferredRoads=[]}={}){
 if(!elevation||!depth)throw Error('总规生成需要原始 Carto 高程与水深 GeoTIFF');
 if(!['combined','highway','arterial','joint','district'].includes(mode)||!masterPlanProfiles[focus]||
  !Number.isInteger(districtCount)||districtCount<1||districtCount>40||![.08,.12,.16].includes(maxGrade))throw Error('目标片区数须为 1–40 的整数。');
 const grid=makeTerrainGrid(project,elevation,depth,reserves,maxGrade);
 const majorRoads=['highway','arterial','joint'].includes(mode);
 if(majorRoads){addHighwayBridges(grid);grid.development=highwayDevelopment(grid);}
 const land=connectedLand(grid);
 if(land.largest<0)throw Error('没有符合坡度和避让条件的连续陆地');
 if(majorRoads)return planMajorRoads(project,grid,land,{mode,highwayPoints,arterialPoints,interchangePoints,centersHint,preferredRoads});
 const warnings=[];
 const manual=accessPoints.map(point=>({point,id:connectionCell(grid,point)}));
 if(manual.some(link=>link.id<0))throw Error('有接点无法连接到可通行陆地，请把接点移到岸线内侧或较平坦的位置');
 if(manual.some(link=>land.ids[link.id]!==land.ids[manual[0].id]))throw Error('接点位于彼此不连通的陆地，请先选同一侧的接点');
 const component=manual.length?land.ids[manual[0].id]:land.largest;
 const access=manual.length?manual:existingAccess(project,grid,land,component);
 const profile=masterPlanProfiles[focus];
 const uses=Array.from({length:districtCount},(_,i)=>profile[i%profile.length]);
 if(useCounts){
  uses.length=0;
  for(const [type,count]of Object.entries(useCounts)){
   if(!Object.hasOwn(useNames,type)||!Number.isInteger(count)||count<0||count>40)throw Error('各用途数量须为 0–40 的整数。');
   for(let i=0;i<count;i++)uses.push(type);
  }
  if(uses.length!==districtCount)throw Error(`各用途合计为 ${uses.length}，请调整到目标片区数 ${districtCount}。`);
 }else if(priorityUse&&useNames[priorityUse]&&!uses.includes(priorityUse))uses[Math.min(1,uses.length-1)]=priorityUse;
 uses.sort((a,b)=>Number(coastUses.has(b))-Number(coastUses.has(a)));
 let roads=[];
 if(mode!=='district'){
  const centers=chooseCenters(grid,land,component,uses,access,Math.max(700,Math.min(1800,3900/Math.sqrt(districtCount))),!!useCounts);
  if(!centers.length)throw Error('连通区域内没有符合所选用途的连续建设用地。');
  roads=routedRoads(grid,centers[0],[...access,...centers.slice(1)],mode);
  if(!access.length)warnings.push('未找到现有主路接点，本方案先连接可建设区。');
 }
 const districts=planDistricts(project,grid,uses,districtCount,mode==='district'&&!manual.length?null:component,land,!!useCounts,manual,districtScales,districtHints);
 if(districts.some(d=>d.type!==d.requested))warnings.push('缺少合适的岸边腹地，部分滨水用途改为陆路物流。');
 if(!districts.length)throw Error('无法划出足够大的规划区块，请调整用途或避让范围。');
 if(districts.length<uses.length){
  const missing=new Map();
  for(const type of uses)missing.set(type,(missing.get(type)||0)+1);
  for(const {type}of districts)missing.set(type,(missing.get(type)||0)-1);
  warnings.push(useCounts?'未能安置：'+[...missing].filter(([,count])=>count>0).map(([type,count])=>useNames[type]+' × '+count).join('、')+'。':
   '符合条件的连续用地不足，减少了片区数量。');
 }
 return {roads,districts,warnings,accessCount:access.length};
}

export const scenicThemes={
 valley:{name:'河谷老镇',core:'old',link:['market','park'],uses:{old:1,market:1,'mid-res':1,park:1,reserve:1},
  direction:'让老镇沿缓坡与河阶展开。用桥头或沿河市集串起街面，隔岸留出可看到镇子轮廓的景观。'},
 harbor:{name:'滨水港城',core:'marina',link:['commerce','park'],uses:{marina:1,port:1,'mid-mix':1,commerce:1,park:1},
  direction:'把作业岸线与公共滨水分开，沿公共岸线布置码头、商业和步行空间，向内陆组织港区交通。'},
 mountain:{name:'山地度假',core:'tourism',link:['park','villa'],uses:{tourism:1,villa:1,park:1,forest:1,reserve:1},
  direction:'用坡地、树带和远景框出主要场景。建筑沿缓坡分组，山脊及陡坡优先留白。'},
 rail:{name:'铁路工业城',core:'station',link:['old','park'],uses:{station:1,industry:1,depot:1,old:1,park:1},
  direction:'用车站和旧工业作为地标。站前街面面向城区，仓储和货运留在铁路一侧。'}
};
const scenicVolume={
 small:{label:'低体量',scale:.68,height:18},
 medium:{label:'中等体量',scale:1,height:35},
 large:{label:'集中体量',scale:1.28,height:65}
};

function scenicObservation(elevation,depth,core,reserves){
 const target=core.site,height=terrainAt(elevation,target);
 let best=null,priority=-Infinity;
 for(const metres of [650,950,1300,1750]){
  for(let i=0;i<24;i++){
   const angle=i*Math.PI/12,point=[target[0]+metres*Math.cos(angle),target[1]+metres*Math.sin(angle)];
   if(!inBounds(point)||inReserve(point,reserves)||terrainAt(depth,point)>0||pointInPolygon(point,core.rings[0]))continue;
   const visibleHeight=terrainAt(elevation,point);
   if(!Number.isFinite(visibleHeight)||!Number.isFinite(height))continue;
   let visible=true,water=0;
   for(let j=1;j<24;j++){
    const t=j/24,p=point.map((n,k)=>n+(target[k]-n)*t);
    const sight=visibleHeight+4+(height+14-visibleHeight-4)*t;
    if(terrainAt(elevation,p)>sight){visible=false;break;}
    if(terrainAt(depth,p)>0)water++;
   }
   const value=Math.min(2,(visibleHeight-height)/28)+water*.10-Math.abs(metres-1100)/1400;
   if(visible&&value>priority){best=point;priority=value;}
  }
 }
 return best;
}

export function generateScenicPlan(project,{theme='valley',volumes={},roadMode='none',...options}={}){
 const concept=scenicThemes[theme];
 if(!concept)throw Error('请选择造景主题。');
 if(!['none','arterial','joint'].includes(roadMode))throw Error('造景道路方案无效。');
 const {elevation,depth,reserves=[]}=options;
 const scales={};
 for(const type of Object.keys(concept.uses)){
  const key=volumes[type]||(type===concept.core?'medium':'small');
  if(!Object.hasOwn(scenicVolume,key))throw Error('片区体量无效。');
  const green=['park','forest','reserve'].includes(type);
  scales[type]=green?1:scenicVolume[key].scale;
 }
 const plan=generateMasterPlan(project,{...options,mode:'district',districtCount:Object.keys(concept.uses).length,
  useCounts:concept.uses,districtScales:scales,accessPoints:[]});
 const core=plan.districts.find(d=>d.type===concept.core);
 const warnings=[...plan.warnings];
 if(!core)warnings.push('未找到符合主题的主场景用地，当前草案仅包含可落地的配套片区。');
 const observation=core&&scenicObservation(elevation,depth,core,reserves);
 const scenicGuides=observation?[{name:'推荐观察方向',points:[observation,core.site]}]:[];
 const sequence=core?[core,...concept.link.map(type=>plan.districts.find(d=>d.type===type)).filter(Boolean)]:[];
 if(sequence.length>=2)scenicGuides.push({name:'场景联系方向',points:sequence.map(d=>d.site),kind:'sequence'});
 const scenicNotes=core?[{name:'主场景 · '+core.name,points:[core.site],notes:concept.direction}]:[];
 if(scenicNotes.length&&sequence.length>=2){
  scenicNotes[0].notes+='\n场景联系：'+sequence.map(d=>useNames[d.type]).join(' → ')+'。结合地形与现状道路细化实际到达路线。';
 }
 if(observation)scenicNotes.push({name:'候选观察点',points:[observation],notes:'地形高程估算视线通向'+core.name+'。进入游戏后核对建筑、林木与镜头高度。'});
 else if(core)warnings.push('附近未找到地形视线清晰的观察点，可在地图上手动选择。');
 const districts=plan.districts.map(d=>{
  const open=['park','forest','reserve'].includes(d.type);
  const volume=scenicVolume[volumes[d.type]||(d===core?'medium':'small')];
  const role=d===core?'主场景':open?'公共空间与留白':'配套片区';
  const direction=open?'保持开敞，优先安排步道与绿化。':
   '局部细化建议按 '+volume.height+' 米限高起步。次干道优先接入主要到达方向，街坊再安排建筑与配套。';
  return {...d,scenicRole:role,scenicHeight:open?null:volume.height,
   description:d.description+'\n'+role+' · '+(open?'保留开敞':volume.label)+'。'+direction};
 });
 let roads=[],interchanges=[];
 if(roadMode!=='none'){
  const centersHint=districts.filter(d=>d.scenicRole!=='公共空间与留白').map(d=>d.site);
  try{
   const protectedZones=districts.filter(d=>d.scenicRole==='公共空间与留白')
    .map(d=>({kind:'zone',type:d.type,points:d.rings[0]}));
   const roadProject={...project,features:[...project.features,...protectedZones]};
   const draft=generateMasterPlan(roadProject,{...options,mode:roadMode,centersHint});
   roads=draft.roads;interchanges=draft.interchanges;
   warnings.push(...draft.warnings);
  }catch(error){
   warnings.push('道路草案未生成。'+error.message);
  }
 }
 return {districts,roads,interchanges,scenicGuides,scenicNotes,warnings,themeName:concept.name,direction:concept.direction};
}
