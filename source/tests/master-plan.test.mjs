import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,pointInPolygon,segmentIntervals,segmentProjection,area} from '../src/model.js';
import {generateLocalPlan,suggestLocalUses} from '../src/local-plan.js';
import {localAssetRole} from '../src/local-building-rules.js';
import {buildingAssetLot} from '../src/building-assets.js';
import {generateMasterPlan,generateScenicPlan} from '../src/master-plan.js';

const width=112,step=128;
const raster=fn=>({width,height:width,values:Float32Array.from({length:width*width},(_,i)=>fn(i%width,Math.floor(i/width)))});
const elevation=raster(()=>20);
const dry=raster(()=>NaN);
const wetStrip=raster(x=>x>=55&&x<57?5:NaN);
const xy=(x,y)=>[(x+.5)*step,(y+.5)*step];

test('offline master plan uses manual access, priorities and exclusions',()=>{
 const project=initialProject();
 const access=xy(12,52),reserve=[xy(20,40),xy(27,48)];
 const options={elevation,depth:wetStrip,focus:'industry',priorityUse:'agriculture',districtCount:3,accessPoints:[access],reserves:[reserve]};
 const result=generateMasterPlan(project,options);
 assert.deepEqual(result,generateMasterPlan(project,options));
 assert.equal(project.features.length,0);
 assert.equal(result.accessCount,1);
 assert(result.districts.some(d=>d.type==='agriculture'));
 assert(result.roads.some(road=>road.points.some(point=>point[0]===access[0]&&point[1]===access[1])));
 for(const {points}of result.roads)for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i];
  for(let j=0;j<=20;j++){
   const x=a[0]+(b[0]-a[0])*j/20,y=a[1]+(b[1]-a[1])*j/20;
   assert(x<55*step);
   assert(!(x>=reserve[0][0]&&x<=reserve[1][0]&&y>=reserve[0][1]&&y<=reserve[1][1]));
  }
 }
 const protectedPoint=xy(23,44);
 for(const {rings}of result.districts)assert.equal(rings.reduce((inside,ring)=>inside!==pointInPolygon(protectedPoint,ring),false),false);
});

test('manual access across separate banks is rejected and an inland port request is downgraded',()=>{
 const project=initialProject();
 assert.throws(()=>generateMasterPlan(project,{elevation,depth:wetStrip,accessPoints:[xy(12,52),xy(90,52)]}),/不连通/);
 assert.throws(()=>generateMasterPlan(project,{elevation,depth:wetStrip,accessPoints:[xy(55,52)]}),/无法连接/);
 const inland=generateMasterPlan(project,{elevation,depth:dry,focus:'logistics',districtCount:3});
 assert(inland.districts.some(d=>d.type==='depot'));
 assert(inland.districts.every(d=>d.type!=='port'));
 assert(inland.warnings.some(w=>w.includes('岸边')));
});

test('local planning stays within the edited district and uses the existing main street',()=>{
 const project=initialProject();
 const district={kind:'district',id:'one',points:[[1000,1000],[2000,1000],[2000,1800],[1000,1800]],
  additionalParts:[[[1400,1200],[1600,1200],[1600,1400],[1400,1400]]]};
 project.features=[
  district,
  {kind:'road',type:'arterial',name:'Main street',structure:'ground',points:[[1000,1200],[1500,1200],[2000,1200]]},
  {kind:'zone',planningGranularity:'master',points:district.points}
 ];
 const {roads,zones,guideName}=generateLocalPlan(project,district,{width:200,depth:200,use:'industry'});
 assert.equal(guideName,'Main street');
 assert(zones.length>6);
 for(const {points}of zones){
  assert(points.every(([x,y])=>x>1000&&x<2000&&y>1000&&y<1800));
  assert(!points.some(([x,y])=>x>1400&&x<1600&&y>1200&&y<1400));
 }
 assert(!roads.some(road=>road.points.every(point=>point[1]===1200)));
 assert.equal(project.features.length,3);
});

test('full-map modes work independently and retain external highway connections across water',()=>{
 const project=initialProject(),west=[0,xy(0,52)[1]],east=[14336,xy(0,52)[1]];
 project.features=[west,east].map((point,i)=>({kind:'road',type:'highway',points:[point,[point[0]+(i?-240:240),point[1]]]}));
 const highway=generateMasterPlan(project,{elevation,depth:wetStrip,mode:'highway'});
 assert.equal(highway.accessCount,2);
 assert.deepEqual(highway.candidateAccess,[]);
 assert.deepEqual(highway.districts,[]);
 assert(highway.roads.some(r=>r.structure==='elevated'));
 assert([west,east].every(exit=>highway.roads.some(r=>r.points.some(point=>point[0]===exit[0]&&point[1]===exit[1]))));
 const arterial=generateMasterPlan(project,{elevation,depth:dry,mode:'arterial'});
 assert(arterial.roads.length>0);
 assert(arterial.roads.every(r=>r.type==='arterial'));
 assert.deepEqual(arterial.districts,[]);
 const requested={park:2,commerce:3,'tech-university':3};
 const districts=generateMasterPlan(project,{elevation,depth:dry,mode:'district',districtCount:8,useCounts:requested});
 assert.deepEqual(districts.roads,[]);
 assert.deepEqual(Object.fromEntries(Object.keys(requested).map(type=>[type,districts.districts.filter(d=>d.type===type).length])),requested);
 assert.throws(()=>generateMasterPlan(project,{elevation,depth:dry,mode:'district',districtCount:4,useCounts:{park:1}}),/各用途合计/);
});

test('mixed local plans reserve existing road width and building footprints',()=>{
 const project=initialProject();
 const district={kind:'district',id:'one',points:[[1000,1000],[2000,1000],[2000,1750],[1000,1750]]};
 const building={kind:'building',geometryType:'polygon',points:[[1190,1140],[1280,1140],[1280,1280],[1190,1280]]};
 const street={kind:'road',type:'arterial',width:64,points:[[1000,1200],[2000,1200]]};
 project.features=[district,building,street];
 const plan=generateLocalPlan(project,district,{terrain:{elevation,depth:dry},percentages:{'mid-res':47,commerce:38,park:15}});
 assert.deepEqual(new Set(plan.zones.map(z=>z.type)),new Set(['mid-res','commerce','park']));
 assert(plan.buildings.length>0);
 assert(new Set(plan.buildings.map(b=>b.assetId)).size>1);
 assert(plan.trees.length>0);
 assert(plan.coverage.building>0&&plan.coverage.green>0&&plan.coverage.road>0);
 assert(plan.zones.some(zone=>zone.notes.includes('参考用地')));
 for(const {points}of plan.zones){
  assert(points.every(([,y])=>Math.abs(y-1200)>=34));
  assert(!pointInPolygon([1225,1160],points));
  assert(!points.some(point=>pointInPolygon(point,building.points)));
 }
});

test('highway alternatives use separate corridors with rounded turns and identical exits',()=>{
 const project=initialProject(),start=[0,7104],end=[14336,7104],reserve=[[6200,6592],[8100,7616]];
 const options={elevation,depth:dry,mode:'highway',accessPoints:[start,end],reserves:[reserve]};
 const {alternatives}=generateMasterPlan(project,options);
 assert.equal(alternatives.length,3);
 const midpoints=alternatives.map(({roads,metres})=>{
  assert(metres<18000);
  assert.deepEqual(roads[0].points[0],end);
  assert.deepEqual(roads.at(-1).points.at(-1),start);
  const crossings=[];
  for(const {points}of roads){
   for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i],dx=b[0]-a[0],dy=b[1]-a[1],steps=Math.ceil(Math.hypot(dx,dy)/10);
    for(let j=0;j<=steps;j++){
     const x=a[0]+dx*j/steps,y=a[1]+dy*j/steps;
     assert(!(x>=reserve[0][0]&&x<=reserve[1][0]&&y>=reserve[0][1]&&y<=reserve[1][1]));
    }
    const t=(7168-a[0])/dx;
    if(t>=0&&t<=1)crossings.push(a[1]+dy*t);
    if(i===points.length-1)continue;
    const u=points[i+1][0]-b[0],v=points[i+1][1]-b[1];
    assert(Math.abs(Math.atan2(dx*v-dy*u,dx*u+dy*v))<Math.PI/9);
   }
  }
  assert.equal(crossings.length,1);
  return crossings[0];
 });
 midpoints.sort((a,b)=>a-b);
 assert(midpoints[0]<reserve[0][1]&&midpoints.at(-1)>reserve[1][1]);
 assert(midpoints.slice(1).every((y,i)=>y-midpoints[i]>500));
});

test('automatic exits vary between highway schemes and retain a single manual anchor',()=>{
 const project=initialProject(),anchor=[0,7104],params={elevation,depth:dry,mode:'highway'};
 for(const accessPoints of [[],[anchor]]){
  const {alternatives}=generateMasterPlan(project,{...params,accessPoints});
  assert(alternatives.length>1);
  assert(new Set(alternatives.map(plan=>plan.access.map(exit=>exit.point.join(',')).sort().join(';'))).size>1);
  if(accessPoints.length)assert(alternatives.every(plan=>plan.access.some(exit=>exit.point===anchor)));
 }
});

test('a highway crossing reserves buildable interchange land in the generated plan',()=>{
 const project=initialProject(),crossing=[7168,7104];
 project.features=[{kind:'road',type:'highway',points:[[7168,500],[7168,13500]]}];
 const {alternatives}=generateMasterPlan(project,{elevation,depth:dry,mode:'highway',
  accessPoints:[[0,7104],[14336,7104]]});
 assert(alternatives[0].interchanges.some(({points})=>pointInPolygon(crossing,points)));
 for(const plan of alternatives){
  assert(plan.interchanges.length>0);
  assert(plan.interchanges.every(({points})=>points.every(([x,y])=>x>=0&&x<=14336&&y>=0&&y<=14336)));
 }
});

test('district placement distinguishes waterfront access and gives site-specific reasons',()=>{
 const project=initialProject(),depth=raster(x=>x<24?4:NaN);
 project.features=[{kind:'road',type:'arterial',points:[[4200,1000],[4200,13000]]}];
 const {districts}=generateMasterPlan(project,{elevation,depth,mode:'district',districtCount:2,useCounts:{port:1,'mid-res':1}});
 const harbor=districts.find(d=>d.type==='port'),housing=districts.find(d=>d.type==='mid-res');
 assert(harbor.site[0]<housing.site[0]);
 assert(districts.every(d=>d.rings.length===1&&d.description.includes('高程')&&d.description.includes('现状主干道')));
 assert.match(harbor.description,/沿岸布置作业面/);
 assert.match(housing.description,/生活组团/);
});

test('coarse district outlines keep small interior water bodies within a single exterior boundary',()=>{
 const depth=raster((x,y)=>x>=54&&x<=56&&y>=54&&y<=56?3:NaN);
 const {districts:[park]}=generateMasterPlan(initialProject(),{elevation,depth,mode:'district',districtCount:1,
  useCounts:{park:1},accessPoints:[[7104,7872]]});
 assert.equal(park.rings.length,1);
 assert(pointInPolygon([7104,7104],park.rings[0]));
 assert.match(park.description,/保留现状水体/);
});

test('local asset planning observes height caps and keeps planting clear of the road',()=>{
 const project=initialProject();
 const district={kind:'district',id:'street-test',points:[[900,900],[1500,900],[1500,1340],[900,1340]]};
 const [a,b]=[[900,1110],[1500,1110]];
 project.features=[district,{kind:'road',type:'local',structure:'ground',width:20,points:[a,b]}];
 const plan=generateLocalPlan(project,district,{terrain:{elevation,depth:dry},percentages:{villa:52,commerce:34,park:14},heightLimit:16});
 assert(plan.buildings.length>3);
 assert(plan.trees.length>0);
 assert(plan.buildings.every(({feature})=>feature.assetPlacement.height<=16&&feature.districtId===district.id));
 for(const tree of plan.trees){
  assert(tree.points.every(point=>pointInPolygon(point,district.points)));
  assert(segmentProjection(tree.poi,a,b).distance>=10+tree.attributes.CrownRadius);
 }
 assert(plan.zones.some(zone=>zone.type==='park'));
});

test('local planning accepts only 100% and reports measured area for each use',()=>{
 const project=initialProject();
 const district={kind:'district',id:'mix',points:[[900,900],[1500,900],[1500,1340],[900,1340]]};
 project.features=[district,{kind:'road',type:'local',points:[[900,1110],[1500,1110]]}];
 assert.throws(()=>generateLocalPlan(project,district,{percentages:{villa:50,park:20}}),/合计为 70%/);
 const plan=generateLocalPlan(project,district,{terrain:{elevation,depth:dry},percentages:{villa:65,park:35}});
 const total=plan.zones.reduce((sum,parcel)=>sum+area(parcel.points),0);
 assert(plan.zones.every(parcel=>['villa','park'].includes(parcel.type)));
 for(const row of plan.distribution){
  const measured=plan.zones.filter(parcel=>parcel.type===row.type).reduce((sum,parcel)=>sum+area(parcel.points),0);
  assert.equal(row.percent,Math.round(1000*measured/total)/10);
  assert(Math.abs(row.target-row.percent)<12);
 }
});

test('local planning extends a boundary road into a connected network with interior buildings',()=>{
 const project=initialProject();
 const district={id:'interior',kind:'district',points:[[1000,1000],[1800,1000],[1800,1700],[1000,1700]]};
 const a=[950,1000],b=[1850,1000];
 project.features=[district,{kind:'road',type:'local',points:[a,b]}];
 const plan=generateLocalPlan(project,district,{terrain:{elevation,depth:dry},percentages:{'mid-res':80,park:20}});
 const attached=(road,other)=>road.some(point=>segmentProjection(point,...other).distance<.15);
 const connected=[[a,b]],pending=plan.roads.map(road=>road.points);
 for(let i=0;i<connected.length;i++){
  for(let j=pending.length-1;j>=0;j--){
   if(attached(pending[j],connected[i])||attached(connected[i],pending[j]))connected.push(pending.splice(j,1)[0]);
  }
 }
 assert.equal(pending.length,0);
 assert(plan.internalBuildings>10);
 assert(plan.buildings.some(({feature})=>segmentProjection(feature.poi,a,b).distance>450));
 assert(plan.roads.some(({points})=>Math.abs(points[0][0]-points[1][0])<.1));
 assert(plan.roads.some(({points})=>Math.abs(points[0][1]-points[1][1])<.1));
});

test('local network uses different access policies on the same street perimeter',()=>{
 const project=initialProject();
 const points=[[1000,1000],[1800,1000],[1800,1700],[1000,1700]];
 const district={id:'perimeter',kind:'district',points};
 const perimeter=points.map((p,i)=>[p,points[(i+1)%4]]);
 project.features=[district,...perimeter.map(points=>({kind:'road',type:'local',points}))];
 const planFor=type=>generateLocalPlan(project,district,{terrain:{elevation,depth:dry},percentages:{[type]:88,park:12}});
 const residential=planFor('mid-res'),campus=planFor('education'),business=planFor('commerce');
 assert.equal(residential.northOffset,0);
 assert(residential.externalConnections.length>=2&&residential.externalConnections.length<=4);
 assert.equal(campus.externalConnections.length,3);
 assert(business.externalConnections.length>4);
 assert(perimeter.filter(edge=>business.externalConnections.some(point=>segmentProjection(point,...edge).distance<.1)).length>=3);
 const small={...district,points:[[1000,1000],[1300,1000],[1300,1300],[1000,1300]]};
 const smallPlan=generateLocalPlan(project,small,{percentages:{'mid-res':100}});
 assert.equal(smallPlan.maximumConnections,2);
 assert(smallPlan.externalConnections.length>=1&&smallPlan.externalConnections.length<=2);
});

test('automatic local orientation balances north and skewed perimeter streets and respects a manual bearing',()=>{
 const project=initialProject(),radians=Math.PI/6;
 const rotate=([x,y])=>[5000+x*Math.cos(radians)-y*Math.sin(radians),5000+x*Math.sin(radians)+y*Math.cos(radians)];
 const district={id:'skewed',kind:'district',points:[[0,0],[800,0],[800,700],[0,700]].map(rotate)};
 project.features=[district,...district.points.map((p,i)=>({kind:'road',type:'local',points:[p,district.points[(i+1)%4]]}))];
 const automatic=generateLocalPlan(project,district,{use:'mid-res'});
 assert(automatic.northOffset>=18&&automatic.northOffset<=33);
 const manual=generateLocalPlan(project,district,{use:'mid-res',angle:7});
 assert.equal(manual.streetAngle,7);
});

test('manual local road access overrides the automatic count and accepts zero',()=>{
 const project=initialProject();
 const points=[[1000,1000],[1800,1000],[1800,1700],[1000,1700]];
 const district={id:'manual-access',kind:'district',points};
 project.features=[district,...points.map((p,i)=>({kind:'road',type:'local',points:[p,points[(i+1)%4]]}))];
 const options={use:'commerce',terrain:{elevation,depth:dry}};
 const one=generateLocalPlan(project,district,{...options,connectionCount:1});
 assert.equal(one.externalConnections.length,1);
 assert.equal(one.requestedConnections,1);
 assert(one.internalBuildings>0);
 const zero=generateLocalPlan(project,district,{...options,connectionCount:0});
 assert.equal(zero.externalConnections.length,0);
 assert.equal(zero.roads.length,0);
 assert(zero.buildings.length>0);
 assert.throws(()=>generateLocalPlan(project,district,{...options,connectionCount:31}),/外部接点数量/);
 const many=generateLocalPlan(project,district,{...options,connectionCount:30});
 assert(many.externalConnections.length<30);
 assert(many.warnings.some(message=>message.includes('手动目标 30')));
});

test('unlimited local connections bypass the residential cap but keep junction spacing',()=>{
 const project=initialProject();
 const points=[[1000,1000],[1800,1000],[1800,1700],[1000,1700]];
 const district={id:'open-residential',kind:'district',points};
 project.features=[district,...points.map((p,i)=>({kind:'road',type:'local',points:[p,points[(i+1)%4]]}))];
 const options={use:'mid-res',terrain:{elevation,depth:dry}};
 const auto=generateLocalPlan(project,district,options);
 const plan=generateLocalPlan(project,district,{...options,unlimitedConnections:true});
 assert.equal(plan.maximumConnections,null);
 assert(plan.externalConnections.length>auto.maximumConnections);
 for(const [i,a]of plan.externalConnections.entries()){
  for(const b of plan.externalConnections.slice(i+1))assert(Math.hypot(a[0]-b[0],a[1]-b[1])>=110-1e-6);
 }
});

test('joint roads keep separately marked exits and cross at the marked interchange',()=>{
 const highwayPoints=[[0,7104],[14336,7104]],arterialPoints=[[7104,0],[7104,14336]],interchange=[7104,7104];
 const plan=generateMasterPlan(initialProject(),{mode:'joint',elevation,depth:dry,highwayPoints,arterialPoints,
  interchangePoints:[interchange]});
 const isPoint=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
 for(const [kind,pins]of [['highway',highwayPoints],['arterial',arterialPoints]]){
  const roads=plan.roads.filter(road=>road.type===kind);
  for(const pin of [...pins,interchange])assert(roads.some(road=>road.points.some(point=>isPoint(point,pin))));
  for(const {points}of roads){
   for(let i=1;i<points.length-1;i++){
    const [x,y]=points[i],a=points[i-1],b=points[i+1];
    const ux=x-a[0],uy=y-a[1],vx=b[0]-x,vy=b[1]-y;
    assert(Math.abs(Math.atan2(ux*vy-uy*vx,ux*vx+uy*vy))<=Math.PI/10+1e-6);
   }
  }
 }
 assert(plan.interchanges.some(({points})=>pointInPolygon(interchange,points)));
 assert.equal(plan.accessCount,4);
});

test('scenic planning composes a theme and applies district volumes before laying roads',()=>{
 const project=initialProject(),terrain={elevation,depth:wetStrip};
 const draft=generateScenicPlan(project,{...terrain,theme:'valley'});
 assert.equal(draft.themeName,'河谷老镇');
 assert.equal(draft.roads.length,0);
 assert(draft.scenicNotes.some(note=>note.name.startsWith('主场景')));
 assert(draft.scenicGuides.some(guide=>guide.kind==='sequence'));
 const core=draft.districts.find(d=>d.scenicRole==='主场景');
 assert.equal(core.scenicHeight,35);
 const expanded=generateScenicPlan(project,{...terrain,theme:'valley',volumes:{old:'large'}});
 const expandedCore=expanded.districts.find(d=>d.type==='old');
 assert.equal(expandedCore.scenicHeight,65);
 assert(area(expandedCore.rings[0])>area(core.rings[0]));
 assert(draft.districts.filter(d=>d.scenicRole==='公共空间与留白').every(d=>d.scenicHeight===null));
 const withRoads=generateScenicPlan(project,{...terrain,theme:'valley',roadMode:'arterial'});
 assert.deepEqual(withRoads.districts,draft.districts);
 assert(withRoads.roads.some(road=>road.type==='arterial'));
});

test('repeated local generation explores different road and asset layouts without changing the requested settings',()=>{
 const project=initialProject();
 const points=[[1000,1000],[1800,1000],[1800,1700],[1000,1700]];
 const district={id:'local-variants',kind:'district',points};
 project.features=[district,...points.map((p,i)=>({kind:'road',type:'local',points:[p,points[(i+1)%4]]}))];
 const options={terrain:{elevation,depth:dry},percentages:{'mid-res':60,commerce:25,park:15},angle:0,heightLimit:30,connectionCount:2};
 const recentSignatures=[],plans=[];
 for(const seed of [101,102,103]){
  const plan=generateLocalPlan(project,district,{...options,seed,recentSignatures});
  assert.equal(plan.repeated,false);
  assert.equal(plan.streetAngle,0);
  assert.equal(plan.externalConnections.length,2);
  assert(plan.buildings.length>0&&plan.buildings.every(({feature})=>feature.assetPlacement.height<=30));
  assert.deepEqual(Object.fromEntries(plan.distribution.map(({type,target})=>[type,target])),options.percentages);
  recentSignatures.push(plan.signature);
  plans.push(plan);
 }
 assert.equal(new Set(plans.map(plan=>JSON.stringify(plan.roads))).size,3);
 assert.equal(new Set(plans.map(plan=>JSON.stringify(plan.buildings.map(({assetId})=>assetId)))).size,3);
 const repeatSeed=generateLocalPlan(project,district,{...options,seed:101});
 assert.equal(repeatSeed.signature,plans[0].signature);
});

test('campus planning limits main facilities and uses offices as repeatable research buildings',()=>{
 const project=initialProject();
 const district={id:'campus',kind:'district',type:'tech-university',points:[[1000,1000],[1640,1000],[1640,1490],[1000,1490]]};
 project.features=[district,...[1030,1260,1460].map(y=>({kind:'road',type:'local',width:18,points:[[930,y],[1690,y]]}))];
 const options={connectionCount:0,percentages:{'tech-university':44,innovation:30,pharma:10,park:16}};
 const plan=generateLocalPlan(project,district,options);
 const buildings=plan.buildings.map(item=>item.feature);
 const anchors=buildings.filter(f=>f.attributes.PlanningFacility==='universities');
 assert.equal(anchors.length,1);
 assert(buildings.filter(f=>f.notes.includes('研发办公')).length>=3);
 assert(buildings.every(f=>localAssetRole({code:f.assetPlacement.code,type:f.type})!=='special'));
 const staged={...project,features:[...project.features,...anchors]};
 const next=generateLocalPlan(staged,district,options);
 assert(next.warnings.some(w=>w.includes('已有同类设施')));
 assert(!next.buildings.some(({feature})=>feature.attributes.PlanningFacility==='universities'));
 const nearby={kind:'building',type:'education',points:[[1660,1050],[1690,1050],[1690,1090],[1660,1090]],
  attributes:{Asset:'TechnicalUniversity01'}};
 const neighboring=generateLocalPlan({...project,features:[...project.features,nearby]},district,options);
 assert(!neighboring.buildings.some(({feature})=>feature.attributes.PlanningFacility==='universities'));
 for(const code of ['RadioTelescope01','LargeHadronCollider01','GeologicalResearchCenter01','Prison01','ObservationTower01'])
  assert.equal(localAssetRole({code}),'special');
});

test('residential height bands and irregular green patches respect ground space and reserved holes',()=>{
 const points=[[1000,1000],[1660,1000],[1690,1350],[1470,1510],[1000,1440]];
 const hole=[[1340,1180],[1430,1180],[1430,1250],[1340,1250]];
 const district={id:'housing',kind:'district',type:'mid-res',points,additionalParts:[hole]};
 const project=initialProject();
 const roads=[1040,1270,1430].map(y=>({kind:'road',type:'local',width:20,points:[[950,y],[1710,y]]}));
 const existing=[[1090,1190],[1170,1190],[1170,1250],[1090,1250]];
 project.features=[district,...roads,{kind:'building',geometryType:'polygon',type:'residential',points:existing}];
 const suggested=suggestLocalUses(district,project);
 assert(suggested.park>0);
 assert.equal(Object.values(suggested).reduce((a,b)=>a+b,0),100);
 const plan=generateLocalPlan(project,district,{connectionCount:0,heightLimit:28,percentages:{'mid-res':73,park:27}});
 assert(plan.buildings.length>=10);
 assert(plan.buildings.every(({feature})=>feature.assetPlacement.height>=11&&feature.assetPlacement.height<=28));
 const band=plan.heightBands.find(b=>b.type==='mid-res');
 assert(band&&band.max-band.min<=8);
 const patches=plan.zones.filter(zone=>zone.attributes?.PlanningGreen);
 assert(patches.some(patch=>patch.points.length>4));
 const excluded=[hole,existing,...plan.buildings.map(({feature})=>buildingAssetLot(feature))];
 for(const {points:ring} of patches){
  assert(area(ring)>0);
  for(let i=0;i<ring.length;i++){
   const a=ring[i],b=ring[(i+1)%ring.length];
   assert(segmentIntervals(a,b,[points]).every(({point})=>pointInPolygon(point,points)));
   for(const exclusion of excluded){
    assert(segmentIntervals(a,b,[exclusion]).every(({point})=>!pointInPolygon(point,exclusion)));
    assert(exclusion.every(point=>!pointInPolygon(point,ring)));
   }
   for(const road of roads)assert(Math.abs(a[1]-road.points[0][1])>=12-1e-6);
  }
 }
});

test('local road hierarchy follows district size, frontage and access',()=>{
 function fixture(use,width,height,options={},sideRoadsOnly=false){
  const points=[[1000,1000],[1000+width,1000],[1000+width,1000+height],[1000,1000+height]];
  const district={id:'road-mix',kind:'district',type:use,points},project=initialProject();
  project.settings.editor={roadStyles:{local:{width:18},'local-wide':{width:25},alley:{width:7}}};
  project.features=[district,...points.map((point,i)=>({kind:'road',type:i%2===1?'secondary':'local',points:[point,points[(i+1)%4]]}))
   .filter((_,index)=>!sideRoadsOnly||index%2===1)];
  return generateLocalPlan(project,district,{use,angle:0,unlimitedConnections:true,...options});
 }
 const residential=fixture('mid-res',340,300,{seed:24});
 assert.deepEqual(new Set(residential.roads.map(r=>r.type)),new Set(['local','alley']));
 const commercial=fixture('commerce',540,350,{seed:24});
 assert.deepEqual(new Set(commercial.roads.map(r=>r.type)),new Set(['local','local-wide','alley']));
 for(const road of commercial.roads)assert.equal(road.width,{'local-wide':25,local:18,alley:7}[road.type]);
 const industrial=fixture('industry',680,400,{seed:24});
 assert(industrial.roads.some(r=>r.type==='local-wide'));
 assert(!industrial.roads.some(r=>r.type==='alley'||r.type==='arterial'));
 const large=fixture('commerce',1100,850,{width:230,depth:130},true);
 const collector=large.roads.filter(r=>r.type==='secondary');
 assert(collector.length>0);
 assert(collector.every(r=>r.width===28));
 assert(collector.some(r=>r.points[1][0]===1000)&&collector.some(r=>r.points[1][0]===2100));
});
