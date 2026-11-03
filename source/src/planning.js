import {prepareEditor,originForFeature,layerKey,groupForLayer} from './model.js';

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
 for(const p of planned.assetPacks){const old=packs.get(p.id);if(old&&JSON.stringify(old.assets)!==JSON.stringify(p.assets))throw Error('同编号资产包内容不同：'+p.name);packs.set(p.id,old?{...old,lods:{...old.lods,...p.lods}}:p);}
 next.assetPacks=[...packs.values()];const features=new Map(next.features.map(f=>[f.id,f]));let replaced=0;
 for(const f of planned.features){const old=features.get(f.id);if(old&&originForFeature(old)==='carto')throw Error('规划编号与游戏现状冲突，请先复制为规划对象');if(old)replaced++;features.set(f.id,f);}
 next.features=[...features.values()];next.settings.editor.origins.planning=true;
 return {project:prepareEditor(next),count:planned.features.length,replaced};
}
