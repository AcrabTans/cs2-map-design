import {SIZE,ZONES,roadInfo,area,distance,geometryParts,isPolygonFeature,pointInPolygon,segmentIntervals,segmentProjection} from './model.js';
import {buildingAssetLot,buildingPacksFor,makeBuildingAssetFeature} from './building-assets.js';
import {isStreetRoad,roadStackLevel} from './network-crossings.js';

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
 if(type==='mid-res')return {'mid-res':55,'mid-mix':25,commerce:12,education:8};
 if(localHeavy.has(type))return type==='depot'?{depot:90,service:10}:{[type]:75,depot:15,service:10};
 if(['university','tech-university','education'].includes(type))return {[type]:60,'mid-res':25,commerce:15};
 if(localOpen.has(type))return type==='park'?{park:70,reserve:30}:{[type]:80,park:20};
 if(['clinic','medical'].includes(type))return {[type]:65,office:20,commerce:15};
 return {[type]:65,...(type==='commerce'?{'mid-mix':25}:{commerce:25}),service:10};
}

const localCatalogTypes={
 'mid-mix':'mixed','high-mix':'mixed',office:'office',station:'transport',civic:'civic',
 power:'energy',waste:'waste',water:'water',airport:'transport',port:'transport',depot:'transport',
 innovation:'research',pharma:'research',tourism:'park'
};
const localSpecialNames={
 station:/Station|车站|铁路/i,airport:/Airport|机场|航站/i,port:/Harbou?r|Cargo Port|货港|港口/i,
 depot:/Depot|车辆段|货场|仓储/i,university:/University|College|大学|学院/i,
 'tech-university':/University|College|大学|学院/i
};
const localLow=new Set(['villa','old']);
const localLarge=new Set(['university','tech-university','medical','education','clinic','police','fire','station','civic']);
function localAssetOptions(type,assets,heightLimit){
 const [category,w,d]=localReference[type];
 if(localOpen.has(type))return [{width:w,depth:d,lot:[w,d]}];
 const catalog=localCatalogTypes[type],special=localSpecialNames[type];
 const candidates=[];
 for(const entry of assets){
  const {asset,bounds}=entry;
  if(special&&!special.test(asset.name+' '+asset.code+' '+(asset.catalogSubcategory||'')))continue;
  if(catalog?catalog!==asset.catalogCategory:asset.type!==category)continue;
  if(asset.heightIsDisplayThickness||asset.height>heightLimit||localLow.has(type)&&asset.height>21||
   type==='mid-res'&&asset.height>48||type==='high-res'&&asset.height<22)continue;
  const [aw,ad]=asset.lot;
  if(aw<w*.25||ad<d*.25||aw>w*2.7||ad>d*2.7)continue;
  const side=(localHeavy.has(type)?6:localLarge.has(type)?5:3)+Math.min(7,asset.height*.065);
  const front=localHeavy.has(type)?12:localLarge.has(type)?9:localUsesAtFront.has(type)?5:7;
  const rear=(localHeavy.has(type)?8:5)+Math.min(8,asset.height*.075);
  const [x0,y0,x1,y1]=bounds;
  const left=Math.max(aw/2,-x0+side),right=Math.max(aw/2,x1+side);
  const near=Math.max(ad/2,-y0+front),far=Math.max(ad/2,y1+rear);
  const width=left+right,depth=near+far;
  candidates.push({...entry,width,depth,left,right,near,far,lot:asset.lot,
   score:Math.abs(Math.log(aw/w))+Math.abs(Math.log(ad/d))});
 }
 candidates.sort((a,b)=>a.score-b.score);
 const options=[],sizes=new Map();
 const compact=[...candidates].sort((a,b)=>a.width*a.depth-b.width*b.depth).slice(0,4);
 for(const item of [...candidates.slice(0,6),...compact,...candidates.slice(6)]){
  if(options.includes(item))continue;
  const key=[Math.round(item.width/8),Math.round(item.depth/8),Math.round(item.asset.height/10)].join(',');
  const count=sizes.get(key)||0;
  if(count>=2)continue;
  sizes.set(key,count+1);
  options.push(item);
  if(options.length===24)break;
 }
 if(options.length)return options;
 return [{width:w+8,depth:d+10,lot:[w,d]}];
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
 if(share(localCampus)>=38||localCampus.has(principal)&&localCampus.has(district.type)){
  return {label:'校园／机构',target:hectares<35?2:3,max:hectares<35?2:3,spacing:120,pitch:1.08,crossEvery:2};
 }
 if(share(localCommerce)>=50||localCommerce.has(district.type)&&share(localCommerce)>=38){
  return {label:'开放商业街区',target:0,max:Infinity,spacing:110,pitch:.84,crossEvery:2};
 }
 if(share(localHousing)>=40){
  return {label:'居住小区',target:hectares<12?1:hectares<38?2:3,max:hectares<12?2:hectares<38?3:4,
   spacing:105,pitch:1.02,crossEvery:2};
 }
 if(share(localHeavy)>=40){
  return {label:'产业／货运',target:hectares<24?1:2,max:hectares<24?2:3,spacing:145,pitch:1.12,crossEvery:3};
 }
 return {label:'混合片区',target:2,max:hectares<25?2:3,spacing:105,pitch:1,crossEvery:2};
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

function generateLocalLayout(project,district,{width,depth,angle=null,use,percentages,connectionCount=null,unlimitedConnections=false,heightLimit=Infinity,terrain,roadOffset=0,optionalLayout=false}={}){
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
 const assets=buildingPacksFor(project).flatMap(pack=>pack.assets
  .filter(asset=>!asset.isExtension&&!asset.parentAssetCode&&!asset.parentAssetCodes?.length)
  .map(asset=>({pack,asset,bounds:localBounds(asset.rings.flat())})));
 const specs=new Map([...shares].map(([type])=>[type,localAssetOptions(type,assets,heightLimit)]));
 const worldRings=geometryParts(district),bounds=localBounds(worldRings.flat());
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
 for(const feature of project.features){
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
 const roadHalf=(project.settings?.editor?.roadStyles?.local?.width??roadInfo('local').width)/2;
 const roadBuffer=roadHalf+4;
 const typicalDepth=[...specs].reduce((total,[type,choices])=>total+shares.get(type)*choices[0].depth,0);
 const span=Math.max(96,width??230);
 const pitch=Math.max(90,depth??((2*Math.min(86,typicalDepth+12)+2*roadBuffer+12)*policy.pitch));
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
   plannedStreetBounds.some(street=>localOverlap(street.box,box)&&localStreetGap(points,street)<roadHalf+2))return null;
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
  zones.push({type,name:localUseNames[type]+' '+(zones.length+1),points,
   notes:localOpen.has(type)?'局部规划草案 · 开放空间':
    '局部规划草案 · '+(spec.asset?spec.asset.name+'，高 '+Math.round(spec.asset.height)+' 米，':'')+'参考用地 '+lotLabel+' 米'});
  zoneBoxes.push({points,box,type});
  used.set(type,(used.get(type)||0)+parcelArea);totalArea+=parcelArea;
  if(localOpen.has(type))return;
  if(!spec.asset){
   envelopes.push({points});
   return;
  }
  const worldCenter=plotFrame.world(center),east=plotFrame.world([center[0]+1,center[1]]);
  const rotation=Math.atan2(east[1]-worldCenter[1],east[0]-worldCenter[0])*180/Math.PI+(side===1?0:180);
  const feature=makeBuildingAssetFeature(spec.pack,spec.asset,worldCenter,rotation,'local-preview-'+buildings.length);
  feature.notes='局部规划草案 · '+localUseNames[type];
  if(district.id)feature.districtId=district.id;
  buildings.push({feature,packId:spec.pack.id,assetId:spec.asset.id,street,parcel:zoneBoxes.at(-1)});
  const key=spec.pack.id+'/'+spec.asset.id;
  assetUses.set(key,(assetUses.get(key)||0)+1);
 }
 function rankTypes(frontage){
  const bias=type=>frontage?(localUsesAtFront.has(type)?550:0):
   type==='park'?200:0;
  return [...shares.keys()].sort((a,b)=>{
   const score=type=>shares.get(type)*(totalArea+3500)-(used.get(type)||0)+bias(type);
   return score(b)-score(a);
  });
 }
 function fillFrontage(plotFrame,from,to,y,side,existing,maxDepth=Infinity,street=null){
  const plotRings=plotFrame===frame?rings:worldRings.map(ring=>ring.map(plotFrame.local));
  let first=Infinity,last=-Infinity;
  for(let x=from;x<to-10&&zones.length<(existing?220:420)&&attempts<15000;){
   attempts++;
   let parcel=null;
   for(const type of rankTypes(existing)){
    const remaining=to-x;
    const options=specs.get(type).filter(spec=>spec.width<=remaining&&spec.depth<=maxDepth);
    const score=spec=> (spec.score||0)*.5+(spec.asset?
     (assetUses.get(spec.pack.id+'/'+spec.asset.id)||0)*.27+
     (!existing&&spec.asset.height>32?(spec.asset.height-32)/25:0):0)+
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
   x=last+2;
  }
  return [first,last];
 }
 function proposedRoad(a,b){
  const [p,q]=[a,b].map(frame.world);
  const half=roadHalf+.1;
  const roadBox=localBox(Math.min(a[0],b[0])-half,Math.min(a[1],b[1])-half,Math.abs(a[0]-b[0])+2*half,Math.abs(a[1]-b[1])+2*half);
  if(!insideDistrict(roadBox,rings))return null;
  const points=roadBox.map(frame.world),box=localBounds(points);
  if(obstacles.some(o=>localOverlap(o.box,box)&&localRingsHit(points,o.parts)))return null;
  if(streetBounds.some(street=>localOverlap(street.box,box)&&localStreetGap(points,street)<street.halfWidth+3))return null;
  if(!safeLocalCell(points,terrain))return null;
  return [p,q];
 }
 function addRoad(a,b,points){
  const key=[a.join(','),b.join(',')].sort().join('/');
  if(!points||localRoadEdges.has(key))return;
  localRoadEdges.add(key);roads.push({type:'local',points});
 }
 const increment=span/2;
 const xStart=x0+roadBuffer+1+increment*roadOffset;
 const yStart=y0+roadBuffer+1+pitch*roadOffset;
 const roadLimit=180;
 if(needsRoads){
  for(let y=yStart;y<y1-roadBuffer&&roads.length<roadLimit;y+=pitch){
   for(let x=xStart;x<x1-48&&roads.length<roadLimit;x+=increment){
    const end=Math.min(x+increment,x1-roadBuffer-1);
    if(end-x>=27)addRoad([x,y],[end,y],proposedRoad([x,y],[end,y]));
   }
  }
  // Cross streets are spaced across the rows to leave continuous building frontage.
  const rows=[...roads],vertices=new Map();
  const position=point=>point.map(n=>Math.round(n*10)).join(',');
  for(const road of rows)for(const point of road.points)vertices.set(position(point),frame.local(point));
  for(const [x,y]of vertices.values()){
   if(roads.length>=roadLimit)break;
   const col=Math.round((x-xStart)/increment);
   if(col%policy.crossEvery&&col>1)continue;
   const a=[x,y],b=[x,y+pitch];
   if(vertices.has(position(frame.world(b))))addRoad(a,b,proposedRoad(a,b));
  }
 }
 const rows=[...roads];
 const junctionStreets=streets.filter(street=>street.type!=='highway'&&street.type!=='path');
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
    const merit=hit.distance+30*(1-crossing);
    near.push({p,q:hit.point,street,length:hit.distance,merit,crossing});
   }
  }
  return near.sort((a,b)=>a.merit-b.merit);
 }
 function connect({p,q,street,length}){
   if(length<.2)return true;
   const link=localFrame(p,Math.atan2(q[1]-p[1],q[0]-p[0]));
   const boundary=Math.max(0,length-street.halfWidth);
   const approachRect=localBox(0,-roadHalf,boundary,2*roadHalf);
   const outline=localBox(0,-roadHalf,length,2*roadHalf).map(link.world);
   if(boundary>1&&!insideDistrict(approachRect,worldRings.map(ring=>ring.map(link.local))))return false;
   if(!safeLocalCell(outline,terrain))return false;
   const box=localBounds(outline),approach=approachRect.map(link.world);
   if(obstacles.some(o=>o.feature!==street.feature&&localOverlap(o.box,box)&&localRingsHit(outline,o.parts)))return false;
   if(streetBounds.some(o=>o.feature!==street.feature&&localOverlap(o.box,box)&&localStreetGap(approach,o)<o.halfWidth+2))return false;
   roads.push({type:'local',points:[p,q]});
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
  const targets=rows.filter(road=>road.points.every(point=>connectedEnds.has(junctionKey(point))))
   .map(({points:[a,b]})=>({a,b,halfWidth:roadHalf}));
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
 plannedStreetBounds=roads.map(({points:[a,b]},i)=>{
  const [u,v,w,z]=localBounds([a,b]),pad=roadHalf+4;
  return {a,b,halfWidth:roadHalf,box:[u-pad,v-pad,w+pad,z+pad],type:'local',name:'规划支路',index:i};
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
  const main=['arterial','secondary'].includes(street.type);
  const margin=halfWidth+(main?8:5),endClearance=main?13:8;
  const maxDepth=newStreet?Math.max(32,pitch/2-roadBuffer+10):Infinity;
  for(const side of [-1,1])fillFrontage(frontage,endClearance,length-endClearance,side*margin,side,main,maxDepth,newStreet?street:null);
 }
 if(hasGreen){
  // Use viable leftover pockets for grass without allocating more road frontage.
  const step=Math.max(22,Math.ceil(Math.sqrt((x1-x0)*(y1-y0)/1800)));
  const grassType=shares.has('park')?'park':mix.find(([type])=>localGreen.has(type))[0];
  const target=shares.get(grassType);
  const deficit=(target*totalArea-(used.get(grassType)||0))/Math.max(.1,1-target);
  const limit=target===1?area(district.points)*.16:Math.min(Math.max(0,deficit),area(district.points)*.10);
  const grass=[];
  const canUse=(points,box)=>!obstacles.some(o=>localOverlap(o.box,box)&&localRingsHit(points,o.parts))&&
   !zoneBoxes.some(o=>localOverlap(o.box,box)&&localRingsHit(points,[o.points]))&&
   !terrainRoads.some(street=>localStreetGap(points,street)<street.halfWidth+2);
  let extra=0;
  grassGrid:for(let y=y0+step/3;limit>0&&y<y1-step;y+=step){
   for(let x=x0+step/3;x<x1-step;x+=step){
    if(extra>=limit||grass.length>=60)break grassGrid;
    for(const size of [step-2,step*.70]){
     const rect=localBox(x,y,size,size),points=rect.map(frame.world),box=localBounds(points);
     if(!insideDistrict(rect,rings)||points.some(p=>p.some(n=>n<0||n>SIZE))||!safeLocalCell(points,terrain)||!canUse(points,box))continue;
     const type=grassType,parcelArea=area(points);
     if(extra+parcelArea/2>limit)continue;
     grass.push(points);
     zones.push({type,name:'街坊草地 '+grass.length,points,notes:'局部规划草案 · 草地填充'});
     zoneBoxes.push({points,box,type});
     used.set(type,(used.get(type)||0)+parcelArea);
     totalArea+=parcelArea;extra+=parcelArea;
     break;
    }
   }
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
 const unmet=[...shares.keys()].filter(type=>!used.has(type)).map(type=>localUseNames[type]);
 if(unmet.length)warnings.push('空间或临路条件不足，未安置：'+unmet.join('、')+'。');
 if(needsRoads&&!roads.length)warnings.push('没有找到符合地形和避让条件的内部道路接入，草案只沿现状道路布置。');
 else if(disconnected)warnings.push('部分内部道路候选未找到安全接点，已略过。');
 if(manualTarget!==null&&gates.length<manualTarget)
  warnings.push('当前道路和地形只能安全接入 '+gates.length+' 处，少于手动目标 '+manualTarget+' 处。');
 else if(roads.length&&targetConnections&&gates.length<targetConnections)
  warnings.push('外部接点少于该片区的建议值，现有道路或地形限制了接入。');
 if(!terrain?.depth||!terrain?.elevation)warnings.push('地形数据不完整，请核对水体和坡度。');
 const distribution=[...mix].sort((a,b)=>b[1]-a[1]).map(([type,target])=>
  ({type,target,percent:Math.round(1000*(used.get(type)||0)/totalArea)/10}));
 return {roads,zones,envelopes,internalBuildings:buildings.filter(item=>item.street).length,buildings:buildings.map(({feature,packId,assetId})=>({feature,packId,assetId})),trees,coverage,warnings,distribution,guideName:guide?.name||null,streetAngle,networkPolicy:policy.label,northOffset:localNorthOffset(streetAngle),recommendedConnections:targetConnections,maximumConnections:Number.isFinite(connectionLimit)?connectionLimit:null,requestedConnections:manualTarget,externalConnections:gates.map(gate=>gate.q)};
}

export function generateLocalPlan(project,district,options={}){
 const first=generateLocalLayout(project,district,options);
 const total=Object.values(first.coverage).reduce((sum,area)=>sum+area,0);
 const manual=first.requestedConnections!==null;
 const needsMoreConnections=manual&&first.requestedConnections>first.externalConnections.length;
 if(!total||!needsMoreConnections&&(first.coverage.remaining/total<.30||first.zones.length>=320||!first.roads.length))return first;
 // Compare shifted street rows so the boundary of an irregular district
 // does not determine where every possible street must begin.
 const score=plan=>{
  const {coverage}=plan;
  const mixError=plan.distribution.reduce((sum,{target,percent})=>sum+Math.abs(target-percent),0)/200;
  const accessShortfall=Math.max(0,plan.recommendedConnections-plan.externalConnections.length);
  return (coverage.building+coverage.green)/total-.16*mixError-.0003*plan.roads.length-.022*accessShortfall;
 };
 let best=first;
 for(const roadOffset of [.35,.65]){
  const candidate=generateLocalLayout(project,district,{...options,roadOffset,optionalLayout:true});
  if(!candidate)continue;
  const difference=candidate.externalConnections.length-best.externalConnections.length;
  const better=manual&&difference!==0?difference>0:score(candidate)>score(best);
  if(better)best=candidate;
 }
 return best;
}
