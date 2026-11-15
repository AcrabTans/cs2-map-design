import {SIZE,ZONES,roadInfo,area,distance,geometryParts,isPolygonFeature,pointInPolygon,segmentIntervals,segmentProjection} from './model.js';
import {buildingAssetLot,buildingPacksFor,makeBuildingAssetFeature} from './building-assets.js';
import {isStreetRoad,roadStackLevel} from './network-crossings.js';
import {localAssetRole,localFacilityReach,localHeightProfile,localSupportLabels,localUseFacility} from './local-building-rules.js';

const localContains=(point,rings)=>rings.reduce((inside,ring)=>inside!==pointInPolygon(point,ring),false);
const localBounds=points=>points.reduce(([x0,y0,x1,y1],[x,y])=>
 [Math.min(x0,x),Math.min(y0,y),Math.max(x1,x),Math.max(y1,y)],[Infinity,Infinity,-Infinity,-Infinity]);
const localBox=(x,y,w,h)=>[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];
const localOverlap=(a,b)=>a[0]<=b[2]&&a[2]>=b[0]&&a[1]<=b[3]&&a[3]>=b[1];
const localEdges=ring=>ring.map((point,index)=>[point,ring[(index+1)%ring.length]]);
const localUseNames=Object.fromEntries(ZONES.flatMap(([,uses])=>uses.map(([id,name])=>[id,name])));
const localGreen=new Set(['park','reserve','forest']);
const localOpen=new Set(['park','reserve','forest','agriculture','aquaculture','future']);
const localUsesAtFront=new Set(['commerce','market','office','mid-mix','high-mix','civic','clinic','station','tourism']);
const localHousing=new Set(['villa','old','mid-res','high-res','mid-mix','high-mix']);
const localCoast=new Set(['port','shipyard','marina','aquaculture']);
const localHeavy=new Set(['industry','vehicle','shipyard','port','depot','airport','power','waste','water']);
const localReference={
 villa:['residential',24,32],old:['residential',24,32],'mid-res':['residential',40,48],'high-res':['residential',48,56],
 'mid-mix':['residential',40,48],'high-mix':['residential',48,56],commerce:['commercial',40,40],market:['commercial',48,48],
 office:['commercial',48,48],industry:['industry',72,72],innovation:['industry',64,64],pharma:['industry',64,64],
 data:['industry',64,64],vehicle:['industry',112,104],'used-car':['commercial',56,56],airport:[null,300,160],
 port:[null,128,104],shipyard:[null,160,112],station:[null,128,64],depot:[null,144,96],marina:[null,80,56],
 power:['industry',104,96],waste:['municipal',88,80],water:['municipal',88,80],university:['education',112,96],
 'tech-university':['education',112,96],medical:['hospital',96,80],civic:['municipal',64,64],
 education:['education',64,56],clinic:['hospital',56,56],police:['police',56,56],fire:['fire',56,56],
 service:['municipal',56,56],agriculture:[null,104,88],forest:[null,56,56],aquaculture:[null,80,64],
 racecourse:[null,200,120],racetrack:[null,240,144],park:[null,28,28],tourism:['sports',64,56],
 reserve:[null,44,40],future:[null,64,56]
};
export function suggestLocalUses(district,project){
 let type=district?.type;
 if(!type||type==='future'){
  const linked=project?.features.filter(f=>f.kind==='zone'&&f.districtId===district?.id&&f.type!=='future')||[];
  type=linked.find(f=>f.planningGranularity==='master')?.type||linked.sort((a,b)=>area(b.points)-area(a.points))[0]?.type;
 }
 if(!type||type==='future'){
  const name=district?.name||'';
  type=[
   [/生态|湿地|绿廊|保护区/,'reserve'],[/理工/,'tech-university'],[/大学|高校|校园/,'university'],
   [/医学|医疗|康养/,'medical'],[/造船/,'shipyard'],[/港口|货港/,'port'],[/物流|货运/,'depot'],
   [/工业|循环经济|制造/,'industry'],[/马术|赛马/,'racecourse'],[/赛车/,'racetrack'],[/田园|农业/,'agriculture'],
   [/办公|商务/,'office'],[/旧城/,'old'],[/文旅|旅游/,'tourism']
  ].find(([pattern])=>pattern.test(name))?.[1];
 }
 if(!Object.hasOwn(localReference,type))type='mid-res';
 if(type==='service')return {service:75,commerce:25};
 if(type==='mid-res')return {'mid-res':50,'mid-mix':23,commerce:9,education:6,park:12};
 if(localHeavy.has(type))return type==='depot'?{depot:82,service:10,park:8}:{[type]:69,depot:15,service:8,park:8};
 if(['university','tech-university','education'].includes(type))return {[type]:55,'mid-res':20,commerce:10,park:15};
 if(localOpen.has(type))return type==='park'?{park:70,reserve:30}:{[type]:80,park:20};
 if(['clinic','medical'].includes(type))return {[type]:60,office:18,commerce:10,park:12};
 return {[type]:65,...(type==='commerce'?{'mid-mix':18}:{commerce:18}),service:7,park:10};
}

const localCatalogTypes={
 'mid-mix':'mixed','high-mix':'mixed',office:'office',tourism:'park'
};
const localLow=new Set(['villa','old']);
const localLarge=new Set(['university','tech-university','medical','education','clinic','police','fire','station','civic']);
function localHash(text,seed=2166136261){
 let hash=seed|0;
 for(let i=0;i<text.length;i++)hash=Math.imul(hash^text.charCodeAt(i),16777619);
 return hash>>>0;
}

function localVariation(seed){
 let state=seed>>>0;
 const random=()=>{
  state=(state+0x6d2b79f5)>>>0;
  let n=Math.imul(state^(state>>>15),1|state);
  n^=n+Math.imul(n^(n>>>7),61|n);
  return ((n^(n>>>14))>>>0)/4294967296;
 };
 return {
  seed,x:random()*.83,y:random()*.84,span:.82+random()*.34,pitch:.85+random()*.27,
  crossPhase:Math.floor(random()*3),crossExtra:random()<.34?1:0,
  alternateFrontages:random()<.5
 };
}

function localAssetOptions(type,assets,heightLimit,variation,profile){
 const [category,w,d]=localReference[type];
 if(localOpen.has(type))return (variation&&localGreen.has(type)?[1,.72,1.25]:[1])
  .map(scale=>({width:w*scale,depth:d*scale,lot:[w*scale,d*scale]}));
 const catalog=localCatalogTypes[type],facility=localUseFacility[type],support=localSupportLabels[type];
 const candidates=[];
 for(const entry of assets){
  const {asset,role}=entry;
  const anchor=!!facility&&role===facility;
  if(!anchor){
   if(role)continue;
   if(support?!(asset.catalogCategory==='office'&&asset.height<=profile.height+2*profile.spread):
    facility||(catalog?catalog!==asset.catalogCategory:!category||asset.type!==category))continue;
  }
  if(asset.heightIsDisplayThickness||asset.height>heightLimit||localLow.has(type)&&asset.height>21||
   type==='mid-res'&&asset.height>48||type==='high-res'&&asset.height<22)continue;
  if(!anchor&&(asset.height<Math.min(heightLimit*.82,profile.height-profile.spread*2)||
   asset.height>profile.height+profile.spread*2.25))continue;
  const bounds=entry.bounds??=localBounds(asset.rings.flat());
  const [aw,ad]=asset.lot;
  const desiredW=support&&!anchor?44:w,desiredD=support&&!anchor?42:d;
  if(aw<desiredW*.25||ad<desiredD*.25||aw>desiredW*(anchor?5:2.7)||ad>desiredD*(anchor?5:2.7))continue;
  const side=(localHeavy.has(type)?6:localLarge.has(type)?5:3)+Math.min(7,asset.height*.065);
  const front=localHeavy.has(type)?12:localLarge.has(type)?9:localUsesAtFront.has(type)?5:7;
  const rear=(localHeavy.has(type)?8:5)+Math.min(8,asset.height*.075);
  const [x0,y0,x1,y1]=bounds;
  const left=Math.max(aw/2,-x0+side),right=Math.max(aw/2,x1+side);
  const near=Math.max(ad/2,-y0+front),far=Math.max(ad/2,y1+rear);
  const width=left+right,depth=near+far;
  const sizeScore=Math.abs(Math.log(aw/desiredW))+Math.abs(Math.log(ad/desiredD));
  candidates.push({pack:entry.pack,asset,facility:anchor?facility:null,support:!anchor?support:null,width,depth,left,right,near,far,lot:asset.lot,
   score:sizeScore+(type==='tech-university'&&anchor&&!/Tech/i.test(asset.code)?.6:0)});
 }
 if(variation)for(const option of candidates){
  option.palette=(localHash(option.asset.id,variation.seed)/4294967296)*.8;
 }
 const rank=item=>item.score+(item.palette||0)+(item.facility?0:Math.abs(item.asset.height-profile.height)/profile.spread);
 candidates.sort((a,b)=>rank(a)-rank(b));
 const options=[],sizes=new Map();
 const anchors=candidates.filter(item=>item.facility).slice(0,8);
 const compact=[...candidates].sort((a,b)=>a.width*a.depth-b.width*b.depth).slice(0,4);
 for(const item of [...anchors,...compact,...candidates]){
  if(options.includes(item))continue;
  const key=[Math.round(item.width/8),Math.round(item.depth/8),Math.round(item.asset.height/10)].join(',');
  const count=sizes.get(key)||0;
  if(count>=2)continue;
  sizes.set(key,count+1);
  options.push(item);
  if(options.length===(variation?32:24))break;
 }
 if(options.length)return options;
 return [{width:w+8,depth:d+10,lot:[w,d],facility}];
}

function insideDistrict(box,rings){
 const center=[(box[0][0]+box[2][0])/2,(box[0][1]+box[2][1])/2];
 if(!localContains(center,rings))return false;
 // A hole or an indentation can be fully inside a block while its corners look valid.
 const [low,,high]=box;
 if(rings.some(ring=>ring.some(([x,y])=>x>low[0]+1e-6&&x<high[0]-1e-6&&y>low[1]+1e-6&&y<high[1]-1e-6)))return false;
 return localEdges(box).every(([a,b])=>segmentIntervals(a,b,rings).every(({point})=>
  localContains(point,rings)||rings.some(ring=>localEdges(ring).some(([u,v])=>segmentProjection(point,u,v).distance<1e-5))));
}

function localStreetSegments(project){
 return project.features.filter(f=>isStreetRoad(f)&&roadStackLevel(f)===0).flatMap(road=>
  geometryParts(road).flatMap(points=>points.slice(1).map((point,index)=>({a:points[index],b:point,name:road.name,type:road.type,feature:road,halfWidth:(road.width??roadInfo(road.type).width)/2}))));
}

function localFrontageSegments(streets){
 const byEndpoint=new Map(),key=point=>point.map(n=>Math.round(n*5)).join(',');
 for(const street of streets)for(const point of [street.a,street.b]){
  const id=key(point);
  if(!byEndpoint.has(id))byEndpoint.set(id,[]);
  byEndpoint.get(id).push(street);
 }
 const used=new Set(),runs=[];
 for(const street of streets){
  if(used.has(street))continue;
  used.add(street);
  let {a,b}=street;
  for(const first of [true,false]){
   for(let i=0;i<32;i++){
    const end=first?a:b,other=first?b:a,neighbors=byEndpoint.get(key(end));
    if(neighbors.length!==2)break;
    const next=neighbors.find(s=>!used.has(s));
    if(!next||next.type!==street.type||Math.abs(next.halfWidth-street.halfWidth)>1)break;
    const point=key(next.a)===key(end)?next.b:next.a;
    const projection=segmentProjection(end,other,point);
    if(projection.t<=0||projection.t>=1||projection.distance>1.2)break;
    used.add(next);
    if(first)a=point;else b=point;
   }
  }
  runs.push({...street,a,b});
 }
 return runs;
}

function localTerrainAt(raster,[x,y]){
 return raster.values[Math.min(raster.height-1,Math.max(0,Math.floor(y/SIZE*raster.height)))*raster.width+
  Math.min(raster.width-1,Math.max(0,Math.floor(x/SIZE*raster.width)))];
}

function safeLocalCell(corners,terrain){
 if(!terrain?.depth&&!terrain?.elevation)return true;
 const [a,b,,d]=corners,wide=distance(a,b),deep=distance(a,d);
 const cols=Math.max(2,Math.ceil(wide/20)),rows=Math.max(2,Math.ceil(deep/20));
 const previousRow=new Float64Array(cols+1);
 for(let j=0;j<=rows;j++)for(let i=0;i<=cols;i++){
  const point=a.map((n,k)=>n+(b[k]-n)*i/cols+(d[k]-n)*j/rows);
  if(terrain.depth&&localTerrainAt(terrain.depth,point)>0)return false;
  if(terrain.elevation){
   const height=localTerrainAt(terrain.elevation,point);
   if(!Number.isFinite(height)||i&&Math.abs(height-previousRow[i-1])>Math.max(.7,wide/cols*.12)||
    j&&Math.abs(height-previousRow[i])>Math.max(.7,deep/rows*.12))return false;
   previousRow[i]=height;
  }
 }
 return true;
}

function nearLocalWater(terrain,[x,y],radii=[40,90,160,250]){
 if(!terrain?.depth)return false;
 for(const radius of radii){
  for(let i=0;i<8;i++){
   const point=[x+radius*Math.cos(i*Math.PI/4),y+radius*Math.sin(i*Math.PI/4)];
   if(point.every(n=>n>=0&&n<=SIZE)&&localTerrainAt(terrain.depth,point)>0)return true;
  }
 }
 return false;
}

function localRingsHit(box,rings){
 return box.some(point=>localContains(point,rings))||
  rings.some(ring=>ring.some(point=>pointInPolygon(point,box)))||
  localEdges(box).some(([a,b])=>segmentIntervals(a,b,rings).some(({point})=>localContains(point,rings)));
}

function localStreetGap(box,street){
 const {a,b}=street;
 if(segmentIntervals(a,b,[box]).some(({point})=>pointInPolygon(point,box)))return 0;
 return Math.min(...box.map(point=>segmentProjection(point,a,b).distance),
  ...localEdges(box).flatMap(([u,v])=>[segmentProjection(a,u,v).distance,segmentProjection(b,u,v).distance]));
}

function localFrame(origin,radians){
 const c=Math.cos(radians),s=Math.sin(radians);
 return {
  local:([x,y])=>[(x-origin[0])*c+(y-origin[1])*s,(y-origin[1])*c-(x-origin[0])*s],
  world:([x,y])=>[origin[0]+x*c-y*s,origin[1]+x*s+y*c]
 };
}

function localGreenOutline(cells){
 const keys=new Set(cells.map(cell=>cell.key)),edges=new Map();
 for(const {col,row,neighbors} of cells){
  const corners=localBox(col,row,1,1);
  for(let i=0;i<4;i++){
   if(keys.has(neighbors[i]))continue;
   const from=corners[i].join(',');
   if(edges.has(from))return null;
   edges.set(from,corners[(i+1)%4]);
  }
 }
 const start=edges.keys().next().value;
 const ring=[];
 let key=start;
 do{
  const next=edges.get(key);
  if(!next)return null;
  ring.push(next);key=next.join(',');
 }while(key!==start&&ring.length<edges.size);
 // A separate contour would enclose a hole or meet another patch at a single vertex.
 if(key!==start||ring.length!==edges.size)return null;
 return ring.filter(([x,y],index)=>{
  const [a,b]=ring[(index+ring.length-1)%ring.length],[c,d]=ring[(index+1)%ring.length];
  return !(a===x&&x===c||b===y&&y===d);
 });
}

function localResidualGreens(frame,rings,bounds,terrain,obstacles,roads,parcels,targets){
 const [x0,y0,x1,y1]=bounds;
 const step=Math.max(10,Math.ceil(Math.sqrt((x1-x0)*(y1-y0)/5200)));
 const cols=Math.floor((x1-x0)/step),rows=Math.floor((y1-y0)/step);
 const occupied=[...obstacles,...parcels.map(parcel=>({box:parcel.box,parts:[parcel.points]}))];
 const builtAreas=[...obstacles.filter(o=>o.feature.kind==='building'),...parcels.filter(p=>!localOpen.has(p.type))];
 const cells=new Map();
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){
  const rect=localBox(x0+col*step,y0+row*step,step,step);
  if(!insideDistrict(rect,rings))continue;
  const points=rect.map(frame.world),box=localBounds(points);
  if(points.some(p=>p.some(n=>n<0||n>SIZE))||!safeLocalCell(points,terrain))continue;
  if(occupied.some(o=>localOverlap(box,o.box)&&localRingsHit(points,o.parts)))continue;
  const vicinity=[box[0]-20,box[1]-20,box[2]+20,box[3]+20];
  const adjacentRoads=roads.filter(road=>localOverlap(vicinity,road.box));
  if(adjacentRoads.some(road=>localStreetGap(points,road)<road.halfWidth+2))continue;
  const publicEdge=adjacentRoads.some(road=>!['highway','path'].includes(road.type)&&localStreetGap(points,road)<road.halfWidth+13);
  const built=builtAreas.some(o=>localOverlap(vicinity,o.box));
  const water=nearLocalWater(terrain,frame.world([x0+(col+.5)*step,y0+(row+.5)*step]),[15,27]);
  const key=col+row*cols;
  const neighbors=[row>0?key-cols:-1,col+1<cols?key+1:-1,row+1<rows?key+cols:-1,col>0?key-1:-1];
  cells.set(key,{key,row,col,neighbors,publicEdge,built,water});
 }
 const patches=[];
 const square=step*step;
 for(const [type,targetArea] of targets){
  let remaining=Math.round(targetArea/square);
  if(remaining<=0)continue;
  const score=cell=>type==='park'?2*Number(cell.built)+Number(cell.publicEdge)+Number(cell.water):
   2*Number(cell.water)+Number(!cell.built);
  const starts=[...cells.values()].sort((a,b)=>score(b)-score(a));
  for(const start of starts){
   if(remaining<=0||patches.length>=95)break;
   if(!cells.has(start.key))continue;
   const limit=Math.min(remaining,type==='park'?32:52);
   const patch=[start],frontier=new Set(start.neighbors);
   cells.delete(start.key);
   while(frontier.size&&patch.length<limit){
    let best;
    for(const key of frontier){
     const candidate=cells.get(key);
     if(candidate&&(!best||score(candidate)>score(best)))best=candidate;
    }
    if(!best)break;
    frontier.delete(best.key);
    if(!localGreenOutline([...patch,best]))continue;
    patch.push(best);cells.delete(best.key);
    for(const key of best.neighbors)if(cells.has(key))frontier.add(key);
   }
   if(patch.length===1&&remaining>2&&type==='park'&&!start.built&&!start.publicEdge)continue;
   const points=localGreenOutline(patch).map(([col,row])=>frame.world([x0+col*step,y0+row*step]));
   const label=type==='forest'?'林地补植':type==='reserve'?'生态缓冲绿地':
    patch.filter(cell=>cell.water).length>=patch.length/2?'滨水缓冲绿地':
    patch.length>=6&&patch.some(cell=>cell.publicEdge)&&new Set(patch.map(cell=>cell.row)).size>1&&
     new Set(patch.map(cell=>cell.col)).size>1?'临街绿地':patch.some(cell=>cell.built)?'楼间绿地':'绿化缓冲';
   patches.push({type,points,box:localBounds(points),label,area:patch.length*square});
   remaining-=patch.length;
  }
 }
 return patches;
}

const localCampus=new Set(['university','tech-university','education','medical','clinic']);
const localCommerce=new Set(['commerce','market','office','mid-mix','high-mix','used-car','station']);
const localNorthOffset=angle=>Math.abs(((angle+45)%90+90)%90-45);
const localBearing=(a,b)=>Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI;

function localNetworkPolicy(district,worldRings,mix){
 const hectares=worldRings.reduce((total,ring,i)=>{
  const nested=worldRings.some((other,j)=>i!==j&&area(other)>area(ring)&&pointInPolygon(ring[0],other));
  return total+area(ring)*(nested?-1:1);
 },0)/10000;
 const share=group=>mix.reduce((sum,[type,value])=>sum+(group.has(type)?value:0),0);
 const [principal]=[...mix].sort((a,b)=>b[1]-a[1])[0];
 const policy={hectares,alleys:share(localHeavy)<25};
 if(share(localCampus)>=38||localCampus.has(principal)&&localCampus.has(district.type)){
  return {...policy,label:'校园／机构',target:hectares<35?2:3,max:hectares<35?2:3,spacing:120,pitch:1.08,crossEvery:2,collectorAt:32};
 }
 if(share(localCommerce)>=50||localCommerce.has(district.type)&&share(localCommerce)>=38){
  return {...policy,label:'开放商业街区',target:0,max:Infinity,spacing:110,pitch:.84,crossEvery:2,collectorAt:12,largeCollector:true};
 }
 if(share(localHousing)>=40){
  return {...policy,label:'居住小区',target:hectares<12?1:hectares<38?2:3,max:hectares<12?2:hectares<38?3:4,
   spacing:105,pitch:1.02,crossEvery:2,collectorAt:24};
 }
 if(share(localHeavy)>=40){
  return {...policy,label:'产业／货运',target:hectares<24?1:2,max:hectares<24?2:3,spacing:145,pitch:1.12,crossEvery:3,collectorAt:16,largeCollector:true};
 }
 return {...policy,label:'混合片区',target:2,max:hectares<25?2:3,spacing:105,pitch:1,crossEvery:2,collectorAt:24};
}

export const maxManualLocalConnections=30;

export function localConnectionDefaults(district,percentages){
 if(!district)return null;
 const mix=Object.entries(percentages).filter(([type,value])=>Object.hasOwn(localUseNames,type)&&Number.isFinite(value)&&value>0);
 if(!mix.length)return null;
 const {label,target,max}=localNetworkPolicy(district,geometryParts(district),mix);
 return {label,target,max:Number.isFinite(max)?max:null};
}

function localStreetOrientation(streets,rings){
 const boundary=localEdges(rings[0]);
 const hints=[];
 for(const street of streets){
  if(street.type==='highway'||street.type==='path')continue;
  const span=distance(street.a,street.b);
  if(span<7)continue;
  const angle=localBearing(street.a,street.b);
  const samples=Math.ceil(span/35);
  let influence=0;
  for(let i=0;i<samples;i++){
   const t=(i+.5)/samples,point=street.a.map((n,j)=>n+(street.b[j]-n)*t);
   const gap=boundary.reduce((min,[a,b])=>Math.min(min,segmentProjection(point,a,b).distance),Infinity);
   influence+=Math.max(0,1-gap/175)*(span/samples);
  }
  if(influence)hints.push({angle,street,weight:influence*(['arterial','secondary'].includes(street.type)?1.35:1)});
 }
 const boundaryHints=boundary.map(([a,b])=>({angle:localBearing(a,b),weight:distance(a,b)*.16}));
 const total=hints.reduce((sum,h)=>sum+h.weight,0);
 const northWeight=Math.max(30,total*.26);
 const score=angle=>[...hints,...boundaryHints,{angle:0,weight:northWeight}].reduce((sum,h)=>{
  const gap=localNorthOffset(angle-h.angle);
  return sum+h.weight*Math.exp(-((gap/22)**2));
 },0);
 const candidates=[0,...[...hints,...boundaryHints].map(h=>Math.round(((h.angle%90+90)%90)/3)*3)];
 const preferred=candidates.reduce((best,angle)=>score(angle)>score(best)?angle:best,0);
 const angle=score(0)>=score(preferred)*.96?0:preferred;
 const guide=hints.reduce((best,h)=>!best||h.weight*(1-localNorthOffset(h.angle-angle)/50)>
  best.weight*(1-localNorthOffset(best.angle-angle)/50)?h:best,null);
 return {angle,guide:guide?.street??null};
}

function generateLocalLayout(project,district,{width,depth,angle=null,use,percentages,connectionCount=null,unlimitedConnections=false,heightLimit=Infinity,terrain,roadOffset=0,optionalLayout=false,variation=null,planningAssets}={}){
 if(!district||district.kind!=='district')throw Error('请先选择一个片区。');
 if(connectionCount!==null&&(!Number.isInteger(connectionCount)||connectionCount<0||connectionCount>maxManualLocalConnections))
  throw Error('外部接点数量须为 0–'+maxManualLocalConnections+' 的整数。');
 if(!(heightLimit>0))throw Error('建筑限高须大于 0 米。');
 if(angle!==null&&(!Number.isFinite(angle)||angle<0||angle>=180))throw Error('方向须在 0–180 度之间。');
 const mix=Object.entries(percentages||(use?{[use]:100}:suggestLocalUses(district,project))).filter(([,value])=>value!==0);
 if(mix.some(([type,value])=>!Object.hasOwn(localUseNames,type)||!Number.isInteger(value)||value<0||value>100))
  throw Error('各用途面积比例须为 0–100 的整数。');
 const total=mix.reduce((sum,[,value])=>sum+value,0);
 if(total!==100)throw Error('用途面积比例合计为 '+total+'%，请调整到 100%。');
 const shares=new Map(mix.map(([type,value])=>[type,value/100]));
 const hasGreen=mix.some(([type])=>localGreen.has(type));
 const districtUse=district.type&&district.type!=='future'?district.type:mix.reduce((a,b)=>a[1]>=b[1]?a:b)[0];
 const profiles=new Map(mix.map(([type])=>[type,localHeightProfile(type,districtUse)]));
 const specs=new Map(mix.map(([type])=>[type,localAssetOptions(type,planningAssets.entries,heightLimit,variation,profiles.get(type))]));
 const worldRings=geometryParts(district),bounds=localBounds(worldRings.flat());
 const districtEdges=worldRings.flatMap(localEdges);
 const edgeDistance=point=>districtEdges.reduce((nearest,[a,b])=>Math.min(nearest,segmentProjection(point,a,b).distance),Infinity);
 const landArea=area(district.points);
 const facilityUses=new Map(mix.map(([type])=>localUseFacility[type]).filter(Boolean).map(role=>[role,0]));
 const facilityLimit=role=>role==='schools'&&landArea>=750000?2:1;
 const bufferedBounds=[bounds[0]-200,bounds[1]-200,bounds[2]+200,bounds[3]+200];
 const streets=localStreetSegments(project).filter(({a,b})=>localOverlap(localBounds([a,b]),bufferedBounds));
 const policy=localNetworkPolicy(district,worldRings,mix);
 const manualTarget=unlimitedConnections?null:connectionCount;
 const targetConnections=unlimitedConnections?0:manualTarget??policy.target;
 const connectionLimit=unlimitedConnections?Infinity:manualTarget??policy.max;
 const gateSpacing=unlimitedConnections?110:policy.spacing;
 const orientation=localStreetOrientation(streets,worldRings);
 const streetAngle=angle??orientation.angle,guide=orientation.guide;
 const origin=worldRings[0][0];
 const radians=streetAngle*Math.PI/180;
 const frame=localFrame(origin,radians);
 const rings=worldRings.map(ring=>ring.map(frame.local));
 const [x0,y0,x1,y1]=localBounds(rings.flat());
 const obstacles=[];
 const referenceHeights=new Map();
 for(const feature of project.features){
  if(feature.kind==='building'||feature.kind==='zone'){
   const code=feature.assetPlacement?.code??feature.attributes?.Asset??feature.poiAttributes?.Asset;
   const known=planningAssets.byCode.get(code);
   const role=feature.attributes?.PlanningFacility??(known?known.role:feature.kind==='building'?
    localAssetRole({code:String(code??feature.name??''),type:feature.type}):null);
   const point=feature.poi||feature.points[0];
   const near=radius=>point&&point[0]>=bounds[0]-radius&&point[0]<=bounds[2]+radius&&
    point[1]>=bounds[1]-radius&&point[1]<=bounds[3]+radius&&(localContains(point,worldRings)||edgeDistance(point)<=radius);
   if(facilityUses.has(role)&&near(localFacilityReach[role]))
    facilityUses.set(role,facilityUses.get(role)+1);
   const height=feature.assetPlacement?.height??known?.asset.height;
   if(!role&&Number.isFinite(height)&&height>0&&near(75)){
    const group=known?.asset.catalogCategory||feature.type;
    if(!referenceHeights.has(group))referenceHeights.set(group,[]);
    referenceHeights.get(group).push(height);
   }
  }
  const road=feature.kind==='road'&&roadStackLevel(feature)===0;
  const plannedZone=feature.kind==='zone'&&feature.planningGranularity!=='master'&&feature.notes!=='地形总规草案';
  if(!road&&!plannedZone&&!['building','interchange'].includes(feature.kind))continue;
  const lot=feature.kind==='building'?buildingAssetLot(feature):[];
  const p=feature.points[0];
  const parts=road?(feature.outlineParts?.length?feature.outlineParts:isPolygonFeature(feature)?geometryParts(feature):[]):
   lot.length?[lot]:isPolygonFeature(feature)?geometryParts(feature):[localBox(p[0]-8,p[1]-8,16,16)];
  if(!parts.length)continue;
  const box=localBounds(parts.flat());
  if(localOverlap(box,bufferedBounds))obstacles.push({parts,box,feature});
 }
 const streetBounds=streets.map(street=>{
  const [a,b,c,d]=localBounds([street.a,street.b]),pad=street.halfWidth+6;
  return {...street,box:[a-pad,b-pad,c+pad,d+pad]};
 });
 const zoneBoxes=[],zones=[],roads=[],buildings=[],trees=[],envelopes=[],warnings=[],used=new Map(),assetUses=new Map();
 const referenceMedian=new Map([...referenceHeights].filter(([,heights])=>heights.length>=3)
  .map(([group,heights])=>[group,heights.sort((a,b)=>a-b)[Math.floor(heights.length/2)]]));
 const initiallyNearby=new Set([...facilityUses].filter(([role,count])=>count>=facilityLimit(role)).map(([role])=>role));
 const widthOf=type=>project.settings?.editor?.roadStyles?.[type]?.width??roadInfo(type).width;
 const roadHalf=widthOf('local')/2;
 const roadBuffer=roadHalf+4;
 const typicalDepth=[...specs].reduce((total,[type,choices])=>total+shares.get(type)*choices[0].depth,0);
 const span=Math.max(96,width??230*(variation?.span??1));
 const pitch=Math.max(90,depth??((2*Math.min(86,typicalDepth+12)+2*roadBuffer+12)*policy.pitch*(variation?.pitch??1)));
 let totalArea=0,attempts=0;
 let plannedStreetBounds=[];
 const localRoadEdges=new Set(),needsRoads=connectionLimit>0&&[...shares.keys()].some(type=>!localOpen.has(type));
 function parcelCandidate(plotFrame,plotRings,x,y,type,side,spec){
  const d=spec.depth;
  const base=side===1?y:y-d,rect=localBox(x,base,spec.width,d);
  const points=rect.map(plotFrame.world),box=localBounds(points);
  if(points.some(point=>point.some(n=>n<0||n>SIZE))||!insideDistrict(rect,plotRings))return null;
  if(obstacles.some(o=>localOverlap(o.box,box)&&localRingsHit(points,o.parts)))return null;
  if(streetBounds.some(street=>localOverlap(street.box,box)&&localStreetGap(points,street)<street.halfWidth+3)||
   plannedStreetBounds.some(street=>localOverlap(street.box,box)&&localStreetGap(points,street)<street.halfWidth+2))return null;
  const center=spec.asset?[x+(side===1?spec.left:spec.right),y+side*spec.near]:[x+spec.width/2,base+d/2];
  if(localCoast.has(type)&&terrain?.depth&&!nearLocalWater(terrain,plotFrame.world(center)))return null;
  if(hasGreen&&!localOpen.has(type)&&!localCoast.has(type)&&points.some(point=>nearLocalWater(terrain,point,[12,21])))return null;
  if(zoneBoxes.some(o=>localOverlap(o.box,box)&&localRingsHit(points,[o.points])))return null;
  const buffer=[box[0]-14,box[1]-14,box[2]+14,box[3]+14];
  if((localHeavy.has(type)||localHousing.has(type))&&zoneBoxes.some(o=>localOverlap(o.box,buffer)&&
   (localHeavy.has(type)?localHousing.has(o.type):localHeavy.has(o.type))))return null;
  if(!safeLocalCell(points,terrain))return null;
  return {type,spec,points,box,center};
 }
 function addParcel(plotFrame,parcel,side,street){
  const {type,spec,points,box,center}=parcel,parcelArea=area(points);
  const lotLabel=spec.lot.map(n=>Math.round(n)).join(' × ');
  zones.push({type,name:(spec.support||localUseNames[type])+' '+(zones.length+1),points,
   notes:localOpen.has(type)?'局部规划草案 · 开放空间':
    '局部规划草案 · '+(spec.asset?spec.asset.name+'，高 '+Math.round(spec.asset.height)+' 米，':'')+'参考用地 '+lotLabel+' 米',
   ...(spec.facility&&!spec.asset?{attributes:{PlanningFacility:spec.facility}}:{})});
  zoneBoxes.push({points,box,type});
  used.set(type,(used.get(type)||0)+parcelArea);totalArea+=parcelArea;
  if(spec.facility)facilityUses.set(spec.facility,facilityUses.get(spec.facility)+1);
  if(localOpen.has(type))return;
  if(!spec.asset){
   envelopes.push({points});
   return;
  }
  const worldCenter=plotFrame.world(center),east=plotFrame.world([center[0]+1,center[1]]);
  const rotation=Math.atan2(east[1]-worldCenter[1],east[0]-worldCenter[0])*180/Math.PI+(side===1?0:180);
  const feature=makeBuildingAssetFeature(spec.pack,spec.asset,worldCenter,rotation,'local-preview-'+buildings.length);
  feature.notes='局部规划草案 · '+(spec.support?spec.support+'参考体量，游戏内用途以资产为准':localUseNames[type]);
  if(spec.facility)feature.attributes.PlanningFacility=spec.facility;
  if(district.id)feature.districtId=district.id;
  buildings.push({feature,packId:spec.pack.id,assetId:spec.asset.id,street,parcel:zoneBoxes.at(-1)});
  const key=spec.pack.id+'/'+spec.asset.id;
  assetUses.set(key,(assetUses.get(key)||0)+1);
 }
 function rankTypes(frontage,position){
  const bias=type=>frontage?(localUsesAtFront.has(type)?550:0):
   type==='park'?200:0;
  return [...shares.keys()].filter(type=>!localGreen.has(type)||shares.get(type)===1||
   (used.get(type)||0)<shares.get(type)*.65*(totalArea+5400)).sort((a,b)=>{
   const score=type=>{
    const variationBias=variation?(localHash(position+'|'+type,variation.seed)/4294967296-.5)*1100:0;
    const share=shares.get(type)*(localGreen.has(type)&&shares.get(type)<1?.65:1);
    return share*(totalArea+3500)-(used.get(type)||0)+bias(type)+variationBias;
   };
   return score(b)-score(a);
  });
 }
 function fillFrontage(plotFrame,from,to,y,side,existing,maxDepth=Infinity,street=null){
  const plotRings=plotFrame===frame?rings:worldRings.map(ring=>ring.map(plotFrame.local));
  let first=Infinity,last=-Infinity;
  const anchor=plotFrame.world([from,y]).map(n=>Math.round(n/8)).join(',');
  const frontageStyle=variation?localHash(anchor,variation.seed):0;
  const start=from+(variation?(frontageStyle%120)/20:0);
  const groups=new Map();
  for(let x=start;x<to-10&&zones.length<(existing?220:420)&&attempts<15000;){
   attempts++;
   const group=Math.floor((x-from)/95);
   if(!groups.has(group)){
    const center=plotFrame.world([Math.min(to-8,from+(group+.5)*95),y+side*14]);
    groups.set(group,edgeDistance(center)<45||nearLocalWater(terrain,center,[30,55]));
   }
   const edge=groups.get(group);
   let parcel=null;
   for(const type of rankTypes(existing,anchor+Math.floor(x/90))){
    if(street?.type==='alley'&&(localHeavy.has(type)||localUseFacility[type]&&!localSupportLabels[type]))continue;
    const remaining=to-x;
    const options=specs.get(type).filter(spec=>spec.width<=remaining&&spec.depth<=maxDepth&&
     (!spec.facility||street?.type!=='alley'&&facilityUses.get(spec.facility)<facilityLimit(spec.facility)));
    const {height,spread}=profiles.get(type);
    const heightCost=spec=>{
     if(!spec.asset)return 0;
     if(spec.facility)return -2.5;
     const context=referenceMedian.get(spec.asset.catalogCategory||spec.asset.type);
     const target=Math.min(heightLimit,Math.max(height-spread,Math.min(height+spread,context??height))+
      (edge?-spread*.7:existing?spread*.45:0));
     return Math.abs(spec.asset.height-target)/spread*1.75;
    };
    const score=spec=> (spec.score||0)*.5+(variation?
     (localHash(spec.asset?.id??String(spec.width),frontageStyle)/4294967296)*.65:0)+(spec.asset?
     Math.log1p(assetUses.get(spec.pack.id+'/'+spec.asset.id)||0)*.76:0)+heightCost(spec)+
     (remaining-spec.width<18?(remaining-spec.width)/40:0.45);
    options.sort((a,b)=>score(a)-score(b));
    for(const spec of options.slice(0,10)){
     parcel=parcelCandidate(plotFrame,plotRings,x,y,type,side,spec);
     if(parcel)break;
    }
    if(parcel)break;
   }
   if(!parcel){x+=8;continue;}
   addParcel(plotFrame,parcel,side,street);
   first=Math.min(first,x);
   last=x+parcel.spec.width;
   x=last+2+(variation?(frontageStyle%7)*.4:0);
  }
  return [first,last];
 }
 function proposedRoad(a,b,type){
  const [p,q]=[a,b].map(frame.world);
  const width=widthOf(type),half=width/2+.1;
  const roadBox=localBox(Math.min(a[0],b[0])-half,Math.min(a[1],b[1])-half,Math.abs(a[0]-b[0])+2*half,Math.abs(a[1]-b[1])+2*half);
  if(!insideDistrict(roadBox,rings))return null;
  const points=roadBox.map(frame.world),box=localBounds(points);
  if(obstacles.some(o=>localOverlap(o.box,box)&&localRingsHit(points,o.parts)))return null;
  if(streetBounds.some(street=>localOverlap(street.box,box)&&localStreetGap(points,street)<street.halfWidth+3))return null;
  if(!safeLocalCell(points,terrain))return null;
  return {type,width,points:[p,q]};
 }
 function addRoad(a,b,type){
  const key=[a.join(','),b.join(',')].sort().join('/');
  if(localRoadEdges.has(key))return null;
  const road=proposedRoad(a,b,type);
  if(!road)return null;
  localRoadEdges.add(key);roads.push(road);
  return road;
 }
 const increment=span/2;
 const xStart=x0+roadBuffer+1+increment*(variation?.x??roadOffset);
 const yStart=y0+roadBuffer+1+pitch*(variation?.y??roadOffset);
 const roadLimit=180;
 const throughRuns=[];
 if(needsRoads){
  for(let y=yStart;y<y1-roadBuffer&&roads.length<roadLimit;y+=pitch){
   let run=[];
   for(let x=xStart;x<x1-48&&roads.length<roadLimit;x+=increment){
    const end=Math.min(x+increment,x1-roadBuffer-1);
    const road=end-x>=27&&addRoad([x,y],[end,y],'local');
    if(road)run.push(road);
    else if(run.length){throughRuns.push(run);run=[];}
   }
   if(run.length)throughRuns.push(run);
  }
  // Cross streets are spaced across the rows to leave continuous building frontage.
  const rows=[...roads],vertices=new Map();
  const position=point=>point.map(n=>Math.round(n*10)).join(',');
  for(const road of rows)for(const point of road.points)vertices.set(position(point),frame.local(point));
  for(const [x,y]of vertices.values()){
   if(roads.length>=roadLimit)break;
   const col=Math.round((x-xStart)/increment);
   const crossEvery=policy.crossEvery+(variation?.crossExtra??0);
   if((col+(variation?.crossPhase??0))%crossEvery&&col>1)continue;
   const a=[x,y],b=[x,y+pitch];
   if(vertices.has(position(frame.world(b)))){
    const shortLink=policy.alleys&&pitch<=210&&(Math.round((y-yStart)/pitch)+col)%2===0;
    addRoad(a,b,shortLink?'alley':'local');
   }
  }
 }
 const rows=[...roads];
 const junctionStreets=streets.filter(({type})=>type!=='highway'&&type!=='path'&&(type!=='alley'||policy.alleys));
 const junctions=new Map();
 const junctionKey=point=>point.map(n=>Math.round(n*10)).join(',');
 for(const {points:[p,q]}of roads){
  for(const [a,b]of [[p,q],[q,p]]){
   const key=junctionKey(a);
   if(!junctions.has(key))junctions.set(key,{point:a,neighbors:[]});
   junctions.get(key).neighbors.push(junctionKey(b));
  }
 }
 const seen=new Set(),connectedEnds=new Set(),components=[];
 for(const start of junctions.keys()){
  if(seen.has(start))continue;
  const queue=[start];
  seen.add(start);
  for(let i=0;i<queue.length;i++){
   const {point,neighbors}=junctions.get(queue[i]);
   for(const key of neighbors)if(!seen.has(key)){seen.add(key);queue.push(key);}
  }
  components.push(queue);
 }
 function connectionOptions(component,targets,maxDistance){
  const near=[];
  for(const key of component){
   const p=junctions.get(key).point;
   for(const street of targets){
    const hit=segmentProjection(p,street.a,street.b);
    if(hit.distance>maxDistance)continue;
    const crossing=Math.abs(Math.sin((localBearing(p,hit.point)-localBearing(street.a,street.b))*Math.PI/180));
    const preference=variation?(localHash(p.join(',')+'|'+hit.point.join(','),variation.seed)/4294967296)*25:0;
    const merit=hit.distance+30*(1-crossing)+preference;
    near.push({p,q:hit.point,street,length:hit.distance,merit,crossing});
   }
  }
  return near.sort((a,b)=>a.merit-b.merit);
 }
 function proposedLink({p,q,street,length},type){
   const width=widthOf(type),half=width/2;
   const link=localFrame(p,Math.atan2(q[1]-p[1],q[0]-p[0]));
   const boundary=Math.max(0,length-street.halfWidth);
   const approachRect=localBox(0,-half,boundary,width);
   const outline=localBox(0,-half,length,width).map(link.world);
   if(boundary>1&&!insideDistrict(approachRect,worldRings.map(ring=>ring.map(link.local))))return null;
   if(!safeLocalCell(outline,terrain))return null;
   const box=localBounds(outline),approach=approachRect.map(link.world);
   if(obstacles.some(o=>o.feature!==street.feature&&localOverlap(o.box,box)&&localRingsHit(outline,o.parts)))return null;
   if(streetBounds.some(o=>o.feature!==street.feature&&localOverlap(o.box,box)&&localStreetGap(approach,o)<o.halfWidth+2))return null;
   return {type,width,points:[p,q]};
 }
 function connect(option){
  if(option.length<.2)return true;
  const road=proposedLink(option,'local');
  if(!road)return false;
  option.road=road;roads.push(road);
  return true;
 }
 const markConnected=component=>{for(const key of component)connectedEnds.add(key);};
 const gates=[];
 const usable=gate=>gates.every(other=>distance(gate.q,other.q)>=gateSpacing&&distance(gate.p,other.p)>=40);
 const existingGateOptions=new Map();
 function addGate(component){
  if(gates.length>=connectionLimit)return false;
  const gate=existingGateOptions.get(component).find(candidate=>usable(candidate)&&connect(candidate));
  if(!gate)return false;
  gates.push(gate);
  markConnected(component);
  return true;
 }
 components.sort((a,b)=>b.length-a.length);
 for(const component of components)existingGateOptions.set(component,connectionOptions(component,junctionStreets,240));
 let pending=components.filter(component=>!addGate(component));
 for(let pass=0;pass<3&&pending.length&&connectedEnds.size;pass++){
  const targets=rows.filter(road=>road.type!=='alley'&&road.points.every(point=>connectedEnds.has(junctionKey(point))))
   .map(({points:[a,b],width})=>({a,b,halfWidth:width/2}));
  const previousCount=pending.length;
  pending=pending.filter(component=>{
   if(!connectionOptions(component,targets,220).some(connect))return true;
   markConnected(component);
   return false;
  });
  if(pending.length===previousCount)break;
 }
 const center=[(bounds[0]+bounds[2])/2,(bounds[1]+bounds[3])/2];
 const sector=point=>(Math.round(localBearing(center,point)/90)+4)%4;
 const extra=components.filter(component=>connectedEnds.has(component[0]))
  .flatMap(component=>existingGateOptions.get(component).filter(option=>option.length<145&&
   (!unlimitedConnections||option.length<.2||option.crossing>=.58)));
 while(gates.length<(targetConnections||connectionLimit)){
  const sectors=new Set(gates.map(gate=>sector(gate.q)));
  const options=extra.filter(usable).sort((a,b)=>
   Number(sectors.has(sector(a.q)))-Number(sectors.has(sector(b.q)))||a.merit-b.merit);
  const gate=options.find(connect);
  if(!gate)break;
  gates.push(gate);
 }
 const disconnected=pending.length;
 if(disconnected){
  for(let i=roads.length-1;i>=0;i--){
   const road=roads[i];
   if(junctions.has(junctionKey(road.points[0]))&&!connectedEnds.has(junctionKey(road.points[0])))roads.splice(i,1);
  }
 }
 if(policy.hectares>=policy.collectorAt&&gates.length){
  const runs=throughRuns.filter(run=>connectedEnds.has(junctionKey(run[0].points[0])))
   .map(roads=>({roads,a:roads[0].points[0],b:roads.at(-1).points[1]}));
  const priority=({a,b})=>distance(a,b)-.7*segmentProjection(center,a,b).distance;
  runs.sort((a,b)=>priority(b)-priority(a));
  for(const run of runs){
   const length=distance(run.a,run.b);
   if(length<230)continue;
   const {roads:segments}=run;
   const viable=type=>segments.every(({points:[a,b]})=>proposedRoad(frame.local(a),frame.local(b),type));
   const serving=gates.filter(gate=>gate.road&&segmentProjection(gate.p,run.a,run.b).distance<.15);
   const major=serving.filter(gate=>['secondary','arterial'].includes(gate.street.type));
   const ends=[run.a,run.b].map(end=>major.find(gate=>distance(gate.p,end)<.15));
   const secondaryLinks=policy.largeCollector&&policy.hectares>=80&&length>=550&&ends.every(Boolean)&&
    ends.map(gate=>proposedLink(gate,'secondary'));
   const secondary=secondaryLinks&&secondaryLinks.every(Boolean)&&viable('secondary');
   const type=secondary?'secondary':'local-wide';
   if(!secondary&&!viable(type))continue;
   for(const road of segments)Object.assign(road,{type,width:widthOf(type)});
   for(const gate of serving){
    const upgraded=secondary?secondaryLinks[ends.indexOf(gate)]:proposedLink(gate,type);
    if(upgraded)Object.assign(gate.road,upgraded);
   }
   break;
  }
 }
 plannedStreetBounds=roads.map(({type,width,points:[a,b]},i)=>{
  const halfWidth=width/2,[u,v,w,z]=localBounds([a,b]),pad=halfWidth+4;
  return {a,b,halfWidth,box:[u-pad,v-pad,w+pad,z+pad],type,name:'规划'+roadInfo(type).name,index:i};
 });
 const terrainRoads=[...streetBounds,...plannedStreetBounds];
 const byLength=(a,b)=>distance(b.a,b.b)-distance(a.a,a.b);
 const internal=localFrontageSegments(plannedStreetBounds).sort(byLength);
 const current=localFrontageSegments(streets).sort(byLength);
 const frontageRoads=[];
 for(let i=0;i<Math.max(Math.ceil(internal.length/3),current.length);i++){
  frontageRoads.push(...internal.slice(i*3,i*3+3));
  if(i<current.length)frontageRoads.push(current[i]);
 }
 for(const street of frontageRoads.slice(0,240)){
  if(street.type==='highway'||street.type==='path')continue;
  const {a,b,halfWidth}=street,length=distance(a,b),newStreet=street.index!==undefined;
  if(length<28)continue;
  const frontage=localFrame(a,Math.atan2(b[1]-a[1],b[0]-a[0]));
  const main=['arterial','secondary','local-wide'].includes(street.type);
  const margin=halfWidth+(main?8:street.type==='alley'?3:5),endClearance=main?13:8;
  const maxDepth=newStreet?Math.max(32,pitch/2-halfWidth+6):Infinity;
  for(const side of variation?.alternateFrontages?[1,-1]:[-1,1])fillFrontage(frontage,endClearance,length-endClearance,side*margin,side,main,maxDepth,street);
 }
 if(hasGreen){
  const greenShare=mix.reduce((sum,[type])=>sum+(localGreen.has(type)?shares.get(type):0),0);
  const finalArea=greenShare<1?(totalArea-mix.reduce((sum,[type])=>
   sum+(localGreen.has(type)?used.get(type)||0:0),0))/(1-greenShare):landArea*.8;
  const targets=mix.filter(([type])=>localGreen.has(type)).map(([type])=>
   [type,Math.max(0,shares.get(type)*finalArea-(used.get(type)||0))]).filter(([,target])=>target>0);
  for(const patch of targets.length?localResidualGreens(frame,rings,[x0,y0,x1,y1],terrain,obstacles,terrainRoads,zoneBoxes,targets):[]){
   const {type,points}=patch;
   zones.push({type,name:patch.label+' '+(zones.length+1),points,notes:'局部规划草案 · 顺应道路、楼间空隙和用地边界的补充绿化',
    attributes:{PlanningGreen:patch.label}});
   zoneBoxes.push(patch);
   used.set(type,(used.get(type)||0)+patch.area);
   totalArea+=patch.area;
  }
  const greens=zoneBoxes.filter(o=>localGreen.has(o.type));
  function plant(point,radius){
   if(trees.length>=260||trees.some(tree=>distance(tree.poi,point)<radius+tree.attributes.CrownRadius+2))return;
   const [x,y]=point;
   const square=localBox(x-radius,y-radius,radius*2,radius*2),box=localBounds(square);
   if(square.some(p=>!p.every(n=>n>=0&&n<=SIZE)||!localContains(p,worldRings))||
    !localEdges(square).every(([a,b])=>segmentIntervals(a,b,worldRings).every(({point})=>localContains(point,worldRings)))||
    terrainRoads.some(street=>segmentProjection(point,street.a,street.b).distance<street.halfWidth+radius+1)||
    obstacles.some(o=>localOverlap(o.box,box)&&localRingsHit(square,o.parts))||
    zoneBoxes.some(o=>!localGreen.has(o.type)&&localOverlap(o.box,box)&&localRingsHit(square,[o.points]))||
    !safeLocalCell(square,terrain))return;
   const points=Array.from({length:12},(_,i)=>[x+radius*Math.cos(i*Math.PI/6),y+radius*Math.sin(i*Math.PI/6)]);
   trees.push({kind:'building',type:'landscape',geometryType:'polygon',name:'建议植树点 '+(trees.length+1),points,poi:point,
    notes:'局部规划草案 · 树冠为预留尺寸，树种待定',source:'manual',
    attributes:{Object:'Tree',CrownRadius:radius},...(district.id?{districtId:district.id}:{})});
  }
  for(const street of terrainRoads){
   if(trees.length>=130)break;
   const {a,b,halfWidth,type}=street,length=distance(a,b);
   if(type==='highway'||length<30)continue;
   const tangent=localFrame(a,Math.atan2(b[1]-a[1],b[0]-a[0]));
   for(let x=17;x<length-17&&trees.length<130;x+=16){
    for(const side of [-1,1])plant(tangent.world([x,side*(halfWidth+5)]),2.7);
   }
  }
  for(const green of greens){
   const [a,b,c,d]=green.box;
   for(let y=b+5;y<d-4&&trees.length<260;y+=13)for(let x=a+5;x<c-4&&trees.length<260;x+=13){
    const point=[x,y];
    if(pointInPolygon(point,green.points))plant(point,3.4);
   }
  }
 }
 const coverage={building:0,road:0,green:0,reserved:0,remaining:0};
 const sampleStep=Math.max(5,Math.sqrt((bounds[2]-bounds[0])*(bounds[3]-bounds[1])/8000));
 const placedParcels=new Set(buildings.map(item=>item.parcel));
 for(let y=bounds[1]+sampleStep/2;y<bounds[3];y+=sampleStep){
  for(let x=bounds[0]+sampleStep/2;x<bounds[2];x+=sampleStep){
   const p=[x,y];
   if(!localContains(p,worldRings)||terrain?.depth&&localTerrainAt(terrain.depth,p)>0)continue;
   const road=terrainRoads.some(s=>segmentProjection(p,s.a,s.b).distance<=s.halfWidth);
   const parcel=zoneBoxes.find(({box,points})=>x>=box[0]&&x<=box[2]&&y>=box[1]&&y<=box[3]&&pointInPolygon(p,points));
   const key=road?'road':parcel?(localGreen.has(parcel.type)?'green':placedParcels.has(parcel)?'building':'reserved'):
    obstacles.some(o=>x>=o.box[0]&&x<=o.box[2]&&y>=o.box[1]&&y<=o.box[3]&&localContains(p,o.parts))?'reserved':'remaining';
   coverage[key]+=sampleStep*sampleStep;
  }
 }
 if(!zones.length){
  if(optionalLayout)return null;
  throw Error('片区内没有足够空间容纳所选用途的地块。请核对道路、建筑、地形和用途。');
 }
 if(zones.length>=420||attempts>=15000)warnings.push('已达到本次细化上限，可缩小片区后分次生成。');
 const unavailable=zones.filter(zone=>!localOpen.has(zone.type)).length-buildings.length;
 if(unavailable>0)warnings.push(unavailable+' 处地块缺少符合用途、尺寸或限高的资产，保留为用地。');
 const nearbyUses=[...shares.keys()].filter(type=>initiallyNearby.has(localUseFacility[type]));
 if(nearbyUses.length)warnings.push('本片区或周边已有同类设施，未重复新增：'+nearbyUses.map(type=>localUseNames[type]).join('、')+'。');
 const unmet=[...shares.keys()].filter(type=>!used.has(type)&&!nearbyUses.includes(type)).map(type=>localUseNames[type]);
 if(unmet.length)warnings.push('空间或临路条件不足，未安置：'+unmet.join('、')+'。');
 const missingAnchors=[...shares.keys()].filter(type=>localSupportLabels[type]&&localUseFacility[type]&&!facilityUses.get(localUseFacility[type]));
 if(missingAnchors.length)warnings.push('主设施需要单独选址，草案中仅布置配套参考体量：'+missingAnchors.map(type=>localUseNames[type]).join('、')+'。');
 if(needsRoads&&!roads.length)warnings.push('没有找到符合地形和避让条件的内部道路接入，草案只沿现状道路布置。');
 else if(disconnected)warnings.push('部分内部道路候选未找到安全接点，已略过。');
 if(manualTarget!==null&&gates.length<manualTarget)
  warnings.push('当前道路和地形只能安全接入 '+gates.length+' 处，少于手动目标 '+manualTarget+' 处。');
 else if(roads.length&&targetConnections&&gates.length<targetConnections)
  warnings.push('外部接点少于该片区的建议值，现有道路或地形限制了接入。');
 if(!terrain?.depth||!terrain?.elevation)warnings.push('地形数据不完整，请核对水体和坡度。');
 const distribution=[...mix].sort((a,b)=>b[1]-a[1]).map(([type,target])=>
  ({type,target,percent:Math.round(1000*(used.get(type)||0)/totalArea)/10}));
 const byUse=new Map();
 for(const {feature,parcel:{type}} of buildings){
  if(feature.attributes.PlanningFacility)continue;
  if(!byUse.has(type))byUse.set(type,[]);
  byUse.get(type).push(feature.assetPlacement.height);
 }
 const heightBands=[...byUse].filter(([,heights])=>heights.length>=3).sort((a,b)=>b[1].length-a[1].length).slice(0,3)
  .map(([type,heights])=>{
   heights.sort((a,b)=>a-b);
   return {type,min:Math.round(heights[Math.floor((heights.length-1)*.2)]),max:Math.round(heights[Math.ceil((heights.length-1)*.8)])};
  });
 return {roads,zones,envelopes,internalBuildings:buildings.filter(item=>item.street?.index!==undefined).length,buildings:buildings.map(({feature,packId,assetId})=>({feature,packId,assetId})),trees,coverage,warnings,distribution,heightBands,guideName:guide?.name||null,streetAngle,networkPolicy:policy.label,northOffset:localNorthOffset(streetAngle),recommendedConnections:targetConnections,maximumConnections:Number.isFinite(connectionLimit)?connectionLimit:null,requestedConnections:manualTarget,externalConnections:gates.map(gate=>gate.q)};
}

function localPlanScore(plan){
 const {coverage}=plan,total=Object.values(coverage).reduce((sum,area)=>sum+area,0);
 if(!total)return -100;
 const mixError=plan.distribution.reduce((sum,{target,percent})=>sum+Math.abs(target-percent),0)/200;
 const accessShortfall=Math.max(0,plan.recommendedConnections-plan.externalConnections.length);
 return (coverage.building+coverage.green)/total-.16*mixError-.0003*plan.roads.length-.022*accessShortfall;
}

function localPlanSignature(plan){
 const points=ring=>ring.map(p=>p.map(n=>Math.round(n/6)).join(',')).join(';');
 const objects=[...plan.roads.map(road=>road.type+':'+points(road.points)),...plan.zones.map(zone=>zone.type+':'+points(zone.points)),
  ...plan.buildings.map(({packId,assetId,feature})=>packId+'/'+assetId+':'+points([feature.poi]))];
 return localHash(objects.sort().join('|')).toString(16).padStart(8,'0');
}

function generateLocalVariants(project,district,options){
 const {seed,recentSignatures=[]}=options;
 const candidates=[];
 const recent=new Set(recentSignatures);
 const add=plan=>{
  if(!plan)return;
  const signature=localPlanSignature(plan);
  if(candidates.some(candidate=>candidate.signature===signature))return;
  candidates.push({...plan,signature,score:localPlanScore(plan)});
 };
 for(let i=0;i<3;i++){
  const variantSeed=(seed+Math.imul(i,0x9e3779b9))>>>0;
  add(generateLocalLayout(project,district,{...options,variation:localVariation(variantSeed),optionalLayout:true}));
  if(candidates[0]?.zones.length>=320&&i>=1)break;
 }
 if(!candidates.length||candidates.every(plan=>recent.has(plan.signature)||plan.score<.08)){
  add(generateLocalLayout(project,district,{...options,optionalLayout:false}));
 }
 const manual=options.connectionCount!=null&&!options.unlimitedConnections;
 const gates=manual?Math.max(...candidates.map(candidate=>candidate.externalConnections.length)):null;
 const viable=manual?candidates.filter(candidate=>candidate.externalConnections.length===gates):candidates;
 viable.sort((a,b)=>b.score-a.score);
 const best=viable[0];
 const distinct=viable.find(candidate=>!recent.has(candidate.signature)&&candidate.score>=best.score-.085);
 const {score,...proposal}=distinct||best;
 return {...proposal,repeated:recent.has(proposal.signature)};
}

export function generateLocalPlan(project,district,options={}){
 const entries=buildingPacksFor(project).flatMap(pack=>pack.assets
  .filter(asset=>!asset.isExtension&&!asset.parentAssetCode&&!asset.parentAssetCodes?.length)
  .map(asset=>({pack,asset,role:localAssetRole(asset)})));
 options={...options,planningAssets:{entries,byCode:new Map(entries.map(entry=>[entry.asset.code,entry]))}};
 if(Number.isInteger(options.seed))return generateLocalVariants(project,district,options);
 const first=generateLocalLayout(project,district,options);
 const total=Object.values(first.coverage).reduce((sum,area)=>sum+area,0);
 const manual=first.requestedConnections!==null;
 const needsMoreConnections=manual&&first.requestedConnections>first.externalConnections.length;
 if(!total||!needsMoreConnections&&(first.coverage.remaining/total<.30||first.zones.length>=320||!first.roads.length))return first;
 // Compare shifted street rows so the boundary of an irregular district
 // does not determine where every possible street must begin.
 let best=first;
 for(const roadOffset of [.35,.65]){
  const candidate=generateLocalLayout(project,district,{...options,roadOffset,optionalLayout:true});
  if(!candidate)continue;
  const difference=candidate.externalConnections.length-best.externalConnections.length;
  const better=manual&&difference!==0?difference>0:localPlanScore(candidate)>localPlanScore(best);
  if(better)best=candidate;
 }
 return best;
}
