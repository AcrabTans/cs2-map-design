import {compressZipEntry,createZip} from './archive.js';
import {geometryParts,isPolygonFeature,layerKey,originForFeature} from './model.js';
import {projectMapFrame} from './planning.js';
import {readTerrainTiff,estimateSeaLevel} from './terrain.js';

const terrainExportSources=[['elevation','terrain/Elevation.tif'],['depth','terrain/Depth.tif']];
const terrainGridSize=64;
const mapDataGuide=`# 地图数据包 / Map data package

- 先读 map.json。这里有坐标系、对象数量、图层索引及地形文件状态。
- layers/*.json 按编辑器图层保存当前工程中的全部对象，含隐藏对象。每个文件是一个对象数组。geometry.parts 包含 [x,y] 节点序列。polygon 按奇偶规则填充全部闭合环。道路的 outlineParts 是可选的路面边界。
- x 从西向东，y 从北向南，单位为米。原点是可玩区西北角。若 map.json 有投影图幅，投影坐标为 west+x、north-y。
- terrain-grid.csv 在有原始地形数据时提供完整可玩区的 64×64 网格。row、column 从 0 开始，x_m、y_m 是格子中心。各格高程为有效像元的最小、平均、最大值。water_fraction 是水深大于 0 的像元比例，平均水深仅统计水域像元。空字段表示无数据。
- terrain/*.tif 保存原始高程和水深，适合精细地形分析。只有图像预览时，地形图层仍会出现在索引里，相应数值字段留空。
- 原始高程及 CSV 的 elevation_*_m 以游戏坐标原点为基准。map.json 的 verticalReference.seaLevelEstimateM 是从边缘水域推算的海平面原始高程（无法推算时为 null）。相对海平面的高程 = 原始高程 - 海平面原始高程。
- 对象坐标为二维。Carto 的 attributes.Elevation 如有保存，是对象属性，无法直接得到路径各点的高程或道路坡度。
`;

export function readExportTerrain(bytes){
 const {buffer,byteOffset,byteLength}=bytes;
 return readTerrainTiff(byteOffset===0&&byteLength===buffer.byteLength?buffer:buffer.slice(byteOffset,byteOffset+byteLength));
}

function terrainGridStats(raster,water){
 const {width,height,values}=raster;
 const size=terrainGridSize;
 const cells=Array.from({length:size*size},()=>({count:0,total:0,sum:0,min:Infinity,max:-Infinity}));
 const columns=Uint8Array.from({length:width},(_,x)=>Math.floor((x+.5)*size/width));
 for(let y=0;y<height;y++){
  const row=Math.floor((y+.5)*size/height)*size;
  for(let x=0;x<width;x++){
   const cell=cells[row+columns[x]],value=values[y*width+x];
   cell.total++;
   if(!Number.isFinite(value)||(water&&value<=0))continue;
   cell.count++;
   cell.sum+=value;
   cell.min=Math.min(cell.min,value);
   cell.max=Math.max(cell.max,value);
  }
 }
 return cells;
}

function terrainGridCsv(mapSize,elevation,depth){
 const rows=['row,column,x_m,y_m,elevation_min_m,elevation_mean_m,elevation_max_m,water_fraction,water_depth_mean_m'];
 const size=terrainGridSize,step=mapSize/size,rounded=n=>Number(n.toFixed(4));
 for(let row=0;row<size;row++)for(let col=0;col<size;col++){
  const i=row*size+col,land=elevation?.[i],water=depth?.[i];
  rows.push([row,col,rounded((col+.5)*step),rounded((row+.5)*step),
   land?.count?rounded(land.min):'',land?.count?rounded(land.sum/land.count):'',land?.count?rounded(land.max):'',
   water?.total?rounded(water.count/water.total):'',water?.count?rounded(water.sum/water.count):''].join(','));
 }
 return rows.join('\n')+'\n';
}

export async function packMapData(project,rawTerrain){
 const entries=[{name:'README.md',data:mapDataGuide}],layers=new Map(),terrain={},stats={},numeric={};
 for(const feature of project.features){
  const key=layerKey(feature);
  if(!layers.has(key))layers.set(key,[]);
  const {points,additionalParts,geometryType,...properties}=feature;
  const type=isPolygonFeature(feature)?'polygon':['road','route'].includes(feature.kind)?'line':'point';
  layers.get(key).push({...properties,origin:originForFeature(feature),geometry:{type,parts:geometryParts(feature)}});
 }
 const layerIndex=[...layers].sort(([a],[b])=>a.localeCompare(b)).map(([key,objects],i)=>{
  const file='layers/'+String(i+1).padStart(2,'0')+'-'+key.replace(/[^a-z0-9-]+/gi,'-')+'.json';
  entries.push({name:file,data:'[\n'+objects.map(object=>JSON.stringify(object)).join(',\n')+'\n]\n'});
  return {key,file,count:objects.length};
 });
 for(const [id,file] of terrainExportSources){
  const bytes=rawTerrain.get(id),preview=project.rasters.find(r=>r.id===id);
  if(!bytes){
   terrain[id]={status:preview?'preview-only':'missing'};
   continue;
  }
  const raster=readExportTerrain(bytes);
  numeric[id]=raster;
  stats[id]=terrainGridStats(raster,id==='depth');
  terrain[id]={status:'original',file,unit:'m',...raster.metadata};
  entries.push({name:file,data:bytes});
 }
 const grid=stats.elevation||stats.depth?
  {file:'terrain-grid.csv',rows:terrainGridSize,columns:terrainGridSize,cellSizeM:project.mapSize/terrainGridSize}:null;
 if(grid)entries.push({name:grid.file,data:terrainGridCsv(project.mapSize,stats.elevation,stats.depth)});
 entries.unshift({name:'map.json',data:JSON.stringify({
  format:'cs2-map-data',version:1,title:project.title,notes:project.notes,
  coordinates:{unit:'m',origin:'northwest',x:'east',y:'south',width:project.mapSize,height:project.mapSize,
   projectedFrame:projectMapFrame(project),projectedBoundsOrder:['west','south','east','north']},
  verticalReference:{datum:'game-origin',unit:'m',seaLevelEstimateM:estimateSeaLevel(numeric.elevation,numeric.depth)},
  objectCount:project.features.length,layers:layerIndex,terrain,terrainGrid:grid
 },null,2)});
 for(const entry of entries)await compressZipEntry(entry);
 return {bytes:createZip(entries),hasTerrain:!!grid};
}
