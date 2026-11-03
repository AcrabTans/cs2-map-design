import {createPlanningProject} from './planning.js';
import {SIZE,ROADS,prepareEditor,pointInPolygon,layerKey,groupForLayer,originForFeature,ZONES,BUILDINGS,buildingCategory} from './model.js';
import {terrainType,readTerrainTiff,checkTerrainExtent,terrainPixels} from './terrain.js';

const CARTO_LAYERS=['Area_Boundary','Network_Centerline','Network_Boundary','Building_Boundary','POI_Location','Route_Centerline','Zoning_Boundary'];
const cartoTargets={Area_Boundary:'地块 Area',Network_Centerline:'路网 Network · 中心线',Network_Boundary:'路网 Network · 轮廓',Building_Boundary:'建筑 Building · 轮廓',POI_Location:'建筑 Building · POI',Route_Centerline:'交通 Route',Zoning_Boundary:'用地 Zoning'};
export function readCartoDbf(buffer,encoding='utf-8'){
 const v=new DataView(buffer),b=new Uint8Array(buffer),check=(o,n)=>{if(o<0||o+n>b.length)throw Error('DBF 数据不完整');};check(0,32);
 const count=v.getUint32(4,true),header=v.getUint16(8,true),rowSize=v.getUint16(10,true);check(0,header+count*rowSize);
 if(count>1000000||header<33||rowSize<1)throw Error('DBF 表头无效');
 const aliases={'65001':'utf-8','936':'gb18030','gbk':'gb18030','cp936':'gb18030','1252':'windows-1252'};const label=encoding.replace(/\0/g,'').trim().toLowerCase();
 let decoder;try{decoder=new TextDecoder(aliases[label]||label||'utf-8');}catch{throw Error('不支持 DBF 编码：'+encoding);}
 const fields=[];let offset=32,total=1;
 while(offset<header&&b[offset]!==13){check(offset,32);const name=new TextDecoder('ascii').decode(b.subarray(offset,offset+11)).replace(/\0.*$/s,'');const type=String.fromCharCode(b[offset+11]),width=b[offset+16];if(!name||!width&&count>0)throw Error('DBF 字段无效');fields.push({name,type,width});total+=width;offset+=32;}
 if(b[offset]!==13||total>rowSize)throw Error('DBF 字段长度不一致');
 const records=[];
 for(let i=0;i<count;i++){
  const at=header+i*rowSize;if(b[at]===42){records.push(null);continue;}let p=at+1;const rec={};
  for(const f of fields){const raw=decoder.decode(b.subarray(p,p+f.width)).replace(/\0/g,'').trim();let value=raw;
   if('NF'.includes(f.type))value=raw===''?null:Number(raw);else if(f.type==='L')value=/^[YT]$/i.test(raw)?true:/^[NF]$/i.test(raw)?false:null;else if(f.type==='I'&&f.width===4)value=v.getInt32(p,true);
   if(typeof value==='number'&&!Number.isFinite(value))value=null;rec[f.name]=value;p+=f.width;
  }records.push(rec);
 }
 return {records,fields,encoding:decoder.encoding};
}
export function readCartoShp(buffer){
 const v=new DataView(buffer),check=(o,n)=>{if(!Number.isSafeInteger(o)||o<0||o+n>v.byteLength)throw Error('Shapefile 数据不完整');};check(0,100);
 if(v.getInt32(0)!==9994||v.getInt32(28,true)!==1000)throw Error('不是有效的 Shapefile');
 const size=v.getUint32(24)*2;if(size<100||size>v.byteLength)throw Error('Shapefile 长度无效');
 const bounds=Array.from({length:4},(_,i)=>v.getFloat64(36+i*8,true));if(!bounds.every(Number.isFinite))throw Error('Shapefile 范围无效');
 const records=[];let offset=100,total=0;
 while(offset<size){check(offset,8);const bytes=v.getUint32(offset+4)*2,o=offset+8;check(o,bytes);if(bytes<4)throw Error('Shapefile 对象损坏');const type=v.getInt32(o,true),recordId=v.getInt32(offset);let geometry=null;
  if([1,11,21].includes(type)){if(bytes<20)throw Error('点对象损坏');const point=[v.getFloat64(o+4,true),v.getFloat64(o+12,true)];if(!point.every(Number.isFinite))throw Error('Shapefile 坐标无效');geometry={type:'point',parts:[[point]]};}
  else if([3,5,13,15,23,25].includes(type)){
   if(bytes<44)throw Error('线面对象损坏');const np=v.getUint32(o+36,true),n=v.getUint32(o+40,true),start=o+44+np*4;
   if(np>n||n>200000||np===0||44+np*4+n*16>bytes||(total+=n)>4000000)throw Error('线面节点数量或长度无效');
   const starts=Array.from({length:np},(_,j)=>v.getUint32(o+44+j*4,true));if(starts[0]!==0||starts.some((x,i)=>x>=n||i&&x<=starts[i-1]))throw Error('Shapefile 分段无效');
   const points=Array.from({length:n},(_,j)=>[v.getFloat64(start+j*16,true),v.getFloat64(start+j*16+8,true)]);
   if(!points.every(p=>p.every(Number.isFinite)))throw Error('Shapefile 坐标无效');geometry={type:[5,15,25].includes(type)?'polygon':'line',parts:starts.map((s,j)=>points.slice(s,starts[j+1]??n))};
  }else if(type!==0)throw Error('暂不支持的 Shapefile 几何类型：'+type);
  records.push({recordId,geometry});offset=o+bytes;
 }
 if(offset!==size)throw Error('Shapefile 记录长度不一致');return {bounds,records};
}
export function cartoRoadType(a){
 const c=String(a.Category||'').toLowerCase(),asset=String(a.Asset||'').toLowerCase(),o=String(a.Object||'').toLowerCase();
 if(/subway|metro/.test(c+asset))return 'metro';if(/train|rail/.test(c)||o==='track')return 'rail';if(/water|shipping/.test(c+o))return 'waterway';if(/highway|motorway/.test(c))return 'highway';if(/path|pedestrian/.test(c+o))return 'path';if(/large|arterial/.test(c))return 'arterial';if(/medium|secondary/.test(c))return 'secondary';return 'local';
}
export function cartoBuildingType(a){
 const text=[a.Category,a.Object,a.Zoning,a.Zone].join(' ').toLowerCase();
 if(/education|school|university|research/.test(text))return 'education';if(/hospital|health|medical/.test(text))return 'hospital';if(/police|prison/.test(text))return 'police';if(/fire|disaster/.test(text))return 'fire';if(/residential|residence|housing/.test(text))return 'residential';if(/industrial|industry|manufactur/.test(text))return 'industry';if(/commercial|office|retail/.test(text))return 'commercial';if(/(?:^|\s)sport|culture|museum/.test(text))return 'sports';if(/decoration|park|landmark|tourism|landscape/.test(text))return 'landscape';if(/utility|transport|government|municipal|electric|water|power|sewage|garbage|road/.test(text))return 'municipal';return 'other';
}
export function cartoRouteType(a){const t=String(a.Transport||a.Category||a.Route||'').toLowerCase();return /metro|subway/.test(t)?'metro':/train|rail/.test(t)?'train':/ship|boat|water|ferry/.test(t)?'water':/air|plane|helicopter/.test(t)?'air':/bus/.test(t)?'bus':'other';}
function zoningType(a){const z=String(a.Zoning||''),high=/high/i.test(a.Density||a.Name||''),medium=/medium/i.test(a.Density||a.Name||'');return /residential/i.test(z)&&/commercial/i.test(z)?(high?'high-mix':'mid-mix'):/residential/i.test(z)?(high?'high-res':medium?'mid-res':'villa'):/industrial/i.test(z)?'industry':/office/i.test(z)?'office':/commercial/i.test(z)?'commerce':'future';}
const cartoHash=s=>{let n=2166136261;for(let i=0;i<s.length;i++)n=Math.imul(n^s.charCodeAt(i),16777619);return (n>>>0).toString(36);};
const signature=a=>JSON.stringify(Object.keys(a).sort().map(k=>[k,a[k]]));
const inside=p=>p[0]>=0&&p[1]>=0&&p[0]<=SIZE&&p[1]<=SIZE;
const boundPoint=p=>p.map(v=>Math.min(SIZE,Math.max(0,v)));
const equal=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-6;
export function clipCartoLine(points){
 const out=[];let current=[];
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],d=[b[0]-a[0],b[1]-a[1]],p=[-d[0],d[0],-d[1],d[1]],q=[a[0],SIZE-a[0],a[1],SIZE-a[1]];let lo=0,hi=1,ok=true;
  for(let j=0;j<4;j++){if(p[j]===0){if(q[j]<0)ok=false;}else{const t=q[j]/p[j];if(p[j]<0)lo=Math.max(lo,t);else hi=Math.min(hi,t);}}if(lo>hi)ok=false;
  if(ok){const x=boundPoint([a[0]+lo*d[0],a[1]+lo*d[1]]),y=boundPoint([a[0]+hi*d[0],a[1]+hi*d[1]]);if(equal(x,y))continue;if(current.length&&!equal(current.at(-1),x)){out.push(current);current=[];}if(!current.length)current.push(x);if(!equal(current.at(-1),y))current.push(y);}
  else if(current.length){out.push(current);current=[];}
 }if(current.length)out.push(current);return out.filter(p=>p.length>=2);
}
export function clipCartoPolygon(points){
 let ps=points.length>1&&equal(points[0],points.at(-1))?points.slice(0,-1):points.slice();
 for(const [axis,edge,greater]of [[0,0,true],[0,SIZE,false],[1,0,true],[1,SIZE,false]]){
  const result=[],inEdge=p=>greater?p[axis]>=edge:p[axis]<=edge;
  for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length],ia=inEdge(a),ib=inEdge(b);if(ia)result.push(a);if(ia!==ib){const t=(edge-a[axis])/(b[axis]-a[axis]);result.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])]);}}ps=result;
 }return ps.map(boundPoint).filter((p,i,a)=>!i||!equal(p,a[i-1]));
}
function cartoProjection(prj){
 if(!prj)return null;
 if(/UTM.*31N/i.test(prj)||/Central_Meridian["\s,]*3(?:\.0)?[,\]]/i.test(prj)&&/Transverse_Mercator/i.test(prj)&&/WGS.?1984|WGS.?84/i.test(prj))return 'EPSG:32631';
 throw Error('此版本支持样例中的 WGS 84 / UTM 31N；该 Shapefile 坐标系不同，请先在 QGIS 转为 EPSG:32631');
}
export async function inspectCartoFolder(files,{existingRasters=[]}={}){
 const all=[...files],layers=new Map(),rasterFiles=new Map(),warnings=[],table=[];
 for(const file of all){const match=/^(.*)\.shp$/i.exec(file.name);if(match){const name=CARTO_LAYERS.find(n=>n.toLowerCase()===match[1].toLowerCase());if(name){if(layers.has(name))throw Error('文件夹里有多份 '+name+'，请选择单次导出的目录');layers.set(name,{file});}}const id=terrainType(file.name);if(id){if(rasterFiles.has(id))throw Error('文件夹里有多张 '+file.name);rasterFiles.set(id,file);}}
 if(!layers.size&&!rasterFiles.size)throw Error('未找到 Carto Shapefile 或 Elevation / Depth GeoTIFF，请选择导出目录');
 const rasterPreviews=[];
 for(const [id,file]of rasterFiles){if(file.size>128*1024*1024)throw Error(file.name+' 超过 128 MB');const rawBytes=new Uint8Array(await file.arrayBuffer()),decoded=readTerrainTiff(rawBytes.buffer);checkTerrainExtent(decoded.metadata,SIZE,rasterPreviews);const image=terrainPixels(decoded,id);rasterPreviews.push({id,name:id==='depth'?'Depth 水体':'Elevation 地形',fileName:file.name,width:image.width,height:image.height,metadata:decoded.metadata,preview:image,rawBytes,opacity:id==='depth'?85:100});table.push({layer:file.name,target:'地形',records:1});}
 const pathOf=f=>(f.webkitRelativePath||f.name).replace(/\\/g,'/').toLowerCase();
 const peers=new Map(all.map(f=>[pathOf(f),f]));let crs='';
 for(const [name,entry]of layers){
  const key=pathOf(entry.file).replace(/\.shp$/i,''),dbf=peers.get(key+'.dbf');if(!dbf)throw Error(name+' 缺少配套 .dbf 属性表');
  const cpg=peers.get(key+'.cpg'),prj=peers.get(key+'.prj');if(prj){const code=cartoProjection(await prj.text());if(crs&&code!==crs)throw Error('各 Shapefile 的坐标系不一致');crs=code;}
  else warnings.push(name+' 未提供 .prj，将按本次地形范围的坐标处理');
  if(entry.file.size>200*1024*1024||dbf.size>100*1024*1024)throw Error(name+' 文件过大');
  entry.shp=readCartoShp(await entry.file.arrayBuffer());entry.dbf=readCartoDbf(await dbf.arrayBuffer(),cpg?await cpg.text():'utf-8');
  if(entry.shp.records.length!==entry.dbf.records.length)throw Error(name+' 的几何对象数与 DBF 属性行数不一致');table.push({layer:name,target:cartoTargets[name],records:entry.shp.records.length});
 }
 let exportedFrame=null;const infoFile=all.find(f=>f.name.toLowerCase()==='mapinfo.json');if(infoFile&&infoFile.size<10000){const info=JSON.parse(await infoFile.text());if(info.format==='cs2-carto-export'&&info.version===1){if(info.mapSize!==SIZE||info.crs!=='EPSG:32631'||!Array.isArray(info.frame)||info.frame.length!==4||!info.frame.every(Number.isFinite))throw Error('导出图幅元数据无效');exportedFrame={bounds:info.frame,crs:info.crs};checkTerrainExtent(exportedFrame,SIZE);}}
 const geo=rasterPreviews.find(r=>r.metadata.bounds)?.metadata||exportedFrame||existingRasters.find(r=>r.metadata.bounds)?.metadata;let frame=geo?.bounds;
 if(frame&&crs&&geo.crs&&crs!==geo.crs)throw Error('Shapefile 与地形的坐标系不一致');crs=crs||geo?.crs||'EPSG:32631';
 if(!frame){const b=layers.get('Area_Boundary')?.shp.bounds;if(b&&Math.abs(b[2]-b[0]-SIZE)<1&&Math.abs(b[3]-b[1]-SIZE)<1){const cx=(b[0]+b[2])/2,cy=(b[1]+b[3])/2;frame=[cx-SIZE/2,cy-SIZE/2,cx+SIZE/2,cy+SIZE/2];}}
 if(!frame)throw Error('缺少完整地图范围。请一并选择 Depth / Elevation 或完整的 Area_Boundary，也可先导入地形');
 checkTerrainExtent({...geo,bounds:frame},SIZE);
 const dataset=cartoHash(crs+frame.map(n=>n.toFixed(1)).join(',')),features=[],byLayer=new Map();let clipped=0,omitted=0,pairedOutlines=0,pairedPoi=0;
 const convert=p=>[p[0]-frame[0],frame[3]-p[1]];
 for(const [name,entry]of layers){
  const rows=[];byLayer.set(name,rows);
  for(let i=0;i<entry.shp.records.length;i++){
   const rec=entry.shp.records[i],attributes=entry.dbf.records[i];if(!rec.geometry||!attributes)continue;
   const mapped=rec.geometry.parts.map(ps=>ps.map(convert));if(mapped.some(ps=>ps.some(p=>!inside(p))))clipped++;
   const parts=rec.geometry.type==='point'?(inside(mapped[0][0])?mapped:[]):rec.geometry.type==='line'?mapped.flatMap(clipCartoLine):mapped.map(clipCartoPolygon).filter(ps=>ps.length>=3);
   if(!parts.length){omitted++;continue;}if(parts.some(p=>p.length>5000))throw Error(name+' 单个对象超过 5000 节点，请简化后导入');rows.push({recordId:rec.recordId,geometryType:rec.geometry.type,parts,attributes});
  }
 }
 const create=(row,layer,kind,type,points,suffix='')=>({id:`carto-${dataset}-${layer}-${row.recordId}${suffix}`,kind,type,name:String(row.attributes.Name||row.attributes.Asset||layer+' '+row.recordId).slice(0,300),notes:'',points,attributes:row.attributes,source:'manual',carto:{dataset,layers:[layer],recordId:row.recordId,crs,frame,encoding:layers.get(layer).dbf.encoding}});
 for(const row of byLayer.get('Area_Boundary')||[]){const f=create(row,'Area_Boundary','district','carto',row.parts[0]);Object.assign(f,{level:/map.?tile/i.test(String(row.attributes.Object))?'tile':'large',color:'#7c9d91'});if(row.parts.length>1)f.additionalParts=row.parts.slice(1);features.push(f);}
 const boundaries=new Map();for(const row of byLayer.get('Network_Boundary')||[]){const key=signature(row.attributes);if(!boundaries.has(key))boundaries.set(key,[]);boundaries.get(key).push(row);}
 const roadProps=(row,f)=>{const info=ROADS.find(r=>r.id===f.type),width=Number(row.attributes.Width);Object.assign(f,{width:Number.isFinite(width)&&width>0?Math.min(1000,width):info.width,structure:/tunnel/i.test(String(row.attributes.Form))?'tunnel':/elevated|bridge/i.test(String(row.attributes.Form))?'elevated':'ground'});f.corridor=Math.max(f.width,info.corridor);};
 for(const row of byLayer.get('Network_Centerline')||[]){const paired=boundaries.get(signature(row.attributes))?.shift();row.parts.forEach((points,i)=>{const f=create(row,'Network_Centerline','road',cartoRoadType(row.attributes),points,i?'-part'+i:'');roadProps(row,f);if(paired&&i===0){f.outlineParts=paired.parts;f.outlineAttributes=paired.attributes;f.carto.layers.push('Network_Boundary');pairedOutlines++;}features.push(f);});}
 for(const list of boundaries.values())for(const row of list){const f=create(row,'Network_Boundary','road',cartoRoadType(row.attributes),row.parts[0]);roadProps(row,f);f.geometryType='polygon';if(row.parts.length>1)f.additionalParts=row.parts.slice(1);features.push(f);}
 const buildings=[];
 for(const row of byLayer.get('Building_Boundary')||[]){const f=create(row,'Building_Boundary','building',cartoBuildingType(row.attributes),row.parts[0]);f.geometryType='polygon';if(row.parts.length>1)f.additionalParts=row.parts.slice(1);buildings.push(f);features.push(f);}
 for(const row of byLayer.get('POI_Location')||[]){for(let i=0;i<row.parts.length;i++){const p=row.parts[i][0],matches=row.attributes.P_Kind==='note'?[]:buildings.filter(f=>!f.poi&&pointInPolygon(p,f.points)&&(!f.additionalParts||!f.additionalParts.some(ring=>pointInPolygon(p,ring))));const paired=matches.find(f=>row.attributes.P_Ver===1&&f.attributes.P_Id===row.attributes.P_Id)||matches.find(f=>f.name===row.attributes.Name)|| (matches.length===1?matches[0]:null);if(paired){paired.poi=p;paired.poiAttributes=row.attributes;paired.carto.layers.push('POI_Location');pairedPoi++;}else{const f=create(row,'POI_Location','building',cartoBuildingType(row.attributes),[p],i?'-part'+i:'');f.geometryType='point';f.poi=p;features.push(f);}}}
 for(const row of byLayer.get('Route_Centerline')||[])row.parts.forEach((ps,i)=>{if(ps.length<2)return;const f=create(row,'Route_Centerline','route',cartoRouteType(row.attributes),ps,i?'-part'+i:'');if(/^#[0-9a-f]{6}$/i.test(row.attributes.Color||''))f.color=row.attributes.Color;features.push(f);});
 for(const row of byLayer.get('Zoning_Boundary')||[]){const f=create(row,'Zoning_Boundary','zone',zoningType(row.attributes),row.parts[0]);if(row.parts.length>1)f.additionalParts=row.parts.slice(1);features.push(f);}
 const planIds=new Map();
 for(const f of features){const a=f.attributes;if(a?.P_Ver!==1)continue;if(typeof a.P_Id==='string'&&a.P_Id)planIds.set(a.P_Id,f.id);
  if(f.kind==='district'&&a.P_Kind==='interchange')f.kind='interchange';
  if(f.carto.layers.includes('POI_Location')&&a.P_Kind==='note'){f.kind='note';delete f.poi;delete f.geometryType;}
  if(f.kind==='district'&&['large','small','tile'].includes(a.P_Level))f.level=a.P_Level;
  if(f.kind==='road'&&ROADS.some(r=>r.id===a.P_Type))f.type=a.P_Type;
  if(f.kind==='zone'&&ZONES.some(g=>g[1].some(z=>z[0]===a.P_Type)))f.type=a.P_Type;
  if(f.kind==='building'&&BUILDINGS.some(b=>b[0]===buildingCategory(a.P_Type)))f.type=a.P_Type;
  if(/^#[0-9a-f]{6}$/i.test(a.P_Color||''))f.color=a.P_Color;
  if(f.kind==='road'&&['ground','bridge','elevated','tunnel'].includes(a.P_Struct))f.structure=a.P_Struct;
  if(f.kind==='road'&&Number.isInteger(a.P_Stack))f.stackLevel=a.P_Stack;
 }
 for(const f of features){const a=f.attributes;if(a?.P_Ver!==1)continue;if(f.kind==='district'&&f.level==='small'&&planIds.has(a.P_Parent))f.parentId=planIds.get(a.P_Parent);if(planIds.has(a.P_Dist))f.districtId=planIds.get(a.P_Dist);}
 if(clipped)warnings.push(`${clipped} 个源对象跨出地图范围，已保留范围内的部分`);if(omitted)warnings.push(`${omitted} 个对象完全在地图外，未导入`);
 if(all.some(f=>/\.geojson$/i.test(f.name)))warnings.push('本次按 Shapefile 导入；同名 GeoJSON 不重复导入');if(all.some(f=>/\.(qml|sld)$/i.test(f.name)))warnings.push('Styles 样式文件已识别，路网使用规划器配色');
 return {dataset,frame,crs,features,rasters:rasterPreviews,table,warnings,pairedOutlines,pairedPoi,sourceLayers:[...layers.keys()],fileCount:all.length,counts:Object.fromEntries([...new Set(features.map(layerKey))].map(key=>[key,features.filter(f=>layerKey(f)===key).length]))};
}
export function mergeCartoImport(project,inspection,rasters){
 const p=structuredClone(project),sourceLayers=new Set(inspection.sourceLayers);let replaced=0;
 const existing=new Set(p.features.filter(f=>f.carto).map(f=>f.carto.dataset));if(existing.size&&!existing.has(inspection.dataset))throw Error('地图范围或坐标系与现有 Carto 不同，请新建工程导入，避免错位覆盖规划');
 if(p.features.some(f=>originForFeature(f)==='planning')){const planned=createPlanningProject(p).project.features;p.features=[...p.features.filter(f=>originForFeature(f)==='carto'),...planned];}
 p.features=p.features.filter(f=>{const replace=f.carto?.dataset===inspection.dataset&&f.carto.layers.some(l=>sourceLayers.has(l));if(replace)replaced++;return !replace;});
 p.features.push(...structuredClone(inspection.features));
 for(const r of rasters){p.rasters=p.rasters.filter(x=>x.id!==r.id);p.rasters.push(r);}
 const next=prepareEditor(p);next.settings.editor.origins.carto=true;for(const f of inspection.features){if(f.kind==='note'){next.settings.notesVisible=true;continue;}const key=layerKey(f),group=groupForLayer(key);if(group!=='zoning')next.settings.editor.groups[group]=true;if(key!=='building:municipal')next.settings.editor.layers[key].visible=key!=='district:tile';}
 if(rasters.length){next.settings.editor.groups.terrain=true;if(rasters.some(r=>r.id==='depth'))next.settings.editor.layers['terrain:landwater'].visible=true;}
 return {project:next,replaced};
}
