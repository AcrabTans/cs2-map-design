import {validateBuildingPacks,validateBuildingPlacement} from './building-assets.js';
export const SIZE=14336;
export const ROADS=[
 {id:'rail',name:'铁路',color:'#222222',width:16,corridor:40,dash:true},
 {id:'waterway',name:'水路',color:'#ffffff',width:30,corridor:60},
 {id:'highway',name:'高速',color:'#13bb4b',width:40,corridor:80},
 {id:'arterial',name:'主干道',color:'#ed9d25',width:40,corridor:64},
 {id:'secondary',name:'次干道',color:'#4c99ce',width:28,corridor:44},
 {id:'local',name:'支路',color:'#7e9fa4',width:20,corridor:32},
 {id:'path',name:'小路',color:'#ffffff',width:12,corridor:20},
 {id:'metro',name:'地铁',color:'#9450c8',width:8,corridor:16,dash:true},
 {id:'bus',name:'公交线路',color:'#2e98c0',width:4,corridor:8,dash:true}
];
export const ZONES=[
 ['居住与混合街区',[
 ['villa','低密度别墅','#b8c893'],['old','低密度旧城区','#b9ad8b'],['mid-res','中密度小区','#79ac8c'],['mid-mix','中密度混杂街区','#77ada2'],['high-res','高密度小区','#4e9278'],['high-mix','高密度混杂街区','#548f99']]],
 ['就业与产业',[
 ['commerce','商业区','#d4a87c'],['office','办公区','#89a5c3'],['industry','工业区','#b39b78'],['innovation','科创园','#8d9dca'],['pharma','医药谷','#a69ac1'],['data','数据中心','#8a97ae'],['vehicle','载具厂','#9c9b91'],['used-car','二手车市场','#bba783']]],
 ['交通与滨水产业',[
 ['airport','机场与配套','#b7a5c9'],['port','小型货运港与堆场','#8999ae'],['shipyard','造船厂','#748d9c'],['station','客运火车站组团','#a696b7'],['depot','铁路车辆段 / 小货场','#a798a4'],['marina','帆船码头与游艇服务','#7bb4ba']]],
 ['公共设施与服务预留',[
 ['power','发电厂','#bf9a7e'],['waste','垃圾回收发电厂','#a69d80'],['water','自来水厂','#7eafc6'],['university','综合大学','#c2a282'],['tech-university','理工大学','#a8a5c6'],['medical','医学组团','#cf9894'],['civic','政务组团','#b599ae'],['education','小学 / 初中 / 高中预留','#c4b482'],['clinic','诊所 / 医院预留','#d2a4a1'],['police','分级警务预留','#93a4b8'],['fire','分级消防预留','#c69a80'],['service','其他公共服务预留','#acb5a0']]],
 ['乡野、游憩与开放空间',[
 ['agriculture','农业区','#c8c080'],['forest','林业','#7b9e75'],['aquaculture','水产养殖','#88b7b2'],['market','农贸市场','#c6aa7d'],['racecourse','赛马场','#b3b47f'],['racetrack','赛车场','#bc8c72'],['park','公园与绿地','#9fba8e'],['tourism','旅游景点','#c9b496'],['reserve','生态 / 景观留白','#a5b6a0'],['future','远期发展预留','#b3b6ac']]]
];
export const zoneInfo=id=>ZONES.flatMap(x=>x[1]).find(z=>z[0]===id)||ZONES[0][1][0];
export const roadInfo=id=>ROADS.find(x=>x.id===id)||ROADS[0];
export const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
export const length=points=>points.slice(1).reduce((s,p,i)=>s+distance(p,points[i]),0);
export const area=points=>Math.abs(points.reduce((s,p,i)=>{const q=points[(i+1)%points.length];return s+p[0]*q[1]-q[0]*p[1]},0))/2;
export function nearestSegment(points,p,closed=false){let best={distance:Infinity,index:-1,point:null};const count=closed?points.length:points.length-1;for(let i=0;i<count;i++){const a=points[i],b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],den=dx*dx+dy*dy;const t=den?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/den)):0;const q=[a[0]+t*dx,a[1]+t*dy],d=distance(q,p);if(d<best.distance)best={distance:d,index:i,point:q}}return best}
export function initialProject(){return {version:2,mapSize:SIZE,title:'地图工程',assetPacks:[],basemaps:[],rasters:[],features:[],notes:'',settings:{base:'none',baseOpacity:100,zoneOpacity:32,grid:false,snap:true,zonesVisible:true,zonesLocked:false,notesVisible:true,corridors:true,districtsVisible:true,planView:'detail',protectExistingZones:true,showNewZones:true,showNewRoads:true,layers:Object.fromEntries(ROADS.map(r=>[r.id,{visible:true,locked:false}]))}}}
export function validateProject(data){
 if(!data||![1,2].includes(data.version)||![13000,SIZE].includes(data.mapSize)||!Array.isArray(data.features)||data.features.length>20000)throw Error('不是有效的地图规划工程');
 const ids=new Set();
 for(const f of data.features){if(!f||typeof f.id!=='string'||ids.has(f.id)||!['road','zone','note','district','building','interchange','route'].includes(f.kind))throw Error('对象类型或编号无效');ids.add(f.id);if(!Array.isArray(f.points)||f.points.length>(5000)||f.points.length<(isPolygonFeature(f)?3:['road','route'].includes(f.kind)?2:1))throw Error('对象节点数量无效');for(const p of f.points)if(!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>data.mapSize))throw Error('节点超出地图范围');if(f.kind==='district'&&!/^#[0-9a-f]{6}$/i.test(f.color||''))throw Error('片区颜色无效');if(f.kind==='road'&&!ROADS.some(r=>r.id===f.type))throw Error('道路类型无效');if(f.kind==='zone'&&!ZONES.some(g=>g[1].some(z=>z[0]===f.type)))throw Error('区划类型无效');if(f.kind==='road'&&(!Number.isFinite(f.width)||f.width<1||f.width>1000||!Number.isFinite(f.corridor)||f.corridor<f.width||f.corridor>2000))throw Error('道路宽度或走廊宽度无效');if(typeof f.name!=='string'||f.name.length>300||typeof f.notes!=='string'||f.notes.length>20000)throw Error('名称或备注无效');if(f.kind==='road'&&!['ground','bridge','tunnel','elevated'].includes(f.structure))throw Error('道路结构无效');}
 const clean=initialProject();clean.mapSize=data.mapSize;if(typeof data.title==='string')clean.title=data.title.slice(0,300);
 if(data.proposal&&typeof data.proposal.revision==='string'){
  clean.proposal={revision:data.proposal.revision.slice(0,100),source:String(data.proposal.source||'').slice(0,300)};
  for(const key of ['preservedZoneIds','newFeatureIds'])if(Array.isArray(data.proposal[key]))clean.proposal[key]=[...new Set(data.proposal[key].filter(id=>typeof id==='string'&&ids.has(id)))];
  if(Array.isArray(data.proposal.appliedPatches))clean.proposal.appliedPatches=[...new Set(data.proposal.appliedPatches.filter(x=>typeof x==='string'&&x.length<=100))].slice(-100);
  if(Array.isArray(data.proposal.interchanges))clean.proposal.interchanges=data.proposal.interchanges.slice(0,20).filter(x=>x&&typeof x.name==='string'&&[3,4].includes(x.arms)).map(x=>({name:x.name.slice(0,100),arms:x.arms,centre:Array.isArray(x.centre)?x.centre.slice(0,2):[],connections:Array.isArray(x.connections)?x.connections.slice(0,12).map(v=>String(v).slice(0,100)):[],description:String(x.description||'').slice(0,4000)}));
 }
 clean.features=structuredClone(data.features);clean.notes=String(data.notes||'').slice(0,20000);const s=data.settings||{};
 for(const k of ['grid','snap','zonesVisible','zonesLocked','notesVisible','corridors','protectExistingZones','showNewZones','showNewRoads','districtsVisible'])if(typeof s[k]==='boolean')clean.settings[k]=s[k];
 if(['districts','streets','detail'].includes(s.planView))clean.settings.planView=s.planView;
 if((['qgis','satellite','none'].includes(s.base)||(data.basemaps||[]).some(b=>b.id===s.base)))clean.settings.base=s.base;
 for(const k of ['baseOpacity','zoneOpacity'])if(Number.isFinite(s[k]))clean.settings[k]=Math.max(k==='zoneOpacity'?10:0,Math.min(k==='zoneOpacity'?85:100,s[k]));
 for(const r of ROADS)for(const k of ['visible','locked'])if(typeof s.layers?.[r.id]?.[k]==='boolean')clean.settings.layers[r.id][k]=s.layers[r.id][k];validateEditorProject(clean,data);return clean;
}

export const isNewFeature=(project,feature)=>project.proposal?.newFeatureIds?.includes(feature.id)||false;
export const isProtectedZone=(project,feature)=>feature.kind==='zone'&&project.settings.protectExistingZones!==false&&(project.proposal?.preservedZoneIds?.includes(feature.id)||false);

export function applyFeaturePatch(project,patch){
 if(project.proposal?.appliedPatches?.includes(patch.id))return {project,applied:false};
 const replacement=new Map((patch.replace||[]).map(f=>[f.id,f]));const remove=new Set(patch.removeIds||[]);
 const targets=project.features.filter(f=>replacement.has(f.id)||remove.has(f.id));
 if(targets.some(f=>f.kind==='zone')||(patch.replace||[]).some(f=>f.kind==='zone'))throw Error('道路修正不能改动区划');
 const next=structuredClone(project);
 next.features=next.features.filter(f=>!remove.has(f.id)).map(f=>replacement.has(f.id)?structuredClone(replacement.get(f.id)):f);
 const ids=new Set(next.features.map(f=>f.id));
 for(const f of patch.add||[])if(!ids.has(f.id)){next.features.push(structuredClone(f));ids.add(f.id)}
 next.proposal=next.proposal||{revision:'细化方案 02',source:''};
 next.proposal.newFeatureIds=[...new Set([...(next.proposal.newFeatureIds||[]).filter(id=>!remove.has(id)),...(patch.add||[]).map(f=>f.id)])];
 if(patch.interchange){next.proposal.interchanges=(next.proposal.interchanges||[]).map(s=>s.name===patch.interchange.name?structuredClone(patch.interchange):s);const note=next.features.find(f=>f.kind==='note'&&f.name===patch.interchange.name);if(note)note.notes=patch.interchange.description;}
 next.proposal.appliedPatches=[...(next.proposal.appliedPatches||[]),patch.id];
 return {project:next,applied:true};
}

export const isPolygonFeature=f=>f.kind==='road'&&f.geometryType==='polygon'||['zone','district','interchange'].includes(f.kind)||(f.kind==='building'&&f.geometryType!=='point');
export function pointInPolygon(p,points){let inside=false;for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
export function interiorPoint(points){
 let sum=0,x=0,y=0;for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length],c=a[0]*b[1]-b[0]*a[1];sum+=c;x+=(a[0]+b[0])*c;y+=(a[1]+b[1])*c;}
 const centre=Math.abs(sum)>1e-8?[x/(3*sum),y/(3*sum)]:points[0];if(pointInPolygon(centre,points))return centre;
 const ys=points.map(p=>p[1]),lo=Math.min(...ys),hi=Math.max(...ys);let best=null;
 for(const frac of [.5,.35,.65,.2,.8]){const yy=lo+(hi-lo)*frac,hits=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]>yy)!==(b[1]>yy))hits.push(a[0]+(yy-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2){const w=hits[i+1]-hits[i];if(!best||w>best.w)best={w,p:[(hits[i]+hits[i+1])/2,yy]};}}
 return best?.p||points[0];
}
export function districtAt(project,p){return project.features.find(f=>f.kind==='district'&&pointInPolygon(p,f.points))?.id||'';}
export function visibleInPlanView(project,f){const mode=project.settings.planView||'detail';if(f.kind==='district')return project.settings.districtsVisible!==false;if(f.kind==='zone')return mode==='detail'||['station','depot','civic'].includes(f.type)||f.name==='生态绿地';if(f.kind==='road'&&mode==='districts'&&['local','path','metro','bus'].includes(f.type))return false;return true;}

// Editor v2 keeps legacy feature geometry untouched; missing metadata has defaults.
export const GROUPS=[['area','地块 Area'],['network','路网 Network'],['building','建筑 Building'],['route','交通 Route'],['zoning','用地 Zoning'],['terrain','地形 Terrain']];
export const BLOCK_CLASSES=[
 ['residential','居住','#70a485'],['commercial','商业','#d9a15e'],['mixed','商住混合','#68a6a2'],
 ['office','办公','#7d9cce'],['industrial','工业与产业','#b99973'],['transport','交通与物流','#9595b5'],
 ['public','公共服务','#c78491'],['utility','市政设施','#a59a7d'],['rural','农业与林业','#b0b86a'],
 ['leisure','文旅与体育','#c596b6'],['green','生态与公园','#79a36c'],['future','发展预留','#a7afaa']
];
export const BUILDINGS=[['education','教育'],['residential','住宅'],['hospital','医疗'],['police','警务'],['fire','消防'],['municipal','市政'],['industry','产业'],['commercial','商业'],['sports','文化体育'],['landscape','景观'],['other','其他建筑']];
export const buildingCategory=type=>({school:'education',university:'education',government:'municipal',utility:'municipal',transport:'municipal'}[type]||type);
export const MUNICIPAL_TYPES=[['rail-facilities','铁路车站与车辆段'],['air-facilities','机场与航空设施'],['water-facilities','港口与水运设施'],['transit-facilities','公交与地铁设施'],['utilities','供电、水务与环卫'],['civic','政务与其他市政建筑'],['rail-stops','火车站牌'],['air-stops','航空停靠点'],['transit-stops','公交、地铁等站点'],['water-stops','水运停靠点'],['traffic-lights','红绿灯'],['other-points','其他市政点位']];
export function municipalClass(f){
 if(f?.kind!=='building'||buildingCategory(f.type)!=='municipal')return null;
 if(isTrafficLight(f))return 'traffic-lights';
 const cat=String(f.attributes?.Category||f.poiAttributes?.Category||''),text=[f.name,cat,f.attributes?.Asset,f.outlineAttributes?.Asset].filter(Boolean).join(' ');
 if(/Stop.*(?:Train|Rail)|火车站牌/i.test(cat+' '+f.name))return 'rail-stops';
 if(/Stop.*(?:Airplane|Helicopter)|Helipad/i.test(cat))return 'air-stops';
 if(/Stop.*(?:Ship|Ferry|Boat)/i.test(cat))return 'water-stops';
 if(/Stop|站位预留|地铁站点/i.test(cat+' '+f.name))return 'transit-stops';
 if(/机场|航站|航空|停机|机坪|airport|airfield|hangar/i.test(text))return 'air-facilities';
 if(/火车|铁路|轨道总站|railway|railroad|train.*(?:station|depot)/i.test(text))return 'rail-facilities';
 if(/港口|码头|船坞|harbo[u]?r|seaport|ferry/i.test(text))return 'water-facilities';
 if(/公交|地铁|换乘|巴士|bus|subway|metro/i.test(text))return 'transit-facilities';
 if(/水厂|取水|泵站|污水|变电|配电|发电|供电|电厂|垃圾|回收|环卫|water|sewage|power|electric|garbage|recycl/i.test(text))return 'utilities';
 return f.geometryType==='point'?'other-points':'civic';
}
export const municipalVisible=(editor,id)=>id!=='traffic-lights'?editor.municipalVisibility?.[id]!==false:editor.municipalVisibility?.[id]===true;
export const groupForLayer=key=>key==='zone'||key.startsWith('district:')?'area':key.startsWith('road:')?'network':key.split(':')[0];
export const layerKeysForGroup=group=>group==='area'?['district:large','district:small','zone','district:tile']:group==='network'?[...ROADS.filter(r=>r.id!=='bus').map(r=>'road:'+r.id),'road:interchange']:group==='building'?BUILDINGS.map(([id])=>'building:'+id):group==='route'?['route:bus','route:metro','route:train','route:water','route:air','route:other']:group==='terrain'?['terrain:elevation','terrain:depth','terrain:landwater']:group==='zoning'?['zoning:boundary']:[];
export function blockClass(f){
 if(BLOCK_CLASSES.some(c=>c[0]===f.category))return f.category;
 const t=f.type;
 if(['villa','old','mid-res','high-res'].includes(t))return 'residential';
 if(['mid-mix','high-mix'].includes(t))return 'mixed';
 if(['commerce','market','used-car'].includes(t))return 'commercial';
 if(t==='office')return 'office';
 if(['industry','innovation','pharma','data','vehicle'].includes(t))return 'industrial';
 if(['airport','port','shipyard','station','depot','marina'].includes(t))return 'transport';
 if(['power','waste','water'].includes(t))return 'utility';
 if(['agriculture','forest','aquaculture'].includes(t))return 'rural';
 if(['racecourse','racetrack','tourism'].includes(t))return 'leisure';
 if(['park','reserve'].includes(t))return 'green';
 return t==='future'?'future':'public';
}
export const classInfo=f=>BLOCK_CLASSES.find(c=>c[0]===blockClass(f));
export const featureSource=(project,f)=>f.source||((project.proposal?.newFeatureIds||[]).includes(f.id)?'ai':'manual');
export const layerKey=f=>f.kind==='zone'&&f.carto?.layers?.includes('Zoning_Boundary')?'zoning:boundary':f.kind==='route'?`route:${f.type}`:f.kind==='road'?(f.type==='bus'?'route:bus':`road:${f.type}`):f.kind==='district'?`district:${f.level||'large'}`:f.kind==='interchange'?'road:interchange':f.kind==='building'?`building:${buildingCategory(f.type)}`:f.kind;
export function defaultLayerColor(key){
 const colors={'district:large':'#477c89','district:small':'#83a67b','district:tile':'#a8b1ba','zone':'#70a485','road:interchange':'#b56e4e','building:education':'#bb9247','building:residential':'#70a485','building:hospital':'#d87982','building:police':'#5c84b5','building:fire':'#d36c4c','building:municipal':'#8b79ae','building:industry':'#ad9469','building:commercial':'#d7a151','building:sports':'#a67fb2','building:landscape':'#6f9b68','building:other':'#8b9ba5','route:bus':'#2695bc','route:metro':'#a461cd','route:train':'#c27843','route:water':'#3aa5a1','route:air':'#c985ae','route:other':'#7e91a1','zoning:boundary':'#70a485'};
 return colors[key]||(key.startsWith('road:')?roadInfo(key.split(':')[1]).color:'#658c8b');
}
export function featureDisplayColor(project,f){
 return project.settings.editor?.layers[layerKey(f)]?.color||f.color||(f.kind==='zone'?classInfo(f)[2]:defaultLayerColor(layerKey(f)));
}
export function roadStyleColors(color){
 const rgb=color.slice(1).match(/../g).map(n=>parseInt(n,16));
 const mix=(target,amount)=>'#'+rgb.map(n=>Math.round(n+(target-n)*amount).toString(16).padStart(2,'0')).join('');
 return {color,elevatedColor:mix(255,.32),tunnelColor:mix(0,.30)};
}
export function editorDefaults(){
 const keys=[...GROUPS.flatMap(([g])=>layerKeysForGroup(g)),'building','road:bus'];
 return {municipalVisibility:Object.fromEntries(MUNICIPAL_TYPES.map(([id])=>[id,id!=='traffic-lights'])),visibilityDefaultsVersion:1,origins:{carto:true,planning:true},lockCarto:true,showBuiltPlanning:false,groups:Object.fromEntries(GROUPS.map(([k])=>[k,k!=='zoning'])),groupLabels:Object.fromEntries(GROUPS.map(([k])=>[k,false])),layers:Object.fromEntries(keys.map(k=>[k,{visible:!['terrain:landwater','building:municipal'].includes(k),locked:false,manual:true,ai:true,labelsVisible:false}])),roadStyles:Object.fromEntries(ROADS.map(r=>[r.id,{...roadStyleColors(r.color),width:r.width,corridor:r.corridor}])),structures:{ground:true,elevated:true,bridge:true,tunnel:true},simpleTerrain:{landColor:'#d8edcf',waterColor:'#66b8e5',opacity:100},networkOutlines:false,networkStyleVersion:2,widthMode:'actual',railSegment:24,routeWidth:2,pngSize:4096,labelSize:11};
}
export const editorSettings=p=>p.settings.editor||editorDefaults();
export function isTrafficLight(f){
 if(f.kind!=='building')return false;
 const category=String(f.attributes?.Category||'').replace(/[\s_-]/g,'').toLowerCase();
 return category==='trafficlight'||(f.geometryType==='point'&&/traffic[\s_-]*light|红绿灯|交通信号灯/i.test(f.name||''));
}
export const originForFeature=f=>Array.isArray(f.carto?.layers)&&f.carto.layers.length?'carto':'planning';
export const lockedInEditor=(p,f)=>editorSettings(p).layers[layerKey(f)]?.locked===true||(originForFeature(f)==='carto'&&editorSettings(p).lockCarto!==false);
export function visibleInEditor(p,f){
 const municipal=municipalClass(f);if(municipal&&!municipalVisible(editorSettings(p),municipal))return false;
 const settings=editorSettings(p);if(settings.origins?.[originForFeature(f)]===false)return false;if(originForFeature(f)==='planning'&&f.planningStatus==='built'&&settings.showBuiltPlanning!==true)return false;
 const e=editorSettings(p),g=groupForLayer(layerKey(f));
 if(f.kind==='note')return p.settings.notesVisible;
 const l=e.layers[layerKey(f)];
 return e.groups[g]!==false&&l?.visible!==false&&(f.kind!=='building'||e.layers.building.visible!==false)&&(f.kind!=='road'||e.structures[f.structure]!==false);
}
export function labelsVisibleInEditor(p,f){
 const e=editorSettings(p),key=layerKey(f);
 return p.settings.notesVisible!==false&&visibleInEditor(p,f)&&e.groupLabels?.[groupForLayer(key)]!==false&&e.layers[key]?.labelsVisible!==false;
}
export function pointInOrOn(p,poly){return pointInPolygon(p,poly)||nearestSegment(poly,p,true).distance<1e-5;}
// Check each segment interval split by boundary intersections. Testing only nodes
// would let a line cross outside a concave interchange reservation.
export function containedGeometry(points,polygon,closed=false){
 if(!points.every(p=>pointInOrOn(p,polygon)))return false;
 const cross=(a,b)=>a[0]*b[1]-a[1]*b[0];
 for(let k=0;k<points.length-(closed?0:1);k++){
  const a=points[k],b=points[(k+1)%points.length],r=[b[0]-a[0],b[1]-a[1]],ts=[0,1];
  for(let j=0;j<polygon.length;j++){
   const c=polygon[j],d=polygon[(j+1)%polygon.length],s=[d[0]-c[0],d[1]-c[1]],q=[c[0]-a[0],c[1]-a[1]],den=cross(r,s);
   if(Math.abs(den)>1e-9){const t=cross(q,s)/den,u=cross(q,r)/den;if(t>0&&t<1&&u>=0&&u<=1)ts.push(t);}
   else if(Math.abs(cross(q,r))<1e-6){const rr=r[0]*r[0]+r[1]*r[1];if(rr)for(const v of [c,d]){const t=((v[0]-a[0])*r[0]+(v[1]-a[1])*r[1])/rr;if(t>0&&t<1)ts.push(t);}}
  }
  ts.sort((a,b)=>a-b);
  for(let j=1;j<ts.length;j++){const t=(ts[j]+ts[j-1])/2;if(!pointInOrOn([a[0]+r[0]*t,a[1]+r[1]*t],polygon))return false;}
 }
 return true;
}
export function validateInterchangeBounds(project){
 for(const f of project.features){
  if(!f.interchangeId)continue;
  const boundary=project.features.find(x=>x.id===f.interchangeId&&x.kind==='interchange');
  if(!boundary||f.kind==='interchange'||!containedGeometry(f.points,boundary.points,isPolygonFeature(f)))throw Error(`“${f.name}”超出指定立交范围或范围不存在`);
 }
}
export function validateEditorProject(clean,data){
 const color=v=>/^#[0-9a-f]{6}$/i.test(v||'');
 clean.assetPacks=validateBuildingPacks(data.assetPacks||[]);
 for(const f of clean.features){
  validateBuildingPlacement(f,data.mapSize);
  if(f.stackLevel!==undefined&&(f.kind!=='road'||!Number.isInteger(f.stackLevel)||f.stackLevel<-20||f.stackLevel>20))throw Error('道路交叉层级需为 −20 到 20 的整数或留空');
  if(f.source!==undefined&&!['manual','ai'].includes(f.source))throw Error('手绘 / AI 来源无效');
  if(f.color!==undefined&&!color(f.color))throw Error('显示颜色无效');
  if(f.kind==='district'&&f.level!==undefined&&!['large','small','tile'].includes(f.level))throw Error('片区等级无效');
  if(f.kind==='building'&&!BUILDINGS.some(b=>b[0]===buildingCategory(f.type)))throw Error('功能建筑类型无效');
  if(f.kind==='building'&&f.geometryType!==undefined&&!['polygon','point'].includes(f.geometryType))throw Error('建筑几何类型无效');
  if(f.kind==='building'&&f.geometryType==='point'&&f.points.length!==1)throw Error('POI 点对象必须只有一个位置');
  if(f.poi!==undefined&&(!Array.isArray(f.poi)||f.poi.length!==2||f.poi.some(n=>!Number.isFinite(n)||n<0||n>data.mapSize)))throw Error('建筑POI超出地图范围');
  if(f.attributes!==undefined&&(!f.attributes||typeof f.attributes!=='object'||Array.isArray(f.attributes)||Object.keys(f.attributes).length>100||Object.entries(f.attributes).some(([k,v])=>k.length>100||!['string','number','boolean'].includes(typeof v)&&v!==null||typeof v==='string'&&v.length>20000||typeof v==='number'&&!Number.isFinite(v))))throw Error('对象扩展属性无效');
  if(f.kind==='route'&&!['bus','metro','train','water','air','other'].includes(f.type))throw Error('交通线路分类无效');
  if(f.kind==='road'&&f.geometryType!==undefined&&!['line','polygon'].includes(f.geometryType))throw Error('路网几何类型无效');
  for(const key of ['additionalParts','outlineParts'])if(f[key]!==undefined){if(!Array.isArray(f[key])||f[key].length>1000||f[key].some(ps=>!Array.isArray(ps)||ps.length<3||ps.length>5000||ps.some(p=>!Array.isArray(p)||p.length!==2||p.some(n=>!Number.isFinite(n)||n<0||n>data.mapSize))))throw Error('Carto 多段轮廓无效');}
  for(const key of ['outlineAttributes','poiAttributes'])if(f[key]!==undefined){const a=f[key];if(!a||typeof a!=='object'||Array.isArray(a)||Object.keys(a).length>100||Object.entries(a).some(([k,v])=>k.length>100||v!==null&&!['string','number','boolean'].includes(typeof v)||typeof v==='number'&&!Number.isFinite(v)||typeof v==='string'&&v.length>20000))throw Error('Carto 附加属性无效');}
  if(f.planningStatus!==undefined&&!['planned','built'].includes(f.planningStatus))throw Error('规划实施状态无效');
  if(f.planningOrigin!==undefined&&(!f.planningOrigin||typeof f.planningOrigin.featureId!=='string'||f.planningOrigin.featureId.length>300||f.planningOrigin.dataset!==null&&typeof f.planningOrigin.dataset!=='string'))throw Error('规划来源信息无效');
  if(f.carto!==undefined){const c=f.carto;if(!c||typeof c.dataset!=='string'||c.dataset.length>100||!Array.isArray(c.layers)||c.layers.some(v=>typeof v!=='string'||v.length>100)||c.layers.length>10||!Number.isInteger(c.recordId)||c.recordId<1||typeof c.crs!=='string'||typeof c.encoding!=='string'||!Array.isArray(c.frame)||c.frame.length!==4||!c.frame.every(Number.isFinite))throw Error('Carto 来源信息无效');}
  if(f.kind==='zone'&&f.category!==undefined&&!BLOCK_CLASSES.some(c=>c[0]===f.category))throw Error('功能区块大类无效');
  if(f.fillStyle!==undefined&&!['solid','hatch','dots'].includes(f.fillStyle))throw Error('填充方式无效');
  for(const k of ['parentId','districtId','interchangeId','originalId'])if(f[k]!==undefined&&(typeof f[k]!=='string'||f[k].length>300))throw Error('关联对象编号无效');
  if(f.tags!==undefined&&(typeof f.tags!=='string'||f.tags.length>1000))throw Error('区块标签无效');
 }
 for(const f of clean.features.filter(f=>f.kind==='district'&&f.parentId))if(f.level!=='small'||!clean.features.some(x=>x.id===f.parentId&&x.kind==='district'&&(x.level||'large')==='large'))throw Error('小片区需归属有效的大片区');
 const maps=data.basemaps||[];
 if(!Array.isArray(maps)||maps.length>30)throw Error('底图数量过多');
 const mapIds=new Set(['qgis','satellite','none']);let bytes=0;
 for(const b of maps){
  if(!b||typeof b.id!=='string'||!/^custom-[a-z0-9-]+$/i.test(b.id)||mapIds.has(b.id)||typeof b.name!=='string'||b.name.length>300||typeof b.data!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(b.data)||!Number.isInteger(b.width)||b.width<1||b.width!==b.height)throw Error('自定义底图必须是正方形 PNG、JPEG 或 WebP');
  mapIds.add(b.id);bytes+=b.data.length;
 }
 if(bytes>180*1024*1024)throw Error('底图总量超过 180 MB');
 clean.basemaps=structuredClone(maps);
 const rasters=data.rasters||[];
 if(!Array.isArray(rasters)||rasters.length>2)throw Error('地形图层数量无效');
 const rasterIds=new Set();
 for(const r of rasters){
  if(!r||!['elevation','depth'].includes(r.id)||rasterIds.has(r.id)||typeof r.name!=='string'||r.name.length>300||typeof r.fileName!=='string'||r.fileName.length>300||typeof r.data!=='string'||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(r.data)||!Number.isInteger(r.width)||r.width<1||r.width>8192||r.width!==r.height||!Number.isFinite(r.opacity)||r.opacity<0||r.opacity>100)throw Error('地形图层数据无效');
  const m=r.metadata;
  if(!m||!Number.isInteger(m.width)||m.width<1||m.width>8192||m.width!==m.height||!Number.isFinite(m.min)||!Number.isFinite(m.max)||m.max<m.min||!Number.isInteger(m.validCount)||m.validCount<1||m.validCount>m.width*m.height||m.noData!==null&&!Number.isFinite(m.noData)||typeof m.crs!=='string'||m.crs.length>100)throw Error('地形属性无效');
  if(m.bounds!==null&&(!Array.isArray(m.bounds)||m.bounds.length!==4||!m.bounds.every(Number.isFinite)||m.bounds[0]>=m.bounds[2]||m.bounds[1]>=m.bounds[3]))throw Error('地形地理范围无效');
  if(m.pixelSize!==null&&(!Array.isArray(m.pixelSize)||m.pixelSize.length!==2||!m.pixelSize.every(n=>Number.isFinite(n)&&n>0)))throw Error('地形像元尺寸无效');
  rasterIds.add(r.id);bytes+=r.data.length;
 }
 if(bytes>180*1024*1024)throw Error('底图与地形图层总量超过 180 MB');
 clean.rasters=structuredClone(rasters);
 const e=editorDefaults(),src=data.settings?.editor;
 if(src){
  for(const k of ['carto','planning'])if(typeof src.origins?.[k]==='boolean')e.origins[k]=src.origins[k];
  if(typeof src.lockCarto==='boolean')e.lockCarto=src.lockCarto;
  for(const [id]of MUNICIPAL_TYPES)if(typeof src.municipalVisibility?.[id]==='boolean')e.municipalVisibility[id]=src.municipalVisibility[id];
  if(typeof src.showBuiltPlanning==='boolean')e.showBuiltPlanning=src.showBuiltPlanning;
  if(!('area' in (src.groups||{}))){
   for(const k of ['district:large','district:small'])e.layers[k].visible=src.groups?.district!==false;
   e.layers.zone.visible=src.groups?.zone!==false;
   e.groups.network=src.groups?.road!==false;
   if(src.layers?.building)for(const k of layerKeysForGroup('building'))Object.assign(e.layers[k],src.layers.building);
   if(src.layers?.['road:bus'])Object.assign(e.layers['route:bus'],src.layers['road:bus']);
  }
  if(!('zoning' in (src.groups||{}))){e.layers['zoning:boundary'].visible=src.layers?.zone?.visible!==false;e.layers['zoning:boundary'].locked=src.layers?.zone?.locked===true;}
  for(const [k,v]of Object.entries(src.groupLabels||{}))if(k in e.groupLabels&&typeof v==='boolean')e.groupLabels[k]=v;
  for(const [k,v]of Object.entries(src.groups||{}))if(k in e.groups&&typeof v==='boolean')e.groups[k]=v;
  for(const [k,v]of Object.entries(src.layers||{}))if(k in e.layers)for(const a of ['visible','locked','manual','ai','labelsVisible'])if(typeof v[a]==='boolean')e.layers[k][a]=v[a];
  if(src.visibilityDefaultsVersion!==1){e.groups.zoning=false;e.layers['building:municipal'].visible=false;}
  for(const [k,v]of Object.entries(src.layers||{}))if(k in e.layers&&v.color!==undefined){if(!color(v.color))throw Error('图层颜色无效');e.layers[k].color=v.color;}
  if(!('area' in (src.groups||{}))){if(src.groups?.district===false)for(const k of ['district:large','district:small'])e.layers[k].visible=false;if(src.groups?.zone===false)e.layers.zone.visible=false;}
  const oldRoadColors={rail:['#806c88'],waterway:['#288fa9'],highway:['#c17c45','#24934c'],arterial:['#ce9b45','#f8c454'],secondary:['#6b9685','#e8ad49'],local:['#6d99b1','#f5f8fa'],path:['#a2ad85','#9caba9'],metro:['#c67d97','#8b50c7'],bus:['#4eabb1']};
  for(const r of ROADS){const v=src.roadStyles?.[r.id];if(v){if(!color(v.color)||!Number.isFinite(v.width)||v.width<1||v.width>1000||!Number.isFinite(v.corridor)||v.corridor<v.width||v.corridor>2000)throw Error('路网默认样式无效');const base=src.networkStyleVersion!==2&&oldRoadColors[r.id].includes(v.color.toLowerCase())?r.color:v.color;e.roadStyles[r.id]={...roadStyleColors(base),width:v.width,corridor:v.corridor};for(const key of ['elevatedColor','tunnelColor'])if(v[key]!==undefined){if(!color(v[key]))throw Error('结构配色无效');e.roadStyles[r.id][key]=v[key];}}}
  if(src.widthMode!==undefined){if(!['actual','overview'].includes(src.widthMode))throw Error('道路显示模式无效');e.widthMode=src.widthMode;}
  for(const [key,min,max]of [['railSegment',2,200],['routeWidth',.25,6]])if(src[key]!==undefined){if(!Number.isFinite(src[key])||src[key]<min||src[key]>max)throw Error('路网显示尺寸无效');e[key]=src[key];}
  if(src.networkStyleVersion!==2)clean.settings.corridors=false;
  for(const k of Object.keys(e.structures))if(typeof src.structures?.[k]==='boolean')e.structures[k]=src.structures[k];
  if(src.networkStyleVersion===2&&typeof src.networkOutlines==='boolean')e.networkOutlines=src.networkOutlines;
  if(src.simpleTerrain){const t=src.simpleTerrain;if(!color(t.landColor)||!color(t.waterColor)||!Number.isFinite(t.opacity)||t.opacity<0||t.opacity>100)throw Error('简图显示设定无效');e.simpleTerrain={landColor:t.landColor.toLowerCase()==='#f0ead7'?'#d8edcf':t.landColor,waterColor:t.waterColor.toLowerCase()==='#9dcddd'?'#66b8e5':t.waterColor,opacity:t.opacity};}
  if([2048,4096,8192].includes(src.pngSize))e.pngSize=src.pngSize;
  if(Number.isFinite(src.labelSize))e.labelSize=Math.max(8,Math.min(24,src.labelSize));
 }
 if(src)clean.settings.editor=e;
 if(Number.isFinite(data.editorSavedAt))clean.editorSavedAt=data.editorSavedAt;
 validateInterchangeBounds(clean);
}
export function prepareEditor(project){
 const p=validateProject(project);
 // Correct the physical extent while keeping every object aligned to its basemap.
 if(p.mapSize!==SIZE){
  const ratio=SIZE/p.mapSize;
  for(const f of p.features){f.points=f.points.map(point=>point.map(value=>value*ratio));for(const key of ['additionalParts','outlineParts'])if(f[key])f[key]=f[key].map(ps=>ps.map(point=>point.map(value=>value*ratio)));if(f.poi)f.poi=f.poi.map(value=>value*ratio);}
  for(const interchange of p.proposal?.interchanges||[])interchange.centre=interchange.centre.map(value=>value*ratio);
  p.mapSize=SIZE;
 }
 if(!p.settings.editor){
  p.settings.editor=editorDefaults();
  for(const key of ['district:large','district:small'])p.settings.editor.layers[key].visible=p.settings.districtsVisible!==false;
  p.settings.editor.layers.zone.visible=p.settings.zonesVisible!==false;
  for(const r of ROADS){const key=r.id==='bus'?'route:bus':`road:${r.id}`;p.settings.editor.layers[key].visible=p.settings.layers[r.id].visible;p.settings.editor.layers[key].locked=p.settings.layers[r.id].locked;}
 }
 p.version=2;p.settings.planView='detail';return p;
}
export function correctionCopy(project,f,id){return {...structuredClone(f),id,name:f.name,source:'ai',originalId:f.originalId||f.id};}

export const CARTO_FIELDS={"area":[["Name","名称","text"],["Age","年龄统计","number"],["Area","面积","number"],["Company","公司数","number"],["Employee","雇员数","number"],["Household","家庭数","number"],["Labor","劳动力","number"],["Object","原始对象类型","text"],["Profit","利润","number"],["Resident","居民数","number"],["SexRatio","性别比例","number"],["Unlocked","解锁状态","number"],["Wage","工资","number"]],"network":[["Name","名称","text"],["Asset","游戏资产","text"],["Category","原始分类","text"],["Direction","通行方向","text"],["Elevation","高程","number"],["Form","结构形式","text"],["Lane","车道数","number"],["Length","长度","number"],["Limit","限速","number"],["Object","原始对象类型","text"],["Volume","流量","number"],["Width","宽度","number"]],"building":[["Name","名称","text"],["Addr_dist","地址区名","text"],["Addr_strt","地址街道","text"],["Addr_nmbr","门牌号","number"],["Age","年龄统计","number"],["Asset","游戏资产","text"],["Brand","品牌","text"],["Category","原始分类","text"],["Elevation","高程","number"],["Employee","雇员数","number"],["Household","家庭数","number"],["Labor","劳动力","number"],["Level","建筑等级","number"],["Object","原始对象类型","text"],["Product","产品","text"],["Profit","利润","number"],["Resident","居民数","number"],["SexRatio","性别比例","number"],["Theme","主题","text"],["Wage","工资","number"],["Zone","原始分区","text"],["Zoning","用地区划","text"]],"route":[["Name","名称","text"],["Color","颜色","text"],["Length","长度","number"],["Model","模型","text"],["Object","原始对象类型","text"],["Passenger","乘客","number"],["Route","线路","text"],["Stop","站点","number"],["Transport","交通方式","text"],["Usage","使用率","number"],["Vehicle","车辆数","number"],["Weight","权重","number"]],"zoning":[["Name","名称","text"],["Color","颜色","text"],["Density","密度","text"],["Object","原始对象类型","text"],["Theme","主题","text"],["Zoning","用地区划","text"]]};
export function fieldsForLayer(key){
 if(key==='road:interchange')return [];
 if(key==='zone'||key==='zoning:boundary')return CARTO_FIELDS.zoning;
 if(key==='area')return [...new Map([...CARTO_FIELDS.area,...CARTO_FIELDS.zoning].map(f=>[f[0],f])).values()];
 return CARTO_FIELDS[groupForLayer(key)]||[];
}
