import {bindAssetExtractor} from './asset-extractor-panel.js';
import {bindMapThreeView} from './view-3d.js';
import './tauri-bridge.js';
import {NAME_STYLES,NAME_TYPES,nameCandidates,drawNames} from './name-generator.js';
import {installDesktopPickers,desktopFile,lightHistorySnapshot,restoreHistorySnapshot,featureHistorySnapshot,restoreFeatureHistory} from './desktop-runtime.js';
installDesktopPickers({
 exportPngBtn:openPngExport,
 manageLayers:openLayerManager,
 manageBasemaps:openBasemapManager,
 importPlanning:importPlanningLayer,
 exportPlanning:exportPlanningLayer,
 openBuiltinAssets:()=>openAssetPackage('blob'),
 manageAssetPacks:openAssetManager,
 aboutApp:openAboutDialog
});
import {readProjectFolder,directoryProjectEntries,folderFileHandle,saveFolderLibraries} from './project-folder.js';
import {removeProjectAssetPacks,buildingPacksFor,addPresetBuildingPacks,includePlacedAsset,catalogPage,readAssetSelection,paradoxModId,buildingAngle,transformBuildingRing,buildingAssetLot,buildingAssetFits,makeBuildingAssetFeature,rotateBuildingAsset,moveBuildingAsset} from './building-assets.js';
import {packCartoRecords,cartoExportRecords,CARTO_EXPORT_LAYERS} from './carto-export.js';
import {packProject,packTauriProject,unpackProject,ProjectFileWriter,chooseProjectSaveTarget,fromBase64} from './project-file.js';
import {createEditScheduler,createSnapIndex,createRoadSegmentIndex,createCrossingCache} from './edit-performance.js';
import {networkDisplay,mapScrollAxis,createViewportScheduler,createZoomAnimator,wheelZoomFactor} from './network-display.js';
import {roadStackLevel,isStreetRoad,buildNetworkCrossings,junctionSectors,roadFlatEnds,crossingRelation} from './network-crossings.js';
import {SIZE,ROADS,ZONES,MUNICIPAL_TYPES,municipalClass,municipalVisible,defaultLayerColor,featureDisplayColor,roadStyleColors,zoneInfo,roadInfo,distance,length,area,nearestGeometryEdge,geometryParts,insertGeometryNodes,initialProject,validateProject,isPolygonFeature,interiorPoint,GROUPS,BLOCK_CLASSES,BUILDINGS,blockClass,classInfo,featureSource,layerKey,visibleInEditor,labelsVisibleInEditor,originForFeature,lockedInEditor,prepareEditor,correctionCopy,validateInterchangeBounds,containedGeometry,buildingCategory,groupForLayer,layerKeysForGroup,CARTO_FIELDS,fieldsForLayer} from './model.js';
import {terrainType,readTerrainTiff,terrainPixels,checkTerrainExtent,correctTerrainSource,terrainFingerprint} from './terrain.js';
import {inspectCartoFolder,mergeCartoImport} from './carto.js';
import {projectMapFrame,checkPlanningFrame,copyAsPlanning,createPlanningProject,mergePlanningProject,pickDistrict,districtPlanningStats,planningWorkspaceStages,planningStageOf,planningWorkspaceAdditions,mergePlanningWorkspace} from './planning.js';
import {generateMasterPlan,masterPlanProfiles,generateScenicPlan,scenicThemes} from './master-plan.js';
import {generateLocalPlan,suggestLocalUses,localConnectionDefaults,maxManualLocalConnections} from './local-plan.js';
import {projectBackup} from './file-store.js';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg',KEY='island-planner-v1';
let project=initialProject(),history=[],future=[],selected=null,selectedNode=null,tool='select',roadType='arterial',zoneType='mid-res',draft=[],hover=null,snapPoint=null,space=false,drag=null,suppressClick=false,toastTimer,saveTimer;
const expandedGroups=new Set(),closedAssetGroups=new Set(['dlc','official','third-party']);
let municipalExpanded=false,activeMunicipalClass=null,snapIndex=null,assetSnapIndex=null,roadSegmentIndex=null;
let roadSnap=null;
const draftRoadConnections=new WeakMap();
const renderCrossingCache=createCrossingCache(buildNetworkCrossings);
function invalidateEditGeometry(){snapIndex=null;assetSnapIndex=null;roadSegmentIndex=null;renderCrossingCache.invalidate();}
let networkJunctions=[],networkMaskBounds={x:0,y:0,width:SIZE,height:SIZE};
let assetCatalogQuery='',assetCatalogCategory='all',assetCatalogIndex=0;
const assetCount=new Intl.NumberFormat('zh-CN');
let assetPanelMode='properties',assetPackId=null,assetSelection=null,assetHover=null,assetRepeat=true;
let activeLayer={key:'road:arterial',source:'manual'},districtLevel='large',buildingType='education',buildingLevel='基层',buildingGeometry='polygon',zoneClass='residential',scopeId='',listQuery='',exporting=false;
let view={cx:SIZE/2,cy:SIZE/2,scale:1},fitScale=1;
let browserHasProject=false,userChanged=false,localSaved=true,editRevision=0,projectDirty=false,projectSaving=false,currentFileName=typeof SEED_FILE_NAME==='undefined'?'未命名工程.cs2map':SEED_FILE_NAME;
let projectFolderContext=null,masterPlanSession=null,inspectorMode='properties',planningRequest=0;
const planningSessions=new Map();
let planningWorkspace=null,basePlanningState=null;
const desktopDraftKey=KEY+'-desktop-draft';
let desktopDraftTimer=null,desktopDraftWrites=Promise.resolve(),desktopDraftFailed=false;
let openedBaseImages={},terrainFiles=new Map(),assetCacheKey=crypto.randomUUID(),projectWriter=new ProjectFileWriter(),pendingProject=null,exportCartoBusy=false;
function terrainCorrectionFor(p){return correctTerrainSource(p,typeof SEED_PROJECT==='undefined'?null:SEED_PROJECT,typeof TERRAIN_CORRECTION==='undefined'?null:TERRAIN_CORRECTION);}
try{if(window.mapDesktop)throw Error('桌面版使用手动工程保存');const raw=localStorage.getItem(KEY);if(raw){project=validateProject(JSON.parse(raw));browserHasProject=true;projectDirty=true;}}catch{}
try{if(window.mapDesktop)throw Error('桌面版使用手动工程保存');const backup=await projectBackup('get',KEY),candidate=backup?.snapshotFormat===2?backup.project:backup;if(candidate&&(candidate.editorSavedAt||0)>=(project.editorSavedAt||0)){project=validateProject(candidate);browserHasProject=true;projectDirty=backup.snapshotFormat===2?backup.dirty!==false:true;if(backup.fileName)currentFileName=backup.fileName;if(backup.assetCacheKey){assetCacheKey=backup.assetCacheKey;const assets=await projectBackup('get',KEY+'-assets');if(assets?.key===assetCacheKey){openedBaseImages=assets.baseImages||{};terrainFiles=new Map(assets.terrainFiles||[]);}}}}catch{}
const initialTerrainCorrection=terrainCorrectionFor(project);project=prepareEditor(initialTerrainCorrection.project);
const svg=$('mapSvg'),viewport=$('mapViewport');
const mapTemplate=svg.cloneNode(true);
let mapRoot=svg;
const mapElement=id=>mapRoot.getElementById(id);
const fmt=m=>m>=1000?`${(m/1000).toFixed(2)} km`:`${Math.round(m)} m`;
const fmtArea=a=>a>=1e6?`${(a/1e6).toFixed(2)} km²`:`${Math.round(a).toLocaleString('zh-CN')} m²`;
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(msg){$('toast').textContent=msg;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),3300);}
function updateSaveStatus(){const label=$('currentProjectLabel');if(!label)return;
 if(basePlanningState){
  label.textContent='规划工作区'+(planningWorkspace.dirty?' · 未保存':'');
  label.title=planningWorkspace.project.title;
  window.mapDesktop?.setTitle?.(label.textContent);
  $('saveProjectTop').textContent=projectSaving?'保存中…':'保存工作区';
  return;
 }
 label.textContent=(projectFolderContext?projectFolderContext.name+' / ':'')+currentFileName+(projectDirty?' · 未保存':'');label.title=project.title+' — '+currentFileName;window.mapDesktop?.setTitle?.(currentFileName+(projectDirty?' · 未保存':''));for(const id of ['saveProjectTop','saveAsProjectTop','openProjectTop','openProjectFolderTop','saveProjectFolderBtn','saveProjectBtn','saveAsProjectBtn','newProjectBtn','importBtn'])if($(id))$(id).disabled=projectSaving;$('saveProjectTop').textContent=projectSaving?'保存中…':'保存';}
async function cacheProjectAssets(){if(basePlanningState||window.mapDesktop)return;try{await projectBackup('put',KEY+'-assets',{key:assetCacheKey,baseImages:openedBaseImages,terrainFiles:[...terrainFiles]});}catch{}}
async function saveBrowser(){if(basePlanningState)return;if(window.mapDesktop){updateSaveStatus();return;}const snapshot=structuredClone(project);snapshot.editorSavedAt=Date.now();project.editorSavedAt=snapshot.editorSavedAt;try{await projectBackup('put',KEY,{snapshotFormat:2,project:snapshot,fileName:currentFileName,dirty:projectDirty,assetCacheKey});localSaved=true;}catch{localSaved=false;}updateSaveStatus();}
function persist(){
 if(basePlanningState){
  const stage=planningWorkspace.editStage||'local';
  for(const f of planningWorkspaceAdditions(project,planningWorkspace.referenceIds)){
   if(!f.attributes?.PlanStage)f.attributes={...f.attributes,PlanStage:stage};
  }
  planningWorkspace.dirty=true;editRevision++;
  refreshPlanningWorkspace();updateSaveStatus();
  return;
 }
 userChanged=true;projectDirty=true;editRevision++;clearTimeout(saveTimer);if(window.mapDesktop)scheduleDesktopDraft();else saveTimer=setTimeout(saveBrowser,350);updateSaveStatus();}
function writeDesktopDraft(mode,snapshot){
 const operation=desktopDraftWrites.then(()=>projectBackup(mode,desktopDraftKey,snapshot));
 desktopDraftWrites=operation.catch(()=>{});
 return operation;
}

function scheduleDesktopDraft(){
 if(desktopDraftTimer!==null)return;
 desktopDraftTimer=setTimeout(()=>{
  desktopDraftTimer=null;
  if(basePlanningState||!projectDirty)return;
  if(drag?.moved){scheduleDesktopDraft();return;}
  const snapshot={
   version:1,savedAt:Date.now(),fileName:currentFileName,project:structuredClone(project),
   baseImages:{...openedBaseImages},terrainFiles:activeTerrainFiles(),workspace:workspaceSnapshot()
  };
  writeDesktopDraft('put',snapshot).then(()=>desktopDraftFailed=false).catch(()=>{
   if(!desktopDraftFailed)toast('恢复草稿写入失败，请手动保存工程');
   desktopDraftFailed=true;
  });
 },1200);
}

function clearDesktopDraft(){
 clearTimeout(desktopDraftTimer);
 desktopDraftTimer=null;
 return writeDesktopDraft('delete');
}

async function offerDesktopDraft(){
 const stored=await projectBackup('get',desktopDraftKey);
 if(!stored||stored.version!==1||editRevision||projectDirty)return;
 const doc={
  ...stored,project:prepareEditor(stored.project),isRecovered:true,
  fileName:typeof stored.fileName==='string'?stored.fileName:'恢复工程.cs2map'
 };
 const dialog=$('desktopDraftDialog');
 $('desktopDraftSummary').textContent=doc.fileName+' · '+new Date(stored.savedAt).toLocaleString('zh-CN');
 $('restoreDesktopDraft').onclick=()=>{dialog.close();installProject(doc);};
 $('discardDesktopDraft').onclick=async()=>{
  try{await clearDesktopDraft();dialog.close();}
  catch{toast('无法删除恢复草稿');}
 };
 dialog.showModal();
}

function activeTerrainFiles(){const files=new Map();for(const r of project.rasters){const raw=terrainFiles.get(r.id+':'+terrainFingerprint(r.data));if(raw)files.set(r.id,raw);}return files;}
async function ensureTerrainFiles(){
 if(typeof SEED_TERRAIN_FILES==='undefined')return;
 for(const r of project.rasters){const seed=SEED_TERRAIN_FILES[r.id];const key=r.id+':'+terrainFingerprint(r.data);if(terrainFiles.has(key)||!seed||(!(seed.sha256&&r.source?.sha256===seed.sha256)&&terrainFingerprint(r.data)!==seed.previewFingerprint))continue;const data=fromBase64(seed.deflated);const bytes=new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());terrainFiles.set(key,bytes);}
}
function workspaceSnapshot(){return {view:{cx:view.cx,cy:view.cy,zoom:view.scale/fitScale},activeLayer:activeLayer.key,expandedGroups:[...expandedGroups]};}
function safeProjectName(){return (project.title.replace(/[\\/:*?"<>|]/g,'-').trim()||'地图规划')+'.cs2map';}
async function saveProject(asNew=false){
 if(basePlanningState)return savePlanningWorkspace(asNew);
 if(projectSaving)return false;projectSaving=true;updateSaveStatus();const revision=editRevision;
 try{
  const {writer,name}=await chooseProjectSaveTarget(projectWriter,{asNew,currentName:currentFileName,suggestedName:asNew?safeProjectName():currentFileName,pick:typeof window.showSaveFilePicker==='function'?()=>window.showSaveFilePicker({suggestedName:asNew?safeProjectName():currentFileName,types:[{description:'天际线Ⅱ地图工程',accept:{'application/octet-stream':['.cs2map']}}]}):null});
  await ensureTerrainFiles();
  const snapshot=structuredClone(project),compact=!!window.mapDesktop?.tauri;
  const pack=compact?packTauriProject:packProject;
  const options={terrainFiles:activeTerrainFiles(),baseImages:{...(typeof BASEMAPS==='undefined'?{}:BASEMAPS),...openedBaseImages},workspace:workspaceSnapshot()};
  if(projectFolderContext&&!asNew){
   const folder=projectFolderContext;
   await writer.save(async()=>{
    options.workspace.folderAssetFiles=await saveFolderLibraries(folder,snapshot.assetPacks,{compact});
    return pack(snapshot,options);
   });
  }else await writer.save(await pack(snapshot,options));
  if(asNew)projectFolderContext=null;
  projectWriter=writer;currentFileName=name;
  if(editRevision===revision){
   projectDirty=false;
   if(window.mapDesktop){
    try{await clearDesktopDraft();}
    catch{toast('工程已保存，恢复草稿未能删除');return true;}
   }
  }
  await cacheProjectAssets();await saveBrowser();toast('工程已保存：'+name);return true;
 }catch(error){if(error.name!=='AbortError')toast('保存未完成：'+error.message);return false;}finally{projectSaving=false;updateSaveStatus();}
}
function installProject(doc){
 if(masterPlanSession)showInspector('properties');
 planningSessions.clear();
 const repaired=terrainCorrectionFor(doc.project);
 // Project loaders have already validated and migrated the document.
 project=repaired.changedIds.length?prepareEditor(repaired.project):repaired.project;
 projectFolderContext=doc.folderContext||null;
 terrainFiles=new Map();for(const r of doc.project.rasters){const raw=doc.terrainFiles?.get(r.id);if(raw&&!repaired.changedIds.includes(r.id))terrainFiles.set(r.id+':'+terrainFingerprint(r.data),raw);}
 openedBaseImages=doc.baseImages||{};projectWriter=doc.writer||new ProjectFileWriter();currentFileName=doc.fileName||safeProjectName();projectDirty=!!(doc.isNew||doc.isRecovered);assetCacheKey=crypto.randomUUID();editRevision++;history=[];future=[];selected=null;selectedNode=null;scopeId='';draft=[];listQuery='';
 const w=doc.workspace||{};activeLayer={key:typeof w.activeLayer==='string'&&(project.settings.editor.layers[w.activeLayer]||GROUPS.some(([g])=>g===w.activeLayer))?w.activeLayer:'area',source:'manual'};expandedGroups.clear();for(const key of w.expandedGroups||[])if(GROUPS.some(([g])=>g===key)){expandedGroups.clear();expandedGroups.add(key);break;}
 if(w.view&&Number.isFinite(w.view.cx)&&Number.isFinite(w.view.cy)&&Number.isFinite(w.view.zoom)&&w.view.zoom>=.5&&w.view.zoom<=35)view={cx:w.view.cx,cy:w.view.cy,scale:fitScale*w.view.zoom};else fitView();
 setTool('select',{redraw:false});buildLayers();syncUI();render();renderProperties();updateUndo();updateSaveStatus();if($('projectDialog').open)$('projectDialog').close();if($('unsavedDialog').open)$('unsavedDialog').close();pendingProject=null;
 if(window.mapDesktop&&!doc.isRecovered)clearDesktopDraft().catch(()=>toast('无法删除上一个工程的恢复草稿'));
 cacheProjectAssets();saveBrowser();
 toast(doc.isRecovered?'已恢复草稿，可另存为工程':doc.isNew?'已新建工程':'已打开：'+currentFileName);
}
function requestProject(doc){if(basePlanningState){toast('请先返回工程，再打开或新建工程');return;}if(projectDirty){pendingProject=doc;$('unsavedDialog').showModal();}else installProject(doc);}
async function acceptProjectFile(file,handle=null){if(/\.cs2plan$/i.test(file.name))return openPlanningWorkspaceFile(file,handle);if(file.size>512*1024*1024)throw Error('工程文件超过 512 MB');const bytes=await file.arrayBuffer(),doc=await unpackProject(bytes);if(doc.workspace?.kind==='isolated-planning')return openPlanningWorkspaceFile(file,handle);doc.fileName=/\.cs2map$/i.test(file.name)?file.name:file.name.replace(/\.json$/i,'')+'.cs2map';if(handle&&/\.cs2map$/i.test(file.name)){doc.writer=new ProjectFileWriter();doc.writer.attach(handle,bytes);}requestProject(doc);}
async function openProjectFile(){
 try{if('showOpenFilePicker' in window){const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'天际线Ⅱ地图工程',accept:{'application/octet-stream':['.cs2map','.cs2plan'],'application/json':['.json']}}]});await acceptProjectFile(await handle.getFile(),handle);}else $('importFile').click();}catch(error){if(error.name!=='AbortError')toast('打开未完成：'+error.message);}
}
function newProject(){const p=prepareEditor(initialProject());p.title='新地图工程';p.features=[];p.basemaps=[];p.rasters=[];p.settings.base='none';requestProject({project:p,fileName:'新地图工程.cs2map',isNew:true});}

async function openProjectFolder(){
 try{
  if(!('showDirectoryPicker' in window)){$('projectFolderInput').click();return;}
  const handle=await window.showDirectoryPicker({mode:'readwrite'}),doc=await readProjectFolder(await directoryProjectEntries(handle));
  doc.folderContext={handle,name:handle.name,projectFile:doc.fileName};doc.writer=new ProjectFileWriter();doc.writer.attach(doc.projectEntry.handle,doc.projectBytes);requestProject(doc);
 }catch(error){if(error.name==='SecurityError')$('projectFolderInput').click();else if(error.name!=='AbortError')toast('打开项目文件夹失败：'+error.message);}
}
async function saveAsProjectFolder(){
 if(basePlanningState){toast('规划工作区请使用「保存工作区」');return;}
 if(!('showDirectoryPicker' in window)){toast('此浏览器无法直接写入文件夹，请保存工程文件到项目文件夹；推荐 Chrome / Edge');return;}
 const previous=projectFolderContext,writer=projectWriter;
 try{
  const handle=await window.showDirectoryPicker({mode:'readwrite'}),entries=await directoryProjectEntries(handle);
  const name=safeProjectName();
  if(entries.some(e=>e.path==='project.folder.json'||(e.path.endsWith('.cs2map')&&(e.path!==name||e.file.size))))
   throw Error('所选目录已有项目，请选择新建的空项目文件夹');
  const file=await folderFileHandle(handle,name);projectWriter=new ProjectFileWriter();projectWriter.attach(file,await (await file.getFile()).arrayBuffer());
  projectFolderContext={handle,name:handle.name,projectFile:name};
  const oldName=currentFileName;currentFileName=name;
  if(!await saveProject()){projectFolderContext=previous;projectWriter=writer;currentFileName=oldName;updateSaveStatus();}
 }catch(error){projectFolderContext=previous;projectWriter=writer;if(error.name!=='AbortError')toast('保存项目文件夹失败：'+error.message);}
}
$('openProjectFolderTop').onclick=openProjectFolder;$('saveProjectFolderBtn').onclick=saveAsProjectFolder;
$('projectFolderInput').onchange=async e=>{
 const files=[...e.target.files];e.target.value='';if(!files.length)return;
 try{const entries=files.map(file=>({path:file.webkitRelativePath.split('/').slice(1).join('/'),file}));const doc=await readProjectFolder(entries);requestProject(doc);}catch(error){toast('打开项目文件夹失败：'+error.message);}
};

function checkpoint(snapshot=lightHistorySnapshot(project)){
 invalidateEditGeometry();
 history.push(snapshot);
 if(history.length>80)history.shift();
 future=[];
 updateUndo();
}
function undo(redo=false){
 const from=redo?future:history,to=redo?history:future;
 const snapshot=from.at(-1);
 if(!snapshot||drag?.moved)return;
 if('featureId' in snapshot)to.push(restoreFeatureHistory(project,snapshot));
 else{
  const next=prepareEditor(restoreHistorySnapshot(snapshot));
  to.push(lightHistorySnapshot(project));
  project=next;
 }
 from.pop();
 invalidateEditGeometry();
 renderAssetPackages();selected=null;selectedNode=null;draft=[];
 syncUI();render();renderProperties();persist();updateUndo();
}
function updateUndo(){$('undoBtn').disabled=!history.length;$('redoBtn').disabled=!future.length}
function node(tag,attrs={},parent){
 const n=document.createElementNS(NS,tag),{screen,...world}=attrs;
 for(const [k,v]of Object.entries(world))n.setAttribute(k,String(v));
 if(screen){n.setAttribute('data-screen',JSON.stringify(screen));updateScreenNode(n,screen);}
 if(attrs['data-min-zoom']!==undefined)n.style.display=view.scale/fitScale>attrs['data-min-zoom']?'':'none';
 if(parent)parent.appendChild(n);return n;
}
function updateScreenNode(n,sizes){for(const [key,value]of Object.entries(sizes))n.setAttribute(key,Array.isArray(value)?value[0]+value[1]/view.scale:value/view.scale);}
function pathData(points,closed=false){return points.map((p,i)=>`${i?'L':'M'}${p[0]},${p[1]}`).join(' ')+(closed?' Z':'')}
function featurePath(f,closed=true){return [f.points,...(f.additionalParts||[])].map(ps=>pathData(ps,closed)).join(' ');}
function renderNetworkFeature(f,isSelected,hostOverride=null,edgeHost=null,flatEnds=null){
 const featureNode=(tag,attrs,parent)=>node(tag,{...attrs,'data-render-id':f.id},parent);
 const e=project.settings.editor,s=networkDisplay(f,e,view.scale),{route,color,width,opacity}=s;
 const host=hostOverride||mapElement(route?'routeShapes':'roadShapes'),poly=f.geometryType==='polygon',d=featurePath(f,poly);
 if(!route&&f.outlineParts&&!f.outlineDetached&&e.networkOutlines)featureNode('path',{d:f.outlineParts.map(ps=>pathData(ps,true)).join(' '),fill:color,'fill-opacity':.08,stroke:color,'stroke-opacity':.3,'stroke-width':.5,'vector-effect':'non-scaling-stroke','data-min-zoom':1.5,'fill-rule':'evenodd','data-id':f.id},host);
 if(poly){featureNode('path',{d,fill:color,'fill-rule':'evenodd','fill-opacity':opacity,stroke:'none','data-id':f.id},host);return;}
 const attrs={d,fill:'none',stroke:color,'stroke-opacity':opacity,'stroke-width':width,'stroke-linecap':s.type==='waterway'?'butt':'round','stroke-linejoin':'round','pointer-events':'none','data-network-type':f.type,'data-structure':s.structure,'data-render-width':s.actualWidth};
 const paint=(paintAttrs,parent)=>{
  if(!flatEnds?.size){featureNode('path',paintAttrs,parent);return;}
  [f.points,...(f.additionalParts||[])].forEach((part,index)=>{
   const start=flatEnds.has(`${index}:start`),end=flatEnds.has(`${index}:end`);
   featureNode('path',{...paintAttrs,d:pathData(part,false),'stroke-linecap':start||end?'butt':'round'},parent);
   if(!start&&!end)return;
   for(const point of [...(start?[]:part.slice(0,1)),...(end?[]:part.slice(-1))]){
    featureNode('circle',{cx:point[0],cy:point[1],r:paintAttrs['stroke-width']/2,fill:paintAttrs.stroke,'fill-opacity':paintAttrs['stroke-opacity'],'pointer-events':'none'},parent);
   }
  });
 };
 if(!route&&project.settings.corridors&&!['bus','metro','waterway'].includes(f.type))paint({...attrs,'stroke-opacity':.08,'stroke-width':f.corridor},mapElement('corridorShapes'));
 if(isSelected)paint({...attrs,stroke:'#fff','stroke-opacity':.8,'stroke-width':width+4/view.scale,screen:{'stroke-width':[width,4]}},host);
 const lineWidth=Math.max(.1,width-s.edgeWidth*2);
 if(s.edgeWidth)paint({...attrs,stroke:s.edgeColor,'data-network-edge':'true'},edgeHost||host);
 paint({...attrs,'stroke-width':lineWidth},host);
 if(!route&&f.type==='rail')featureNode('path',{...attrs,stroke:s.railWhite,'stroke-width':lineWidth*.62,'stroke-linecap':'butt','stroke-dasharray':s.railSegment+' '+s.railSegment,'data-rail-inlay':'true'},host);
 featureNode('path',{d,fill:'none',stroke:'transparent','stroke-width':Math.max(width,13/view.scale),'data-hit-width':width,'data-id':f.id,'stroke-linecap':'round'},host);
 if(labelsVisibleInEditor(project,f)&&(!project.proposal||isSelected)){const p=f.points[Math.floor(f.points.length/2)];const text=label(f.name,p,f.type==='waterway'?'#3187a4':color,mapElement('noteShapes'),10,-10);text.setAttribute('data-render-id',f.id);text.setAttribute('data-min-zoom',1.6);text.style.display=view.scale/fitScale>1.6?'':'none';}
}
function renderRoadNetwork(roads){
 networkJunctions=renderCrossingCache.get(roads);
 const flatEnds=roadFlatEnds(networkJunctions);
 const levels=[...new Set(roads.map(roadStackLevel))].sort((a,b)=>a-b),style=f=>networkDisplay(f,project.settings.editor,view.scale);
 for(let i=0;i<levels.length;i++){
  const level=levels[i],higher=roads.filter(f=>roadStackLevel(f)>level),group=node('g',{'data-network-level':level},mapElement('roadShapes'));
  if(higher.length){
   const id='network-level-mask-'+i,mask=node('mask',{id,maskUnits:'userSpaceOnUse',...networkMaskBounds,'mask-type':'luminance'},mapElement('networkMasks'));
   node('rect',{x:0,y:0,width:SIZE,height:SIZE,fill:'#ffffff'},mask);
   for(const f of higher){const width=style(f).width,gap=Math.min(3,Math.max(.5,width*.08));node('path',{d:featurePath(f,f.geometryType==='polygon'),fill:f.geometryType==='polygon'?'#000000':'none',stroke:'#000000','stroke-width':f.geometryType==='polygon'?gap*2:width+gap*2,'stroke-linecap':'butt','stroke-linejoin':'round','data-occludes':f.id},mask);}
   group.setAttribute('mask',`url(#${id})`);
  }
  const edgeHost=node('g',{'data-network-casings':level},group);
  const levelRoads=roads.filter(f=>roadStackLevel(f)===level),special=f=>['rail','metro','waterway'].includes(f.type);
  for(const f of levelRoads.filter(f=>!special(f)))renderNetworkFeature(f,!!project.proposal&&f.id===selected,node('g',{'data-road-id':f.id},group),edgeHost,flatEnds.get(f.id));
  for(const junction of networkJunctions){
   const sectors=junctionSectors(junction,level,f=>style(f).width);if(!sectors.length)continue;
   const joint=node('g',{'data-junction':'at-grade','data-level':level,'data-junction-roads':junction.roads.map(f=>f.id).join(' ')},group);node('title',{},joint).textContent='平交（可互通） · '+[...new Set(sectors.map(s=>s.feature.name))].join(' / ');
   node('path',{d:pathData(sectors[0].outer,true),fill:style(sectors[0].feature).color,stroke:'none','pointer-events':'none'},joint);
   for(const sector of sectors)node('path',{d:pathData(sector.points,true),fill:style(sector.feature).color,stroke:'none','data-id':sector.feature.id,'data-junction-sector':sector.feature.type},joint);
  }
  for(const f of levelRoads.filter(special))renderNetworkFeature(f,!!project.proposal&&f.id===selected,node('g',{'data-road-id':f.id},group),edgeHost,flatEnds.get(f.id));
 }
}
function networkCrossingFields(f,disabled){
 const counts={connected:0,above:0,below:0};
 for(const junction of networkJunctions.filter(n=>n.roads.some(r=>r.id===f.id))){const relations=new Set(junction.roads.filter(r=>r.id!==f.id).map(r=>crossingRelation(f,r)));for(const key of Object.keys(counts))if(relations.has(key))counts[key]++;}
 return `<label class="field-label" for="editStackLevel">交叉层级</label><input id="editStackLevel" type="number" min="-20" max="20" step="1" placeholder="自动：${roadStackLevel({...f,stackLevel:undefined})}" value="${f.stackLevel??''}" ${disabled}><p class="muted network-crossing-hint">留空按结构：地下 −1、地面 0、高架／桥梁 1。数字越大越在上层；同层公路按平交显示。局部变层时分段绘制。</p><p class="muted">当前可见交叉：平交 ${counts.connected} 处 · 上跨 ${counts.above} 处 · 下穿 ${counts.below} 处</p>`;
}
function getSelected(){return project.features.find(f=>f.id===selected)}
function screenPoint(e){const r=svg.getBoundingClientRect();return [view.cx+(e.clientX-r.left-r.width/2)/view.scale,view.cy+(e.clientY-r.top-r.height/2)/view.scale]}
function inMap(p){return p[0]>=0&&p[0]<=SIZE&&p[1]>=0&&p[1]<=SIZE}
function constrained(e){
 let point=screenPoint(e);
 snapPoint=null;roadSnap=null;
 if(e.shiftKey&&draft.length){
  const a=draft.at(-1),len=distance(a,point);
  const angle=Math.round(Math.atan2(point[1]-a[1],point[0]-a[0])/(Math.PI/4))*Math.PI/4;
  point=[a[0]+len*Math.cos(angle),a[1]+len*Math.sin(angle)];
 }
 if(project.settings.snap&&!e.shiftKey){
  const radius=12/view.scale,excluded=drag?.id||null;
  if(!snapIndex||snapIndex.excluded!==excluded){
   snapIndex={excluded,index:createSnapIndex(project.features,{visible:featureVisible,exclude:excluded})};
  }
  const near=snapIndex.index.nearest(point,radius);
  if(tool==='road'&&isStreetRoad({kind:'road',type:roadType})){
   if(!roadSegmentIndex){
    const roads=project.features.filter(f=>isStreetRoad(f)&&roadStackLevel(f)===0&&featureVisible(f));
    roadSegmentIndex=createRoadSegmentIndex(roads);
   }
   roadSnap=roadSegmentIndex.nearest(point,radius);
  }
  if(roadSnap&&(!near||roadSnap.distance<=distance(point,near))){
   point=roadSnap.point;snapPoint=point;
  }else{
   roadSnap=null;
   if(near){point=near;snapPoint=point;}
  }
  if(draft.length>=3&&['zone','district','building','interchange'].includes(tool)&&distance(point,draft[0])<radius){
   point=[...draft[0]];snapPoint=point;
  }
 }
 return point.map(n=>Math.max(0,Math.min(SIZE,n)));
}
function fitView(){const r=viewport.getBoundingClientRect();fitScale=Math.min(r.width/SIZE,r.height/SIZE)*.92;view={cx:SIZE/2,cy:SIZE/2,scale:fitScale};}
function fit(){fitView();render();}
const scrollOffsets={x:0,y:0};
function syncMapScrollbars(r){
 for(const [axis,center,pixels]of [['x','cx',r.width],['y','cy',r.height]]){
  const state=mapScrollAxis(view[center],view.scale,pixels),bar=$(axis==='x'?'mapScrollX':'mapScrollY');view[center]=state.center;
  const size=axis==='x'?'width':'height',value=state.extent+'px';
  if(bar.firstElementChild.style[size]!==value)bar.firstElementChild.style[size]=value;
  bar[axis==='x'?'scrollLeft':'scrollTop']=state.offset;
 }
 for(const axis of ['x','y']){
  const bar=$(axis==='x'?'mapScrollX':'mapScrollY');scrollOffsets[axis]=bar[axis==='x'?'scrollLeft':'scrollTop'];
 }
}
function bindMapScrollbars(){
 for(const [axis,center]of [['x','cx'],['y','cy']]){const bar=$(axis==='x'?'mapScrollX':'mapScrollY');bar.addEventListener('scroll',()=>{const offset=bar[axis==='x'?'scrollLeft':'scrollTop'];if(Math.abs(offset-scrollOffsets[axis])<.5)return;zoomAnimator.cancel();const r=viewport.getBoundingClientRect();view[center]=(offset+(axis==='x'?r.width:r.height)/2)/view.scale;viewportScheduler.schedule();});}
}
function updateView(){
 const r=viewport.getBoundingClientRect();syncMapScrollbars(r);
 for(const n of svg.querySelectorAll('[data-screen]'))updateScreenNode(n,JSON.parse(n.getAttribute('data-screen')));
 for(const n of svg.querySelectorAll('[data-min-zoom]')){
  const display=view.scale/fitScale>Number(n.getAttribute('data-min-zoom'))?'':'none';
  if(n.style.display!==display)n.style.display=display;
 }
 const w=r.width/view.scale,h=r.height/view.scale;
 svg.setAttribute('viewBox',[view.cx-w/2,view.cy-h/2,w,h].join(' '));
 networkMaskBounds={x:view.cx-w/2-50,y:view.cy-h/2-50,width:w+100,height:h+100};
 for(const mask of $('networkMasks').children)for(const [key,value]of Object.entries(networkMaskBounds))mask.setAttribute(key,value);
 $('zoomValue').textContent=Math.round(view.scale/fitScale*100)+'%';
 const target=95/view.scale,scale=[1,2,5,10,20,50,100,200,500,1000,2000,5000,10000].reduce((a,b)=>Math.abs(b-target)<Math.abs(a-target)?b:a);
 $('scaleLine').style.width=scale*view.scale+'px';$('scaleLabel').textContent=fmt(scale);
}
let renderedScale=null;
function refreshNavigationDetails(){
 if(view.scale===renderedScale)return;
 // Overview widths and proposal label collision depend on scale. Ordinary map
 // geometry does not; preserve its DOM and only refresh the editing overlays.
 if(project.settings.editor.widthMode==='overview'||project.proposal){render();return;}
 for(const n of svg.querySelectorAll('[data-hit-width]'))n.setAttribute('stroke-width',Math.max(Number(n.getAttribute('data-hit-width')),13/view.scale));
 renderDraft();renderSelection();renderMasterPlan();renderedScale=view.scale;
}
const viewportScheduler=createViewportScheduler(updateView,refreshNavigationDetails);
const zoomAnimator=createZoomAnimator(()=>view,next=>{view=next;viewportScheduler.schedule();},()=>[fitScale*.5,fitScale*35]);
function zoom(factor,at){zoomAnimator.zoom(factor,at);}
function label(text,p,color,parent,size=11,offsetY=0){const n=node('text',{x:p[0],y:p[1],screen:{'font-size':size,...(offsetY?{y:[p[1],offsetY]}:{})},fill:color,'text-anchor':'middle','paint-order':'stroke','stroke':'#fcfff7','stroke-width':3,'vector-effect':'non-scaling-stroke','stroke-linejoin':'round','pointer-events':'none'},parent);n.textContent=text;return n}
function workspaceCorridor(f){return basePlanningState&&f.attributes?.PlanStage==='corridors'&&!planningWorkspace.referenceIds.has(f.id);}

function renderBaseLayers(){
 for(const id of ['districtShapes','zoneShapes','corridorShapes','roadShapes','routeShapes','networkMasks','noteShapes'])mapElement(id).replaceChildren();
 const settings=project.settings;mapElement('baseImage').style.display=settings.base==='none'?'none':'';const baseUrl=basemapUrl();if(mapElement('baseImage').getAttribute('href')!==baseUrl)mapElement('baseImage').setAttribute('href',baseUrl);mapElement('baseImage').setAttribute('opacity',settings.baseOpacity/100);mapElement('gridRect').style.display=settings.grid?'':'none';
 renderDistricts();const zoneLabelCandidates=[];
 for(const f of project.features.filter(f=>featureVisible(f))){const isSelected=f.id===selected;
  if(f.kind==='zone'){const z=[f.type,zoneInfo(f.type)[1],featureDisplayColor(project,f)];const shape=node('path',{d:featurePath(f,true),fill:polygonFill(f,z[2]),'fill-rule':'evenodd','fill-opacity':settings.zoneOpacity/100,stroke:z[2],'stroke-width':1.3,'vector-effect':'non-scaling-stroke','stroke-dasharray':'none','data-id':f.id},mapElement('zoneShapes'));const hint=node('title',{},shape);hint.textContent=`${f.name} · ${z[1]} · ${fmtArea(area(f.points))}`;if(labelsVisibleInEditor(project,f)){const c=interiorPoint(f.points);if(project.proposal)zoneLabelCandidates.push({f,p:c});else label(f.tags?f.name+' · '+f.tags:f.name,c,'#3e6252',mapElement('noteShapes'),11)}}
  if(f.kind==='route'||f.kind==='road'&&f.type==='bus')renderNetworkFeature(f,!!project.proposal&&isSelected);
  if(f.kind==='note'){const p=f.points[0];
   if(f.attributes?.PlanGuide&&f.points.length>1)node('path',{d:pathData(f.points),fill:'none',
    stroke:'#705c91','stroke-width':2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'7 5','data-id':f.id},mapElement('noteShapes'));if(project.proposal&&view.scale/fitScale<2&&!isSelected){const marker=node('circle',{cx:p[0],cy:p[1],screen:{r:3},fill:'#6c8674','data-id':f.id},mapElement('noteShapes'));const hint=node('title',{},marker);hint.textContent=f.name;continue;}node('circle',{cx:p[0],cy:p[1],screen:{r:4},fill:'#55725e',stroke:'#fcfff5','stroke-width':2,'vector-effect':'non-scaling-stroke','data-id':f.id},mapElement('noteShapes'));const t=label(f.name,p,'#345540',mapElement('noteShapes'),12,-12);t.setAttribute('data-id',f.id);t.setAttribute('pointer-events','auto')}
 }
 renderRoadNetwork(project.features.filter(f=>f.kind==='road'&&f.type!=='bus'&&featureVisible(f)&&!workspaceCorridor(f)));
 if(basePlanningState)for(const road of project.features.filter(f=>f.kind==='road'&&workspaceCorridor(f)&&featureVisible(f))){
  const stroke=road.type==='highway'?'#208758':'#bc7137';
  node('path',{d:featurePath(road,false),fill:'none',stroke,'stroke-width':3,'vector-effect':'non-scaling-stroke',
   'stroke-dasharray':'9 5','data-id':road.id},mapElement('roadShapes'));
 }
 if(project.proposal){
  const ranks={airport:1,station:1,university:1,'tech-university':1,medical:1,civic:1,port:1,shipyard:1,racetrack:1,racecourse:1,industry:2,vehicle:2,data:2,power:2,waste:2,innovation:2,pharma:2,water:2,marina:2,'high-mix':2,education:8,clinic:8,police:8,fire:8,service:8};const placed=[];
  zoneLabelCandidates.sort((a,b)=>(a.f.id===selected?-1:b.f.id===selected?1:0)||(ranks[a.f.type]||4)-(ranks[b.f.type]||4)||area(b.f.points)-area(a.f.points));
  for(const {f,p}of zoneLabelCandidates){const chosen=f.id===selected,rank=ranks[f.type]||4;if(!chosen&&((rank>=8&&view.scale/fitScale<3)||area(f.points)*view.scale*view.scale<220||f.name.endsWith(' · 分区')))continue;const halfW=([...f.name].length*10+10)/view.scale/2,halfH=8/view.scale,b=[p[0]-halfW,p[1]-halfH,p[0]+halfW,p[1]+halfH];if(!chosen&&placed.some(c=>b[0]<c[2]&&b[2]>c[0]&&b[1]<c[3]&&b[3]>c[1]))continue;placed.push(b);label(f.tags?f.name+' · '+f.tags:f.name,p,'#355d4c',mapElement('noteShapes'),10);}
 }
}
function renderDraft(){if(tool==='asset-place'){renderAssetPreview();return;}$('drawingActions').hidden=draft.length===0;const group=$('draftShapes');group.replaceChildren();$('finishBtn').disabled=draft.length<(tool==='building'&&buildingGeometry==='point'?1:['zone','district','building','interchange'].includes(tool)?3:2);const points=[...draft];if(hover&&draft.length)points.push(hover);if(!points.length)return;const color=tool==='road'?roadInfo(roadType).color:tool==='zone'?zoneInfo(zoneType)[2]:tool==='district'?'#598c8c':'#315e50';
 if(points.length>1)node('path',{d:pathData(points,['zone','district','building','interchange'].includes(tool)&&points.length>2),fill:['zone','district','building','interchange'].includes(tool)?color:'none','fill-opacity':.18,stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'6 5','pointer-events':'none'},group);
 for(const p of draft)node('circle',{cx:p[0],cy:p[1],screen:{r:4},fill:'#fff',stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke','pointer-events':'none'},group);
 if(snapPoint)node('circle',{cx:snapPoint[0],cy:snapPoint[1],screen:{r:8},fill:'none',stroke:'#258568','stroke-width':1.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'},group);
 if(points.length>1){const p=points.at(-1),value=['zone','district','building','interchange'].includes(tool)&&points.length>2?fmtArea(area(points)):fmt(length(points));label(value,p,color,group,12,-15)}
 $('finishBtn').disabled=draft.length<(tool==='building'&&buildingGeometry==='point'?1:['zone','district','building','interchange'].includes(tool)?3:2);
}
function updateStatus(){if(tool==='select'&&getSelected()?.assetPlacement){$('toolStatus').textContent='拖动建筑整体移动；右侧可调整位置和旋转角度';$('toolStatus').title=$('toolStatus').textContent;return;}if(tool==='asset-place'){updateAssetStatus();return;}const names={select:'双击选中对象的边线添加节点；Alt＋单击可选被覆盖的片区',pan:'拖动画布平移；滚轮缩放',measure:'逐点测量 · Enter 完成 · Esc 清除',road:`绘制${roadInfo(roadType).name} · 单击加点 · 可吸附同层道路 · Enter 完成`,zone:`绘制${zoneInfo(zoneType)[1]} · 至少 3 点 · Enter 闭合`,district:'绘制大片区边界 · 至少3点 · Enter闭合 · 不移动下属区块',note:'在地图上单击添加标注'};$('toolStatus').textContent=names[tool];$('toolStatus').title=names[tool]||'';}
function addFeature(f,features=[...project.features,f]){
 checkpoint();
 project.settings.editor.origins.planning=true;
 project.features=features;
 selected=f.id;
 setTool('select',{redraw:false});
 render();renderProperties();persist();
}
function draftRoadFeatures(road){
 const byRoad=new Map();
 for(const point of draft){
  const hit=draftRoadConnections.get(point);
  if(!hit)continue;
  const target=project.features.find(f=>f.id===hit.feature.id);
  if(target!==hit.feature||locked(target)||!featureVisible(target))continue;
  if(!byRoad.has(target.id))byRoad.set(target.id,[]);
  byRoad.get(target.id).push(hit);
 }
 return [...project.features.map(f=>byRoad.has(f.id)?insertGeometryNodes(f,byRoad.get(f.id)):f),road];
}
function selectFeature(feature,nodeIndex=null){
 assetPanelMode='properties';
 if(feature){
  const key=layerKey(feature);
  if(key!==activeLayer.key)listQuery='';
  activeLayer={key,source:featureSource(project,feature)};
 }
 selected=feature?.id??null;
 selectedNode=nodeIndex;
 updateStatus();
 if(project.proposal&&project.settings.notesVisible)render();
 else renderSelection();
 syncUI();
 renderProperties();
 if(inspectorMode==='local'&&feature?.kind==='district'&&feature.level!=='tile'&&$('localPlanDistrict').value!==feature.id){
  $('localPlanDistrict').value=feature.id;
  setLocalPlanningDistrict(feature.id);
 }
}
function commitGeometryChange(feature,next){
 const index=project.features.indexOf(feature);
 const snapshot=featureHistorySnapshot(project,feature.id);
 project.features[index]=next;
 try{validateInterchangeBounds(project);}
 catch(error){project.features[index]=feature;toast(error.message);return false;}
 checkpoint(snapshot);
 return true;
}
function commitFeatureEdit(feature,next){
 const index=project.features.indexOf(feature);
 const features=project.features.slice();
 features[index]=next;
 const validated=prepareEditor({...project,features}).features[index];
 checkpoint(featureHistorySnapshot(project,feature.id));
 project.features[index]=validated;
 return validated;
}
function deleteSelected(){
 const f=getSelected();
 if(!f)return;
 if(locked(f)){toast('图层已锁定');return;}
 if(selectedNode!==null&&f.kind!=='note'){
  const {partIndex,index}=selectedNode,parts=geometryParts(f);
  const min=partIndex||isPolygonFeature(f)?3:f.geometryType==='point'?1:2;
  if(parts[partIndex].length<=min){toast(`这一段至少需要 ${min} 个节点`);return;}
  parts[partIndex]=parts[partIndex].filter((_,i)=>i!==index);
  const next={...f,points:parts[0]};
  if(f.additionalParts)next.additionalParts=parts.slice(1);
  if(f.outlineParts)next.outlineDetached=true;
  if(!commitGeometryChange(f,next))return;
  selectedNode=null;
 }else{
  if(f.kind==='interchange'&&project.features.some(x=>x.interchangeId===f.id)){
   toast('请先删除或解除范围内细化对象的关联');return;
  }
  if(f.kind==='district')checkpoint();
  else checkpoint(featureHistorySnapshot(project,f.id));
  if(scopeId===selected)scopeId='';
  project.features=project.features.filter(x=>x.id!==selected);
  if(f.kind==='district')for(const child of project.features){
   if(child.districtId===f.id)delete child.districtId;
   if(child.parentId===f.id)delete child.parentId;
  }
  selected=null;selectedNode=null;
 }
 changed();
}
function canInsertNode(feature){
 return feature&&feature.kind!=='note'&&feature.geometryType!=='point'&&!feature.assetPlacement&&!locked(feature);
}
function edgeHitRadius(feature){
 const minimum=9/view.scale;
 if(!isPolygonFeature(feature)&&['road','route'].includes(feature.kind)){
  return Math.max(minimum,networkDisplay(feature,project.settings.editor,view.scale).width/2);
 }
 return minimum;
}
function nearSelectedEdge(feature,point){
 return canInsertNode(feature)&&featureVisible(feature)&&nearestGeometryEdge(feature,point).distance<=edgeHitRadius(feature);
}
svg.addEventListener('pointerdown',e=>{
 if(e.button!==0&&e.button!==1)return;
 zoomAnimator.cancel();refreshNavigationDetails();
 const point=screenPoint(e);
 if(space||tool==='pan'||e.button===1){
  e.preventDefault();drag={kind:'pan',x:e.clientX,y:e.clientY,cx:view.cx,cy:view.cy};
  viewport.style.cursor='grabbing';svg.setPointerCapture(e.pointerId);return;
 }
 if(masterPlanSession?.picking){e.preventDefault();return;}
 if(tool!=='select')return;
 const target=e.target.closest('[data-id]');
 const picked=target?project.features.find(f=>f.id===target.dataset.id):null;
 const current=getSelected();
 const handle=target?.dataset.node;
 let feature=picked;
 if(handle===undefined&&(e.altKey||!picked||picked!==current)){
  if(!e.altKey&&nearSelectedEdge(current,point))feature=current;
  else if(e.altKey||!picked){
   const districts=project.features.filter(f=>f.kind==='district'&&featureVisible(f));
   feature=pickDistrict(districts,point,8/view.scale)||picked;
  }
 }
 if(!feature){selectFeature(null);return;}
 const selectedHandle=handle===undefined?null:{partIndex:Number(target.dataset.part),index:Number(handle)};
 if(feature!==current||selectedHandle?.partIndex!==selectedNode?.partIndex||selectedHandle?.index!==selectedNode?.index)
  selectFeature(feature,selectedHandle);
 if(locked(feature)||e.detail>1)return;
 drag={kind:selectedHandle?'node':'feature',id:feature.id,node:selectedHandle,start:point,
  original:structuredClone(feature.points),
  extraOriginal:structuredClone({additionalParts:feature.additionalParts,outlineParts:feature.outlineParts,poi:feature.poi}),
  originalAssetLot:buildingAssetLot(feature),moved:false};
});
svg.addEventListener('pointermove',e=>{const p=screenPoint(e);$('coordinates').textContent=inMap(p)?`X ${Math.round(p[0])} m · Y ${Math.round(p[1])} m`:'地图范围外';if(drag){if(drag.kind==='pan'){view.cx=drag.cx-(e.clientX-drag.x)/view.scale;view.cy=drag.cy-(e.clientY-drag.y)/view.scale;viewportScheduler.schedule();return}const f=project.features.find(f=>f.id===drag.id);if(!f)return;if(!drag.moved&&distance(p,drag.start)*view.scale<3)return;if(!drag.moved){drag.snapshot=featureHistorySnapshot(project,f.id);invalidateEditGeometry();drag.moved=true;if(svg.hasPointerCapture(e.pointerId)===false)svg.setPointerCapture(e.pointerId);}suppressClick=true;if(drag.kind==='node'){const {partIndex,index}=drag.node;geometryParts(f)[partIndex][index]=constrained(e);if(f.outlineParts)f.outlineDetached=true;}else{const dx=p[0]-drag.start[0],dy=p[1]-drag.start[1],allPoints=[...(drag.originalAssetLot||[]),...drag.original,...(drag.extraOriginal.additionalParts||[]).flat(),...(drag.extraOriginal.outlineParts||[]).flat(),...(drag.extraOriginal.poi?[drag.extraOriginal.poi]:[])],xs=allPoints.map(p=>p[0]),ys=allPoints.map(p=>p[1]),cx=Math.max(-Math.min(...xs),Math.min(SIZE-Math.max(...xs),dx)),cy=Math.max(-Math.min(...ys),Math.min(SIZE-Math.max(...ys),dy));f.points=drag.original.map(q=>[q[0]+cx,q[1]+cy]);for(const key of ['additionalParts','outlineParts'])if(drag.extraOriginal[key])f[key]=drag.extraOriginal[key].map(ps=>ps.map(q=>[q[0]+cx,q[1]+cy]));if(drag.extraOriginal.poi)f.poi=[drag.extraOriginal.poi[0]+cx,drag.extraOriginal.poi[1]+cy]}editPreviewScheduler.schedule();return}if(['road','zone','district','building','interchange','measure'].includes(tool)){hover=constrained(e);renderDraft()}});
function endDrag(e){
 if(!drag)return;
 editPreviewScheduler.flush();
 const pan=drag.kind==='pan',moved=drag.moved;
 let committed=false;
 if(moved){
  const f=project.features.find(feature=>feature.id===drag.id);
  try{
   if(e.type==='pointercancel')throw Error('拖动已取消');
   if(f.kind==='building'&&f.geometryType==='point')f.poi=[...f.points[0]];
   validateInterchangeBounds(project);
   if(f.assetPlacement&&!buildingAssetFits(f,SIZE))throw Error('建筑占地超出地图边界');
   checkpoint(drag.snapshot);
   committed=true;
  }catch(error){
   project.features[drag.snapshot.index]=drag.snapshot.feature;
   invalidateEditGeometry();
   if(e.type!=='pointercancel')toast(error.message);
  }
 }
 clearDragPreview();drag=null;
 if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);
 viewport.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';
 if(moved){render();renderProperties();}
 if(committed)persist();
 if(pan)suppressClick=true;
 setTimeout(()=>suppressClick=false,50);
}
svg.addEventListener('pointerup',endDrag);
svg.addEventListener('pointercancel',endDrag);
svg.addEventListener('pointerleave',()=>{if(drag&&drag.kind!=='pan'&&!drag.moved)drag=null;});
svg.addEventListener('click',e=>{if(suppressClick||space||e.detail>1)return;if(!inMap(screenPoint(e)))return;if(masterPlanSession?.picking){pickMasterPlanPoint(screenPoint(e));return;}if(['road','zone','district','building','interchange','measure'].includes(tool)){const p=constrained(e);if(['zone','district','building','interchange'].includes(tool)&&draft.length>=3&&distance(p,draft[0])<8/view.scale){finish();return}if(draft.length&&distance(p,draft.at(-1))<1/view.scale)return;if(roadSnap)draftRoadConnections.set(p,roadSnap);draft.push(p);hover=null;$('cancelBtn').hidden=false;renderDraft();return}if(tool==='note')addFeature({id:crypto.randomUUID(),kind:'note',name:'新标注',notes:'',points:[screenPoint(e)]})});
svg.addEventListener('dblclick',e=>{
 e.preventDefault();
 if(suppressClick||space||masterPlanSession?.picking)return;
 if(['road','zone','district','building','interchange','measure'].includes(tool)){finish();return;}
 const feature=getSelected();
 if(tool!=='select'||!canInsertNode(feature))return;
 const hit=nearestGeometryEdge(feature,screenPoint(e));
 if(hit.distance>edgeHitRadius(feature))return;
 try{
  const next=insertGeometryNodes(feature,[hit]);
  if(next===feature||!commitGeometryChange(feature,next))return;
  selectedNode={partIndex:hit.partIndex,index:hit.index+1};
  render();renderProperties();persist();
 }catch(error){toast(error.message);}
});
viewport.addEventListener('wheel',e=>{e.preventDefault();if(!drag)zoom(wheelZoomFactor(e.deltaY,e.deltaMode,viewport.clientHeight),screenPoint(e));},{passive:false});
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;const key=e.key.toLowerCase();if((e.ctrlKey||e.metaKey)&&key==='z'){e.preventDefault();undo(e.shiftKey);return}if((e.ctrlKey||e.metaKey)&&key==='y'){e.preventDefault();undo(true);return}if(e.code==='Space'){e.preventDefault();space=true;viewport.style.cursor='grab'}if(key==='escape'){draft=[];hover=null;if(tool==='asset-place')stopAssetPlacement();else setTool('select')}if(key==='enter'){e.preventDefault();finish()}if(key==='delete'||key==='backspace'){e.preventDefault();if(draft.length){draft.pop();renderDraft()}else deleteSelected()}if(!e.ctrlKey&&!e.metaKey){if(key==='v')setTool('select');if(key==='h')setTool('pan');if(key==='m')setTool('measure');if(key==='z')drawOnLayer('zone');if(key==='d')drawOnLayer('district:large')}});
window.addEventListener('keyup',e=>{if(e.code==='Space'){space=false;viewport.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair'}});window.addEventListener('blur',()=>space=false);
$('selectTool').onclick=()=>setTool('select');$('panTool').onclick=()=>setTool('pan');$('measureTool').onclick=()=>setTool('measure');$('finishBtn').onclick=finish;$('cancelBtn').onclick=()=>setTool('select');$('undoBtn').onclick=()=>undo();$('redoBtn').onclick=()=>undo(true);$('zoomIn').onclick=()=>zoom(1.4);$('zoomOut').onclick=()=>zoom(1/1.4);$('fitBtn').onclick=fit;
let mapExpanded=false,nativeMapFullscreen=false;
const mapShell=viewport.closest('.map-shell');
function setMapExpanded(on){mapExpanded=on;mapShell.classList.toggle('map-expanded',on);document.body.classList.toggle('map-fullscreen',on);$('fullscreenBtn').setAttribute('aria-pressed',String(on));$('fullscreenBtn').setAttribute('aria-label',on?'退出全屏':'全屏地图');$('fullscreenBtn').title=on?'退出全屏 (Esc)':'全屏地图';}
$('fullscreenBtn').onclick=async()=>{if(mapExpanded){setMapExpanded(false);if(document.fullscreenElement===mapShell)try{await document.exitFullscreen();}catch{}return;}setMapExpanded(true);if(document.fullscreenEnabled&&mapShell.requestFullscreen)try{await mapShell.requestFullscreen();}catch{}};
document.addEventListener('fullscreenchange',()=>{if(document.fullscreenElement===mapShell){nativeMapFullscreen=true;setMapExpanded(true);}else if(nativeMapFullscreen){nativeMapFullscreen=false;setMapExpanded(false);}});
window.addEventListener('keydown',e=>{if(e.key==='Escape'&&mapExpanded&&!document.fullscreenElement)setMapExpanded(false);});

$('zoneOpacity').oninput=event=>{
 project.settings.zoneOpacity=Number(event.target.value);
 $('zoneOpacityValue').textContent=event.target.value+'%';
 render();persist();
};
for(const key of ['grid','snap','notesVisible']){
 const control=$(key==='notesVisible'?key:key+'Toggle');
 control.onchange=()=>{project.settings[key]=control.checked;render();renderProperties();persist();};
}
window.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(document.querySelector('dialog[open]'))return;document.activeElement?.blur();saveProject(e.shiftKey);}},true);
window.addEventListener('pagehide',saveBrowser);
window.addEventListener('beforeunload',e=>{if(!window.mapDesktop?.tauri&&(projectDirty||projectSaving||planningWorkspace?.dirty)){e.preventDefault();e.returnValue='';}});
$('helpBtn').onclick=()=>$('helpDialog').showModal();
async function download(content,name,mime,onWrite){if(window.mapDesktop?.exportPick){const target=await window.mapDesktop.exportPick(name);if(!target)throw new DOMException('已取消','AbortError');await onWrite?.();const bytes=new Uint8Array(await new Blob([content]).arrayBuffer());await window.mapDesktop.write(target.id,bytes);return;}await onWrite?.();const url=URL.createObjectURL(new Blob([content],{type:mime}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
$('importBtn').onclick=openProjectFile;$('importFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{await acceptProjectFile(file);}catch(error){toast('打开失败：'+error.message);}};

// Generic layer workspace.
function basemapUrl(){const b=project.settings.base;if(b==='none')return ''; return openedBaseImages[b]||project.basemaps.find(x=>x.id===b)?.data||(typeof BASEMAPS!=='undefined'?BASEMAPS[b]:`assets/${b==='satellite'?'satellite':'qgis'}.png`)}
function featureVisible(f){
 if(!f)return false;
 if(basePlanningState&&planningWorkspace.hiddenStages.has(planningWorkspace.referenceIds.has(f.id)?'reference':planningStageOf(f)))return false;
 return visibleInEditor(project,f);
}
function locked(f){return !!(basePlanningState&&planningWorkspace.referenceIds.has(f?.id))||lockedInEditor(project,f)}
function polygonFill(f,color){if(!f.fillStyle||f.fillStyle==='solid')return color;const id='fill-'+f.id.replace(/[^a-z0-9-]/gi,'');let p=mapElement(id);if(!p){p=node('pattern',{id,width:60,height:60,patternUnits:'userSpaceOnUse'},mapRoot.querySelector('defs'));}p.replaceChildren();node('rect',{width:60,height:60,fill:color,'fill-opacity':.3},p);if(f.fillStyle==='hatch')node('path',{d:'M0 60L60 0',stroke:color,'stroke-width':12},p);else node('circle',{cx:30,cy:30,r:9,fill:color},p);return `url(#${id})`}
function layerName(key){
 const groups=Object.fromEntries(GROUPS);if(groups[key])return groups[key];
 if(key.startsWith('building:'))return BUILDINGS.find(([id])=>id===key.split(':')[1])?.[1]||'其他建筑';
 return ({'district:large':'大片区','district:small':'小片区','district:tile':'游戏地块','zone':'功能区块','zoning:boundary':'游戏用地区划','road:interchange':'立交预留范围','terrain:landwater':'陆地／水体简图','terrain:elevation':'Elevation 地形','terrain:depth':'Depth 水体','route:bus':'公交','route:metro':'地铁线路','route:train':'客运铁路线路','route:water':'水上交通','route:air':'航空线路','route:other':'其他交通线路'})[key]||roadInfo(key.split(':')[1]).name;
}
function expandLayerGroup(key,open=true){
 expandedGroups.clear();if(open)expandedGroups.add(key);
 for(const section of $('layerTree').querySelectorAll('.layer-section')){const g=section.querySelector('[data-group]').dataset.group,on=expandedGroups.has(g),button=section.querySelector('.group-fold');section.classList.toggle('collapsed',!on);button.textContent=on?'▾':'▸';button.setAttribute('aria-expanded',String(on));button.setAttribute('aria-label',(on?'折叠':'展开')+layerName(g));}
}
function buildLayers(){
 renderAssetPackages();const host=$('layerTree');const baseControls=$('basemapControls');baseControls.remove();host.replaceChildren();
 for(const [g,name]of GROUPS){
  const section=document.createElement('section');section.className='layer-section'+(expandedGroups.has(g)?'':' collapsed');
  section.innerHTML=`<div class="group-heading"><input type="checkbox" data-group="${g}" aria-label="显示${name}"><button class="group-title" data-category="${g}">${name}</button><button class="group-fold" aria-label="${expandedGroups.has(g)?'折叠':'展开'}${name}" aria-expanded="${expandedGroups.has(g)}" title="展开 / 折叠">${expandedGroups.has(g)?'▾':'▸'}</button></div><div class="group-content"></div>`;
  section.querySelector('[data-group]').onchange=ev=>{checkpoint();project.settings.editor.groups[g]=ev.target.checked;if(g==='building'&&ev.target.checked)project.settings.editor.layers.building.visible=true;changed()};
  section.querySelector('.group-title').onclick=()=>{expandLayerGroup(g);activateLayer(g);};
  section.querySelector('.group-fold').onclick=()=>expandLayerGroup(g,!expandedGroups.has(g));
  if(g==='network'){section.querySelector('.group-heading').oncontextmenu=ev=>{ev.preventDefault();openNetworkSettings()};}
  for(const key of layerKeysForGroup(g)){
   const row=document.createElement('div');row.className='editor-layer';row.dataset.layerKey=key;
   const color=key.startsWith('road:')&&key!=='road:interchange'?project.settings.editor.roadStyles[key.split(':')[1]].color:project.settings.editor.layers[key].color||(key==='terrain:landwater'?'#66b8e5':key==='terrain:depth'?'#3185b0':key==='terrain:elevation'?'#8fa475':defaultLayerColor(key));
   row.innerHTML=`<input type="checkbox" data-layer-visible="${key}" aria-label="显示${layerName(key)}"><button class="category-button" data-category="${key}"><span class="layer-chip ${key.startsWith('road:')?'road-chip':''}" style="background:${key==='road:rail'?'repeating-linear-gradient(90deg,'+color+' 0 5px,#fff 5px 10px)':color}"></span>${layerName(key)}</button>`;
   row.querySelector('input').onchange=ev=>{checkpoint();project.settings.editor.layers[key].visible=ev.target.checked;changed()};row.querySelector('button').onclick=()=>activateLayer(key);
   section.querySelector('.group-content').appendChild(row);
   if(key==='building:municipal')appendMunicipalTree(section.querySelector('.group-content'),row);
  }
  if(g==='terrain')section.querySelector('.group-content').prepend(baseControls);
  host.appendChild(section);
 }
}
function changed(){if(selected&&!featureVisible(getSelected()))selected=null;syncUI();render();renderProperties();persist()}
function activateLayer(key,source='manual',municipal=null){activeMunicipalClass=municipal;assetPanelMode='properties';
 activeLayer={key,source};listQuery='';selected=null;setTool('select');project.settings.editor.groups[groupForLayer(key)]=true;
 const l=project.settings.editor.layers[key];if(l){l.visible=true;l[source]=true;}
 if(key.startsWith('building:')){buildingType=key.split(':')[1];project.settings.editor.layers.building.visible=true;}
 if(key.startsWith('road:')&&key!=='road:interchange')roadType=key.split(':')[1];
 if(key.startsWith('district:'))districtLevel=key.split(':')[1];
 syncUI();render();renderProperties();document.querySelector('.right-scroll').scrollTop=0;persist();
}

function syncUI(){syncOriginControls();const s=project.settings,e=s.editor;for(const [id,key]of [['gridToggle','grid'],['snapToggle','snap'],['notesVisible','notesVisible'],['corridorsToggle','corridors']])$(id).checked=s[key];for(const key of ['zoneOpacity']){$(key).value=s[key];$(key+'Value').textContent=s[key]+'%'}$('baseSelect').innerHTML=[['none','无底图'],...(['qgis','satellite'].filter(k=>openedBaseImages[k]||(typeof BASEMAPS!=='undefined'&&BASEMAPS[k])).map(k=>[k,k==='qgis'?'QGIS 简图':'卫星底图'])),...project.basemaps.map(b=>[b.id,b.name])].map(([id,n])=>`<option value="${escape(id)}">${escape(n)}</option>`).join('');$('baseSelect').value=s.base;document.querySelectorAll('[data-group]').forEach(x=>{const g=x.dataset.group;x.checked=e.groups[g]!==false&&(g!=='building'||e.layers.building.visible!==false)});document.querySelectorAll('[data-layer-key]').forEach(row=>{row.querySelector('[data-layer-visible]').checked=e.layers[row.dataset.layerKey].visible});syncMunicipalControls();document.querySelectorAll('[data-category]').forEach(b=>b.classList.toggle('active',activeLayer.key===b.dataset.category));}

function renderDistricts(){for(const f of project.features.filter(f=>f.kind==='district'&&featureVisible(f))){const displayColor=featureDisplayColor(project,f);node('path',{d:featurePath(f,true),fill:polygonFill(f,displayColor),'fill-rule':'evenodd','fill-opacity':f.level==='small'?.09:.025,stroke:displayColor,'stroke-width':1.8,'vector-effect':'non-scaling-stroke','stroke-dasharray':`${f.level==='small'?4:10} 5`,'data-id':f.id},mapElement('districtShapes'));if(labelsVisibleInEditor(project,f)){const text=label(f.name,interiorPoint(f.points),displayColor,mapElement('districtShapes'),f.level==='small'?11:14);if(f.level==='tile'&&f.id!==selected){text.setAttribute('data-min-zoom',3);text.style.display=view.scale/fitScale>3?'':'none';}}}}
function renderMap(){renderBaseLayers();renderTerrain();for(const id of ['buildingShapes','interchangeShapes'])mapElement(id).replaceChildren();for(const f of project.features.filter(f=>['building','interchange'].includes(f.kind)&&featureVisible(f))){const color=featureDisplayColor(project,f),host=mapElement(f.kind==='building'?'buildingShapes':'interchangeShapes');if(f.assetPlacement){renderPlacedBuildingAsset(f,host,color);continue;}node(f.kind==='building'&&f.geometryType==='point'?'circle':'path',{...(f.kind==='building'&&f.geometryType==='point'?{cx:f.points[0][0],cy:f.points[0][1],screen:{r:6}}:{d:featurePath(f,true)}),fill:polygonFill(f,color),'fill-rule':'evenodd','fill-opacity':f.kind==='interchange'?.12:.55,stroke:color,'stroke-width':1.5,'vector-effect':'non-scaling-stroke','stroke-dasharray':f.kind==='interchange'?'8 4':'none','data-id':f.id},host);if(labelsVisibleInEditor(project,f))label(f.name,interiorPoint(f.points),color,host,11);}
}
function render(){
 snapIndex=null;assetSnapIndex=null;roadSegmentIndex=null;
 syncOriginControls();zoomAnimator.cancel();viewportScheduler.cancel();updateView();
 renderMap();
 renderedScale=view.scale;
 renderDraft();renderSelection();renderMasterPlan();
}
function renderSelection(){
 const host=$('editShapes');
 host.replaceChildren();
 const f=getSelected();
 if(f&&featureVisible(f)){
  const scale=view.scale,point=f.geometryType==='point'||f.kind==='note';
  const outline={fill:'none',stroke:'#174f55','stroke-width':2.5,'vector-effect':'non-scaling-stroke','pointer-events':'none'};
  if(point)node('circle',{...outline,cx:f.points[0][0],cy:f.points[0][1],screen:{r:8}},host);
  else node('path',{...outline,d:featurePath(f,isPolygonFeature(f)),'stroke-linejoin':'round'},host);
  if(f.assetPlacement){
   if(labelsVisibleInEditor(project,f))label(f.name,[f.poi[0],f.poi[1]-f.assetPlacement.lot[1]/2],'#315b65',host,11,-12);
  }else if(!locked(f)){
   for(const [partIndex,points]of geometryParts(f).entries())for(const [index,p]of points.entries()){
    const active=partIndex===selectedNode?.partIndex&&index===selectedNode?.index;
    node('circle',{cx:p[0],cy:p[1],screen:{r:active?6:4.5},fill:active?'#194f47':'#fff',
     stroke:'#2d6b58','stroke-width':1.8,'vector-effect':'non-scaling-stroke','data-part':partIndex,'data-node':index,'data-id':f.id,cursor:'move'},host);
   }
  }
 }
 if(scopeId){
  const boundary=project.features.find(f=>f.id===scopeId);
  if(boundary&&featureVisible(boundary))node('path',{d:pathData(boundary.points,true),fill:'none',stroke:'#e06b38',
   'stroke-width':3,'vector-effect':'non-scaling-stroke','stroke-dasharray':'10 5','pointer-events':'none'},host);
 }
}
function setTool(next,{keepAssetPanel=false,redraw=true}={}){
 if(next==='asset-place')assetPanelMode='assets';
 else{
  assetSelection=null;assetHover=null;
  if(!keepAssetPanel)assetPanelMode='properties';
 }
 tool=next;draft=[];hover=null;snapPoint=null;selectedNode=null;
 if(next!=='select')selected=null;
 for(const [id,t]of [['selectTool','select'],['panTool','pan'],['measureTool','measure']])$(id).classList.toggle('active',next===t);
 viewport.style.cursor=next==='pan'?'grab':next==='select'?'default':'crosshair';
 $('finishBtn').disabled=true;$('cancelBtn').hidden=true;
 updateStatus();
 if(['building','interchange'].includes(next))$('toolStatus').textContent=`绘制${next==='building'?'功能建筑轮廓':'立交预留范围'} · ${next==='building'&&buildingGeometry==='point'?'1个点位':'至少3点'} · Enter完成`;
 if(redraw){render();renderProperties();}
}
function drawOnLayer(key){
 if(project.settings.editor.layers[key].locked){toast('请先解锁图层');return;}
 if(activeLayer.key!==key||activeLayer.source!=='manual')activateLayer(key);
 beginDrawing();
}
function beginDrawing(){if(!project.settings.editor.layers[activeLayer.key]||activeLayer.key.startsWith('route:')||activeLayer.key.startsWith('terrain:')||activeLayer.key.startsWith('zoning:'))return;if(project.settings.editor.layers[activeLayer.key].locked){toast('请先解锁图层');return}const key=activeLayer.key;setTool(key==='road:interchange'?'interchange':key.split(':')[0]);renderProperties()}
function finish(){const min=tool==='road'||tool==='measure'?2:tool==='building'&&buildingGeometry==='point'?1:3;if(draft.length<min)return;if(tool==='measure'){toast(fmt(length(draft)));return}if(!['road','zone','district','building','interchange'].includes(tool))return;const kind=tool,type=kind==='road'?roadType:kind==='building'?buildingType:zoneType;const f={id:crypto.randomUUID(),kind,type,name:kind==='road'?roadInfo(type).name:kind==='zone'?zoneInfo(type)[1]:kind==='district'?layerName(activeLayer.key):kind==='building'?BUILDINGS.find(b=>b[0]===type)[1]:'立交预留',notes:'',points:structuredClone(draft),source:activeLayer.source};if(kind==='road'){const style=project.settings.editor.roadStyles[type];Object.assign(f,{width:style.width,corridor:style.corridor,structure:type==='metro'?'tunnel':'ground'})}if(kind==='district')Object.assign(f,{level:districtLevel,color:project.settings.editor.layers[activeLayer.key]?.color||'#658c8b'});if(kind==='zone')f.category=zoneClass;if(kind==='building'){f.serviceLevel=buildingLevel;f.geometryType=buildingGeometry;if(buildingGeometry==='point'){f.points=f.points.slice(0,1);f.poi=[...f.points[0]];}const c=project.settings.editor.layers[activeLayer.key]?.color;if(c)f.color=c;}if(scopeId&&kind!=='interchange')f.interchangeId=scopeId;if(isPolygonFeature(f)&&area(f.points)<1){toast('多边形面积太小');return}try{
 const features=kind==='road'?draftRoadFeatures(f):[...project.features,f];
 validateInterchangeBounds({...project,features});
 addFeature(f,features);syncUI();
 }catch(error){toast(error.message);}}
const options=(items,value)=>items.map(([v,n])=>`<option value="${escape(v)}" ${v===value?'selected':''}>${escape(n)}</option>`).join('');
function renderProperties(){if(inspectorMode!=='properties')return;syncAssetPanelTabs();const host=$('propertiesPanel'),f=getSelected();if(assetPanelMode==='assets'){renderAssetLibrary(host);return;}if(f?.assetPlacement){renderPlacedAssetProperties(host,f);renderOriginControls(host,f);return;}document.querySelector('.right-panel').classList.add('has-selection');if(!f){renderLayerProperties(host);return;}
 const isRoad=f.kind==='road',poly=isPolygonFeature(f),isLocked=locked(f),disabled=isLocked?'disabled':'';const fields=`<label class="field-label">名称</label><input id="editName" type="text" value="${escape(f.name)}" maxlength="300" ${disabled}><label class="field-label">显示颜色</label><input id="editColor" type="color" value="${f.color||(isRoad||f.kind==='route'?networkDisplay(f,project.settings.editor,view.scale).color:f.kind==='zone'?classInfo(f)[2]:'#668b85')}" ${disabled}>`;
 host.innerHTML=`<button id="backLayer" class="back-button">← 返回图层对象列表</button><div class="object-kind">${escape(layerName(layerKey(f)))}${isLocked?' · 已锁定':''}</div><h2 class="property-title">${escape(f.name)}</h2><p class="property-hint">${f.geometryType==='point'?'拖动点位调整位置。':'拖动节点调整边界；双击边缘增加节点。'}${selectedNode!==null?'当前节点 '+(selectedNode.index+1):''}</p>${fields}${['road','zone','building'].includes(f.kind)?`<label class="field-label">所属片区</label><select id="editDistrict" ${disabled}>${options([['','未归属'],...project.features.filter(x=>x.kind==='district'&&x.level!=='tile').map(x=>[x.id,x.name])],f.districtId||'')}</select>`:''}${isRoad?`<label class="field-label">路网等级 / 分类</label><select id="editType" ${disabled}>${options(ROADS.filter(r=>r.id!=='bus'||f.type==='bus').map(r=>[r.id,r.name]),f.type)}</select><div class="two-fields"><label class="field-label">路宽 m<input id="editWidth" type="number" min="1" max="1000" value="${f.width}" ${disabled}></label><label class="field-label">走廊 m<input id="editCorridor" type="number" min="1" max="2000" value="${f.corridor}" ${disabled}></label></div><label class="field-label">结构</label><select id="editStructure" ${disabled}>${options([['ground','地面'],['elevated','高架'],['bridge','桥梁'],['tunnel','地下 / 隧道']],f.structure)}</select>${networkCrossingFields(f,disabled)}`:''}${f.kind==='district'?`<label class="field-label">片区等级</label><select id="editLevel" ${disabled}>${options([['large','大片区'],['small','小片区'],['tile','游戏地块']],f.level||'large')}</select>${f.level==='small'?`<label class="field-label">所属大片区</label><select id="editParent" ${disabled}>${options([['','未归属'],...project.features.filter(x=>x.kind==='district'&&(x.level||'large')==='large'&&x.id!==f.id).map(x=>[x.id,x.name])],f.parentId||'')}</select>`:''}`:''}${f.kind==='zone'?`<label class="field-label">区块大类</label><select id="editCategory" ${disabled}>${options(BLOCK_CLASSES,blockClass(f))}</select><label class="field-label">详细用途</label><select id="editType" ${disabled}>${ZONES.map(([g,zs])=>`<optgroup label="${g}">${options(zs,f.type)}</optgroup>`).join('')}</select><label class="field-label">标签（逗号分隔）</label><input id="editTags" type="text" maxlength="1000" value="${escape(f.tags||'')}" ${disabled}>`:''}${f.kind==='building'?`<label class="field-label">建筑功能</label><select id="editType" ${disabled}>${options(BUILDINGS,buildingCategory(f.type))}</select><label class="field-label">服务等级 / 层级</label><input id="editService" type="text" maxlength="100" value="${escape(f.serviceLevel||'基层')}" ${disabled}>`:''}${poly?`<label class="field-label">填充</label><select id="editFill" ${disabled}>${options([['solid','纯色'],['hatch','斜线'],['dots','点状']],f.fillStyle||'solid')}</select><div class="metric-box"><small>面积</small><strong>${fmtArea(area(f.points))}</strong></div>`:''}${isRoad?`<p class="muted">中心线 ${fmt(length(f.points))}</p>`:''}<label class="field-label">限定立交范围</label><select id="editScope" ${disabled}>${options([['','不限定'],...project.features.filter(x=>x.kind==='interchange'&&x.id!==f.id).map(x=>[x.id,x.name])],f.interchangeId||'')}</select><label class="field-label">备注</label><textarea id="editNotes" rows="4" maxlength="20000" ${disabled}>${escape(f.notes)}</textarea>${f.kind==='interchange'?'<div class="dialog-actions"><button id="detailManual">框内细化</button></div>':''}<button id="deleteObject" class="danger-button" ${disabled}>${selectedNode!==null?'删除选中节点':'删除对象'}</button>`;
 renderOriginControls(host,f);
 $('backLayer').onclick=()=>activateLayer(layerKey(f));
 const bind=(id,prop,convert=x=>x)=>{const el=$(id);if(!el)return;el.onchange=()=>{const target=structuredClone(f);target[prop]=convert(el.value);if(prop==='name')target.name=target.name.trim()||f.name;if(prop==='width'){target.corridor=Math.max(target.corridor,target.width);if(target.outlineParts)target.outlineDetached=true;}if(prop==='level'&&target.level==='large'){delete target.parentId;}if(prop==='level'&&target.level==='small'&&project.features.some(x=>x.parentId===f.id)){toast('请先调整下属小片区的归属');renderProperties();return}try{const edited=commitFeatureEdit(f,target);activeLayer={key:layerKey(edited),source:featureSource(project,edited)};buildLayers();syncUI();render();renderProperties();persist()}catch(e){toast(e.message);renderProperties()}}};
 for(const [id,prop]of [['editDistrict','districtId'],['editName','name'],['editColor','color'],['editType','type'],['editStructure','structure'],['editLevel','level'],['editParent','parentId'],['editCategory','category'],['editTags','tags'],['editService','serviceLevel'],['editFill','fillStyle'],['editNotes','notes'],['editScope','interchangeId']])bind(id,prop);bind('editWidth','width',Number);bind('editCorridor','corridor',Number);bind('editStackLevel','stackLevel',v=>v===''?undefined:Number(v));$('deleteObject').onclick=deleteSelected;
 renderObjectAttributes(host,f,isLocked);
 if(f.kind==='district')renderDistrictStatistics(host,f);
 for(const [id,source]of [['detailManual','manual']])if($(id))$(id).onclick=()=>{scopeId=f.id;activateLayer('road:secondary',source)};
}
function renderDistrictStatistics(host,district){
 const details=document.createElement('details');
 details.className='attribute-schema district-statistics';
 details.innerHTML='<summary>片区规划统计</summary>';
 details.addEventListener('toggle',()=>{
  if(!details.open||details.childElementCount>1)return;
  const stats=districtPlanningStats(project,district);
  const rows=(table,name,format)=>[...table].sort((a,b)=>b[1]-a[1])
   .map(([key,value])=>`<div><span>${escape(name(key))}</span><code>${format(value)}</code></div>`).join('');
  const sum=table=>[...table.values()].reduce((total,value)=>total+value,0);
  details.insertAdjacentHTML('beforeend',`<p class="muted">只统计手绘规划。道路按片区内长度，区块和建筑优先按所属片区，未指定时按位置归属。</p>
   <div class="schema-list">
   <div><strong>片区面积</strong><code>${fmtArea(stats.area)}</code></div>
   <div><strong>道路总长</strong><code>${fmt(sum(stats.roads))}</code></div>
   ${rows(stats.roads,key=>roadInfo(key).name,fmt)}
   <div><strong>区块总面积</strong><code>${fmtArea(sum(stats.zones))}</code></div>
   ${rows(stats.zones,key=>BLOCK_CLASSES.find(c=>c[0]===key)?.[1]||key,fmtArea)}
   <div><strong>建筑与设施点位</strong><code>${sum(stats.buildings)} 个</code></div>
   ${rows(stats.buildings,key=>BUILDINGS.find(b=>b[0]===key)?.[1]||key,value=>value+' 个')}
   </div>`);
 });
 host.querySelector('#deleteObject').before(details);
}
function focusObject(f){zoomAnimator.cancel();const xs=f.points.map(p=>p[0]),ys=f.points.map(p=>p[1]),r=viewport.getBoundingClientRect(),w=Math.max(...xs)-Math.min(...xs),h=Math.max(...ys)-Math.min(...ys);view={cx:(Math.max(...xs)+Math.min(...xs))/2,cy:(Math.max(...ys)+Math.min(...ys))/2,scale:Math.min(r.width/(w+500),r.height/(h+500),fitScale*15)};updateView();}
function widthModeField(id,value){return '<label class="field-label">道路宽度显示</label><select id="'+id+'"><option value="actual" '+(value==='actual'?'selected':'')+'>实际宽度（按米）</option><option value="overview" '+(value==='overview'?'selected':'')+'>概览加粗（最小 1 像素）</option></select>';}
function openNetworkSettings(){const e=project.settings.editor,styles=e.roadStyles;
 $('roadDefaults').innerHTML=widthModeField('networkWidthMode',e.widthMode)+'<div class="two-fields"><label class="field-label">铁路基准黑／白段长 (m)<input id="networkRailSegment" type="number" min="2" max="200" value="'+e.railSegment+'"></label><label class="field-label">运营线路宽度 (m)<input id="networkRouteWidth" type="number" min="0.25" max="6" step="0.25" value="'+e.routeWidth+'"></label></div><div class="defaults-row network-palette"><b>分类</b><b>地面</b><b>高架</b><b>隧道</b><b>新路宽 m</b><b>走廊 m</b></div>'+ROADS.filter(r=>r.id!=='bus').map(r=>'<div class="defaults-row network-palette" data-default-road="'+r.id+'"><span>'+r.name+'</span>'+['color','elevatedColor','tunnelColor'].map((k,i)=>'<input type="color" value="'+styles[r.id][k]+'" aria-label="'+r.name+['地面','高架','隧道'][i]+'颜色">').join('')+'<input type="number" min="1" max="1000" value="'+styles[r.id].width+'" aria-label="'+r.name+'默认路宽"><input type="number" min="1" max="2000" value="'+styles[r.id].corridor+'" aria-label="'+r.name+'走廊"></div>').join('');
 $('structureFilters').innerHTML=[['ground','地面'],['elevated','高架'],['bridge','桥梁'],['tunnel','隧道']].map(([v,n])=>'<label class="check-row"><input data-structure="'+v+'" type="checkbox" '+(e.structures[v]?'checked':'')+'>显示'+n+'</label>').join('');$('networkDialog').showModal();
}
const readStyleNumber=(id)=>Number($(id).value);
$('saveNetworkSettings').onclick=()=>{const next=structuredClone(project),e=next.settings.editor;for(const row of document.querySelectorAll('[data-default-road]')){const [c,h,t,w,b]=row.querySelectorAll('input');e.roadStyles[row.dataset.defaultRoad]={color:c.value,elevatedColor:h.value,tunnelColor:t.value,width:Number(w.value),corridor:Number(b.value)}}e.widthMode=$('networkWidthMode').value;e.railSegment=readStyleNumber('networkRailSegment');e.routeWidth=readStyleNumber('networkRouteWidth');for(const el of document.querySelectorAll('[data-structure]'))e.structures[el.dataset.structure]=el.checked;try{const valid=prepareEditor(next);checkpoint();project=valid;$('networkDialog').close();buildLayers();changed()}catch(e){toast(e.message)}};
$('baseSelect').onchange=e=>{project.settings.base=e.target.value;changed()};$('baseImportBtn').onclick=()=>$('baseFile').click();
const readData=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(Error('读取图片失败'));r.readAsDataURL(file)});
const loadImage=src=>new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve(img);img.onerror=()=>reject(Error('图片解码失败'));img.src=src});
$('baseFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;try{if(file.size>80*1024*1024)throw Error('单张底图超过80 MB');const data=await readData(file),img=await loadImage(data);if(img.naturalWidth!==img.naturalHeight)throw Error('请选择正方形底图');const map={id:'custom-'+crypto.randomUUID(),name:file.name,data,width:img.naturalWidth,height:img.naturalHeight};const next=structuredClone(project);next.basemaps.push(map);next.settings.base=map.id;const valid=prepareEditor(next);checkpoint();project=valid;changed();if($('basemapManagerDialog').open)renderBasemapManager();toast('底图已导入，按同一图幅对齐')}catch(error){toast(error.message)}e.target.value=''};
$('corridorsToggle').onchange=e=>{project.settings.corridors=e.target.checked;changed()};
function openProject(){$('projectTitle').value=project.title;$('projectSummary').textContent=`${project.features.length} 个对象 · ${project.basemaps.length} 张自定义底图 · ${project.rasters.length} 张地形 / 水体`;$('projectDialog').showModal()}
$('projectBtn').onclick=openProject;$('projectTitle').onchange=e=>{checkpoint();project.title=e.target.value.trim()||'地图工程';persist();};$('saveProjectBtn').onclick=()=>saveProject();$('saveAsProjectBtn').onclick=()=>saveProject(true);$('saveProjectTop').onclick=()=>saveProject();$('saveAsProjectTop').onclick=()=>saveProject(true);$('openProjectTop').onclick=openProjectFile;document.querySelectorAll('[data-close]').forEach(b=>b.onclick=()=>$(b.dataset.close).close());
$('discardProjectChanges').onclick=()=>{if(pendingProject)installProject(pendingProject);};$('saveThenOpenProject').onclick=async()=>{const next=pendingProject;if(next&&await saveProject())installProject(next);};$('cancelProjectSwitch').onclick=()=>{pendingProject=null;$('unsavedDialog').close();};
function openPngExport(){$('pngResolution').value=project.settings.editor.pngSize;$('pngLabelSize').value=project.settings.editor.labelSize;$('pngStatus').textContent='';$('pngDialog').showModal();}
function exportStage(id,message){
 $(id).textContent=message;
 // Let the dialog paint before synchronous geometry or raster work starts.
 return new Promise(resolve=>setTimeout(resolve,25));
}
function renderPngSvg(size,labelSize){
 const copy=mapTemplate.cloneNode(true);
 const saved={view,fitScale,selected,networkMaskBounds,networkJunctions};
 try{
  mapRoot=copy;
  selected=null;
  view={cx:SIZE/2,cy:SIZE/2,scale:size/SIZE};
  fitScale=view.scale/3;
  networkMaskBounds={x:0,y:0,width:SIZE,height:SIZE};
  renderMap();
 }finally{
  mapRoot=svg;
  ({view,fitScale,selected,networkMaskBounds,networkJunctions}=saved);
 }
 copy.setAttribute('viewBox',`0 0 ${SIZE} ${SIZE}`);
 copy.setAttribute('width',size);copy.setAttribute('height',size);
 copy.querySelector('#masterPlanPreview').remove();
 copy.querySelector('#editShapes').remove();copy.querySelector('#draftShapes').remove();
 copy.querySelectorAll('text').forEach(t=>{
  t.setAttribute('font-family','Microsoft YaHei,Segoe UI,sans-serif');
  t.setAttribute('font-size',labelSize/(size/SIZE));
 });
 copy.querySelectorAll('[stroke="transparent"]').forEach(x=>x.remove());
 return copy;
}
async function exportPng(size,labelSize){
 await exportStage('pngStatus','正在生成地图图层…');
 const copy=renderPngSvg(size,labelSize),title=project.title;
 const image=copy.querySelector('#baseImage');
 if(image.style.display==='none')image.remove();
 else{
  let url=image.getAttribute('href');
  if(!url.startsWith('data:')){
   const response=await fetch(url);
   if(!response.ok)throw Error('底图读取失败');
   url=await readData(await response.blob());
  }
  image.setAttribute('href',url);
 }
 await exportStage('pngStatus','正在绘制图片…');
 const blob=new Blob([new XMLSerializer().serializeToString(copy)],{type:'image/svg+xml;charset=utf-8'});
 const url=URL.createObjectURL(blob),canvas=document.createElement('canvas');
 try{
  const img=await loadImage(url);
  canvas.width=size;canvas.height=size;
  canvas.getContext('2d').drawImage(img,0,0,size,size);
  await exportStage('pngStatus','正在编码 PNG…');
  const png=await new Promise((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(Error('PNG 编码失败')),'image/png'));
  canvas.width=canvas.height=1;
  await exportStage('pngStatus',window.mapDesktop?'请选择 PNG 的保存位置…':'正在下载 PNG…');
  await download(png,`${title}-${size}.png`,'image/png',()=>exportStage('pngStatus','正在写入 PNG…'));
 }finally{
  canvas.width=canvas.height=1;
  URL.revokeObjectURL(url);
 }
}
$('confirmPngBtn').onclick=async()=>{
 if(exporting)return;
 exporting=true;$('confirmPngBtn').disabled=true;
 const source=project,size=Number($('pngResolution').value);
 const labelSize=Math.max(8,Math.min(24,Number($('pngLabelSize').value)||11));
 try{
  await exportPng(size,labelSize);
  if(project===source&&(project.settings.editor.pngSize!==size||project.settings.editor.labelSize!==labelSize)){
   project.settings.editor.pngSize=size;
   project.settings.editor.labelSize=labelSize;
   persist();
  }
  $('pngStatus').textContent='PNG 已导出。';
 }catch(error){
  $('pngStatus').textContent=error.name==='AbortError'?'已取消导出。':'导出失败：'+error.message;
 }finally{
  exporting=false;$('confirmPngBtn').disabled=false;
 }
};
bindMapScrollbars();buildLayers();syncUI();updateUndo();new ResizeObserver(()=>{const r=viewport.getBoundingClientRect(),next=Math.min(r.width/SIZE,r.height/SIZE)*.92;view.scale*=next/fitScale;fitScale=next;render()}).observe(viewport);fit();renderProperties();updateSaveStatus();if(initialTerrainCorrection.changedIds.length){saveBrowser();setTimeout(()=>toast('地形与水体已更正为 saint 数据，规划对象保留'),500);}

$('newProjectBtn').onclick=newProject;
function layerObjects(key){return project.features.filter(f=>GROUPS.some(([id])=>id===key)?groupForLayer(layerKey(f))===key:layerKey(f)===key)}
function renderTerrain(){
 const host=mapElement('terrainShapes'),e=project.settings.editor;
 host.style.display=e.groups.terrain===false?'none':'';if(e.groups.terrain===false){host.replaceChildren();return;}
 for(const id of ['elevation','depth']){
  const r=project.rasters.find(x=>x.id===id);let el=host.querySelector(`[data-raster="${id}"]`);
  if(!r||e.layers['terrain:'+id].visible===false){el?.remove();continue;}
  if(!el)el=node('image',{'data-raster':id,x:0,y:0,width:SIZE,height:SIZE,preserveAspectRatio:'none'},host);
  if(id==='elevation')el.setAttribute('filter','url(#elevationColor)');
  if(el.getAttribute('href')!==r.data)el.setAttribute('href',r.data);
  el.setAttribute('opacity',r.opacity/100);el.style.display=e.layers['terrain:'+id].visible===false?'none':'';
 }
 // Water is always drawn above elevation, regardless of import order.
 const water=host.querySelector('[data-raster="depth"]'),existingSimple=host.querySelector('[data-raster="landwater"]');if(water&&(existingSimple?water.nextElementSibling!==existingSimple:water!==host.lastElementChild))host.insertBefore(water,existingSimple);
 // Derive a flat land/water view from Depth's valid-pixel mask. No extra import.
 const depth=project.rasters.find(r=>r.id==='depth');let simple=host.querySelector('[data-raster="landwater"]');
 if(!depth||e.layers['terrain:landwater'].visible===false){simple?.remove();return;}
 if(!simple){simple=node('g',{'data-raster':'landwater'},host);node('rect',{x:0,y:0,width:SIZE,height:SIZE,'data-simple-land':''},simple);node('image',{x:0,y:0,width:SIZE,height:SIZE,preserveAspectRatio:'none',filter:'url(#simpleWaterMask)','data-simple-water':''},simple);}
 const style=e.simpleTerrain,mask=simple.querySelector('image');
 simple.querySelector('rect').setAttribute('fill',style.landColor);mapElement('simpleWaterColor').setAttribute('flood-color',style.waterColor);
 if(mask.getAttribute('href')!==depth.data)mask.setAttribute('href',depth.data);
 simple.setAttribute('opacity',style.opacity/100);simple.style.display=e.layers['terrain:landwater'].visible===false?'none':'';
 if(simple!==host.lastElementChild)host.appendChild(simple);
}
let terrainImporting=false,terrainTarget=null;
function chooseTerrainFile(folder=false){
 if(folder){chooseCartoFolder();return;}
 if(terrainImporting)return;
 terrainTarget=activeLayer.key.startsWith('terrain:')?activeLayer.key.split(':')[1]:null;
 if(terrainTarget==='landwater')terrainTarget='depth';
 $(folder?'terrainFolder':'terrainFile').click();
}
async function importTerrainFiles(files,folder=false){
 if(terrainImporting)return;
 const candidates=[...files].filter(f=>folder?terrainType(f.name):/\.tiff?$/i.test(f.name));
 if(!candidates.length){toast('请选择 Elevation.tif 或 Depth.tif');return;}
 terrainImporting=true;renderProperties();toast('正在读取地形与水体数据…');const startProject=project;
 try{
  const replacements=[],rawReplacements=new Map(),ids=new Set();
  for(const file of candidates){
   const id=terrainType(file.name)||(candidates.length===1?terrainTarget:null);
   if(!id)throw Error('请保留 Elevation / Depth 文件名，或先选择对应的地形子图层');
   if(ids.has(id))throw Error('一次只能为每个图层导入一张 TIFF');ids.add(id);
   if(project.settings.editor.layers['terrain:'+id].locked)throw Error(`${layerName('terrain:'+id)} 已锁定，请先解锁`);
   if(file.size>128*1024*1024)throw Error('单张 GeoTIFF 超过 128 MB');
   const rawBytes=new Uint8Array(await file.arrayBuffer()),raster=readTerrainTiff(rawBytes.buffer);
   if(project!==startProject)throw Error('工程已切换，请重新导入');
   const others=[...project.rasters.filter(r=>r.id!==id),...replacements.filter(r=>r.id!==id)];
   checkTerrainExtent(raster.metadata,SIZE,others);
   rawReplacements.set(id,rawBytes);const preview=terrainPixels(raster,id),canvas=document.createElement('canvas');canvas.width=preview.width;canvas.height=preview.height;
   canvas.getContext('2d').putImageData(new ImageData(preview.pixels,preview.width,preview.height),0,0);
   const data=canvas.toDataURL('image/png');canvas.width=canvas.height=1;
   replacements.push({id,name:layerName('terrain:'+id),fileName:file.name,width:preview.width,height:preview.height,opacity:id==='depth'?85:100,data,metadata:raster.metadata});
  }
  const next=structuredClone(project);next.rasters=[...next.rasters.filter(r=>!ids.has(r.id)),...replacements];next.settings.editor.groups.terrain=true;
  for(const id of ids)next.settings.editor.layers['terrain:'+id].visible=true;
  const valid=prepareEditor(next);checkpoint();project=valid;for(const [id,raw]of rawReplacements)terrainFiles.set(id+':'+terrainFingerprint(replacements.find(r=>r.id===id).data),raw);cacheProjectAssets();changed();toast(`已导入 ${replacements.map(r=>r.name).join('、')}，随工程保存`);
 }catch(error){toast('导入失败：'+error.message);}
 finally{terrainImporting=false;renderProperties();}
}
$('terrainFile').onchange=async e=>{await importTerrainFiles(e.target.files);e.target.value='';};
$('terrainFolder').onchange=async e=>{await importTerrainFiles(e.target.files,true);e.target.value='';};
function renderTerrainProperties(host){
 if(activeLayer.key==='terrain:landwater'){renderSimpleTerrainProperties(host);return;}
 const key=activeLayer.key,isGroup=key==='terrain',e=project.settings.editor,children=layerKeysForGroup('terrain'),id=key.split(':')[1],r=project.rasters.find(x=>x.id===id),layer=e.layers[key];
 const locked=isGroup?children.every(k=>e.layers[k].locked):layer.locked,visible=e.groups.terrain!==false&&(isGroup||layer.visible);
 const disabled=terrainImporting||locked?'disabled':'';
 const m=r?.metadata,number=n=>Number(n.toFixed(3)).toLocaleString('zh-CN');
 host.innerHTML=`${!isGroup?'<button id="backGroup" class="back-button">← 返回地形</button>':''}<div class="object-kind">图层属性 · GeoTIFF</div><h2 class="property-title">${escape(layerName(key))}</h2>
 <div class="layer-toggles"><label class="check-row"><input id="terrainVisible" type="checkbox" ${visible?'checked':''}>显示图层</label><label class="check-row"><input id="terrainLocked" type="checkbox" ${locked?'checked':''}>${isGroup?'锁定全部子层':'锁定图层'}</label></div>
 ${isGroup?`<div class="layer-subcategories">${children.map(k=>`<button data-terrain-layer="${k}">${escape(layerName(k))} <small>${project.rasters.some(x=>x.id===(k==='terrain:landwater'?'depth':k.split(':')[1]))?(k==='terrain:landwater'?'可用':'已导入'):'未导入'}</small></button>`).join('')}</div>`:''}
 <button id="importTerrain" class="wide-button primary" ${disabled}>${terrainImporting?'正在读取…':r?'替换 GeoTIFF':'＋ 导入 GeoTIFF'}</button>${isGroup?`<button id="importTerrainFolder" class="wide-button" ${disabled}>导入 Carto 文件夹</button>`:''}
 <p class="muted">${isGroup?'自动识别 Elevation.tif 地形和 Depth.tif 水体。文件夹导入同时识别 Shapefile 图层。':id==='depth'?'按水深着色，无数据区域透明显示。':'按高程着色，以自然绿和暖土色表现地势，增强色彩对比。'}地形与水体显示在底图上方、规划图层下方。</p>
 ${r?`<label class="range-row">透明度<input id="terrainOpacity" type="range" min="0" max="100" value="${r.opacity}" ${locked?'disabled':''}><output id="terrainOpacityValue">${r.opacity}%</output></label><dl class="raster-metadata"><dt>源文件</dt><dd>${escape(r.fileName)}</dd>${r.source?.dataset?'<dt>数据来源</dt><dd>'+escape(r.source.dataset)+'</dd>':''}<dt>原始分辨率</dt><dd>${m.width} × ${m.height}</dd><dt>数值范围</dt><dd>${number(m.min)} ～ ${number(m.max)}</dd><dt>有效像元</dt><dd>${(m.validCount/(m.width*m.height)*100).toFixed(2)}%</dd><dt>无数据值</dt><dd>${m.noData===null?'未标记':m.noData}</dd><dt>像元尺寸</dt><dd>${m.pixelSize?m.pixelSize.map(number).join(' × ')+' m':'未提供'}</dd><dt>坐标系</dt><dd>${escape(m.crs||'未提供')}</dd><dt>覆盖范围</dt><dd>${m.bounds?number((m.bounds[2]-m.bounds[0])/1000)+' × '+number((m.bounds[3]-m.bounds[1])/1000)+' km':'按完整地图对齐'}</dd></dl><div class="terrain-legend ${id}"></div><p class="muted">低值 → 高值</p><button id="removeTerrain" class="danger-button" ${locked?'disabled':''}>移除此地形图层数据</button>`:isGroup?`<p class="muted">3 个显示图层 · 已导入 ${project.rasters.length} / 2 张原始数据。陆地／水体简图由 Depth 自动生成；各层可单独显示，随工程保存。</p>`:'<p class="muted">尚未导入。支持 Carto 单波段、未压缩的正方形 GeoTIFF。</p>'}`;
 if($('backGroup'))$('backGroup').onclick=()=>activateLayer('terrain');
 $('terrainVisible').onchange=ev=>{checkpoint();if(isGroup)e.groups.terrain=ev.target.checked;else{layer.visible=ev.target.checked;if(layer.visible)e.groups.terrain=true;}changed();};
 $('terrainLocked').onchange=ev=>{checkpoint();if(isGroup)children.forEach(k=>e.layers[k].locked=ev.target.checked);else layer.locked=ev.target.checked;changed();};
 $('importTerrain').onclick=()=>chooseTerrainFile();if($('importTerrainFolder'))$('importTerrainFolder').onclick=()=>chooseTerrainFile(true);
 for(const b of host.querySelectorAll('[data-terrain-layer]'))b.onclick=()=>activateLayer(b.dataset.terrainLayer);
 if($('terrainOpacity')){const input=$('terrainOpacity');input.onpointerdown=()=>checkpoint();input.onkeydown=ev=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(ev.key))checkpoint();};input.oninput=ev=>{r.opacity=Number(ev.target.value);$('terrainOpacityValue').textContent=r.opacity+'%';renderTerrain();persist();};}
 if($('removeTerrain'))$('removeTerrain').onclick=()=>{checkpoint();project.rasters=project.rasters.filter(x=>x.id!==id);changed();toast('图层数据已移除，可撤销恢复');};
}
function renderSimpleTerrainProperties(host){
 const e=project.settings.editor,layer=e.layers['terrain:landwater'],style=e.simpleTerrain,depth=project.rasters.find(r=>r.id==='depth'),disabled=layer.locked?'disabled':'';
 host.innerHTML=`<button id="backGroup" class="back-button">← 返回地形</button><div class="object-kind">图层属性 · 简图</div><h2 class="property-title">陆地／水体简图</h2>
 <div class="layer-toggles"><label class="check-row"><input id="simpleVisible" type="checkbox" ${e.groups.terrain!==false&&layer.visible?'checked':''}>显示图层</label><label class="check-row"><input id="simpleLock" type="checkbox" ${layer.locked?'checked':''}>锁定图层</label></div>
 <p class="muted">陆地和水体各用一种纯色，只显示海岸线、河流和岛屿边界。根据 Depth 自动生成，无需再次导入。开启时显示在彩色地形与水深上方。</p>
 ${depth?`<div class="two-fields"><label class="field-label">陆地颜色<input id="simpleLandColor" type="color" value="${style.landColor}" ${disabled}></label><label class="field-label">水体颜色<input id="simpleWaterEdit" type="color" value="${style.waterColor}" ${disabled}></label></div><label class="range-row">透明度<input id="simpleOpacity" type="range" min="0" max="100" value="${style.opacity}" ${disabled}><output id="simpleOpacityValue">${style.opacity}%</output></label><div class="simple-terrain-legend"><span><i style="background:${style.landColor}"></i>陆地</span><span><i style="background:${style.waterColor}"></i>水体</span></div><dl class="raster-metadata"><dt>边界来源</dt><dd>${escape(depth.source?.dataset?depth.source.dataset+' / '+depth.fileName:depth.fileName)}</dd><dt>源分辨率</dt><dd>${depth.metadata.width} × ${depth.metadata.height}</dd></dl>`:`<p class="muted">请先导入 Depth.tif，才能识别陆地与水体。</p><button id="simpleImportDepth" class="wide-button primary" ${disabled}>导入 Depth 水体数据</button>`}`;
 $('backGroup').onclick=()=>activateLayer('terrain');
 $('simpleVisible').onchange=ev=>{checkpoint();layer.visible=ev.target.checked;if(layer.visible)e.groups.terrain=true;changed();};
 $('simpleLock').onchange=ev=>{checkpoint();layer.locked=ev.target.checked;changed();};
 for(const [id,key] of [['simpleLandColor','landColor'],['simpleWaterEdit','waterColor']])if($(id))$(id).onchange=ev=>{checkpoint();style[key]=ev.target.value;changed();};
 if($('simpleOpacity')){const input=$('simpleOpacity');input.onpointerdown=()=>checkpoint();input.onkeydown=ev=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End','PageUp','PageDown'].includes(ev.key))checkpoint();};input.oninput=ev=>{style.opacity=Number(ev.target.value);$('simpleOpacityValue').textContent=style.opacity+'%';renderTerrain();persist();};}
 if($('simpleImportDepth'))$('simpleImportDepth').onclick=()=>chooseTerrainFile();
}
let cartoBusy=false,pendingCarto=null,cartoOrigin=null,cartoRequest=0;
function chooseCartoFolder(){if(!cartoBusy)$('cartoFolder').click();}
$('cartoFolderBtn').onclick=chooseCartoFolder;
$('cartoDialog').addEventListener('close',()=>{cartoRequest++;pendingCarto=null;});
$('cartoFolder').onchange=async ev=>{
 const files=[...ev.target.files];ev.target.value='';if(!files.length||cartoBusy)return;
 const request=++cartoRequest;cartoBusy=true;pendingCarto=null;cartoOrigin=project;
 $('cartoApply').disabled=true;$('cartoStatus').textContent='正在识别文件、读取属性并匹配几何…';$('cartoReport').replaceChildren();$('cartoDialog').showModal();
 try{
  const result=await inspectCartoFolder(files,{existingRasters:project.rasters});if(request!==cartoRequest)return;pendingCarto=result;
  $('cartoReport').innerHTML=`<div class="metric-box"><strong>${result.features.length} 个规划对象 · ${result.rasters.length} 张地形数据</strong><span>已配对 ${result.pairedOutlines} 组路网中心线与轮廓、${result.pairedPoi} 组建筑与 POI。</span></div><table class="carto-table"><thead><tr><th>源图层</th><th>归入</th><th>源对象数</th></tr></thead><tbody>${result.table.map(r=>`<tr><td>${escape(r.layer)}</td><td>${escape(r.target)}</td><td>${r.records}</td></tr>`).join('')}</tbody></table><p class="muted">更新 Carto 游戏现状；替换本次包含的源图层中的旧对象（包括游戏中已删除的对象），保留手绘对象。游戏地块默认隐藏，可在“地块 Area”下打开。</p>${result.warnings.length?'<ul class="carto-notes">'+result.warnings.map(s=>'<li>'+escape(s)+'</li>').join('')+'</ul>':''}`;
  $('cartoStatus').textContent='识别完成。空图层已识别，0 个对象不会生成占位对象。';$('cartoApply').disabled=false;
 }catch(error){if(request===cartoRequest)$('cartoStatus').textContent='导入未进行：'+error.message;}
 finally{cartoBusy=false;}
};
$('cartoApply').onclick=()=>{
 if(!pendingCarto||cartoBusy)return;
 if(project!==cartoOrigin){$('cartoStatus').textContent='当前工程已变化，请重新选择 Carto 文件夹。';return;}
 try{
  const stored=pendingCarto.rasters.map(({preview,rawBytes,...r})=>{const canvas=document.createElement('canvas');canvas.width=preview.width;canvas.height=preview.height;canvas.getContext('2d').putImageData(new ImageData(preview.pixels,preview.width,preview.height),0,0);const data=canvas.toDataURL('image/png');canvas.width=canvas.height=1;return {...r,data};});
  const result=mergeCartoImport(project,pendingCarto,stored);for(const r of pendingCarto.rasters)if(r.rawBytes)terrainFiles.set(r.id+':'+terrainFingerprint(stored.find(s=>s.id===r.id).data),r.rawBytes);cacheProjectAssets();checkpoint();project=result.project;selected=null;selectedNode=null;scopeId='';activeLayer={key:'network',source:'manual'};setTool('select');buildLayers();changed();const count=pendingCarto.features.length;$('cartoDialog').close();toast(`Carto 已导入：${count} 个对象，更新 ${result.replaced} 个旧导入对象`);
 }catch(error){$('cartoStatus').textContent='未写入工程：'+error.message;}
};
function layerSchemaHtml(key){const fields=fieldsForLayer(key);return fields.length?`<details class="attribute-schema"><summary>图层属性字段 · ${fields.length}</summary><div class="schema-list">${fields.map(([id,name])=>`<div><span>${name}</span><code>${id}</code></div>`).join('')}</div></details>`:''}
function attributeValue(f,key){
 if(key==='Name')return f.name;
 if(key==='Area'&&isPolygonFeature(f))return area(f.points);
 if(key==='Color')return f.color||'';
 if(f.kind==='road'){
  if(key==='Width')return f.width;
  if(key==='Length')return length(f.points);
  if(key==='Form')return ({ground:'Normal',elevated:'Elevated',bridge:'Elevated',tunnel:'Tunnel'})[f.structure];
 }
 return f.attributes?.[key]??'';
}
function renderObjectAttributes(host,f,isLocked){
 const fields=fieldsForLayer(layerKey(f));if(!fields.length)return;
 const derived=key=>['Name','Color'].includes(key)||key==='Area'&&isPolygonFeature(f)||f.kind==='road'&&['Width','Length','Form'].includes(key);
 const section=document.createElement('div');section.className='object-attributes';
 section.innerHTML=`${f.kind==='building'?`<details class="attribute-schema" open><summary>轮廓与 POI 点位</summary><p class="muted">${isPolygonFeature(f)?'建筑轮廓：'+f.points.length+' 个节点':'POI 点对象：1 个位置'}</p><div class="two-fields"><label class="field-label">POI X (m)<input id="editPoiX" type="number" min="0" max="${SIZE}" step="any" value="${f.poi?.[0]??(f.geometryType==='point'?f.points[0][0]:'')}" ${isLocked?'disabled':''}></label><label class="field-label">POI Y (m)<input id="editPoiY" type="number" min="0" max="${SIZE}" step="any" value="${f.poi?.[1]??(f.geometryType==='point'?f.points[0][1]:'')}" ${isLocked?'disabled':''}></label></div><button id="savePoi" class="wide-button" ${isLocked?'disabled':''}>保存 POI 位置</button></details>`:''}<details class="attribute-schema" open><summary>游戏 / Carto 属性 · ${fields.length}</summary><div class="attribute-fields">${fields.map(([key,name,type])=>`<label class="field-label">${name}<small>${key}</small><input data-attribute="${key}" aria-label="${name} ${key}" type="${type}" ${type==='number'?'step="any"':''} maxlength="20000" value="${escape(attributeValue(f,key))}" ${isLocked||derived(key)?'disabled':''}></label>`).join('')}</div><button id="saveObjectAttributes" class="wide-button" ${isLocked?'disabled':''}>保存游戏属性</button><p class="muted">空白表示未提供；修改后点击保存游戏属性。名称、颜色、面积和线路尺寸随上方属性同步。</p></details>`;
 host.insertBefore(section,$('deleteObject'));if(f.carto){const details=document.createElement('details');details.className='attribute-schema';details.innerHTML='<summary>Carto 来源与关联轮廓</summary><p class="muted">'+escape(f.carto.layers.join(' + '))+' · '+escape(f.carto.crs)+' · '+escape(f.carto.encoding)+'</p>'+(f.outlineParts?'<p class="muted">路网轮廓：'+f.outlineParts.reduce((n,p)=>n+p.length,0)+' 个节点'+(f.outlineDetached?'；中心线已编辑，原轮廓暂时隐藏':'')+'</p>':'')+(f.additionalParts?'<p class="muted">附加边界：'+f.additionalParts.length+' 组</p>':'')+['outlineAttributes','poiAttributes'].filter(k=>f[k]).map(k=>'<h4>'+(k==='outlineAttributes'?'轮廓原始属性':'POI 原始属性')+'</h4><div class="schema-list">'+Object.entries(f[k]).map(([n,v])=>'<div><span>'+escape(n)+'</span><span>'+escape(v??'')+'</span></div>').join('')+'</div>').join('');host.insertBefore(details,$('deleteObject'));}
 const commit=update=>{try{const target=structuredClone(f);update(target);commitFeatureEdit(f,target);changed()}catch(error){toast(error.message);renderProperties()}};
 $('saveObjectAttributes').onclick=()=>commit(target=>{target.attributes={...(target.attributes||{})};for(const el of section.querySelectorAll('[data-attribute]:not(:disabled)')){if(el.value==='')delete target.attributes[el.dataset.attribute];else target.attributes[el.dataset.attribute]=el.type==='number'?Number(el.value):el.value;}});
 if($('savePoi'))$('savePoi').onclick=()=>commit(target=>{const x=$('editPoiX').value,y=$('editPoiY').value;if(x===''&&y===''&&target.geometryType!=='point'){delete target.poi;return}if(x===''||y==='')throw Error('请同时填写 POI 的 X、Y 坐标');target.poi=[Number(x),Number(y)];if(target.geometryType==='point')target.points=[[...target.poi]]});
}
function renderLayerProperties(host){
 if(groupForLayer(activeLayer.key)==='terrain'){renderTerrainProperties(host);return;}
 const key=activeLayer.key,e=project.settings.editor,isGroup=GROUPS.some(([id])=>id===key),group=groupForLayer(key),layer=e.layers[key],items=layerObjects(key).filter(f=>key!=='building:municipal'||!activeMunicipalClass||municipalClass(f)===activeMunicipalClass),style=key.startsWith('road:')&&key!=='road:interchange'?e.roadStyles[key.split(':')[1]]:null;
 const childKeys=isGroup?layerKeysForGroup(key):[],isLocked=isGroup?childKeys.every(k=>e.layers[k].locked):layer.locked;
 const visible=e.groups[group]!==false&&(isGroup||layer.visible)&&(key!=='building:municipal'||!activeMunicipalClass||municipalVisible(e,activeMunicipalClass));
 host.innerHTML=`${!isGroup?`<button id="backGroup" class="back-button">← 返回${escape(layerName(group))}</button>`:''}<div class="object-kind">图层属性</div><h2 class="property-title">${escape(key==='building:municipal'&&activeMunicipalClass?MUNICIPAL_TYPES.find(([id])=>id===activeMunicipalClass)?.[1]:layerName(key))}<small class="layer-object-count">${items.length} 个对象</small></h2>
 ${scopeId?'<p class="scope-banner">正在立交框内细化 <button id="exitScope">退出范围</button></p>':''}
 <div class="layer-toggles"><label class="check-row"><input id="layerVisibleEdit" type="checkbox" ${visible?'checked':''}>显示图层</label><label class="check-row"><input id="layerLock" type="checkbox" ${isLocked?'checked':''}>${isGroup?'锁定全部子层':'锁定图层'}</label></div>
 ${layerLabelsToggleHtml(key)}
 ${style?`<div class="structure-colors"><label>地面<input id="layerColorEdit" type="color" value="${style.color}" aria-label="地面颜色"></label><label>高架／桥梁<input id="layerElevatedColor" type="color" value="${style.elevatedColor}" aria-label="高架颜色"></label><label>隧道<input id="layerTunnelColor" type="color" value="${style.tunnelColor}" aria-label="隧道颜色"></label></div>${key==='road:rail'?'<p class="muted">连续黑轨＋白色内块；段长随路宽等比例变化，可在统一设定中调整。</p>':''}<div class="two-fields"><label class="field-label">新建路宽 (m)<input id="layerWidthEdit" type="number" min="1" max="1000" value="${style.width}"></label><label class="field-label">新建走廊 (m)<input id="layerCorridorEdit" type="number" min="1" max="2000" value="${style.corridor}"></label></div>`:!isGroup&&key!=='zone'?`<label class="field-label" for="layerColorEdit">小类统一显示颜色</label><input id="layerColorEdit" type="color" value="${layer.color||defaultLayerColor(key)}">`:''}
 ${key==='network'?widthModeField('layerWidthMode',e.widthMode)+'<p class="muted">按对象路宽（米）显示；缩小后细路会变细。概览模式仅增加最小可见宽度。</p>':''}${key==='route'?'<label class="field-label">运营线路宽度 (m)<input id="routeWidthEdit" type="number" min="0.25" max="6" step="0.25" value="'+e.routeWidth+'"></label><p class="muted">细线叠在路网之上，按米宽随比例缩放。</p>':''}${key==='zone'?`<div class="two-fields"><div><label class="field-label" for="newClass">新建区块大类</label><select id="newClass">${options(BLOCK_CLASSES,zoneClass)}</select></div><div><label class="field-label" for="newZoneType">详细用途</label><select id="newZoneType">${ZONES.map(([n,z])=>`<optgroup label="${n}">${options(z,zoneType)}</optgroup>`).join('')}</select></div></div><label class="range-row">图层透明度<input id="layerOpacityEdit" type="range" min="10" max="85" value="${project.settings.zoneOpacity}"><output id="layerOpacityValue">${project.settings.zoneOpacity}%</output></label>`:''}
 ${key.startsWith('building:')?`<label class="field-label" for="newBuildingGeometry">新建对象几何</label><select id="newBuildingGeometry">${options([['polygon','建筑轮廓（多边形）'],['point','POI 设施点位']],buildingGeometry)}</select>`:''}
 ${isGroup?`<div class="layer-subcategories">${childKeys.map(k=>`<button data-child-layer="${k}">${escape(layerName(k))} <small>${layerObjects(k).length}</small></button>`).join('')}</div>${key==='network'?'<label class="check-row"><input id="networkOutlinesToggle" type="checkbox" '+(e.networkOutlines!==false?'checked':'')+'>放大后显示导入路网轮廓</label><button id="layerNetworkSettings" class="wide-button">路网统一设定 ⚙</button>':''}`:`<button id="drawLayer" class="wide-button primary" ${key.startsWith('route:')||key.startsWith('zoning:')?'disabled':''}>＋ ${tool==='select'?'绘制新对象':'正在绘制 · Enter 完成'}</button>`}
 ${key==='building:municipal'?municipalControlsHtml():''}${isGroup&&['area','network','building','route'].includes(key)?groupPaletteHtml(key):''}${layerSchemaHtml(key)}<div class="object-list-heading"><span>对象列表</span><small>${items.length}</small></div><input id="objectSearch" type="text" aria-label="搜索当前图层对象" placeholder="按名称查找" value="${escape(listQuery)}">
 <div id="objectList"></div>`;
 if(key==='building:municipal')bindMunicipalControls(host);
 if($('backGroup'))$('backGroup').onclick=()=>activateLayer(activeMunicipalClass?'building:municipal':group);
 $('layerVisibleEdit').onchange=ev=>{checkpoint();if(key==='building:municipal'&&activeMunicipalClass)e.municipalVisibility[activeMunicipalClass]=ev.target.checked;else if(isGroup)e.groups[key]=ev.target.checked;else{layer.visible=ev.target.checked;if(ev.target.checked)e.groups[group]=true}changed()};
 $('layerLabelsVisible').onchange=ev=>{checkpoint();if(isGroup){e.groupLabels[key]=ev.target.checked;if(ev.target.checked&&!childKeys.some(k=>e.layers[k].labelsVisible))childKeys.forEach(k=>e.layers[k].labelsVisible=true);}else{layer.labelsVisible=ev.target.checked;if(ev.target.checked)e.groupLabels[group]=true;}changed();};
 $('layerLock').onchange=ev=>{checkpoint();if(isGroup)childKeys.forEach(k=>e.layers[k].locked=ev.target.checked);else layer.locked=ev.target.checked;changed()};
 bindGroupPalette(host);
 if($('drawLayer'))$('drawLayer').onclick=beginDrawing;
 if($('layerNetworkSettings'))$('layerNetworkSettings').onclick=openNetworkSettings;
 if($('layerWidthMode'))$('layerWidthMode').onchange=ev=>{checkpoint();e.widthMode=ev.target.value;changed();};
 if($('routeWidthEdit'))$('routeWidthEdit').onchange=ev=>{const next=structuredClone(project);next.settings.editor.routeWidth=Number(ev.target.value);try{const valid=prepareEditor(next);checkpoint();project=valid;changed();}catch(error){toast(error.message);renderProperties();}};
 if($('networkOutlinesToggle'))$('networkOutlinesToggle').onchange=ev=>{checkpoint();e.networkOutlines=ev.target.checked;changed();};
 for(const b of host.querySelectorAll('[data-child-layer]'))b.onclick=()=>activateLayer(b.dataset.childLayer);
 const saveStyle=()=>{const next=structuredClone(project),target=style?next.settings.editor.roadStyles[key.split(':')[1]]:next.settings.editor.layers[key];target.color=$('layerColorEdit').value;if(style){next.settings.editor.layers[key].color=target.color;target.elevatedColor=$('layerElevatedColor').value;target.tunnelColor=$('layerTunnelColor').value;target.width=Number($('layerWidthEdit').value);target.corridor=Number($('layerCorridorEdit').value)}try{const valid=prepareEditor(next);checkpoint();project=valid;buildLayers();changed()}catch(err){toast(err.message);renderProperties()}};
 for(const id of ['layerColorEdit','layerElevatedColor','layerTunnelColor','layerWidthEdit','layerCorridorEdit'])if($(id))$(id).onchange=saveStyle;
 if($('newClass'))$('newClass').onchange=ev=>zoneClass=ev.target.value;
 if($('newZoneType'))$('newZoneType').onchange=ev=>zoneType=ev.target.value;
 if($('newBuildingGeometry'))$('newBuildingGeometry').onchange=ev=>buildingGeometry=ev.target.value;
 if($('layerOpacityEdit'))$('layerOpacityEdit').oninput=ev=>{project.settings.zoneOpacity=Number(ev.target.value);$('layerOpacityValue').textContent=ev.target.value+'%';$('zoneOpacity').value=ev.target.value;$('zoneOpacityValue').textContent=ev.target.value+'%';render();persist()};
 const byId=new Map(items.map(f=>[f.id,f]));
 const list=$('objectList'),pageSize=100;
 let matches=[],shown=0;
 function appendObjects(){
  list.querySelector('[data-more-objects]')?.remove();
  const page=matches.slice(shown,shown+pageSize);
  shown+=page.length;
  list.insertAdjacentHTML('beforeend',page.map(f=>`<button data-object="${escape(f.id)}" class="object-item"><span>${escape(f.name)} <i class="origin-badge">${originForFeature(f)==='carto'?'现状':f.planningStatus==='built'?'已实施':'规划'}</i></span><small>${isGroup?escape(layerName(layerKey(f))):f.points.length+' 节点'}</small></button>`).join(''));
  if(shown<matches.length)list.insertAdjacentHTML('beforeend',`<button class="wide-button" data-more-objects>显示更多 · 还有 ${matches.length-shown} 个</button>`);
 }
 function searchObjects(){
  const query=listQuery.trim().toLowerCase();
  matches=items.filter(f=>f.name.toLowerCase().includes(query));
  shown=0;
  list.innerHTML=matches.length?'':`<p class="muted">${items.length?'没有匹配的对象。':'此图层还没有对象。'}</p>`;
  appendObjects();
 }
 $('objectSearch').oninput=ev=>{listQuery=ev.target.value;searchObjects();};
 list.onclick=ev=>{
  if(ev.target.closest('[data-more-objects]')){appendObjects();return;}
  const feature=byId.get(ev.target.closest('[data-object]')?.dataset.object);
  if(!feature)return;
  const scale=view.scale;
  focusObject(feature);
  selectFeature(feature);
  if(!(project.proposal&&project.settings.notesVisible)&&scale!==view.scale)viewportScheduler.schedule();
  if(!featureVisible(feature))toast('已定位，当前对象受图层或数据来源开关隐藏');
  document.querySelector('.right-scroll').scrollTop=0;
 };
 searchObjects();
 if($('exitScope'))$('exitScope').onclick=()=>{scopeId='';render();renderProperties()};
}

let cartoExportPreview=null;
$('cartoExportDialog').addEventListener('close',()=>{
 if(!$('cartoExportDialog').open)cartoExportPreview=null;
});
$('exportCartoBtn').onclick=async()=>{
 if(exportCartoBusy||$('cartoExportDialog').open)return;
 const source=project,revision=editRevision;
 cartoExportPreview=null;
 $('confirmCartoExport').disabled=true;
 $('cartoExportRows').replaceChildren();
 const dialog=$('cartoExportDialog');
 dialog.showModal();
 await exportStage('cartoExportStatus','正在统计七个图层…');
 if(!dialog.open)return;
 try{
  const report=cartoExportRecords(source);
  cartoExportPreview={report,revision};
  $('cartoExportRows').innerHTML=CARTO_EXPORT_LAYERS.map(([name])=>'<tr><td>'+name+'</td><td>'+report.records[name].length+'</td></tr>').join('');
  $('cartoExportStatus').textContent='包含全部规划对象，隐藏的图层也会导出。';
  $('confirmCartoExport').disabled=false;
 }catch(error){$('cartoExportStatus').textContent='预览失败：'+error.message;}
};
$('confirmCartoExport').onclick=async()=>{
 if(exportCartoBusy||!cartoExportPreview)return;
 if(cartoExportPreview.revision!==editRevision){
  $('cartoExportStatus').textContent='工程已变化，请关闭窗口后重新预览。';return;
 }
 exportCartoBusy=true;$('confirmCartoExport').disabled=true;
 const {report,revision}=cartoExportPreview,title=project.title;
 const includeTerrain=$('cartoIncludeTerrain').checked;
 try{
  await exportStage('cartoExportStatus','正在生成七个图层及配套文件…');
  if(includeTerrain)await ensureTerrainFiles();
  if(revision!==editRevision)throw Error('工程已变化，请重新预览');
  const terrain=includeTerrain?activeTerrainFiles():new Map();
  const result=packCartoRecords(report,{terrainFiles:terrain,includeTerrain});
  await exportStage('cartoExportStatus',window.mapDesktop?'请选择 Carto ZIP 的保存位置…':'正在下载 Carto ZIP…');
  await download(result.bytes,title.replace(/[\\/:*?"<>|]/g,'-')+'-Carto.zip','application/zip',
   ()=>exportStage('cartoExportStatus','正在写入 Carto ZIP…'));
  $('cartoExportStatus').textContent=['已导出七组 Shapefile。',...result.warnings,
   ...(includeTerrain&&!terrain.size?['本工程没有原始 GeoTIFF，可通过 Carto 文件夹导入补齐。']:[])].join(' ');
 }catch(error){
  $('cartoExportStatus').textContent=error.name==='AbortError'?'已取消导出。':'导出未完成：'+error.message;
 }finally{exportCartoBusy=false;$('confirmCartoExport').disabled=false;}
};
$('cartoExportPng').onclick=()=>{$('cartoExportDialog').close();openPngExport();};

// Building catalogs contain only the footprint and the dimensions needed for planning.
function syncAssetPanelTabs(){
 if(!$('assetsTab'))return;const assets=assetPanelMode==='assets';$('assetsTab').setAttribute('aria-selected',String(assets));$('propertiesTab').setAttribute('aria-selected',String(!assets));$('inspectorHeading').textContent=assets?'建筑资产':'图层属性与对象';
}
function renderAssetPackages(){
 const host=$('assetPackageList');if(!host)return;
 const packs=buildingPacksFor(project),query=$('assetPackSearch').value.trim().toLowerCase();
 const total=items=>items.reduce((n,pack)=>n+pack.assets.length,0);
 $('assetLibraryCount').textContent=assetCount.format(total(packs))+' 栋';
 const groups={base:[],dlc:[],official:[],'third-party':[]};
 for(const [index,pack] of packs.entries()){
  if(query&&!(pack.name+' '+(pack.dlc||'')).toLowerCase().includes(query))continue;
  const group=pack.id==='blob'?'base':pack.builtinGroup==='dlc'?'dlc':
   pack.builtinGroup==='official'||pack.assetGroup==='official'?'official':'third-party';
  groups[group].push({pack,index});
 }
 const packRow=({pack,index})=>{
  const active=assetPanelMode==='assets'&&assetPackId===pack.id;
  return `<button class="asset-package ${active?'active':''}" data-pack-index="${index}" aria-pressed="${active}" title="${escape(pack.name)}"><span>${escape(pack.name)}</span><small>${assetCount.format(pack.assets.length)} 栋</small></button>`;
 };
 host.innerHTML=groups.base.map(packRow).join('')+[['dlc','内置 DLC'],['official','官方资产包'],['third-party','第三方资产包']].map(([group,title])=>{
  const list=groups[group],count=list.reduce((n,{pack})=>n+pack.assets.length,0);
  return `<details class="asset-pack-fold" data-asset-group="${group}" ${!closedAssetGroups.has(group)||query?'open':''}><summary>${title}<small>${list.length} 包 · ${assetCount.format(count)} 栋</small></summary><div>${list.map(packRow).join('')||'<p class="asset-empty">暂无资产包</p>'}</div></details>`;
 }).join('');
 for(const fold of host.querySelectorAll('[data-asset-group]'))fold.ontoggle=()=>{if(query)return;if(fold.open)closedAssetGroups.delete(fold.dataset.assetGroup);else closedAssetGroups.add(fold.dataset.assetGroup);};
 for(const b of host.querySelectorAll('[data-pack-index]'))b.onclick=()=>openAssetPackage(packs[Number(b.dataset.packIndex)].id);
}
function openAssetPackage(id){if(id!==assetPackId){assetCatalogQuery='';assetCatalogCategory='all';assetCatalogIndex=0;}selected=null;setTool('select');assetPackId=id;assetPanelMode='assets';renderAssetPackages();renderProperties();document.querySelector('.right-scroll').scrollTop=0;}
function stopAssetPlacement(){
 if(tool!=='asset-place')return;const shelf=document.querySelector('.right-scroll'),scrollTop=shelf.scrollTop;
 setTool('select',{keepAssetPanel:true});renderAssetPackages();shelf.scrollTop=scrollTop;toast('已取消建筑选择，可在当前资产包选择其他建筑');
}
function assetThumbnail(a){
 const [w,d]=a.lot,ps=[[-w/2,-d/2],[w/2,d/2],...a.rings.flat()],xs=ps.map(p=>p[0]),ys=ps.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),width=Math.max(...xs)-x,height=Math.max(...ys)-y,pad=Math.max(width,height)*.07;
 return `<svg class="asset-thumbnail" viewBox="${x-pad} ${y-pad} ${width+pad*2} ${height+pad*2}" aria-label="${escape(a.name)}占地与建筑投影" role="img"><rect x="${-w/2}" y="${-d/2}" width="${w}" height="${d}" fill="#e9f0df" stroke="#9ab292" stroke-width=".7" vector-effect="non-scaling-stroke"/><path d="${a.rings.map(r=>pathData(r,true)).join(' ')}" fill="#4b8293" fill-rule="evenodd"/></svg>`;
}
function assetCapacityRows(a){
 const count=n=>Number.isSafeInteger(n)&&n>=0?`${n} 人`:'';
 return `<div class="asset-capacity-metrics" aria-label="源资产人数上限" title="仅显示资产包明确提供的人数上限；未提供则留空"><div><span>最大住宅人口</span><strong data-capacity="residents">${count(a.maxResidents)}</strong></div><div><span>最大雇佣人口</span><strong data-capacity="employees">${count(a.maxEmployees)}</strong></div></div>`;
}
function renderAssetLibrary(host){
 document.querySelector('.right-panel').classList.add('has-selection');const packs=buildingPacksFor(project),pack=packs.find(p=>p.id===assetPackId);
 if(!pack){host.innerHTML='<div class="asset-shelf-title"><h2>选择资产包</h2><p>选择包内建筑，在地图上按真实尺寸摆放。</p></div>'+packs.map((p,i)=>`<button class="asset-package asset-package-large" data-open-pack="${i}"><span>${escape(p.name)}</span><small>${p.assets.length} 栋建筑 →</small></button>`).join('');for(const b of host.querySelectorAll('[data-open-pack]'))b.onclick=()=>openAssetPackage(packs[Number(b.dataset.openPack)].id);return;}
 const page=catalogPage(pack,{category:assetCatalogCategory,query:assetCatalogQuery,page:assetCatalogIndex}),categories=[...new Map(pack.assets.map(a=>[a.catalogCategory||a.type,a.catalogLabel||BUILDINGS.find(([id])=>id===a.type)?.[1]||a.type])).entries()];assetCatalogIndex=page.page;
 host.innerHTML=`<button class="back-layer" id="assetBackPacks">← 资产包列表</button><div class="asset-shelf-title"><h2>${escape(pack.name)}<small>${pack.assets.length} 栋</small></h2></div>${assetSelection?`<div class="asset-placement-controls"><strong>正在摆放：${escape(assetSelection.asset.name)}</strong>${assetCapacityRows(assetSelection.asset)}<div class="asset-rotation-row"><button id="assetRotateLeft" title="逆时针 15°">↶ 15°</button><label>角度 <input id="assetAngle" aria-label="摆放角度" type="number" step="1" value="${assetSelection.rotation}">°</label><button id="assetRotateRight" title="顺时针 15°">15° ↷</button></div><label class="check-row"><input id="assetRepeat" type="checkbox" ${assetRepeat?'checked':''}>连续摆放</label><div class="asset-placement-actions"><button id="assetZoom">放大查看</button><button id="assetStop" title="地图右键或 Esc 取消选择">取消选择</button></div><p>单击落位 · 右键取消 · R 旋转 90° · Shift+R 旋转 15°</p></div>`:'<p class="asset-shelf-hint">点击建筑，再在地图上点击摆放。</p>'}<div class="asset-catalog-controls"><select id="assetCatalogFilter" aria-label="筛选建筑用途"><option value="all">全部用途</option>${categories.map(([id,name])=>`<option value="${escape(id)}" ${assetCatalogCategory===id?'selected':''}>${escape(name)} · ${pack.assets.filter(a=>(a.catalogCategory||a.type)===id).length}</option>`).join('')}</select><input id="assetCatalogSearch" type="search" aria-label="搜索内置和导入资产" placeholder="名称、来源编号或子类" value="${escape(assetCatalogQuery)}"><div><button id="assetPrevPage" ${page.page===0?'disabled':''}>上一页</button><span>${page.total} 项 · ${page.page+1}/${page.pages} 页</span><button id="assetNextPage" ${page.page+1>=page.pages?'disabled':''}>下一页</button></div></div><div class="asset-card-list">${page.assets.map((a,i)=>`<button class="asset-card ${assetSelection?.pack.id===pack.id&&assetSelection.asset.id===a.id?'active':''}" data-asset-index="${pack.assets.indexOf(a)}" aria-pressed="${assetSelection?.pack.id===pack.id&&assetSelection.asset.id===a.id}">${assetThumbnail(a)}<span class="asset-card-info"><strong>${escape(a.name)}</strong><small>${escape(a.code)}</small>${a.catalogLabel?`<small>${escape(a.catalogLabel)}${a.catalogSubcategory!==a.catalogLabel?' · '+escape(a.catalogSubcategory):''}</small>`:''}<span>占地 ${a.lot[0]} × ${a.lot[1]} m</span><span>高 ${a.height.toFixed(2)} m</span><span>投影 ${a.area.toFixed(1)} m²</span></span></button>`).join('')}</div>`;
 const projectPack=project.assetPacks.find(p=>p.id===pack.id);
 if(pack.author||!pack.builtin){
  const author=document.createElement('p');
  author.className='asset-author';author.textContent='作者 '+(pack.author||'未知');
  host.querySelector('.asset-shelf-title').append(author);
 }
 if(!pack.builtin&&projectPack){const field=document.createElement('label');field.className='field-label';field.textContent='资产包分类';const select=document.createElement('select');select.innerHTML='<option value="official">官方资产包</option><option value="third-party">第三方资产包</option>';select.value=pack.assetGroup==='official'?'official':'third-party';field.append(select);host.querySelector('.asset-shelf-title').after(field);select.onchange=()=>{checkpoint();projectPack.assetGroup=select.value;persist();renderAssetPackages();};}
 $('assetCatalogFilter').onchange=e=>{assetCatalogCategory=e.target.value;assetCatalogIndex=0;renderProperties();};
 $('assetCatalogSearch').oninput=e=>{const at=e.target.selectionStart;assetCatalogQuery=e.target.value;assetCatalogIndex=0;renderProperties();$('assetCatalogSearch').focus();$('assetCatalogSearch').setSelectionRange(at,at);};
 $('assetPrevPage').onclick=()=>{assetCatalogIndex--;renderProperties();};$('assetNextPage').onclick=()=>{assetCatalogIndex++;renderProperties();};
 $('assetBackPacks').onclick=()=>{setTool('select');assetPanelMode='assets';assetPackId=null;renderAssetPackages();renderProperties();};
 const modId=paradoxModId(pack.modUrl);
 for(const b of host.querySelectorAll('[data-asset-index]')){
  b.onclick=()=>startAssetPlacement(pack,pack.assets[Number(b.dataset.assetIndex)]);
  if(modId)b.oncontextmenu=event=>openAssetModMenu(event,modId,pack.modUrl);
 }
 if(assetSelection){$('assetRotateLeft').onclick=()=>changeAssetAngle(assetSelection.rotation-15);$('assetRotateRight').onclick=()=>changeAssetAngle(assetSelection.rotation+15);$('assetAngle').onchange=e=>{const n=Number(e.target.value);if(Number.isFinite(n))changeAssetAngle(n);};$('assetRepeat').onchange=e=>assetRepeat=e.target.checked;$('assetStop').onclick=stopAssetPlacement;$('assetZoom').onclick=()=>zoom(1.8);}
}
function openAssetModMenu(event,modId,url){
 event.preventDefault();
 const menu=$('assetModMenu'),link=$('assetModLink'),rect=event.currentTarget.getBoundingClientRect();
 if(!menu.matches(':popover-open'))menu.showPopover();
 const x=event.clientX||rect.left,y=event.clientY||rect.bottom;
 menu.style.left=Math.max(4,Math.min(x,innerWidth-menu.offsetWidth-4))+'px';
 menu.style.top=Math.max(4,Math.min(y,innerHeight-menu.offsetHeight-4))+'px';
 link.title=url;
 link.onclick=async()=>{
  menu.hidePopover();
  try{
   if(window.mapDesktop?.openModPage)await window.mapDesktop.openModPage(modId);
   else window.open(url,'_blank','noopener,noreferrer');
  }catch(error){toast(error.message||String(error));}
 };
 link.focus();
}
function startAssetPlacement(pack,a){
 project.settings.editor.origins.planning=true;
 const key='building:'+a.type;if(project.settings.editor.layers[key].locked){toast('对应建筑图层已锁定，请先解锁');return;}
 const rotation=assetSelection?.rotation||0;assetSelection={pack,asset:a,rotation};assetPackId=pack.id;assetHover=null;selected=null;activeLayer={key,source:'manual'};buildingType=a.type;
 project.settings.editor.groups.building=true;project.settings.editor.layers.building.visible=true;project.settings.editor.layers[key].visible=true;
 setTool('asset-place');if(view.scale<fitScale*10){view.scale=fitScale*12;render();}syncUI();renderAssetPackages();toast('已选择 '+a.name+'；在地图上单击摆放');
}
function changeAssetAngle(value){if(!assetSelection)return;assetSelection.rotation=buildingAngle(value);if($('assetAngle'))$('assetAngle').value=assetSelection.rotation;updateAssetStatus();renderAssetPreview();}
function updateAssetStatus(){if(!assetSelection)return;$('toolStatus').textContent=`摆放 ${assetSelection.asset.name} · ${assetSelection.rotation}° · 单击落位 · R 旋转 · 右键取消`;$('toolStatus').title=$('toolStatus').textContent;}
function assetHoverPoint(e){
 const point=screenPoint(e);
 if(!project.settings.snap)return point;
 if(!assetSnapIndex)assetSnapIndex=createSnapIndex(project.features,{visible:f=>f.kind==='road'&&featureVisible(f)});
 return assetSnapIndex.nearest(point,Math.min(3,8/view.scale))||point;
}
function assetPreviewFeature(){if(!assetSelection||!assetHover)return null;const f=makeBuildingAssetFeature(assetSelection.pack,assetSelection.asset,assetHover,assetSelection.rotation,'asset-preview');if(scopeId)f.interchangeId=scopeId;return f;}
function renderAssetPreview(){
 if(tool!=='asset-place')return;const host=$('draftShapes');host.replaceChildren();$('drawingActions').hidden=true;const f=assetPreviewFeature();if(!f)return;
 const valid=buildingAssetFits(f,SIZE)&&featureVisible(f)&&!project.settings.editor.layers[layerKey(f)].locked,color=valid?'#286c6b':'#c04b43';
 node('path',{d:pathData(buildingAssetLot(f),true),fill:valid?'#c5dab4':'#eab5ac','fill-opacity':.25,stroke:color,'stroke-width':1.2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'5 3','pointer-events':'none'},host);
 node('path',{d:featurePath(f,true),fill:valid?'#4b8293':'#c65a50','fill-rule':'evenodd','fill-opacity':.75,stroke:color,'stroke-width':1.3,'vector-effect':'non-scaling-stroke','pointer-events':'none'},host);
 const top=Math.min(...buildingAssetLot(f).map(p=>p[1]));label(`${f.assetPlacement.lot.join(' × ')} m · 高 ${f.assetPlacement.height.toFixed(1)} m`,[f.poi[0],top],color,host,11,-13);
}
function renderPlacedBuildingAsset(f,host,color){
 const meta=f.assetPlacement;
 if(meta.showLot)node('path',{d:pathData(buildingAssetLot(f),true),fill:'#bfd2a9','fill-opacity':.13,stroke:'#7f9e72','stroke-width':.8,'vector-effect':'non-scaling-stroke','data-id':f.id,'data-asset-lot':f.id},host);
 const shape=node('path',{d:featurePath(f,true),fill:color,'fill-rule':'evenodd','fill-opacity':.85,stroke:'#315b65','stroke-width':1,'vector-effect':'non-scaling-stroke','data-id':f.id,'data-building-asset':meta.assetId},host);
 node('title',{},shape).textContent=`${f.name} · 占地 ${meta.lot.join(' × ')} m · 高 ${meta.height.toFixed(2)} m`;
}
function placeBuildingAsset(){
 const f=assetPreviewFeature();if(!f)return;f.id=crypto.randomUUID();f.color='#4b8293';
 if(project.settings.editor.layers[layerKey(f)].locked){toast('对应建筑图层已锁定');return;}if(!featureVisible(f)){toast('请先显示对应的建筑图层');return;}if(!buildingAssetFits(f,SIZE)){toast('建筑占地超出地图边界，请移回图内');return;}
 try{const withAsset=includePlacedAsset(project,assetSelection.pack,assetSelection.asset),valid=prepareEditor({...withAsset,features:[...withAsset.features,f]});checkpoint();project=valid;selected=null;render();persist();if(!assetRepeat){setTool('select');selected=f.id;render();renderProperties();}else toast('已摆放 '+f.name+'，可继续摆放');}catch(error){toast(error.message);}
}
function commitPlacedAsset(next){
 const f=getSelected();if(!f||locked(f))return;try{commitFeatureEdit(f,next);changed();}catch(error){toast(error.message);renderProperties();}
}
function renderPlacedAssetProperties(host,f){
 document.querySelector('.right-panel').classList.add('has-selection');const a=f.assetPlacement,disabled=locked(f)?'disabled':'',center=f.poi;
 const thumb={name:a.assetName,lot:a.lot,rings:[f.points,...(f.additionalParts||[])].map(r=>transformBuildingRing(r.map(p=>[p[0]-center[0],p[1]-center[1]]),[0,0],-a.rotation))};
 host.innerHTML=`<button class="back-layer" id="assetBackLayer">← ${escape(layerName(layerKey(f)))}</button><div class="object-kind">建筑资产 · ${escape(a.packName)}</div><h2 class="property-title">${escape(f.name)}</h2><div class="asset-source-code"><span>来源编号</span><strong>${escape(a.code)}</strong></div>${assetCapacityRows(a)}<div class="asset-object-preview">${assetThumbnail(thumb)}</div><div class="asset-object-metrics"><div><span>地块占地</span><strong>${a.lot.join(' × ')} m</strong></div><div><span>建筑高度</span><strong>${a.height.toFixed(2)} m</strong></div><div><span>建筑投影</span><strong>${a.area.toFixed(1)} m²</strong></div></div><p class="asset-shelf-hint">${disabled?'图层已锁定。':'拖动建筑整体移动，旋转保持真实尺寸。'}</p><label class="field-label" for="placedAssetName">名称</label><input id="placedAssetName" type="text" maxlength="300" value="${escape(f.name)}" ${disabled}><label class="field-label" for="placedAssetColor">显示颜色</label><input id="placedAssetColor" type="color" value="${f.color||'#4b8293'}" ${disabled}><div class="two-fields"><label class="field-label">中心 X (m)<input id="placedAssetX" type="number" step="0.1" value="${center[0].toFixed(2)}" ${disabled}></label><label class="field-label">中心 Y (m)<input id="placedAssetY" type="number" step="0.1" value="${center[1].toFixed(2)}" ${disabled}></label></div><div class="asset-rotation-row"><button id="placedRotateLeft" ${disabled}>↶ 15°</button><label>角度 <input id="placedAssetAngle" type="number" aria-label="建筑旋转角度" step="1" value="${a.rotation}" ${disabled}>°</label><button id="placedRotateRight" ${disabled}>15° ↷</button></div><label class="check-row"><input id="placedAssetLot" type="checkbox" ${a.showLot?'checked':''} ${disabled}>显示占地框</label><div class="asset-placement-actions"><button id="placeSameAsset">摆放同款</button><button id="locatePlacedAsset">定位</button></div><button id="deleteObject" class="danger-button" ${disabled}>删除建筑</button>`;
 $('assetBackLayer').onclick=()=>activateLayer(layerKey(f));$('placedAssetName').onchange=e=>{const n=structuredClone(f);n.name=e.target.value.trim()||a.assetName;commitPlacedAsset(n);};$('placedAssetColor').onchange=e=>{const n=structuredClone(f);n.color=e.target.value;commitPlacedAsset(n);};
 const rotate=n=>{if(Number.isFinite(n))commitPlacedAsset(rotateBuildingAsset(f,n));};$('placedAssetAngle').onchange=e=>rotate(Number(e.target.value));$('placedRotateLeft').onclick=()=>rotate(a.rotation-15);$('placedRotateRight').onclick=()=>rotate(a.rotation+15);
 const move=()=>{const xy=[Number($('placedAssetX').value),Number($('placedAssetY').value)];if(xy.every(Number.isFinite))commitPlacedAsset(moveBuildingAsset(f,xy));};$('placedAssetX').onchange=move;$('placedAssetY').onchange=move;
 $('placedAssetLot').onchange=e=>{const n=structuredClone(f);n.assetPlacement.showLot=e.target.checked;commitPlacedAsset(n);};$('deleteObject').onclick=deleteSelected;
 $('locatePlacedAsset').onclick=()=>{view.cx=center[0];view.cy=center[1];view.scale=Math.max(view.scale,fitScale*25);render();};$('placeSameAsset').onclick=()=>startAssetPlacement({id:a.packId,name:a.packName},{id:a.assetId,name:a.assetName,code:a.code,type:f.type,lot:a.lot,height:a.height,area:a.area,maxResidents:a.maxResidents??null,maxEmployees:a.maxEmployees??null,rings:thumb.rings});
}
$('assetsTab').onclick=()=>{if(tool!=='asset-place'){selected=null;selectedNode=null;assetPanelMode='assets';renderSelection();}renderAssetPackages();renderProperties();};
$('propertiesTab').onclick=()=>{setTool('select');renderAssetPackages();};
$('importBuildingLibrary').onclick=async()=>{if(window.mapDesktop){const info=await window.mapDesktop.pick('assets');if(info)await importChosenAssets(info.map(desktopFile));}else $('buildingLibraryFile').click();};
function installBuildingPacks(packs){
 const merged=new Map((project.assetPacks||[]).map(pack=>[pack.id,pack]));
 for(const pack of packs)merged.set(pack.id,{...pack,assetGroup:pack.assetGroup==='official'?'official':'third-party'});
 const valid=prepareEditor({...project,assetPacks:[...merged.values()]});
 checkpoint();project=valid;changed();openAssetPackage(packs[0].id);
 return `已导入 ${packs.length} 个资产包，${packs.reduce((n,p)=>n+p.assets.length,0)} 栋建筑`;
}
async function importChosenAssets(files){
 if(!files.length)return;
 try{toast(installBuildingPacks(await readAssetSelection(files)));}
 catch(error){toast(error.message);}
 $('buildingLibraryFile').value='';
}
$('buildingLibraryFile').onchange=e=>importChosenAssets([...e.target.files]);

async function loadPresetBuildingPacks(){
 const files=await window.mapDesktop.presetBuildingFiles();
 const warnings=[];
 for(const info of files){
  try{
   addPresetBuildingPacks(await readAssetSelection([desktopFile(info)]));
  }catch(error){
   warnings.push(`${info.name}：${error.message||error}`);
  }
 }
 if(!files.length)return;
 renderAssetPackages();
 if(assetPanelMode==='assets')renderProperties();
 if(warnings.length){
  const extra=warnings.length>1?`，另有 ${warnings.length-1} 个失败`:'';
  toast('预置投影读取失败 · '+warnings[0]+extra);
 }
}
const assetPreviewScheduler=createEditScheduler(renderAssetPreview);
svg.addEventListener('pointermove',e=>{if(tool==='asset-place'&&!drag){assetHover=assetHoverPoint(e);assetPreviewScheduler.schedule();}});
svg.addEventListener('pointerleave',()=>{if(tool==='asset-place'){assetPreviewScheduler.cancel();assetHover=null;renderAssetPreview();}});
svg.addEventListener('click',e=>{if(tool!=='asset-place'||suppressClick||space||e.detail>1||!inMap(screenPoint(e)))return;assetHover=assetHoverPoint(e);placeBuildingAsset();});
svg.addEventListener('contextmenu',e=>{if(tool==='asset-place'){e.preventDefault();stopAssetPlacement();}});
window.addEventListener('keydown',e=>{if(tool!=='asset-place'||!assetSelection||e.ctrlKey||e.metaKey||['INPUT','TEXTAREA','SELECT'].includes(document.activeElement.tagName)||document.querySelector('dialog[open]'))return;if(e.key.toLowerCase()==='r'){e.preventDefault();changeAssetAngle(assetSelection.rotation+(e.shiftKey?15:90));}});

let managedPacks=new Set();
function renderAssetManager(){
 const query=$('assetManagerSearch').value.trim().toLowerCase(),packs=project.assetPacks||[],counts=new Map();
 for(const f of project.features)if(f.assetPlacement)counts.set(f.assetPlacement.packId,(counts.get(f.assetPlacement.packId)||0)+1);
 $('assetManagerList').innerHTML=packs.length?'<table><thead><tr><th>选择</th><th>资产包</th><th>建筑</th><th>已摆放</th></tr></thead><tbody>'+packs.filter(p=>p.name.toLowerCase().includes(query)||p.id.toLowerCase().includes(query)).map(p=>`<tr><td><input type="checkbox" data-manage-pack="${escape(p.id)}" aria-label="选择${escape(p.name)}" ${managedPacks.has(p.id)?'checked':''}></td><td>${escape(p.name)}<small>${escape(p.id)}</small></td><td>${p.assets.length}</td><td>${counts.get(p.id)||0}</td></tr>`).join('')+'</tbody></table>':'<p class="muted">当前工程没有导入资产包。</p>';
 for(const box of $('assetManagerList').querySelectorAll('[data-manage-pack]'))box.onchange=()=>{if(box.checked)managedPacks.add(box.dataset.managePack);else managedPacks.delete(box.dataset.managePack);updateAssetManagerSelection();};
 updateAssetManagerSelection();
}
function updateAssetManagerSelection(){$('assetManagerStatus').textContent=`共 ${project.assetPacks.length} 个包，已选择 ${managedPacks.size} 个`;$('removeSelectedPacks').disabled=!managedPacks.size;}
function openAssetManager(){managedPacks.clear();$('assetManagerSearch').value='';$('removePlacedWithPack').checked=false;renderAssetManager();$('assetManagerDialog').showModal();}
$('assetManagerSearch').oninput=renderAssetManager;
$('selectUnusedPacks').onclick=()=>{const used=new Set(project.features.map(f=>f.assetPlacement?.packId));managedPacks=new Set(project.assetPacks.filter(p=>!used.has(p.id)).map(p=>p.id));renderAssetManager();};
$('clearPackSelection').onclick=()=>{managedPacks.clear();renderAssetManager();};
$('removeSelectedPacks').onclick=()=>{
 try{const next=prepareEditor(removeProjectAssetPacks(project,[...managedPacks],{removePlaced:$('removePlacedWithPack').checked})),removed=project.features.length-next.features.length;
 if(!confirm(`从当前工程移除 ${managedPacks.size} 个资产包${removed?'，并删除 '+removed+' 栋已摆放建筑':''}？\n此操作可撤销，不删除源文件。`))return;
 checkpoint();project=next;selected=null;assetSelection=null;assetPackId=null;assetPanelMode='assets';setTool('select');buildLayers();changed();managedPacks.clear();renderAssetManager();toast('资产包已移除，可撤销恢复；请保存工程');
 }catch(error){$('assetManagerStatus').textContent=error.message;}
};

function groupPaletteHtml(group){
 const e=project.settings.editor;
 return '<details class="group-palette" open><summary>小类显示配色</summary><p class="muted">修改后统一该小类的地图颜色；↺ 恢复原始／默认配色。</p>'+layerKeysForGroup(group).map(key=>{
 const road=key.startsWith('road:')&&key!=='road:interchange',style=road?e.roadStyles[key.split(':')[1]]:null;
 return `<div class="palette-row"><span>${escape(layerName(key))}</span><div class="palette-colors">${(road?[['color','地面'],['elevatedColor','高架／桥梁'],['tunnelColor','隧道']]:[['color','显示颜色']]).map(([field,label])=>`<label title="${label}"><input type="color" data-palette-key="${key}" data-palette-field="${field}" aria-label="${escape(layerName(key)+' '+label)}" value="${style?style[field]:e.layers[key].color||defaultLayerColor(key)}">${road?'<small>'+label+'</small>':''}</label>`).join('')}</div><button data-palette-reset="${key}" title="恢复此小类配色" aria-label="恢复${escape(layerName(key))}配色">↺</button></div>`;
 }).join('')+'</details>';
}
function bindGroupPalette(host){
 for(const input of host.querySelectorAll('[data-palette-key]'))input.onchange=()=>{
 const key=input.dataset.paletteKey,field=input.dataset.paletteField,next=structuredClone(project),e=next.settings.editor;
 if(key.startsWith('road:')&&key!=='road:interchange'){const style=e.roadStyles[key.split(':')[1]];style[field]=input.value;if(field==='color')Object.assign(style,roadStyleColors(input.value));e.layers[key].color=style.color;}
 else e.layers[key].color=input.value;
 try{const valid=prepareEditor(next);checkpoint();project=valid;buildLayers();changed();}catch(error){toast(error.message);}
 };
 for(const button of host.querySelectorAll('[data-palette-reset]'))button.onclick=()=>{const key=button.dataset.paletteReset;checkpoint();delete project.settings.editor.layers[key].color;if(key.startsWith('road:')&&key!=='road:interchange')Object.assign(project.settings.editor.roadStyles[key.split(':')[1]],roadStyleColors(roadInfo(key.split(':')[1]).color));buildLayers();changed();};
}

function layerLabelsToggleHtml(key){
 const e=project.settings.editor,isGroup=GROUPS.some(([id])=>id===key),checked=isGroup?e.groupLabels[key]!==false:e.layers[key]?.labelsVisible!==false;
 const hint=project.settings.notesVisible===false?'左侧“显示名称与标签”总开关已关闭。':!isGroup&&e.groupLabels[groupForLayer(key)]===false?'所属大类的名称和标签已关闭。':'';
 return `<label class="check-row"><input id="layerLabelsVisible" type="checkbox" ${checked?'checked':''}>显示名称和标签</label>${hint?'<p class="muted">'+hint+'</p>':''}`;
}

function syncOriginControls(){
 if(!$('cartoOriginVisible'))return;const e=project.settings.editor,count={carto:0,planning:0};for(const f of project.features)count[originForFeature(f)]++;
 $('cartoOriginVisible').checked=e.origins.carto;$('planningOriginVisible').checked=e.origins.planning;$('builtPlanningVisible').checked=e.showBuiltPlanning;$('cartoOriginLocked').checked=e.lockCarto;
 $('cartoOriginCount').textContent=count.carto+' 个';$('planningOriginCount').textContent=count.planning+' 个';
}
for(const [id,key]of [['cartoOriginVisible','carto'],['planningOriginVisible','planning']])$(id).onchange=e=>{checkpoint();project.settings.editor.origins[key]=e.target.checked;changed();};
$('cartoOriginLocked').onchange=e=>{checkpoint();project.settings.editor.lockCarto=e.target.checked;changed();};
$('builtPlanningVisible').onchange=e=>{checkpoint();project.settings.editor.showBuiltPlanning=e.target.checked;changed();};
function renderOriginControls(host,f){
 const carto=originForFeature(f)==='carto',box=document.createElement('div');box.className='object-origin';box.innerHTML=carto?'<strong>Carto 游戏现状</strong><p class="muted">更新 Carto 时，此对象会被替换。要保留设计改动，请先复制为手绘规划。</p><button id="copyToPlanning" class="wide-button">复制为手绘规划</button>':'<strong>手绘规划</strong><label class="check-row"><input id="planningBuilt" type="checkbox" '+(f.planningStatus==='built'?'checked':'')+'>已在游戏中实施</label><p class="muted">已实施对象默认隐藏，可在左侧重新显示；不会自动删除。</p>';
 host.prepend(box);
 if(carto)$('copyToPlanning').onclick=()=>{try{const result=copyAsPlanning(project,f.id);checkpoint();project=result.project;activeLayer={key:layerKey(project.features.find(x=>x.id===result.selectedId)),source:'manual'};selected=result.selectedId;selectedNode=null;buildLayers();changed();toast('已复制为手绘规划，后续更新 Carto 不会覆盖此副本');}catch(error){toast(error.message);}};
 else $('planningBuilt').onchange=e=>{checkpoint(featureHistorySnapshot(project,f.id));f.planningStatus=e.target.checked?'built':'planned';changed();};
}
async function exportPlanningLayer(){
 if(basePlanningState)return exportVisiblePlanningWorkspace();
 if(projectSaving)return;projectSaving=true;updateSaveStatus();
 try{const planned=createPlanningProject(project);let handle=null;const name=safeProjectName().replace(/\.cs2map$/,'-手绘规划.cs2map');
 if(window.showSaveFilePicker){handle=await window.showSaveFilePicker({suggestedName:name,types:[{description:'手绘规划工程',accept:{'application/octet-stream':['.cs2map']}}]});if(handle.name===currentFileName)throw Error('请使用不同文件名，避免覆盖完整工程');}
 const pack=window.mapDesktop?.tauri?packTauriProject:packProject,bytes=await pack(planned.project,{workspace:{kind:'planning-layer',version:1,planningFrame:planned.frame}});
 if(handle){const writer=new ProjectFileWriter();writer.attach(handle,new Uint8Array(await (await handle.getFile()).arrayBuffer()));await writer.save(bytes);}else await download(bytes,name,'application/octet-stream');
 toast('手绘规划已单独导出；包含模型时需同时携带同名 .assets 文件夹');
 }catch(error){if(error.name!=='AbortError')toast('规划导出未完成：'+error.message);}finally{projectSaving=false;updateSaveStatus();}
}
async function importPlanningLayer(){
 if(projectSaving)return;
 try{
  const [handle]=await window.showOpenFilePicker({
   multiple:false,types:[{description:'手绘规划工程',accept:{'application/octet-stream':['.cs2map']}}]
  });
  await overlayPlanningFile(await handle.getFile());
 }catch(error){if(error.name!=='AbortError')toast('规划叠加失败：'+error.message);}
}
async function overlayPlanningFile(file){
 if(file.size>512*1024*1024)throw Error('规划文件超过 512 MB');const doc=await unpackProject(await file.arrayBuffer());
 const frame=doc.workspace?.planningFrame||projectMapFrame(doc.project),matched=checkPlanningFrame(project,frame);
 if(!matched&&!confirm('规划或当前工程缺少地理范围信息，将按相同地图坐标直接叠加。确认两者为同一张地图吗？'))return;
 const result=mergePlanningProject(project,doc.project,{frame});checkpoint();project=result.project;selected=null;selectedNode=null;scopeId='';setTool('select');buildLayers();changed();toast(`已叠加 ${result.count} 个规划对象，更新 ${result.replaced} 个已有规划；游戏现状保留`);
}

function paintDragPreview(){
 if(!drag||!drag.moved||drag.kind==='pan')return;
 const f=project.features.find(x=>x.id===drag.id);if(!f)return;
 if(!drag.hiddenElements){
  drag.hiddenElements=[...svg.querySelectorAll(`[data-render-id="${f.id}"],[data-id="${f.id}"],[data-occludes="${f.id}"],[data-junction-roads~="${f.id}"]`)].filter(n=>!$('editShapes').contains(n));
  drag.hiddenElements=drag.hiddenElements.map(n=>[n,n.style.visibility]);for(const [n]of drag.hiddenElements)n.style.visibility='hidden';
 }
 const host=$('editShapes');host.replaceChildren();const preview=node('g',{'pointer-events':'none','data-drag-preview':f.id},host),poly=isPolygonFeature(f);
 if(f.kind==='road'||f.kind==='route'){
  const style=networkDisplay(f,project.settings.editor,view.scale),d=featurePath(f,poly);
  node('path',{d,fill:poly?style.color:'none',stroke:'#fff','stroke-width':style.width+4/view.scale,'stroke-opacity':.8,'stroke-linecap':'round','stroke-linejoin':'round'},preview);
  if(style.edgeWidth)node('path',{d,fill:'none',stroke:style.edgeColor,'stroke-width':style.width,'stroke-linecap':'round','stroke-linejoin':'round'},preview);
  node('path',{d,fill:poly?style.color:'none',stroke:style.color,'stroke-width':Math.max(.1,style.width-2*style.edgeWidth),'stroke-linecap':'round','stroke-linejoin':'round'},preview);
 }else if(f.geometryType==='point')node('circle',{cx:f.points[0][0],cy:f.points[0][1],screen:{r:6},fill:featureDisplayColor(project,f)},preview);
 else node('path',{d:featurePath(f,true),fill:featureDisplayColor(project,f),'fill-rule':'evenodd','fill-opacity':.35,stroke:'#276554','stroke-width':2,'vector-effect':'non-scaling-stroke'},preview);
 if(!f.assetPlacement)for(const [partIndex,points]of geometryParts(f).entries())for(const [index,p]of points.entries()){
  const active=partIndex===selectedNode?.partIndex&&index===selectedNode?.index;
  node('circle',{cx:p[0],cy:p[1],screen:{r:active?6:4},fill:'#fff',stroke:'#276554','stroke-width':1.5,'vector-effect':'non-scaling-stroke'},preview);
 }
}
const editPreviewScheduler=createEditScheduler(paintDragPreview);
function clearDragPreview(){editPreviewScheduler.cancel();for(const [n,value]of drag?.hiddenElements||[])n.style.visibility=value;}

function municipalCounts(){const counts=Object.fromEntries(MUNICIPAL_TYPES.map(([id])=>[id,0]));for(const f of project.features){const id=municipalClass(f);if(id)counts[id]++;}return counts;}
function municipalControlsHtml(){const counts=municipalCounts();return '<div class="municipal-controls">'+MUNICIPAL_TYPES.map(([id,name])=>`<label><input type="checkbox" data-municipal-visible="${id}" ${municipalVisible(project.settings.editor,id)?'checked':''}><button type="button" data-municipal-category="${id}">${name}</button><small>${counts[id]}</small></label>`).join('')+'</div>';}
function bindMunicipalControls(host){
 for(const input of host.querySelectorAll('[data-municipal-visible]'))input.onchange=()=>{checkpoint();project.settings.editor.municipalVisibility[input.dataset.municipalVisible]=input.checked;changed();};
 for(const button of host.querySelectorAll('[data-municipal-category]'))button.onclick=()=>activateLayer('building:municipal','manual',button.dataset.municipalCategory);
}
function appendMunicipalTree(host,row){
 const fold=document.createElement('button');fold.className='municipal-fold group-fold';fold.setAttribute('aria-label','展开市政分类');fold.setAttribute('aria-expanded',String(municipalExpanded));fold.textContent=municipalExpanded?'▾':'▸';row.append(fold);
 const children=document.createElement('div');children.className='municipal-children';children.hidden=!municipalExpanded;children.innerHTML=municipalControlsHtml();bindMunicipalControls(children);host.append(children);
 fold.onclick=()=>{municipalExpanded=!municipalExpanded;children.hidden=!municipalExpanded;fold.textContent=municipalExpanded?'▾':'▸';fold.setAttribute('aria-expanded',String(municipalExpanded));};
}
function syncMunicipalControls(){for(const input of document.querySelectorAll('[data-municipal-visible]'))input.checked=municipalVisible(project.settings.editor,input.dataset.municipalVisible);}

function openLayerManager(){renderLayerManager();$('layerManagerDialog').showModal();}
function renderLayerManager(){
 const host=$('layerManagerList'),e=project.settings.editor;
 host.innerHTML=GROUPS.map(([g,name])=>`<section class="manager-section"><h3><input type="checkbox" data-manage-group="${g}" aria-label="显示${name}" ${e.groups[g]!==false?'checked':''}>${name}</h3>${layerKeysForGroup(g).map(key=>`<div class="manager-layer"><button data-manage-open="${key}">${escape(layerName(key))}<small>${layerObjects(key).length} 个对象</small></button><label><input data-manage-visible="${key}" type="checkbox" ${e.layers[key].visible?'checked':''}>显示</label><label><input data-manage-lock="${key}" type="checkbox" ${e.layers[key].locked?'checked':''}>锁定</label><label><input data-manage-labels="${key}" type="checkbox" ${e.groupLabels[g]!==false&&e.layers[key].labelsVisible?'checked':''}>名称标签</label></div>${key==='building:municipal'?municipalControlsHtml():''}`).join('')}</section>`).join('');
 for(const input of host.querySelectorAll('input'))input.onchange=()=>{
  checkpoint();const d=input.dataset,value=input.checked;
  if(d.manageGroup){e.groups[d.manageGroup]=value;if(value&&d.manageGroup==='building')e.layers.building.visible=true;}
  if(d.manageVisible){e.layers[d.manageVisible].visible=value;if(value){e.groups[groupForLayer(d.manageVisible)]=true;if(d.manageVisible.startsWith('building:'))e.layers.building.visible=true;}}
  if(d.manageLock)e.layers[d.manageLock].locked=value;
  if(d.manageLabels){e.layers[d.manageLabels].labelsVisible=value;if(value)e.groupLabels[groupForLayer(d.manageLabels)]=true;}
  if(d.municipalVisible)e.municipalVisibility[d.municipalVisible]=value;
  changed();renderLayerManager();
 };
 for(const button of host.querySelectorAll('[data-manage-open]'))button.onclick=()=>{$('layerManagerDialog').close();activateLayer(button.dataset.manageOpen);};
 for(const button of host.querySelectorAll('[data-municipal-category]'))button.onclick=()=>{$('layerManagerDialog').close();activateLayer('building:municipal','manual',button.dataset.municipalCategory);};
}
function openBasemapManager(){renderBasemapManager();$('basemapManagerDialog').showModal();}
function renderBasemapManager(){
 const builtin=['qgis','satellite'].filter(id=>openedBaseImages[id]||(typeof BASEMAPS!=='undefined'&&BASEMAPS[id])).map(id=>({id,name:id==='qgis'?'QGIS 简图':'卫星底图',data:openedBaseImages[id]||(typeof BASEMAPS!=='undefined'?BASEMAPS[id]:''),builtin:true}));
 const all=[{id:'none',name:'无底图',builtin:true},...builtin,...project.basemaps];
 $('basemapManagerList').innerHTML=all.map(b=>`<div class="basemap-manager-row"><input type="radio" name="managedBasemap" data-base-pick="${b.id}" aria-label="显示${escape(b.name)}" ${project.settings.base===b.id?'checked':''}>${b.data?`<img src="${b.data}" alt="${escape(b.name)}预览">`:'<div class="basemap-placeholder">—</div>'}<div>${b.builtin?`<strong>${escape(b.name)}</strong>`:`<input data-base-name="${b.id}" aria-label="底图名称" value="${escape(b.name)}" maxlength="300">`}<small>${b.width?`${b.width} × ${b.height} · 整幅对齐`:b.id==='none'?'只显示其他图层':'内置底图'}</small></div>${b.builtin?'':`<button data-base-remove="${b.id}" class="danger-button">移除</button>`}</div>`).join('');
 for(const input of $('basemapManagerList').querySelectorAll('[data-base-pick]'))input.onchange=()=>{checkpoint();project.settings.base=input.dataset.basePick;changed();};
 for(const input of $('basemapManagerList').querySelectorAll('[data-base-name]'))input.onchange=()=>{const name=input.value.trim();if(!name){input.value=project.basemaps.find(b=>b.id===input.dataset.baseName).name;return;}checkpoint();project.basemaps.find(b=>b.id===input.dataset.baseName).name=name;changed();};
 for(const button of $('basemapManagerList').querySelectorAll('[data-base-remove]'))button.onclick=()=>{checkpoint();const id=button.dataset.baseRemove;project.basemaps=project.basemaps.filter(b=>b.id!==id);if(project.settings.base===id)project.settings.base='none';changed();renderBasemapManager();toast('底图已从工程移除，可撤销恢复；原图片文件保留');};
}
$('managerImportBasemap').onclick=()=>$('baseFile').click();

for(const b of document.querySelectorAll("[data-open-layer-manager]"))b.onclick=()=>{b.closest("details").open=false;openLayerManager();};
for(const b of document.querySelectorAll("[data-open-basemap-manager]"))b.onclick=()=>{b.closest("details").open=false;openBasemapManager();};

$('assetPackSearch').oninput=()=>renderAssetPackages();
$('zoneOpacitySettings').onclick=()=>{$('zoneOpacityDialog').showModal();};

$('namingStyle').innerHTML=Object.entries(NAME_STYLES).map(([id,style])=>`<option value="${id}">${style.label}</option>`).join('');
$('namingType').innerHTML=Object.entries(NAME_TYPES).map(([id,label])=>`<option value="${id}">${label}</option>`).join('');
function renderDistrictPlanResults(){
 const host=$('districtPlanResults');
 const districts=masterPlanSession?.preview?.revision===editRevision?masterPlanSession.preview.plan.districts:[];
 host.replaceChildren();
 host.hidden=!districts?.length;
 if(host.hidden)return;
 const heading=document.createElement('strong');
 heading.textContent='片区选址说明';
 host.append(heading);
 for(const district of districts){
  const item=document.createElement('details'),summary=document.createElement('summary'),description=document.createElement('p');
  const locate=document.createElement('button');
  summary.textContent=district.name;
  description.textContent=district.description;
  locate.type='button';
  locate.textContent='在地图上定位';
  locate.onclick=()=>focusObject({points:district.rings[0]});
  item.append(summary,description,locate);host.append(item);
 }
}

const masterPinTools=[
 ['access','Access','参考接点','#276875'],
 ['highway','Highway','高速对外接点','#17764a'],
 ['arterial','Arterial','主干道对外接点','#aa561d'],
 ['interchange','Interchange','互通位置','#884b91']
];
function masterPins(session,kind){return kind==='access'?session.access:session.roadPins[kind];}
function visibleMasterPins(mode){
 if(mode==='corridors'||mode==='roads')mode=$('scenicRoadMode').value;
 if(mode==='theme'||mode==='volume')return [];
 return masterPinTools.filter(([kind])=>mode==='district'?kind==='access':
  kind==='interchange'||mode==='joint'&&kind!=='access'||kind===mode);
}
function renderMasterPlan(){
 const host=$('masterPlanPreview');
 host.replaceChildren();
 const session=masterPlanSession;
 if(!session)return;
 const scale=view.scale;
 const drawReserve=(a,b)=>node('rect',{x:Math.min(a[0],b[0]),y:Math.min(a[1],b[1]),
  width:Math.abs(a[0]-b[0]),height:Math.abs(a[1]-b[1]),fill:'#b96c48','fill-opacity':.14,
  stroke:'#a45532','stroke-width':2,'vector-effect':'non-scaling-stroke','stroke-dasharray':'7 4'},host);
 const full=session.mode==='full';
 if(full)for(const [a,b]of session.reserves)drawReserve(a,b);
 if(session.corner)node('circle',{cx:session.corner[0],cy:session.corner[1],screen:{r:5},fill:'#a45532'},host);
 const preview=session.preview?.revision===editRevision?session.preview.plan:null;
 if(preview){
  for(const guide of preview.scenicGuides||[]){
   const color=guide.kind==='sequence'?'#007c79':'#705c91';
   node('path',{d:pathData(guide.points),fill:'none',stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke',
    'stroke-dasharray':'7 5'},host);
   const [a,b]=guide.points;
   label(guide.name,[(a[0]+b[0])/2,(a[1]+b[1])/2],color,host,11);
  }
  for(const note of preview.scenicNotes||[]){
   const [point]=note.points;
   node('circle',{cx:point[0],cy:point[1],screen:{r:6},fill:'#705c91',stroke:'#fff','stroke-width':1.5,'vector-effect':'non-scaling-stroke'},host);
   label(note.name,point,'#5b4679',host,11,-12);
  }
  for(const district of preview.districts||[]){
   const color=classInfo({type:district.type})[2];
   node('path',{d:district.rings.map(ring=>pathData(ring,true)).join(' '),fill:color,'fill-opacity':.34,
    'fill-rule':'evenodd',stroke:color,'stroke-width':2,'vector-effect':'non-scaling-stroke'},host);
   label(district.name,interiorPoint(district.rings[0]),color,host,12);
  }
  for(const zone of preview.zones||[]){
   const color=classInfo(zone)[2];
   node('path',{d:pathData(zone.points,true),fill:color,'fill-opacity':.36,stroke:color,'stroke-width':1,'vector-effect':'non-scaling-stroke'},host);
  }
  for(const {feature}of preview.buildings||[]){
   const color=featureDisplayColor(project,feature);
   node('path',{d:geometryParts(feature).map(points=>pathData(points,true)).join(' '),fill:color,'fill-rule':'evenodd',
    stroke:color,'stroke-width':.65,'vector-effect':'non-scaling-stroke','fill-opacity':.86},host);
  }
  for(const tree of preview.trees||[])node('path',{d:pathData(tree.points,true),fill:'#357546','fill-opacity':.64},host);
  for(const envelope of preview.envelopes||[])node('path',{d:pathData(envelope.points,true),fill:'#213a36','fill-opacity':.22},host);
  for(const {points}of preview.interchanges||[]){
   node('path',{d:pathData(points,true),fill:'#c8833c','fill-opacity':.24,stroke:'#9d5828','stroke-width':2,'vector-effect':'non-scaling-stroke',
    'stroke-dasharray':'5 3'},host);
   label('互通预留',interiorPoint(points),'#884a25',host,11);
  }
  for(const {point,candidate}of [...(preview.access||[]),...(preview.arterialAccess||[])]){
   if(full&&visibleMasterPins($('masterPlanMode').value).some(([kind])=>masterPins(session,kind).some(manual=>distance(manual,point)<.01)))continue;
   node('circle',{cx:point[0],cy:point[1],screen:{r:6},fill:candidate?'#fff4db':'#d9efe0',
    stroke:candidate?'#aa561d':'#17764a','stroke-width':2,'vector-effect':'non-scaling-stroke'},host);
  }
  for(const road of preview.roads)node('path',{d:pathData(road.points),fill:'none',
   stroke:full?(road.type==='highway'?'#17764a':road.type==='arterial'?'#aa561d':'#276875'):roadInfo(road.type).color,
   'stroke-width':full?({highway:5,arterial:4}[road.type]??2.5)/scale:Math.max(1.3/scale,road.width),
   'data-plan-road':road.type,
   'stroke-dasharray':road.structure==='elevated'?`${8/scale} ${5/scale}`:'none',
   'stroke-linecap':'round','stroke-linejoin':'round'},host);
  for(const point of preview.externalConnections||[])node('circle',{cx:point[0],cy:point[1],screen:{r:4.5},
   fill:'#f0ad5d',stroke:'#634226','stroke-width':1.4,'vector-effect':'non-scaling-stroke'},host);
 }
 if(full)for(const [kind,,name,color]of visibleMasterPins($('masterPlanMode').value)){
  for(const [index,point]of masterPins(session,kind).entries()){
   node('circle',{cx:point[0],cy:point[1],screen:{r:6},fill:color,stroke:'#fff','stroke-width':1.5,'vector-effect':'non-scaling-stroke'},host);
   label(name+' '+(index+1),point,color,host,11,-9);
  }
 }
}

function syncMasterPlanInputs(){
 const session=masterPlanSession;
 if(session?.mode!=='full')return;
 const mode=$('masterPlanMode').value;
 const visible=visibleMasterPins(mode);
 for(const [kind,id]of masterPinTools){
  const shown=visible.some(([key])=>key===kind);
  const pick=$('masterPlanPick'+id),clear=$('masterPlanClear'+id);
  pick.hidden=clear.hidden=!shown;
  pick.setAttribute('aria-pressed',String(session.picking===kind));
  clear.disabled=!masterPins(session,kind).length;
 }
 $('masterPlanPickReserve').setAttribute('aria-pressed',String(session.picking==='reserve'));
 $('masterPlanClearReserves').disabled=!session.reserves.length;
 const picking=masterPinTools.find(([kind])=>kind===session.picking);
 const summary=visible.map(([kind,,name])=>name+' '+(masterPins(session,kind).length||'自动')).join(' · ');
 $('masterPlanInputs').textContent=picking?'单击地图标记'+picking[2]+'，再点一次按钮结束。':
  session.picking==='reserve'?(session.corner?'单击避让范围的另一个角。':'单击避让范围的第一个角。'):
  [summary,'避让范围 '+session.reserves.length+' 处'].filter(Boolean).join(' · ');
 viewport.style.cursor=session.picking?'crosshair':'default';
}

function invalidateMasterPlanPreview(){
 if(!masterPlanSession)return;
 planningRequest++;
 $('masterPlanGenerate').disabled=false;
 masterPlanSession.preview=null;
 masterPlanSession.status='';
 renderDistrictPlanResults();
 $('masterPlanApply').disabled=true;
 $('masterPlanStatus').textContent='';
 renderMasterPlan();
}

function pickMasterPlanPoint(point){
 const session=masterPlanSession;
 if(session.picking!=='reserve'){
  const kind=session.picking,points=masterPins(session,kind);
  if(points.length>=6){toast('每类最多可标记 6 处');return;}
  let target=point;
  if(kind!=='interchange'){
   const types=kind==='highway'?['highway']:kind==='arterial'?['arterial','secondary']:null;
   const roads=project.features.filter(f=>isStreetRoad(f)&&roadStackLevel(f)===0&&featureVisible(f)&&(!types||types.includes(f.type)));
   target=createRoadSegmentIndex(roads).nearest(point,Math.min(50,8/view.scale))?.point||point;
   if(target===point&&types)target=point.map(n=>n<36?0:n>SIZE-36?SIZE:n);
  }
  if(!points.some(p=>distance(p,target)<20))points.push(target);
 }else if(!session.corner)session.corner=point;
 else{
  if(Math.abs(session.corner[0]-point[0])<20||Math.abs(session.corner[1]-point[1])<20){toast('避让范围至少需要 20 × 20 米');return;}
  session.reserves.push([session.corner,point]);session.corner=null;session.picking=null;
 }
 markPlanningSettings();invalidateMasterPlanPreview();syncMasterPlanInputs();
}

function showInspector(mode){
 planningRequest++;
 const planning=mode==='full'||mode==='local';
 inspectorMode=mode;
 const panel=$('rightPanel'),hidden=mode==='hidden';
 panel.hidden=hidden;
 panel.classList.toggle('inspector-planning',planning);
 panel.closest('.workspace').classList.toggle('inspector-hidden',hidden);
 $('planningPanel').hidden=!planning;
 $('propertiesPanel').hidden=planning;
 $('inspectorTabs').hidden=planning;
 $('globalPlanningUnavailable').hidden=mode!=='full';
 for(const id of ['masterPlanStatus','masterPlanGenerate','masterPlanApply'])$(id).hidden=mode==='full';
 $('localPlanForm').hidden=mode!=='local';
 $('openMasterPlan').setAttribute('aria-pressed',String(mode==='full'));
 $('openLocalPlan').setAttribute('aria-pressed',String(mode==='local'));
 $('toggleInspector').setAttribute('aria-expanded',String(!hidden));
 $('toggleInspector').textContent=hidden?'显示右栏':'隐藏右栏';
 if(planning){
  panel.classList.add('has-selection');
  $('inspectorHeading').textContent='规划工具';
  panel.querySelector('.right-scroll').scrollTop=0;
 }else{
  if(masterPlanSession){masterPlanSession.picking=null;masterPlanSession.corner=null;}
  masterPlanSession=null;
  renderDistrictPlanResults();
  viewport.style.cursor=tool==='pan'?'grab':tool==='select'?'default':'crosshair';
  renderMasterPlan();
  if(!hidden)renderProperties();
 }
}
function planningEditorState(){
 return {project,history,future,view:{...view},activeLayer:{...activeLayer},dirty:projectDirty,
  terrainFiles,openedBaseImages,session:[...planningSessions]};
}

function switchPlanningEditor(state){
 showInspector('properties');
 ({project,history,future,view,activeLayer,terrainFiles,openedBaseImages}=state);
 projectDirty=state.dirty;
 planningSessions.clear();
 for(const [mode,session]of state.session)planningSessions.set(mode,session);
 draft=[];selected=null;selectedNode=null;drag=null;scopeId='';listQuery='';
 editRevision++;invalidateEditGeometry();setTool('select',{redraw:false});
 buildLayers();syncUI();render();renderProperties();updateUndo();updateSaveStatus();
 refreshPlanningWorkspace();
}

function workspaceFieldSettings(){
 return {stage:$('masterPlanMode').value,theme:$('scenicTheme').value,roadMode:$('scenicRoadMode').value,
  focus:$('masterPlanFocus').value,count:$('masterPlanCount').value,grade:$('masterPlanGrade').value,
  uses:readPlanningUses('masterPlanUses'),volumes:planningWorkspace.volumes};
}

function restoreWorkspaceFields(config={}){
 const fields={stage:'masterPlanMode',theme:'scenicTheme',roadMode:'scenicRoadMode',focus:'masterPlanFocus',
  count:'masterPlanCount',grade:'masterPlanGrade'};
 for(const [key,id]of Object.entries(fields))if(config[key]!=null){
  const field=$(id),value=String(config[key]);
  if(field.tagName==='INPUT'||[...field.options].some(option=>option.value===value))field.value=value;
 }
 if(config.uses)setPlanningUses('masterPlanUses',config.uses);else applyMasterProfile();
 planningWorkspace.volumes=config.volumes&&typeof config.volumes==='object'?
  Object.fromEntries(Object.entries(config.volumes).filter(([,value])=>['small','medium','large'].includes(value))):{};
 syncMasterMix();syncScenicTheme();syncMasterMode();
}

function activatePlanningWorkspace(){
 if(basePlanningState)return true;
 if(projectSaving||drag?.moved){toast('请先完成当前编辑');return false;}
 clearTimeout(saveTimer);saveBrowser();
 clearTimeout(desktopDraftTimer);desktopDraftTimer=null;
 basePlanningState=planningEditorState();
 if(!planningWorkspace){
  const copy=structuredClone(project);
  planningWorkspace={id:crypto.randomUUID(),project:copy,referenceIds:new Set(project.features.map(f=>f.id)),
   frame:projectMapFrame(project),hiddenStages:new Set(),dirty:false,writer:new ProjectFileWriter(),
   config:{stage:'theme',theme:'valley',roadMode:'joint',focus:'balanced',count:5,grade:'.12'},volumes:{},
   state:{...planningEditorState(),project:copy,terrainFiles:new Map(terrainFiles),openedBaseImages:{...openedBaseImages},
    history:[],future:[],dirty:false,session:[]}};
 }
 switchPlanningEditor(planningWorkspace.state);
 restoreWorkspaceFields(planningWorkspace.config);
 return true;
}

function leavePlanningWorkspace(){
 if(!basePlanningState||projectSaving)return;
 planningWorkspace.state=planningEditorState();planningWorkspace.config=workspaceFieldSettings();
 planningWorkspace.project=project;
 const previous=basePlanningState;basePlanningState=null;
 switchPlanningEditor(previous);
 if(projectDirty&&window.mapDesktop)scheduleDesktopDraft();
}

function refreshPlanningWorkspace(){
 const panel=$('planWorkspacePanel');
 panel.hidden=!basePlanningState;
 if(panel.hidden)return;
 const layers=$('planWorkspaceLayers'),counts={};
 for(const f of planningWorkspaceAdditions(project,planningWorkspace.referenceIds)){
  const stage=planningStageOf(f);
  counts[stage]=(counts[stage]||0)+1;
 }
 $('planWorkspaceInfo').textContent=planningWorkspace.dirty?'有未保存的工作区改动。':'工程对象在这里作为只读参考。';
 const entries=[['reference','现状参考',planningWorkspace.referenceIds.size],...Object.entries(planningWorkspaceStages)
  .map(([key,label])=>[key,label,counts[key]||0])];
 layers.innerHTML=entries.map(([key,label,count])=>`<label><input type="checkbox" data-workspace-stage="${key}" ${planningWorkspace.hiddenStages.has(key)?'':'checked'}>${label}<small>${count}</small></label>`).join('');
}

function visiblePlanningWorkspaceProject(){
 const subset=planningWorkspaceAdditions(project,planningWorkspace.referenceIds)
  .filter(f=>!planningWorkspace.hiddenStages.has(planningStageOf(f)));
 const byId=new Map(subset.map(f=>[f.id,f]));
 for(const f of project.features){
  if(f.kind==='note'&&f.districtId&&f.attributes?.PlanStage==='volume'&&byId.has(f.id)){
   const district=byId.get(f.districtId);
   if(district?.kind==='district')byId.set(district.id,{...district,attributes:{...district.attributes,ScenicHeight:f.attributes.ScenicHeight}});
  }
 }
 return {...project,features:[...byId.values()]};
}

async function savePlanningWorkspace(asNew=false){
 if(!basePlanningState||projectSaving)return false;
 projectSaving=true;updateSaveStatus();
 const active=planningWorkspace,revision=editRevision;
 try{
  await ensureTerrainFiles();
  const session=planningSessions.get('full');
  const config=workspaceFieldSettings(),snapshot=structuredClone(project);
  const workspace={kind:'isolated-planning',version:1,id:active.id,referenceIds:[...active.referenceIds],planningFrame:active.frame,
   hiddenStages:[...active.hiddenStages],config,access:session?.access,roadPins:session?.roadPins,reserves:session?.reserves};
  const pack=window.mapDesktop?.tauri?packTauriProject:packProject;
  const bytes=await pack(snapshot,{baseImages:openedBaseImages,terrainFiles:activeTerrainFiles(),workspace});
  const name=project.title.replace(/[\\/:*?"<>|]/g,'-')+' · 规划工作区.cs2plan';
  if(window.showSaveFilePicker){
   const choice=await chooseProjectSaveTarget(active.writer,{asNew,currentName:active.fileName,suggestedName:name,
    pick:()=>window.showSaveFilePicker({suggestedName:name,types:[{description:'独立规划工作区',accept:{'application/octet-stream':['.cs2plan']}}]})});
   if(!/\.cs2plan$/i.test(choice.name))throw Error('工作区请使用 .cs2plan 文件名。');
   await choice.writer.save(bytes);active.writer=choice.writer;active.fileName=choice.name;
  }else await download(bytes,name,'application/octet-stream');
  if(editRevision===revision)active.dirty=false;
  refreshPlanningWorkspace();toast('规划工作区已保存');return true;
 }catch(error){if(error.name!=='AbortError')toast('工作区保存失败：'+error.message);return false;}
 finally{projectSaving=false;updateSaveStatus();}
}

async function openPlanningWorkspaceFile(file,handle=null){
 if(!file||projectSaving)return;
 if(planningWorkspace?.dirty&&!confirm('当前规划工作区有未保存的改动。打开另一个工作区？'))return;
 projectSaving=true;updateSaveStatus();
 try{
  if(file.size>512*1024*1024)throw Error('工作区文件超过 512 MB。');
  const bytes=await file.arrayBuffer(),doc=await unpackProject(bytes),data=doc.workspace;
  if(data.kind!=='isolated-planning'||data.version!==1||typeof data.id!=='string'||!Array.isArray(data.referenceIds))
   throw Error('请选择独立规划工作区文件。');
  if(!basePlanningState){
   projectSaving=false;
   if(!activatePlanningWorkspace())return;
   projectSaving=true;
  }
  const writer=new ProjectFileWriter();
  if(handle&&/\.cs2plan$/i.test(file.name))writer.attach(handle,bytes);
  const features=new Set(doc.project.features.map(f=>f.id));
  const loadedTerrain=new Map();
  for(const raster of doc.project.rasters){
   const raw=doc.terrainFiles.get(raster.id);
   if(raw)loadedTerrain.set(raster.id+':'+terrainFingerprint(raster.data),raw);
  }
  const cleanPoint=point=>Array.isArray(point)&&point.length===2&&point.every(n=>Number.isFinite(n)&&n>=0&&n<=SIZE);
  const points=list=>Array.isArray(list)?list.filter(cleanPoint):[];
  const full={mode:'full',picking:null,corner:null,preview:null,terrain:null,status:'',access:points(data.access),
   roadPins:Object.fromEntries(['highway','arterial','interchange'].map(kind=>[kind,points(data.roadPins?.[kind])])),
   reserves:Array.isArray(data.reserves)?data.reserves.filter(pair=>Array.isArray(pair)&&pair.length===2&&pair.every(cleanPoint)):[]};
  planningWorkspace={id:data.id,project:doc.project,referenceIds:new Set(data.referenceIds.filter(id=>features.has(id))),
   frame:data.planningFrame||null,hiddenStages:new Set(Array.isArray(data.hiddenStages)?data.hiddenStages:[]),
   config:data.config||{},volumes:{},dirty:false,writer,fileName:file.name,
   state:{...planningEditorState(),project:doc.project,terrainFiles:loadedTerrain,openedBaseImages:doc.baseImages,
    history:[],future:[],dirty:false,session:[['full',full]]}};
  switchPlanningEditor(planningWorkspace.state);restoreWorkspaceFields(planningWorkspace.config);
  startPlanning('local');toast('已打开规划工作区：'+file.name);
 }catch(error){toast('工作区打开失败：'+error.message);}
 finally{projectSaving=false;updateSaveStatus();}
}

async function exportVisiblePlanningWorkspace(){
 if(!basePlanningState||projectSaving)return;
 projectSaving=true;updateSaveStatus();
 try{
  const visible=visiblePlanningWorkspaceProject(),planned=createPlanningProject(visible);
  const pack=window.mapDesktop?.tauri?packTauriProject:packProject;
  const bytes=await pack(planned.project,{workspace:{kind:'planning-layer',version:1,planningFrame:planningWorkspace.frame}});
  await download(bytes,'可见规划.cs2map','application/octet-stream');
  toast('可见规划已导出，可在项目中用叠加导入打开。');
 }catch(error){if(error.name!=='AbortError')toast(error.message);}
 finally{projectSaving=false;updateSaveStatus();}
}

function mergeVisiblePlanningWorkspace(){
 if(!basePlanningState||projectSaving)return;
 try{
  const visible=visiblePlanningWorkspaceProject(),count=visible.features.length;
  if(!count)throw Error('当前没有可见的规划对象。');
  const matched=checkPlanningFrame(basePlanningState.project,planningWorkspace.frame);
  const extra=matched?'':' 两者缺少完整的地图坐标信息，请确认属于同一张地图。';
  if(!confirm('将 '+count+' 个可见规划对象合并到当前工程？'+extra))return;
  const result=mergePlanningWorkspace(basePlanningState.project,visible,{referenceIds:new Set(),id:planningWorkspace.id,frame:planningWorkspace.frame});
  leavePlanningWorkspace();
  checkpoint();project=result.project;buildLayers();changed();
  toast('已合并 '+result.count+' 个规划对象，可在工程中整批撤销。');
 }catch(error){toast(error.message);}
}

$('planWorkspaceTools').onclick=()=>startPlanning(lastPlanningScope);
$('planWorkspaceSave').onclick=()=>savePlanningWorkspace();
$('planWorkspaceOpen').onclick=async()=>{
 try{
  if(window.showOpenFilePicker){
   const [handle]=await window.showOpenFilePicker({multiple:false,types:[{description:'独立规划工作区',
    accept:{'application/octet-stream':['.cs2plan']}}]});
   await openPlanningWorkspaceFile(await handle.getFile(),handle);
  }else $('planWorkspaceFile').click();
 }catch(error){if(error.name!=='AbortError')toast(error.message);}
};
$('planWorkspaceFile').onchange=event=>{
 const file=event.target.files[0];event.target.value='';openPlanningWorkspaceFile(file);
};
$('planWorkspaceExport').onclick=exportVisiblePlanningWorkspace;
$('planWorkspaceMerge').onclick=mergeVisiblePlanningWorkspace;
$('planWorkspaceLeave').onclick=leavePlanningWorkspace;
$('planWorkspaceLayers').onchange=event=>{
 const key=event.target.dataset.workspaceStage;
 if(!basePlanningState||!key)return;
 if(event.target.checked)planningWorkspace.hiddenStages.delete(key);else planningWorkspace.hiddenStages.add(key);
 if(selected&&!featureVisible(getSelected())){selected=null;selectedNode=null;}
 render();renderProperties();planningWorkspace.dirty=true;updateSaveStatus();
};

function startPlanning(mode){
 if(!activatePlanningWorkspace()||inspectorMode===mode)return;
 planningWorkspace.editStage='local';
 setTool('select',{redraw:false});
 if(masterPlanSession){masterPlanSession.picking=null;masterPlanSession.corner=null;}
 if(!planningSessions.has(mode)){
  planningSessions.set(mode,{mode,access:[],roadPins:{highway:[],arterial:[],interchange:[]},reserves:[],picking:null,corner:null,preview:null,terrain:null,status:''});
 }
 const session=planningSessions.get(mode);
 masterPlanSession=session;
 showInspector(mode);
 if(mode==='full'){
  session.preview=null;session.status='';
  $('masterPlanGenerate').disabled=true;
  $('masterPlanApply').disabled=true;
  renderDraft();renderMasterPlan();
  return;
 }
 $('masterPlanGenerate').disabled=false;
 if(session.preview&&session.preview.revision!==editRevision){
  session.preview=null;session.status='工程内容已变化，请重新生成预览。';
 }
 $('masterPlanApply').disabled=!session.preview;
 syncMasterPlanInputs();
 if(mode==='local'){
  const districts=project.features.filter(f=>f.kind==='district'&&f.level!=='tile');
  const current=getSelected();
  const districtId=districts.some(f=>f.id===session.districtId)?session.districtId:
   districts.some(f=>f===current)?current.id:'';
  $('localPlanDistrict').innerHTML=options([['','选择片区'],...districts.map(f=>[f.id,f.name])],districtId);
  if(!session.districtId||session.districtId!==districtId)setLocalPlanningDistrict(districtId);
  syncLocalConnections();
  $('masterPlanStatus').textContent=session.status||(districts.length?'生成后可核对具体建筑、接入道路和绿化。':'请先绘制片区，或采纳一份片区规划。');
 }else{syncMasterMode();$('masterPlanStatus').textContent=session.status;}
 renderDraft();renderMasterPlan();renderDistrictPlanResults();
}
const fullPlanModeHelp={
 theme:'先暂存主题和主场景。工程含地形时，可一起预览候选观察点和场景联系。',
 district:'按用途、地形和主题主场景划粗略分区。暂存后可选中片区编辑边界。',
 corridors:'比较高速或主干道的大致走向。将选中的方案暂存为走向图层，可手动改线。',
 volume:'对工作区已暂存的建设片区设定体量。暂存后，区域规划会使用对应的建议限高。',
 roads:'参考已暂存的分区和经手动调整的走向，生成平顺的道路与互通预留。'
};
function fillPlanningUses(id,max,unit=''){
 $(id).innerHTML=ZONES.map(([group,uses])=>`<details><summary>${group}</summary>${uses.map(([key,name])=>
  `<label>${name}<input type="number" data-plan-use="${key}" min="0" max="${max}" step="1" value="0">${unit?'<span aria-hidden="true">'+unit+'</span>':''}</label>`).join('')}</details>`).join('');
}
function useInputs(id){return [...$(id).querySelectorAll('[data-plan-use]')];}
function readPlanningUses(id){
 return Object.fromEntries(useInputs(id).map(input=>[input.dataset.planUse,input.validity.valid?Number(input.value):NaN]));
}
function setPlanningUses(id,counts){
 for(const input of useInputs(id))input.value=counts[input.dataset.planUse]||0;
}
function planningUseSummary(id,summary,suffix){
 const total=Object.values(readPlanningUses(id)).reduce((sum,count)=>sum+count,0);
 for(const group of $(id).querySelectorAll('details')){
  const used=[...group.querySelectorAll('input')].filter(input=>Number(input.value)>0).length;
  const title=group.querySelector('summary');
  title.dataset.name||=title.textContent;
  title.textContent=title.dataset.name+(used?` · ${used} 项`:'');
 }
 $(summary).textContent=Number.isFinite(total)?suffix(total):'用途输入超出范围。';
}
function syncMasterMix(){planningUseSummary('masterPlanUses','masterPlanMixSummary',
 total=>`各用途合计 ${total} / ${$('masterPlanCount').value||'—'} 个；填 0 表示不安排。`);}
function syncLocalMix(){planningUseSummary('localPlanUses','localPlanMixSummary',
 total=>`合计 ${total}% / 100%。按规划地块面积分配，绿地也计入 100%。`);}
function applyMasterProfile(){
 const profile=masterPlanProfiles[$('masterPlanFocus').value],count=$('masterPlanCount');
 if(profile&&count.validity.valid){
  const uses={};
  for(let i=0;i<Number(count.value);i++){const type=profile[i%profile.length];uses[type]=(uses[type]||0)+1;}
  setPlanningUses('masterPlanUses',uses);
 }
 syncMasterMix();
}
const localConnectionPreferenceKey='map-design-local-connections';
let localConnectionPreference={mode:'auto',count:null};
try{
 const saved=JSON.parse(localStorage.getItem(localConnectionPreferenceKey));
 if(saved){
  if(['manual','unlimited'].includes(saved.mode))localConnectionPreference.mode=saved.mode;
  if(Number.isInteger(saved.count)&&saved.count>=0&&saved.count<=maxManualLocalConnections)localConnectionPreference.count=saved.count;
 }
}catch{}
$('localPlanConnectionMode').value=localConnectionPreference.mode;
$('localPlanConnectionCount').max=maxManualLocalConnections;

function saveLocalConnectionPreference(){
 try{localStorage.setItem(localConnectionPreferenceKey,JSON.stringify(localConnectionPreference));}catch{}
}
function syncLocalConnections(){
 const district=project.features.find(feature=>feature.id===$('localPlanDistrict').value);
 const policy=localConnectionDefaults(district,readPlanningUses('localPlanUses'));
 const mode=$('localPlanConnectionMode').value,manual=mode==='manual';
 $('localPlanManualConnections').hidden=!manual;
 const input=$('localPlanConnectionCount');
 if(manual&&document.activeElement!==input){
  input.value=localConnectionPreference.count??(policy?.target||(policy?.max===null?4:2));
 }
 $('localPlanConnectionDefault').textContent=mode==='unlimited'?'接点数量不限，优先接入不同侧的现状道路，并保留路口间距。':!policy?'选择片区后查看自动建议。':
  policy.label+'自动建议：'+(policy.max===null?'按外围道路条件多侧接入。':
  policy.target+(policy.target===policy.max?'':'–'+policy.max)+' 处。');
}

function setLocalPlanningDistrict(id){
 masterPlanSession.districtId=id;
 const district=project.features.find(feature=>feature.id===id);
 const height=$('localPlanHeight'),previousSuggested=height.dataset.suggested;
 const volume=basePlanningState?project.features.findLast(f=>f.kind==='note'&&f.districtId===id&&f.attributes?.PlanStage==='volume'):null;
 const suggested=volume?.attributes?.ScenicHeight??district?.attributes?.ScenicHeight;
 if(Number.isFinite(suggested)){
  height.value=suggested;height.dataset.suggested=height.value;
 }else if(previousSuggested){
  if(height.value===previousSuggested)height.value='';
  delete height.dataset.suggested;
 }
 const recommended=suggestLocalUses(project.features.find(feature=>feature.id===id),project);
 if(!recommended.park){
  const types=Object.keys(recommended);
  let left=88;
  for(const [i,type]of types.entries()){
   recommended[type]=i===types.length-1?left:Math.round(recommended[type]*.88);
   left-=recommended[type];
  }
  recommended.park=12;
 }
 setPlanningUses('localPlanUses',recommended);
 syncLocalMix();syncLocalConnections();
 invalidateMasterPlanPreview();
}
const workspaceHeights={small:18,medium:35,large:65};
function syncScenicTheme(){
 const theme=scenicThemes[$('scenicTheme').value];
 $('scenicThemeDirection').textContent=theme.direction;
 const host=$('scenicVolumes');
 host.replaceChildren();
 if(!basePlanningState||$('masterPlanMode').value!=='volume')return;
 const districts=planningWorkspaceAdditions(project,planningWorkspace.referenceIds).filter(f=>f.kind==='district'&&
  !['park','forest','reserve'].includes(f.type));
 if(!districts.length){
  host.textContent='请先暂存功能分区，或在工作区手动画出建设片区。';
  return;
 }
 for(const district of districts){
  const row=document.createElement('label'),select=document.createElement('select');
  row.textContent=district.name;select.dataset.scenicUse=district.id;
  select.innerHTML=options([['small','低体量 · 18 m'],['medium','中等 · 35 m'],['large','集中 · 65 m']],
   planningWorkspace.volumes[district.id]||(district.type===theme.core?'medium':'small'));
  row.append(select);host.append(row);
 }
}
$('scenicTheme').innerHTML=options(Object.entries(scenicThemes).map(([id,theme])=>[id,theme.name]),'valley');
syncScenicTheme();

function syncMasterMode(){
 const mode=$('masterPlanMode').value,roads=mode==='corridors'||mode==='roads';
 $('masterPlanDistrictOptions').hidden=mode!=='district';
 $('scenicPlanOptions').hidden=mode!=='theme';
 $('workspaceVolumeOptions').hidden=mode!=='volume';
 $('workspaceRoadOptions').hidden=!roads;
 $('masterTerrainOptions').hidden=mode==='volume'||mode==='theme';
 $('masterPlanModeHelp').textContent=fullPlanModeHelp[mode];
 syncScenicTheme();
}
fillPlanningUses('masterPlanUses',40);
fillPlanningUses('localPlanUses',100,'%');
applyMasterProfile();
syncMasterMode();

let hiddenInspectorMode='properties',lastPlanningScope='local';
$('toggleInspector').onclick=()=>{
 if(inspectorMode!=='hidden'){
  hiddenInspectorMode=inspectorMode;
  showInspector('hidden');
 }else if(hiddenInspectorMode==='properties')showInspector('properties');
 else startPlanning(hiddenInspectorMode);
 $('toggleInspector').closest('details').open=false;
};
$('openPlanningTools').onclick=()=>{
 startPlanning(lastPlanningScope);
 $('openPlanningTools').closest('details').open=false;
};
$('openMasterPlan').onclick=()=>startPlanning(lastPlanningScope='full');
$('openLocalPlan').onclick=()=>startPlanning(lastPlanningScope='local');
$('cancelPlanning').onclick=()=>{
 planningSessions.delete(inspectorMode);
 showInspector('properties');
};
function markPlanningSettings(){
 if(!basePlanningState)return;
 planningWorkspace.dirty=true;refreshPlanningWorkspace();updateSaveStatus();
}
$('scenicTheme').onchange=()=>{syncScenicTheme();markPlanningSettings();invalidateMasterPlanPreview();};
$('workspaceThemeUses').onclick=()=>{
 const {uses}=scenicThemes[$('scenicTheme').value];
 $('masterPlanFocus').value='custom';
 $('masterPlanCount').value=Object.values(uses).reduce((sum,count)=>sum+count,0);
 setPlanningUses('masterPlanUses',uses);syncMasterMix();markPlanningSettings();invalidateMasterPlanPreview();
};
$('scenicVolumes').onchange=event=>{
 const id=event.target.dataset.scenicUse;
 if(id)planningWorkspace.volumes[id]=event.target.value;
 markPlanningSettings();invalidateMasterPlanPreview();
};
$('scenicRoadMode').onchange=()=>{
 masterPlanSession.picking=null;masterPlanSession.corner=null;
 syncMasterPlanInputs();markPlanningSettings();invalidateMasterPlanPreview();
};
$('masterPlanMode').onchange=()=>{
 const session=masterPlanSession;
 session.picking=null;session.corner=null;
 planningWorkspace.editStage=$('masterPlanMode').value;
 syncMasterMode();markPlanningSettings();invalidateMasterPlanPreview();syncMasterPlanInputs();
};
for(const id of ['masterPlanFocus','masterPlanCount'])$(id).oninput=()=>{applyMasterProfile();markPlanningSettings();invalidateMasterPlanPreview();};
$('masterPlanUses').oninput=()=>{$('masterPlanFocus').value='custom';syncMasterMix();markPlanningSettings();invalidateMasterPlanPreview();};
$('localPlanUses').oninput=()=>{syncLocalMix();syncLocalConnections();invalidateMasterPlanPreview();};
$('localPlanConnectionMode').onchange=event=>{
 localConnectionPreference.mode=event.target.value;
 saveLocalConnectionPreference();syncLocalConnections();invalidateMasterPlanPreview();
};
$('localPlanConnectionCount').oninput=event=>{
 if(event.target.validity.valid){
  localConnectionPreference.count=Number(event.target.value);
  saveLocalConnectionPreference();
 }
 invalidateMasterPlanPreview();
};
$('resetLocalUses').onclick=()=>setLocalPlanningDistrict($('localPlanDistrict').value);
for(const [mode,id]of [...masterPinTools,['reserve','Reserve']]){
 $('masterPlanPick'+id).onclick=()=>{
  const session=masterPlanSession;
  session.picking=session.picking===mode?null:mode;
  session.corner=null;
  syncMasterPlanInputs();renderMasterPlan();
 };
 if(mode!=='reserve')$('masterPlanClear'+id).onclick=()=>{
  masterPins(masterPlanSession,mode).length=0;
  markPlanningSettings();invalidateMasterPlanPreview();syncMasterPlanInputs();
 };
}
$('masterPlanClearReserves').onclick=()=>{masterPlanSession.reserves=[];markPlanningSettings();invalidateMasterPlanPreview();syncMasterPlanInputs();};
$('masterPlanGrade').oninput=()=>{markPlanningSettings();invalidateMasterPlanPreview();};
for(const id of ['localPlanAngle','localPlanHeight'])$(id).oninput=invalidateMasterPlanPreview;
$('localPlanDistrict').onchange=event=>setLocalPlanningDistrict(event.target.value);

$('masterPlanGenerate').onclick=async()=>{
 const session=masterPlanSession;
 if(session?.mode!=='local')return;
 session.picking=null;session.corner=null;
 invalidateMasterPlanPreview();syncMasterPlanInputs();
 const revision=editRevision,request=planningRequest;
 $('masterPlanGenerate').disabled=true;
 $('masterPlanStatus').textContent='正在生成规划草案…';
 try{
  await new Promise(resolve=>setTimeout(resolve,25));
  if(request!==planningRequest||revision!==editRevision)return;
  await ensureTerrainFiles();
  if(request!==planningRequest||revision!==editRevision)return;
  const files=activeTerrainFiles(),elevation=files.get('elevation'),depth=files.get('depth');
  const phase=$('masterPlanMode').value;
  if(session.mode==='full'&&!['theme','volume'].includes(phase)&&(!elevation||!depth))throw Error('需要原始 Elevation.tif 和 Depth.tif，请先导入完整的 Carto 文件夹。');
  const decode=bytes=>bytes?readTerrainTiff(bytes.byteOffset===0&&bytes.byteLength===bytes.buffer.byteLength?bytes.buffer:bytes.slice().buffer):null;
  if(!session.terrain||session.terrain.elevation!==elevation||session.terrain.depth!==depth){
   session.terrain={elevation,depth,inputs:{elevation:decode(elevation),depth:decode(depth)}};
  }
  let plan,district=null,status;
  if(session.mode==='local'){
   district=project.features.find(f=>f.id===$('localPlanDistrict').value);
   const angle=$('localPlanAngle'),height=$('localPlanHeight'),connections=$('localPlanConnectionCount');
   const connectionMode=$('localPlanConnectionMode').value,manual=connectionMode==='manual';
   if(!angle.validity.valid||!height.validity.valid)throw Error('请检查道路方向和建筑限高。');
   if(manual&&!connections.validity.valid)throw Error('请填写 0–'+maxManualLocalConnections+' 的整数作为目标接点数。');
   if(!district)throw Error('请先选择一个片区。');
   const localProject={...project,features:project.features.filter(f=>!workspaceCorridor(f))};
   const params={connectionCount:manual?Number(connections.value):null,unlimitedConnections:connectionMode==='unlimited',
    percentages:readPlanningUses('localPlanUses'),angle:angle.value===''?null:Number(angle.value),
    heightLimit:height.value?Number(height.value):Infinity};
   const key=JSON.stringify([revision,district.id,params]);
   if(session.variants?.key!==key)session.variants={key,recent:[],number:0};
   const variants=session.variants;
   const seed=crypto.getRandomValues(new Uint32Array(1))[0];
   plan=generateLocalPlan(localProject,district,{...params,terrain:session.terrain.inputs,seed,recentSignatures:variants.recent});
   variants.number++;
   variants.recent=[plan.signature,...variants.recent.filter(signature=>signature!==plan.signature)].slice(0,8);
   if(plan.repeated)plan.warnings.push('可用临街空间或接入条件有限，这次方案与近期草案相同。');
   const {coverage}=plan,total=Object.values(coverage).reduce((sum,n)=>sum+n,0);
   const pct=key=>Math.round(coverage[key]/(total||1)*100)+'%';
   status=`草案 ${variants.number} · ${plan.roads.length} 段内部道路、${plan.zones.length} 个地块、${plan.buildings.length} 栋资产、${plan.trees.length} 处建议植树点。`;
   if(plan.internalBuildings)status+=' 其中 '+plan.internalBuildings+' 栋沿新增内部道路布置。';
   if(plan.roads.length){
    const counts=new Map();
    for(const {type} of plan.roads)counts.set(type,(counts.get(type)||0)+1);
    status+='\n路型 · '+ROADS.filter(road=>counts.has(road.id)).map(road=>road.name+' '+counts.get(road.id)+' 段').join('、')+'。';
   }
   const direction=angle.value!==''?'手动方向 '+angle.value+'°':plan.northOffset?
    '自动轴网偏离南北 '+Math.round(plan.northOffset)+'°':'自动对齐南北／东西';
   status+='\n'+direction+(plan.guideName&&angle.value===''?'，兼顾外围道路':'')+'。'+
    plan.networkPolicy+' · 外部接点 '+plan.externalConnections.length+' 处'+
    (connectionMode==='unlimited'?'（不限，按路网顺接）。':plan.requestedConnections!==null?'（手动目标 '+plan.requestedConnections+' 处）。':
     plan.maximumConnections===null?'，优先多侧连通。':'（建议 '+plan.recommendedConnections+
     (plan.maximumConnections===plan.recommendedConnections?'':'–'+plan.maximumConnections)+' 处）。');

   status+='\n片区陆地估算 · 资产用地 '+pct('building')+'、路面 '+pct('road')+'、绿化 '+pct('green')+'、现状及预留 '+pct('reserved')+'、其余 '+pct('remaining')+'。';
   const greenCount=plan.zones.filter(zone=>zone.attributes?.PlanningGreen).length;
   if(greenCount)status+=' 补充绿地 '+greenCount+' 处。';
   if(plan.heightBands.length)status+='\n主要建筑高度 · '+plan.heightBands.map(({type,min,max})=>
    zoneInfo(type)[1]+' '+(min===max?min:`${min}–${max}`)+' 米').join('、')+'。';
   status+='\n用途面积（目标 → 草案）\n'+plan.distribution.map(({type,target,percent})=>
    zoneInfo(type)[1]+' '+target+'% → '+percent+'%').join('、')+'。';
  }else{
   const mode=$('masterPlanMode').value,count=$('masterPlanCount'),chosenTheme=$('scenicTheme').value;
   const theme=scenicThemes[chosenTheme],drafts=planningWorkspaceAdditions(project,planningWorkspace.referenceIds);
   const savedDistricts=drafts.filter(f=>f.kind==='district');
   const activeInputs={...session.terrain.inputs,maxGrade:Number($('masterPlanGrade').value),reserves:session.reserves};
   if(mode==='theme'){
    const hasTerrain=elevation&&depth;
    const scenic=hasTerrain?generateScenicPlan(project,{...activeInputs,theme:chosenTheme}):null;
    const fallback=[SIZE/2,SIZE/2];
    const scenicNotes=(scenic?.scenicNotes?.length?scenic.scenicNotes:[{name:theme.name,points:[fallback],notes:theme.direction}])
     .map((note,index)=>({...note,attributes:index===0?{PlanTheme:chosenTheme,PlanCore:theme.core}:{}}));
    plan={roads:[],scenicNotes,scenicGuides:scenic?.scenicGuides||[],warnings:scenic?.warnings||[]};
    status=theme.name+'。'+theme.direction+(hasTerrain?'':' 导入原始地形后可生成候选观察点。');
   }else if(mode==='district'){
    if(!count.validity.valid)throw Error('目标片区数须为 1–40 的整数。');
    const anchor=drafts.findLast(f=>f.kind==='note'&&f.attributes?.PlanTheme===chosenTheme);
    plan=generateMasterPlan(project,{...activeInputs,mode:'district',districtCount:Number(count.value),
     useCounts:readPlanningUses('masterPlanUses'),accessPoints:session.access,
     districtHints:anchor?{[theme.core]:anchor.points[0]}:{}});
    status=`已生成 ${plan.districts.length} 个分区。暂存后可手动修改边界。`;
   }else if(mode==='volume'){
    const uses=[...$('scenicVolumes').querySelectorAll('select')];
    if(!uses.length)throw Error('请先在工作区暂存功能分区，或手动画出建设片区。');
    plan={roads:[],warnings:[],scenicNotes:uses.map(select=>{
     const district=savedDistricts.find(f=>f.id===select.dataset.scenicUse),height=workspaceHeights[select.value];
     return {name:district.name+' · 建议限高 '+height+' 米',points:[interiorPoint(district.points)],districtId:district.id,
      notes:'区域规划会采用这个建议限高，可按场景继续调整。',attributes:{ScenicHeight:height}};
    })};
    status=`已为 ${uses.length} 个片区设置体量。暂存后会带入区域规划。`;
   }else{
    const roadMode=$('scenicRoadMode').value;
    const preferences=mode==='roads'?drafts.filter(f=>f.kind==='road'&&planningStageOf(f)==='corridors'):[];
    const centersHint=savedDistricts.filter(d=>!['park','forest','reserve'].includes(d.type)).map(d=>interiorPoint(d.points));
    const roadProject={...project,features:project.features.filter(f=>!(workspaceCorridor(f)))};
    const params={...activeInputs,mode:roadMode,centersHint,preferredRoads:preferences,
     highwayPoints:roadMode==='arterial'?[]:session.roadPins.highway,arterialPoints:roadMode==='highway'?[]:session.roadPins.arterial,
     interchangePoints:session.roadPins.interchange};
    const key=JSON.stringify([revision,mode,roadMode,params.maxGrade,session.roadPins,session.reserves]);
    if(session.highwayOptions?.key!==key||session.highwayOptions.terrain!==session.terrain)
     session.highwayOptions={key,terrain:session.terrain,plan:generateMasterPlan(roadProject,params),index:-1};
    const cache=session.highwayOptions,result=cache.plan;
    const alternatives=result.alternatives||[result];
    cache.index=(cache.index+1)%alternatives.length;
    const current=alternatives[cache.index];
    plan={...current,warnings:result.alternatives?[...result.highwayWarnings,...current.warnings]:current.warnings};
    status=planningWorkspaceStages[mode]+' · 方案 '+(cache.index+1)+' / '+alternatives.length+' · '+plan.roads.length+' 段。';
    if(mode==='roads'&&preferences.length)status+=' 已参考工作区保存的道路走向。';
    if(mode==='corridors')status+=' 可暂存走向后手动改线。';
   }

  }
  session.preview={plan,revision,districtId:district?.id,stage:session.mode==='local'?'local':phase};
  renderDistrictPlanResults();
  $('masterPlanApply').disabled=false;
  session.status=[status,...plan.warnings].join('\n');
  $('masterPlanStatus').textContent=session.status;
  if(district){focusObject(district);render();}
  else fit();
 }catch(error){if(request===planningRequest){session.status=error.message;$('masterPlanStatus').textContent=session.status;}}
 finally{if(request===planningRequest)$('masterPlanGenerate').disabled=false;}
};

$('masterPlanApply').onclick=()=>{
 const preview=masterPlanSession?.preview;
 if(!basePlanningState||masterPlanSession?.mode!=='local'||!preview||preview.revision!==editRevision){
  invalidateMasterPlanPreview();$('masterPlanStatus').textContent='工程内容已变化，请重新生成预览。';return;
 }
 try{
  const additions=preview.plan.roads.map((road,index)=>{
   const style=project.settings.editor.roadStyles[road.type],width=road.width??style.width;
   const {name,lanes}=roadInfo(road.type);
   return {...road,id:crypto.randomUUID(),kind:'road',name:`${preview.districtId?name:'总规骨干路'} ${index+1}`,
    notes:preview.districtId?'局部规划草案'+(road.type==='alley'?' · 双向通行，无中心线':''):'地形总规草案',source:'manual',width,corridor:Math.max(width,style.corridor),structure:road.structure||'ground',
    ...(lanes?{attributes:{Lane:lanes,Direction:'Both'}}:{}),
    ...(preview.districtId?{districtId:preview.districtId}:{})};
  });
  for(const [index,{points}]of (preview.plan.interchanges||[]).entries()){
   additions.push({kind:'interchange',type:'future',id:crypto.randomUUID(),name:'道路互通预留 '+(index+1),
    points,notes:'道路总规预留 · 可在范围内细化匝道',source:'manual'});
  }
  for(const district of preview.plan.districts||[]){
   const [points]=district.rings;
   const id=crypto.randomUUID(),color=classInfo({type:district.type})[2];
   const notes='地形总规草案'+(district.description?'\n'+district.description:'');
   additions.push({points,id,kind:'district',level:'large',name:district.name,
    type:district.type,color,notes,source:'manual',
    ...(district.scenicHeight?{attributes:{ScenicHeight:district.scenicHeight}}:{})});
   additions.push({points:structuredClone(points),id:crypto.randomUUID(),kind:'zone',name:district.name+' · 建议用途',
    type:district.type,districtId:id,planningGranularity:'master',notes,source:'manual'});
  }
  for(const note of preview.plan.scenicNotes||[])additions.push({...note,kind:'note',id:crypto.randomUUID(),source:'manual'});
  for(const guide of preview.plan.scenicGuides||[])additions.push({kind:'note',id:crypto.randomUUID(),source:'manual',
   name:guide.name,points:guide.points,notes:'主题构图参考线，可在工作区调整。',attributes:{PlanGuide:true}});
  for(const zone of preview.plan.zones||[]){
   additions.push({...zone,id:crypto.randomUUID(),kind:'zone',districtId:preview.districtId,source:'manual'});
  }
  let withAssets=project;
  if(preview.plan.buildings?.length){
   const packs=new Map(buildingPacksFor(project).map(pack=>[pack.id,pack])),included=new Set();
   for(const {feature,packId,assetId}of preview.plan.buildings){
    const key=packId+'/'+assetId;
    if(!included.has(key)){
     const pack=packs.get(packId),asset=pack?.assets.find(item=>item.id===assetId);
     if(!asset)throw Error('草案中的建筑资产已变化，请重新生成预览。');
     withAssets=includePlacedAsset(withAssets,pack,asset);
     included.add(key);
    }
    additions.push({...feature,id:crypto.randomUUID()});
   }
  }
  for(const tree of preview.plan.trees||[])additions.push({...tree,id:crypto.randomUUID()});
  for(const addition of additions)addition.attributes={...addition.attributes,PlanStage:preview.stage};
  const keys=new Set(additions.map(layerKey));
  if([...keys].some(key=>project.settings.editor.layers[key]?.locked))throw Error('请先解锁本方案涉及的路网或地块图层。');
  const replacedVolumes=new Set(preview.stage==='volume'?additions.map(f=>f.districtId):[]);
  const kept=project.features.filter(f=>!replacedVolumes.has(f.districtId)||f.attributes?.PlanStage!=='volume'||
   planningWorkspace.referenceIds.has(f.id));
  const next=prepareEditor({...withAssets,features:[...kept,...additions]});
  next.settings.editor.origins.planning=true;
  for(const key of keys){
   if(!next.settings.editor.layers[key])continue;
   next.settings.editor.groups[groupForLayer(key)]=true;
   next.settings.editor.layers[key].visible=true;
  }
  checkpoint();project=next;selected=null;selectedNode=null;scopeId='';
  planningWorkspace.hiddenStages.delete(preview.stage);
  if(preview.stage==='roads')planningWorkspace.hiddenStages.add('corridors');
  masterPlanSession.preview=null;masterPlanSession.status='';
  showInspector('properties');
  changed();
  toast('已暂存到「'+planningWorkspaceStages[preview.stage]+'」图层，可编辑或整批撤销。');
 }catch(error){$('masterPlanStatus').textContent=error.message;}
};

let namingBatch=[];
let namingLibraryOpen=false,namingPageIndex=0;
let namingPoolKey='',namingPool=[];
const namingPageSize=64;
function currentNamingPool(){
 const options=[$('namingStyle').value,$('namingType').value,$('namingLanguage').value];
 const key=options.join('/');
 if(key!==namingPoolKey){namingPool=nameCandidates(...options);namingPoolKey=key;}
 return namingPool;
}
function namingTarget(){
 const feature=getSelected();
 if(!feature||locked(feature))return null;
 if(['road','district','zone'].includes(feature.kind))return feature;
 return feature.kind==='building'&&['education','hospital','residential','commercial','industry','landscape','sports','office'].includes(feature.type)?feature:null;
}
async function copyNamingText(value){
 try{await navigator.clipboard.writeText(value);return true;}catch{
  const field=document.createElement('textarea');field.value=value;$('namingDialog').append(field);field.select();
  try{return document.execCommand('copy');}finally{field.remove();}
 }
}
function showNamingResults(){
 const pool=currentNamingPool(),canApply=!!namingTarget();
 if(namingLibraryOpen){
  const query=$('namingSearch').value.trim().toLowerCase();
  const filtered=query?pool.filter(name=>name.toLowerCase().includes(query)):pool;
  const pages=Math.max(1,Math.ceil(filtered.length/namingPageSize));
  namingPageIndex=Math.min(pages-1,Math.max(0,namingPageIndex));
  namingBatch=filtered.slice(namingPageIndex*namingPageSize,(namingPageIndex+1)*namingPageSize);
  $('namingPage').value=namingPageIndex+1;
  $('namingPage').max=pages;
  $('namingPageTotal').textContent=`共 ${pages} 页`;
  $('namingPrevPage').disabled=namingPageIndex===0;
  $('namingNextPage').disabled=namingPageIndex===pages-1;
  $('namingCountInfo').textContent=`${filtered.length.toLocaleString()} 个名称 · 本页 ${namingBatch.length} 个`;
 }else{
  const reserved=[project.title,...project.features.map(f=>f.name)].filter(Boolean);
  namingBatch=drawNames(pool,Number($('namingCount').value),reserved);
  $('namingCountInfo').textContent=`${pool.length.toLocaleString()} 个候选 · ${namingBatch.length} 个结果`;
 }
 $('namingStatus').textContent=namingBatch.length?(canApply?'可应用到选中的对象':''):'当前条件没有可用的名称';
 $('copyNameBatch').disabled=!namingBatch.length;
 $('copyNameBatch').textContent=namingLibraryOpen?'复制本页':'复制本批';
 $('generateNames').hidden=namingLibraryOpen;
 $('namingCount').disabled=namingLibraryOpen;
 $('namingLibraryTools').hidden=!namingLibraryOpen;
 $('toggleNamingLibrary').textContent=namingLibraryOpen?'返回随机':'查看全部';
 $('toggleNamingLibrary').setAttribute('aria-pressed',String(namingLibraryOpen));
 $('namingResults').innerHTML=namingBatch.map((name,i)=>{
  const lines=name.split(' / ').map(part=>`<span>${escape(part)}</span>`).join('');
  const apply=canApply?`<button data-apply-name="${i}" aria-label="应用 ${escape(name)}">应用</button>`:'';
  return `<li><div class="naming-item-text">${lines}</div><div class="naming-item-actions"><button data-copy-name="${i}" aria-label="复制 ${escape(name)}">复制</button>${apply}</div></li>`;
 }).join('');
 $('namingResults').scrollTop=0;
}
function refreshNamingSelection(){namingPageIndex=0;showNamingResults();}
$('openNamingTool').onclick=()=>{
 const menu=$('openNamingTool').closest('details');if(menu)menu.open=false;
 namingLibraryOpen=false;showNamingResults();$('namingDialog').showModal();
};
$('generateNames').onclick=showNamingResults;
$('toggleNamingLibrary').onclick=()=>{
 namingLibraryOpen=!namingLibraryOpen;
 $('namingSearch').value='';refreshNamingSelection();
 if(namingLibraryOpen)$('namingSearch').focus();
};
for(const id of ['namingStyle','namingType','namingLanguage','namingCount'])$(id).onchange=refreshNamingSelection;
$('namingSearch').oninput=refreshNamingSelection;
$('namingPrevPage').onclick=()=>{namingPageIndex--;showNamingResults();};
$('namingNextPage').onclick=()=>{namingPageIndex++;showNamingResults();};
$('namingPage').onchange=()=>{namingPageIndex=Math.floor(Number($('namingPage').value)||1)-1;showNamingResults();};
$('copyNameBatch').onclick=async()=>{
 const label=namingLibraryOpen?'本页':'本批';
 const copied=await copyNamingText(namingBatch.join('\n'));
 $('namingStatus').textContent=copied?`已复制${label}名称`:'复制失败，可选中文本手动复制';
};
$('namingResults').onclick=async event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.copyName!==undefined){$('namingStatus').textContent=await copyNamingText(namingBatch[Number(button.dataset.copyName)])?'已复制名称':'复制失败，可选中文本手动复制';return;}
 const target=namingTarget(),name=namingBatch[Number(button.dataset.applyName)];
 if(!target||!name)return;
 checkpoint(featureHistorySnapshot(project,target.id));target.name=name;$('namingDialog').close();changed();toast('已应用名称');
};

window.mapDesktop?.onClose?.(async()=>{
 if(projectSaving){toast('正在保存工程');return;}
 if(projectDirty||basePlanningState?.dirty||planningWorkspace?.dirty){
  if(!await window.mapDesktop.confirmDiscard())return;
  try{await clearDesktopDraft();}
  catch{toast('无法删除恢复草稿');return;}
 }
 await window.mapDesktop.exit();
});
if(window.mapDesktop)offerDesktopDraft().catch(()=>toast('无法读取恢复草稿'));

function openAboutDialog(){
 $('aboutLinkStatus').hidden=true;
 $('aboutDialog').showModal();
}
$('aboutDialog').addEventListener('click',async event=>{
 const link=event.target.closest('[data-reference]');
 if(!link||!window.mapDesktop?.openReference)return;
 event.preventDefault();
 $('aboutLinkStatus').hidden=true;
 try{await window.mapDesktop.openReference(link.dataset.reference);}
 catch(error){$('aboutLinkStatus').textContent=error.message||String(error);$('aboutLinkStatus').hidden=false;}
});

const registerMapLods=bindMapThreeView({
 async snapshot(){
  await ensureTerrainFiles();
  return {project,raw:activeTerrainFiles(),features:project.features.filter(featureVisible)};
 },
 selection:getSelected,
 toast
});
bindAssetExtractor(window.mapDesktop,(packs,models)=>{
 const message=installBuildingPacks(packs);
 const loaded=models.length?registerMapLods(models,packs):0;
 toast(message+(loaded?'，已载入 '+loaded+' 组 3D 模型':''));
});
if(window.mapDesktop?.presetBuildingFiles){
 loadPresetBuildingPacks().catch(error=>toast('无法读取预置投影：'+(error.message||error)));
}
