import {BUILTIN_BUILDING_PACKS} from './building-asset-data.js';
const buildingAssetTypes=['education','residential','hospital','police','fire','municipal','industry','commercial','sports','landscape','other'];
const validPopulationCapacity=v=>v===undefined||v===null||(Number.isSafeInteger(v)&&v>=0);
export function validateBuildingPacks(packs=[]){
 if(!Array.isArray(packs)||packs.length>100)throw Error('建筑资产包数量无效');
 const ids=new Set();let total=0,vertices=0;
 for(const p of packs){
  if(!p||typeof p.id!=='string'||!p.id||p.id.length>100||ids.has(p.id)||typeof p.name!=='string'||!p.name.trim()||p.name.length>300||!Array.isArray(p.assets)||!p.assets.length)throw Error('建筑资产包信息无效');if(p.lods!==undefined&&(!p.lods||typeof p.lods!=='object'||Array.isArray(p.lods)||Object.entries(p.lods).some(([k,v])=>!['lod1','lod2'].includes(k)||typeof v!=='string'||v.length>360*1024*1024||!v.startsWith('data:model/gltf-binary;base64,')&&!/^native-lod:[a-zA-Z0-9-]+$/.test(v)&&!BUILTIN_BUILDING_PACKS.some(b=>b.lods?.lod2===v))||p.lods.lod1&&!p.lods.lod2))throw Error('建筑LOD数据或顺序无效');ids.add(p.id);const assetIds=new Set();
  for(const a of p.assets){
   if(++total>20000||!a||typeof a.id!=='string'||!a.id||a.id.length>100||assetIds.has(a.id)||typeof a.name!=='string'||!a.name.trim()||a.name.length>300||typeof a.code!=='string'||a.code.length>300||!buildingAssetTypes.includes(a.type))throw Error('建筑资产名称或分类无效');assetIds.add(a.id);
   if(!Array.isArray(a.lot)||a.lot.length!==2||a.lot.some(v=>!Number.isFinite(v)||v<=0||v>10000)||!Number.isFinite(a.height)||a.height<=0||a.height>2000||!Number.isFinite(a.area)||a.area<=0||a.area>1e8)throw Error('建筑占地或高度无效');
   if(!validPopulationCapacity(a.maxResidents)||!validPopulationCapacity(a.maxEmployees))throw Error('建筑人数上限须为非负整数或留空');
   if(!Array.isArray(a.rings)||!a.rings.length||a.rings.length>512||a.rings.some(r=>!Array.isArray(r)||r.length<3||r.length>5000||r.some(pt=>!Array.isArray(pt)||pt.length!==2||pt.some(v=>!Number.isFinite(v)||Math.abs(v)>10000))))throw Error('建筑投影轮廓无效');
   vertices+=a.rings.reduce((n,r)=>n+r.length,0);if(vertices>2000000)throw Error('建筑资产库数据过大');
  }
 }
 return structuredClone(packs).map(p=>({...p,assets:p.assets.map(a=>({...a,maxResidents:a.maxResidents??null,maxEmployees:a.maxEmployees??null}))}));
}
export function buildingPacksFor(project){const merged=new Map(BUILTIN_BUILDING_PACKS.map(p=>[p.id,p]));for(const p of project.assetPacks||[]){const builtin=merged.get(p.id);if(!builtin){merged.set(p.id,p);continue;}const assets=new Map(builtin.assets.map(a=>[a.id,a]));for(const a of p.assets){const b=assets.get(a.id);assets.set(a.id,b?{...b,...a,...(!a.catalogCategory?{type:b.type,catalogCategory:b.catalogCategory,catalogLabel:b.catalogLabel,catalogSubcategory:b.catalogSubcategory}:{})}:a);}merged.set(p.id,{...builtin,...p,lods:{...builtin.lods,...p.lods},assets:[...assets.values()]});}return [...merged.values()];}
export function includePlacedAsset(project,pack,asset){const packs=[...(project.assetPacks||[])],i=packs.findIndex(p=>p.id===pack.id);if(i>=0&&packs[i].assets.some(a=>a.id===asset.id))return project;const old=i>=0?packs[i]:{id:pack.id,name:pack.name,assets:[],...(pack.lods?{lods:pack.lods}:{})},next={...old,assets:[...old.assets,asset]};if(i>=0)packs[i]=next;else packs.push(next);return {...project,assetPacks:packs};}
export function readBuildingLibrary(data){if(data?.format!=='cs2-building-assets'||data.version!==1||!data.packs?.length)throw Error('请选择包含建筑的 .cs2assets 资产库文件');return validateBuildingPacks(data.packs);}
export function catalogPage(pack,{category='all',query='',page=0,pageSize=32}={}){const q=query.trim().toLowerCase(),filtered=pack.assets.filter(a=>(category==='all'||(a.catalogCategory||a.type)===category)&&(!q||[a.name,a.code,a.catalogLabel,a.catalogSubcategory].join(' ').toLowerCase().includes(q)));const pages=Math.max(1,Math.ceil(filtered.length/pageSize)),index=Math.max(0,Math.min(page,pages-1));return {assets:filtered.slice(index*pageSize,(index+1)*pageSize),total:filtered.length,page:index,pages};}
export const buildingAngle=v=>((v%360)+360)%360;
export function transformBuildingRing(ring,center,degrees){const r=degrees*Math.PI/180,c=Math.cos(r),s=Math.sin(r);return ring.map(([x,y])=>[center[0]+x*c-y*s,center[1]+x*s+y*c]);}
export function buildingAssetLot(f){const a=f.assetPlacement;if(!a||!f.poi)return [];const [w,d]=a.lot;return transformBuildingRing([[-w/2,-d/2],[w/2,-d/2],[w/2,d/2],[-w/2,d/2]],f.poi,a.rotation);}
export function buildingAssetFits(f,size=14336){return [...f.points,...(f.additionalParts||[]).flat(),...buildingAssetLot(f)].every(p=>p.every(v=>Number.isFinite(v)&&v>=0&&v<=size));}
export function makeBuildingAssetFeature(pack,a,center,rotation,id){
 const angle=buildingAngle(rotation),rings=a.rings.map(r=>transformBuildingRing(r,center,angle));
 return {id,kind:'building',type:a.type,geometryType:'polygon',name:a.name,notes:'',source:'manual',points:rings[0],...(rings.length>1?{additionalParts:rings.slice(1)}:{}),poi:[...center],attributes:{Asset:a.code,Category:a.catalogLabel||(a.type==='residential'?'Residential':a.type==='commercial'?'Commercial':'Other'),...(a.catalogSubcategory?{CatalogSubcategory:a.catalogSubcategory}:{}),...(a.parentAssetCode?{ParentAsset:a.parentAssetCode,ParentAssetName:a.parentAssetName||a.parentAssetCode}:{}),Object:'Building'},assetPlacement:{packId:pack.id,packName:pack.name,assetId:a.id,assetName:a.name,code:a.code,lot:[...a.lot],height:a.height,area:a.area,maxResidents:a.maxResidents??null,maxEmployees:a.maxEmployees??null,rotation:angle,showLot:true}};
}
export function rotateBuildingAsset(f,degrees){
 if(!f.assetPlacement||!f.poi)throw Error('不是可旋转的建筑资产');const next=structuredClone(f),rotation=buildingAngle(degrees),delta=rotation-f.assetPlacement.rotation;
 const rotate=ps=>transformBuildingRing(ps.map(p=>[p[0]-f.poi[0],p[1]-f.poi[1]]),f.poi,delta);next.points=rotate(f.points);if(f.additionalParts)next.additionalParts=f.additionalParts.map(rotate);next.assetPlacement.rotation=rotation;return next;
}
export function moveBuildingAsset(f,center){const next=structuredClone(f),delta=center.map((v,i)=>v-f.poi[i]);next.points=f.points.map(p=>p.map((v,i)=>v+delta[i]));if(f.additionalParts)next.additionalParts=f.additionalParts.map(r=>r.map(p=>p.map((v,i)=>v+delta[i])));next.poi=[...center];return next;}
export function validateBuildingPlacement(f,size){
 const a=f.assetPlacement;if(a===undefined)return;
 if(a.heightOffset!==undefined&&(!Number.isFinite(a.heightOffset)||Math.abs(a.heightOffset)>1000))throw Error('离地偏移须在-1000到1000米之间');
 if(f.kind!=='building'||f.geometryType!=='polygon'||!Array.isArray(f.poi)||f.poi.length!==2||!a||typeof a!=='object'||['packId','packName','assetId','assetName','code'].some(k=>typeof a[k]!=='string'||!a[k]||a[k].length>300)||!Array.isArray(a.lot)||a.lot.length!==2||a.lot.some(n=>!Number.isFinite(n)||n<=0||n>10000)||!Number.isFinite(a.height)||a.height<=0||a.height>2000||!Number.isFinite(a.area)||a.area<=0||!Number.isFinite(a.rotation)||a.rotation<0||a.rotation>=360||typeof a.showLot!=='boolean')throw Error('建筑资产摆放信息无效');
 if(!buildingAssetFits(f,size))throw Error('建筑占地超出地图边界');
 if(!validPopulationCapacity(a.maxResidents)||!validPopulationCapacity(a.maxEmployees))throw Error('建筑人数上限须为非负整数或留空');
}

export function removeProjectAssetPacks(project,ids,{removePlaced=false}={}){
 const selected=new Set(ids),known=new Set((project.assetPacks||[]).map(p=>p.id));
 if(!selected.size)throw Error('请先选择资产包');
 if([...selected].some(id=>!known.has(id)))throw Error('资产包已变化，请重新选择');
 const used=project.features.filter(f=>selected.has(f.assetPlacement?.packId));
 if(used.length&&!removePlaced)throw Error('所选包有 '+used.length+' 栋已摆放建筑，请先取消选择这些包，或勾选同时移除建筑');
 return {...project,assetPacks:project.assetPacks.filter(p=>!selected.has(p.id)),features:project.features.filter(f=>!selected.has(f.assetPlacement?.packId))};
}
