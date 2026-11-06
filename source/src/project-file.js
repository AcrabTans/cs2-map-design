import {projectAssetPacksForSave} from './building-assets.js';
import {createZip,readZip} from './archive.js';
import {prepareEditor} from './model.js';
const projectEncoder=new TextEncoder();
export function fromBase64(text){const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;}
export function toBase64(bytes){let text='';for(let i=0;i<bytes.length;i+=32768)text+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(text);}
function projectArchiveEntries(project,{terrainFiles=new Map(),baseImages={},workspace={}}={},compact=false){
 const clean=prepareEditor(project),entries=[],envelope={format:'cs2-map-project',version:1,savedAt:new Date().toISOString(),project:clean,baseImages:{},terrainFiles:{},workspace};
 if(compact)clean.assetPacks=projectAssetPacksForSave(clean.assetPacks||[]);
 function asset(path,data){const match=/^data:([^;]+);base64,(.*)$/s.exec(data);if(!match)throw Error('工程图像数据无效');entries.push({name:path,data:fromBase64(match[2])});return {path,mime:match[1]};}
 clean.basemaps=clean.basemaps.map((b,i)=>({...b,data:asset('Basemaps/custom-'+i+'.'+(b.data.includes('image/jpeg')?'jpg':b.data.includes('image/webp')?'webp':'png'),b.data)}));
 clean.rasters=clean.rasters.map(r=>({...r,data:asset('Terrain/'+r.id+'.png',r.data)}));
 for(const key of ['qgis','satellite'])if(baseImages[key]?.startsWith('data:'))envelope.baseImages[key]=asset('Basemaps/'+key+'.png',baseImages[key]);
 for(const id of ['depth','elevation'])if(terrainFiles.has(id)){const path='GeoTIFF/'+(id==='depth'?'Depth':'Elevation')+'.tif';entries.push({name:path,data:terrainFiles.get(id)});envelope.terrainFiles[id]=path;}
 entries.unshift({name:'project.json',data:projectEncoder.encode(JSON.stringify(envelope))});return entries;
}
export function packProject(project,options){
 return createZip(projectArchiveEntries(project,options));
}
export async function packTauriProject(project,options){
 const entries=projectArchiveEntries(project,options,true);
 for(const entry of entries){
  if(!entry.name.startsWith('GeoTIFF/'))continue;
  // ZIP method 8 uses raw DEFLATE. The zlib stream adds a 2-byte header and a 4-byte checksum.
  const stream=new Blob([entry.data]).stream().pipeThrough(new CompressionStream('deflate'));
  const compressed=new Uint8Array(await new Response(stream).arrayBuffer());
  entry.deflated=compressed.subarray(2,compressed.length-4);
 }
 return createZip(entries);
}
export async function unpackProject(input){
 const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
 if(bytes[0]!==80||bytes[1]!==75){const project=prepareEditor(JSON.parse(new TextDecoder().decode(bytes)));return {project,terrainFiles:new Map(),baseImages:{},workspace:{},legacy:true};}
 const files=await readZip(bytes,{ignore:name=>/\.glb$/i.test(name)});if(!files.has('project.json'))throw Error('工程文件缺少 project.json');const e=JSON.parse(new TextDecoder().decode(files.get('project.json')));
 if(e.format!=='cs2-map-project'||e.version!==1||!e.project)throw Error('工程文件格式或版本不支持');
 function asset(ref){if(!ref||typeof ref.path!=='string'||!/^image\/(png|jpeg|webp)$/.test(ref.mime)||!files.has(ref.path))throw Error('工程中的图像文件缺失');return 'data:'+ref.mime+';base64,'+toBase64(files.get(ref.path));}
 e.project.basemaps=(e.project.basemaps||[]).map(b=>({...b,data:asset(b.data)}));e.project.rasters=(e.project.rasters||[]).map(r=>({...r,data:asset(r.data)}));
 const baseImages={};for(const key of ['qgis','satellite'])if(e.baseImages?.[key])baseImages[key]=asset(e.baseImages[key]);const terrainFiles=new Map();
 for(const id of ['depth','elevation'])if(e.terrainFiles?.[id]){const file=files.get(e.terrainFiles[id]);if(!file)throw Error('工程原始 GeoTIFF 缺失');terrainFiles.set(id,file);}
 return {project:prepareEditor(e.project),terrainFiles,baseImages,workspace:e.workspace||{},savedAt:e.savedAt,legacy:false};
}

export class ProjectFileWriter{
 constructor(){this.handle=null;this.baseline=null;this.tail=Promise.resolve();this.generation=0;}
 attach(handle,baseline){this.generation++;this.handle=handle;this.baseline=new Uint8Array(baseline);}
 save(bytes){const handle=this.handle,generation=this.generation;const job=this.tail.then(async()=>{if(!handle)throw Error('请先选择工程保存位置');if(generation!==this.generation)throw Error('工程文件已切换');const baseline=this.baseline,disk=new Uint8Array(await (await handle.getFile()).arrayBuffer());if(disk.length!==baseline.length||disk.some((n,i)=>n!==baseline[i]))throw Error('工程文件已被外部修改，请重新打开，或另存为其他文件');let writable;try{writable=await handle.createWritable();await writable.write(bytes);await writable.close();this.baseline=new Uint8Array(bytes);}catch(error){if(writable)try{await writable.abort();}catch{}throw error;}});this.tail=job.catch(()=>{});return job;}
}

export async function chooseProjectSaveTarget(current,{asNew=false,currentName,suggestedName,pick}={}){
 if(current.handle&&!asNew)return {writer:current,name:currentName||current.handle.name};
 if(!pick)throw Error('当前浏览器不支持选择位置并覆盖保存，请使用新版 Chrome / Edge 打开本网页');
 const handle=await pick({suggestedName}),writer=new ProjectFileWriter();
 writer.attach(handle,await (await handle.getFile()).arrayBuffer());
 return {writer,name:handle.name};
}
