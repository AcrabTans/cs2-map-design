import {SIZE,CARTO_FIELDS,prepareEditor,area,length,pointInPolygon,classInfo,blockClass,buildingCategory} from './model.js';
import {createZip} from './archive.js';
export const CARTO_EXPORT_LAYERS=[['Area_Boundary',5,'area'],['Network_Centerline',3,'network'],['Network_Boundary',5,'network'],['Building_Boundary',5,'building'],['POI_Location',1,'poi'],['Route_Centerline',3,'route'],['Zoning_Boundary',5,'zoning']];
const cartoPrj='PROJCS["WGS_1984_UTM_Zone_31N",GEOGCS["GCS_WGS_1984",DATUM["D_WGS_1984",SPHEROID["WGS_1984",6378137.0,298.257223563]],PRIMEM["Greenwich",0.0],UNIT["Degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["False_Easting",500000.0],PARAMETER["False_Northing",0.0],PARAMETER["Central_Meridian",3.0],PARAMETER["Scale_Factor",0.9996],PARAMETER["Latitude_Of_Origin",0.0],UNIT["Meter",1.0]]';
const cartoExportEncoder=new TextEncoder();
const sameCartoPoint=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-7;
function signedRingArea(ps){let sum=0;for(let i=0;i<ps.length;i++){const a=ps[i],b=ps[(i+1)%ps.length];sum+=a[0]*b[1]-b[0]*a[1];}return sum/2;}
export function shapefileRings(parts){
 const rings=parts.map(ps=>{let ring=ps.filter((p,i)=>!i||!sameCartoPoint(p,ps[i-1]));if(ring.length>1&&sameCartoPoint(ring[0],ring.at(-1)))ring=ring.slice(0,-1);return ring;}).filter(ps=>ps.length>=3&&Math.abs(signedRingArea(ps))>1e-6);
 return rings.map((ring,i)=>{const depth=rings.filter((other,j)=>j!==i&&pointInPolygon(ring[0],other)).length,clockwise=depth%2===0;let ps=(signedRingArea(ring)<0)===clockwise?ring.slice():ring.slice().reverse();ps.push([...ps[0]]);return ps;});
}
export function roadFootprint(points,width){
 let ps=points.filter((p,i)=>!i||!sameCartoPoint(p,points[i-1]));if(ps.length<2)return [];
 const closed=ps.length>3&&sameCartoPoint(ps[0],ps.at(-1));if(closed)ps=ps.slice(0,-1);
 const count=ps.length,half=width/2,normals=[];
 for(let i=0;i<(closed?count:count-1);i++){const a=ps[i],b=ps[(i+1)%count],d=Math.hypot(b[0]-a[0],b[1]-a[1]);normals.push([-(b[1]-a[1])/d,(b[0]-a[0])/d]);}
 function side(sign){const out=[];for(let i=0;i<count;i++){const p=ps[i],a=normals[(i-1+normals.length)%normals.length],b=normals[i%normals.length];if(!closed&&(i===0||i===count-1)){const n=i===0?b:a;out.push([p[0]+n[0]*half*sign,p[1]+n[1]*half*sign]);continue;}const dot=a[0]*b[0]+a[1]*b[1],den=1+dot,m=den>1e-5?[(a[0]+b[0])/den,(a[1]+b[1])/den]:null;if(m&&Math.hypot(...m)<=2.5)out.push([p[0]+m[0]*half*sign,p[1]+m[1]*half*sign]);else out.push([p[0]+a[0]*half*sign,p[1]+a[1]*half*sign],[p[0]+b[0]*half*sign,p[1]+b[1]*half*sign]);}return out;}
 const left=side(1),right=side(-1);return closed?[left,right]:[[...left,...right.reverse()]];
}
const plannerFields=[['P_Ver','number'],['P_Id','text'],['P_Kind','text'],['P_Type','text'],['P_Level','text'],['P_Parent','text'],['P_Dist','text'],['P_Color','text'],['P_Struct','text'],['P_Stack','number']];
function planAttributes(f){return {P_Ver:1,P_Id:f.id,P_Kind:f.kind,P_Type:f.type||'',P_Level:f.level||'',P_Parent:f.parentId||'',P_Dist:f.districtId||'',P_Color:f.color||'',P_Struct:f.structure||'',P_Stack:f.kind==='road'?(f.stackLevel??null):null};}
const networkCategories={rail:'Train',metro:'Subway',waterway:'Waterway',highway:'Highway',arterial:'Large',secondary:'Medium',local:'Small',path:'Pathway'};
const buildingCategories={education:'Education',residential:'Residential',hospital:'Health',police:'Police',fire:'Fire',municipal:'Utility',industry:'Industrial',commercial:'Commercial',sports:'Sports',landscape:'Decoration',other:'Other'};
function zoningAttributes(f){const kind=blockClass(f);return {Object:'Zone',Zoning:kind==='residential'?'Residential':kind==='commercial'?'Commercial':kind==='office'?'Office':kind==='industrial'?'Industrial':kind==='mixed'?'Residential Commercial':'None',Density:/^high/.test(f.type)?'High':/^mid/.test(f.type)?'Medium':'Low'};}
export function cartoExportRecords(project){
 const p=prepareEditor(project),frame=p.rasters.find(r=>r.metadata.bounds)?.metadata.bounds||p.features.find(f=>f.carto?.frame)?.carto.frame||[158853.44317933184,-7168,173189.44317933184,7168];
 if(p.rasters.some(r=>r.metadata.crs&&r.metadata.crs!=='EPSG:32631'))throw Error('当前导出支持 Carto 的 EPSG:32631 坐标系');
 const world=pt=>[frame[0]+pt[0],frame[3]-pt[1]],records=Object.fromEntries(CARTO_EXPORT_LAYERS.map(([name])=>[name,[]])),warnings=[];
 function add(layer,f,parts,defaults={}){if(!parts.length)return;const polygons=['Area_Boundary','Network_Boundary','Building_Boundary','Zoning_Boundary'].includes(layer);const mapped=parts.map(ps=>ps.map(world)),geometry=polygons?shapefileRings(mapped):mapped;if(!geometry.length){warnings.push('跳过退化几何：'+f.name);return;}
  const attrs={...defaults,...f.attributes,Name:f.name,...planAttributes(f)};
  if(layer.startsWith('Network_'))Object.assign(attrs,{Length:length(f.points),Width:f.width,Form:({ground:'Normal',bridge:'Elevated',elevated:'Elevated',tunnel:'Tunnel'})[f.structure]});
  if(layer==='Area_Boundary')attrs.Area=area(f.points);if(layer==='Route_Centerline')Object.assign(attrs,{Length:length(f.points),Color:f.color||p.settings.editor.layers['route:'+f.type]?.color||defaults.Color});
  if(layer==='Zoning_Boundary')attrs.Color=f.color||classInfo(f)[2];records[layer].push({parts:geometry,attributes:attrs});
 }
 for(const f of p.features){
  if(f.kind==='district'||f.kind==='interchange')add('Area_Boundary',f,[f.points,...(f.additionalParts||[])],{Object:f.level==='tile'?'MapTile':'District',Unlocked:1});
  else if(f.kind==='zone')add('Zoning_Boundary',f,[f.points,...(f.additionalParts||[])],zoningAttributes(f));
  else if(f.kind==='route'||f.kind==='road'&&f.type==='bus')add('Route_Centerline',f,[f.points],{Object:'Route',Transport:({bus:'Bus',metro:'Subway',train:'Train',water:'Ship',air:'Airplane'})[f.type]||'Other',Color:f.color||'#2e98c0'});
  else if(f.kind==='road'){
   const defaults={Category:networkCategories[f.type],Object:['rail','metro'].includes(f.type)?'Track':f.type==='waterway'?'Waterway':'Road',Direction:'Both'};
   if(f.geometryType!=='polygon')add('Network_Centerline',f,[f.points],defaults);
   const parts=f.geometryType==='polygon'?[f.points,...(f.additionalParts||[])]:f.outlineParts&&!f.outlineDetached?f.outlineParts:roadFootprint(f.points,f.width);add('Network_Boundary',f,parts,defaults);
  }else if(f.kind==='building'){
   const defaults={Category:buildingCategories[buildingCategory(f.type)]||'Other',Object:'Building'};
   if(f.geometryType!=='point')add('Building_Boundary',f,[f.points,...(f.additionalParts||[])],defaults);
   if(f.poi||f.geometryType==='point')add('POI_Location',{...f,attributes:f.poiAttributes||f.attributes},[[f.poi||f.points[0]]],defaults);
  }else if(f.kind==='note')add('POI_Location',f,[[f.points[0]]],{Category:'Landmark',Object:'POI'});
 }
 return {records,frame,warnings};
}
export function writeShapefile(records,type){
 const contents=records.map(r=>{
  if(type===1){const b=new Uint8Array(20),v=new DataView(b.buffer);v.setInt32(0,type,true);v.setFloat64(4,r.parts[0][0][0],true);v.setFloat64(12,r.parts[0][0][1],true);return b;}
  const points=r.parts.flat(),b=new Uint8Array(44+r.parts.length*4+points.length*16),v=new DataView(b.buffer);v.setInt32(0,type,true);writeBounds(v,4,points);v.setInt32(36,r.parts.length,true);v.setInt32(40,points.length,true);let n=0;r.parts.forEach((ps,i)=>{v.setInt32(44+i*4,n,true);n+=ps.length;});points.forEach((p,i)=>{v.setFloat64(44+r.parts.length*4+i*16,p[0],true);v.setFloat64(52+r.parts.length*4+i*16,p[1],true);});return b;
 });
 const shp=new Uint8Array(100+contents.reduce((n,b)=>n+8+b.length,0)),shx=new Uint8Array(100+records.length*8),all=records.flatMap(r=>r.parts.flat());
 for(const bytes of [shp,shx]){const v=new DataView(bytes.buffer);v.setInt32(0,9994);v.setInt32(24,bytes.length/2);v.setInt32(28,1000,true);v.setInt32(32,type,true);writeBounds(v,36,all);}
 let at=100;contents.forEach((bytes,i)=>{const v=new DataView(shp.buffer);v.setInt32(at,i+1);v.setInt32(at+4,bytes.length/2);shp.set(bytes,at+8);const index=new DataView(shx.buffer);index.setInt32(100+i*8,at/2);index.setInt32(104+i*8,bytes.length/2);at+=8+bytes.length;});return {shp,shx};
}
function writeBounds(v,offset,points){let xmin=Infinity,ymin=Infinity,xmax=-Infinity,ymax=-Infinity;for(const [x,y]of points){xmin=Math.min(xmin,x);ymin=Math.min(ymin,y);xmax=Math.max(xmax,x);ymax=Math.max(ymax,y);}const b=points.length?[xmin,ymin,xmax,ymax]:[0,0,0,0];b.forEach((n,i)=>v.setFloat64(offset+i*8,n,true));}
function bytePrefix(text,limit){let out='',n=0;for(const c of text){const size=cartoExportEncoder.encode(c).length;if(n+size>limit)break;out+=c;n+=size;}return cartoExportEncoder.encode(out);}
export function writeCartoDbf(records,schema,warnings=[]){
 const types=new Map(schema.map(([name,,kind])=>[name,kind]));for(const [name,kind]of plannerFields)types.set(name,kind);
 for(const row of records)for(const [name,value]of Object.entries(row.attributes))if(!types.has(name))types.set(name,typeof value==='number'?'number':'text');
 const used=new Set(),fieldMap={},fields=[];
 for(const [name,kind]of types){let field=name.replace(/[^A-Za-z0-9_]/g,'_').slice(0,10)||'Field',i=0;while(used.has(field.toLowerCase()))field=(name.slice(0,7)+'_'+(++i)).slice(0,10);used.add(field.toLowerCase());if(field!==name)fieldMap[field]=name;
  const numeric=kind==='number',width=numeric?24:Math.max(1,Math.min(254,Math.max(0,...records.map(r=>cartoExportEncoder.encode(String(r.attributes[name]??'')).length))));fields.push({name,field,type:numeric?'N':'C',width,decimals:numeric?6:0});
 }
 const header=33+fields.length*32,rowSize=1+fields.reduce((n,f)=>n+f.width,0);if(header>65535||rowSize>65535)throw Error('Shapefile 属性字段过多');const b=new Uint8Array(header+records.length*rowSize+1),v=new DataView(b.buffer);b.fill(32);b[0]=3;const now=new Date();b[1]=now.getFullYear()-1900;b[2]=now.getMonth()+1;b[3]=now.getDate();v.setUint32(4,records.length,true);v.setUint16(8,header,true);v.setUint16(10,rowSize,true);b.fill(0,12,32);b[29]=0;
 fields.forEach((f,i)=>{const at=32+i*32;b.fill(0,at,at+32);b.set(cartoExportEncoder.encode(f.field),at);b[at+11]=f.type.charCodeAt(0);b[at+16]=f.width;b[at+17]=f.decimals;});b[header-1]=13;
 const truncated=new Set();records.forEach((r,i)=>{let at=header+i*rowSize;b[at++]=32;for(const f of fields){const value=r.attributes[f.name];if(value!==undefined&&value!==null){let text=f.type==='N'?Number(value).toFixed(f.decimals):String(value);if(f.type==='N'&&(!Number.isFinite(Number(value))||text.length>f.width))throw Error('数值超出 Shapefile 字段范围：'+f.name);const data=bytePrefix(text,f.width);if(data.length<cartoExportEncoder.encode(text).length)truncated.add(f.name);b.set(data,at+(f.type==='N'?f.width-data.length:0));}at+=f.width;}});b[b.length-1]=26;
 if(truncated.size)warnings.push('DBF 文字限长，已截短字段：'+[...truncated].join('、')+'；完整文字保留在工程文件中');return {dbf:b,fieldMap};
}
export function exportCarto(project,{terrainFiles=new Map(),includeTerrain=false}={}){
 const {records,frame,warnings}=cartoExportRecords(project),files=[],counts={},fieldMaps={};
 for(const [name,type,kind]of CARTO_EXPORT_LAYERS){const rows=records[name],schema=kind==='poi'?[['Name','名称','text'],['Addr_dist','区','text'],['Addr_strt','街道','text'],['Addr_nmbr','门牌','number'],['Category','分类','text'],['Object','对象','text']]:CARTO_FIELDS[kind],shape=writeShapefile(rows,type),{dbf,fieldMap}=writeCartoDbf(rows,schema,warnings);counts[name]=rows.length;fieldMaps[name]=fieldMap;
  for(const [ext,data]of Object.entries({...shape,dbf,prj:cartoPrj,cpg:'UTF-8'}))files.push({name:'Shapefile/'+name+'.'+ext,data});
 }
 if(includeTerrain)for(const [id,data]of terrainFiles)files.push({name:'GeoTIFF/'+(id==='depth'?'Depth':'Elevation')+'.tif',data});
 files.push({name:'MapInfo.json',data:JSON.stringify({format:'cs2-carto-export',version:1,mapSize:SIZE,crs:'EPSG:32631',frame},null,2)});
 files.push({name:'README.txt',data:'Carto Shapefile export / EPSG:32631\n7 个图层及配套 SHX / DBF / PRJ / CPG。空图层保留空文件。\nP_ 开头字段保留规划类别和关联信息。没有游戏轮廓的新道路按路宽生成轮廓，不代表游戏资产的最终路口形状。\n'+warnings.join('\n')});
 if(Object.values(fieldMaps).some(m=>Object.keys(m).length))files.push({name:'field-map.json',data:JSON.stringify(fieldMaps,null,2)});
 return {bytes:createZip(files),files,counts,warnings,frame};
}
