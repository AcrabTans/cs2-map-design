import {buildingPacksFor,includePlacedAsset} from './building-assets.js';
import {prepareEditor,originForFeature,layerKey,groupForLayer,geometryParts,pointInPolygon,nearestSegment,segmentIntervals,area,distance,interiorPoint,blockClass,buildingCategory} from './model.js';

const planningLinks=['parentId','districtId','interchangeId'];
export function projectMapFrame(project){
 const raster=project.rasters.find(r=>r.metadata?.bounds),source=project.features.find(f=>f.carto?.frame);
 return raster?{bounds:raster.metadata.bounds,crs:raster.metadata.crs}:source?{bounds:source.carto.frame,crs:source.carto.crs}:null;
}
export function checkPlanningFrame(project,frame){
 const current=projectMapFrame(project);if(!current||!frame)return false;
 if(current.crs!==frame.crs||current.bounds.length!==4||frame.bounds.length!==4||current.bounds.some((v,i)=>Math.abs(v-frame.bounds[i])>.1))throw Error('规划与当前工程的地图范围或坐标系不同，不能直接叠加');
 return true;
}
function planningCopies(project,ids,{preserve=false}={}){
 const source=new Map(project.features.map(f=>[f.id,f])),copies=new Map(),mapping=new Map();
 function copy(id){
  if(mapping.has(id))return mapping.get(id);const original=source.get(id);if(!original)return null;
  const keep=preserve&&originForFeature(original)==='planning';
  const newId=keep?id:preserve?'plan-parent:'+id:crypto.randomUUID();mapping.set(id,newId);
  const f=structuredClone(original);f.id=newId;delete f.carto;if(!keep)f.source='manual';
  if(!keep){f.planningOrigin={featureId:id,dataset:original.carto?.dataset||null};f.planningStatus='planned';}
  copies.set(id,f);
  for(const key of planningLinks)if(f[key]){const target=source.get(f[key]);if(target&&(preserve||originForFeature(target)==='carto')){const ref=copy(f[key]);if(ref)f[key]=ref;}else if(!target)delete f[key];}
  return newId;
 }
 for(const id of ids)copy(id);
 return {features:[...copies.values()],mapping};
}
export function copyAsPlanning(project,id){
 if(!project.features.some(f=>f.id===id))throw Error('没有找到所选对象');
 const {features,mapping}=planningCopies(project,[id]),next=structuredClone(project);next.features.push(...features);next.settings.editor.origins.planning=true;const key=layerKey(features.find(f=>f.id===mapping.get(id)));next.settings.editor.groups[groupForLayer(key)]=true;if(next.settings.editor.layers[key])next.settings.editor.layers[key].visible=true;
 return {project:prepareEditor(next),selectedId:mapping.get(id),count:features.length};
}
export function createPlanningProject(project){
 const ids=project.features.filter(f=>originForFeature(f)==='planning').map(f=>f.id);
 if(!ids.length)throw Error('当前工程没有手绘规划对象');
 const {features}=planningCopies(project,ids,{preserve:true}),next={...project,settings:structuredClone(project.settings)},used=new Set(features.map(f=>f.assetPlacement?.packId).filter(Boolean));
 next.features=features;next.assetPacks=next.assetPacks.filter(p=>used.has(p.id));next.basemaps=[];next.rasters=[];next.settings.base='none';delete next.proposal;
 next.title=project.title+' · 手绘规划';next.settings.editor.origins={carto:true,planning:true};
 return {project:prepareEditor(next),frame:projectMapFrame(project)};
}
export function mergePlanningProject(project,incoming,{frame=null}={}){
 checkPlanningFrame(project,frame);
 const planned=createPlanningProject(incoming).project,next=structuredClone(project),packs=new Map(next.assetPacks.map(p=>[p.id,p]));
 for(const p of planned.assetPacks){const old=packs.get(p.id);if(old&&JSON.stringify(old.assets)!==JSON.stringify(p.assets))throw Error('同编号资产包内容不同：'+p.name);packs.set(p.id,old||p);}
 next.assetPacks=[...packs.values()];const features=new Map(next.features.map(f=>[f.id,f]));let replaced=0;
 for(const f of planned.features){const old=features.get(f.id);if(old&&originForFeature(old)==='carto')throw Error('规划编号与游戏现状冲突，请先复制为规划对象');if(old)replaced++;features.set(f.id,f);}
 next.features=[...features.values()];next.settings.editor.origins.planning=true;
 return {project:prepareEditor(next),count:planned.features.length,replaced};
}


function pointInDistrictRings(point,rings){
 let inside=false;
 for(const ring of rings){
  if(pointInPolygon(point,ring))inside=!inside;
  if(nearestSegment(ring,point,true).distance<1e-5)return true;
 }
 return inside;
}

function polygonPartArea(rings){
 return rings.reduce((total,ring,index)=>{
  const depth=rings.filter((outer,i)=>i!==index&&pointInPolygon(ring[0],outer)).length;
  return total+(depth%2?-1:1)*area(ring);
 },0);
}

export function pickDistrict(districts,point,tolerance){
 const candidates=[];
 for(const district of districts){
  const rings=geometryParts(district);
  if(pointInDistrictRings(point,rings)){
   candidates.push({district,distance:0,area:polygonPartArea(rings)});
   continue;
  }
  const edgeDistance=Math.min(...rings.map(ring=>nearestSegment(ring,point,true).distance));
  if(edgeDistance<=tolerance)candidates.push({district,distance:edgeDistance,area:polygonPartArea(rings)});
 }
 const priority=d=>d.level==='small'?0:d.level==='tile'?2:1;
 candidates.sort((a,b)=>priority(a.district)-priority(b.district)||a.distance-b.distance||a.area-b.area);
 return candidates[0]?.district;
}

export function districtPlanningStats(project,district){
 const rings=geometryParts(district),districtIds=new Set([district.id]);
 for(const f of project.features)if(f.kind==='district'&&f.parentId===district.id)districtIds.add(f.id);
 const roads=new Map(),zones=new Map(),buildings=new Map();
 const add=(table,key,value)=>table.set(key,(table.get(key)||0)+value);
 const allPoints=rings.flat();
 const bounds=allPoints.reduce(([x0,y0,x1,y1],[x,y])=>[Math.min(x0,x),Math.min(y0,y),Math.max(x1,x),Math.max(y1,y)],[Infinity,Infinity,-Infinity,-Infinity]);
 const [x0,y0,x1,y1]=bounds;
 for(const f of project.features){
  if(originForFeature(f)!=='planning')continue;
  if(f.kind==='road'&&f.geometryType!=='polygon'&&f.type!=='bus'){
   let meters=0;
   for(const points of geometryParts(f))for(let i=1;i<points.length;i++){
    const a=points[i-1],b=points[i];
    if(Math.max(a[0],b[0])<x0||Math.min(a[0],b[0])>x1||Math.max(a[1],b[1])<y0||Math.min(a[1],b[1])>y1)continue;
    const fraction=segmentIntervals(a,b,rings).reduce((total,interval)=>total+(pointInDistrictRings(interval.point,rings)?interval.fraction:0),0);
    meters+=fraction*distance(a,b);
   }
   if(meters)add(roads,f.type,meters);
  }else if(f.kind==='zone'||f.kind==='building'){
   const point=f.poi||(f.geometryType==='point'?f.points[0]:interiorPoint(f.points));
   const belongs=f.districtId?districtIds.has(f.districtId):pointInDistrictRings(point,rings);
   if(!belongs)continue;
   if(f.kind==='zone')add(zones,blockClass(f),polygonPartArea(geometryParts(f)));
   else add(buildings,buildingCategory(f.type),1);
  }
 }
 return {area:polygonPartArea(rings),roads,zones,buildings};
}

export const planningWorkspaceStages={
 theme:'主题设定',district:'功能分区规划',corridors:'高速与主干路网走向',volume:'片区体量设定',
 roads:'主干道与高速规划',local:'区域规划'
};

export function planningStageOf(feature){
 const stage=feature.attributes?.PlanStage;
 return Object.hasOwn(planningWorkspaceStages,stage)?stage:'local';
}

export function planningWorkspaceAdditions(project,referenceIds){
 return project.features.filter(feature=>!referenceIds.has(feature.id));
}

export function mergePlanningWorkspace(project,working,{referenceIds,id,frame}){
 checkPlanningFrame(project,frame);
 const features=new Map(project.features.map(feature=>[feature.id,feature]));
 const additions=planningWorkspaceAdditions(working,referenceIds);
 if(!additions.length)throw Error('工作区还没有可合并的规划对象。');
 const available=new Set([...features.keys(),...additions.map(feature=>feature.id)]);
 const packs=new Map(buildingPacksFor(working).map(pack=>[pack.id,pack]));
 const currentPacks=new Map(buildingPacksFor(project,{includePresets:false}).map(pack=>[pack.id,pack]));
 let next=project,replaced=0;
 for(const object of additions){
  const old=features.get(object.id);
  if(old&&old.attributes?.PlanWorkspace!==id)throw Error('规划对象编号与当前工程冲突，请另选工程。');
  const feature={...structuredClone(object),source:'manual',attributes:{...object.attributes,PlanWorkspace:id,PlanStage:planningStageOf(object)}};
  for(const key of planningLinks)if(feature[key]&&!available.has(feature[key]))delete feature[key];
  const placement=feature.assetPlacement;
  if(placement){
   const pack=packs.get(placement.packId),asset=pack?.assets.find(item=>item.id===placement.assetId);
   const current=currentPacks.get(placement.packId)?.assets.find(item=>item.id===placement.assetId);
   if(!asset||current&&JSON.stringify(current)!==JSON.stringify(asset))throw Error('工程中存在不同定义的建筑资产：'+feature.name);
   next=includePlacedAsset(next,pack,asset);
  }
  if(old)replaced++;
  features.set(feature.id,feature);
 }
 const settings=structuredClone(project.settings);
 settings.editor.origins.planning=true;
 for(const feature of additions){
  const key=layerKey(feature);
  if(!settings.editor.layers[key])continue;
  settings.editor.layers[key].visible=true;
  settings.editor.groups[groupForLayer(key)]=true;
 }
 return {project:prepareEditor({...next,settings,features:[...features.values()]}),count:additions.length,replaced};
}
