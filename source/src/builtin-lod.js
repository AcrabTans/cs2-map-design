import {BUILTIN_BUILDING_PACKS} from './building-asset-data.js';
import {registerNativeLod,nativeLodResources} from './native-lod.js';
import {desktopFile} from './desktop-runtime.js';
import {readLodGlb,lodBytes} from './asset-3d.js';
const builtinLodPending=new Map();
export async function ensureBuiltinLods(packs){
 for(const pack of packs){
  const builtin=BUILTIN_BUILDING_PACKS.find(p=>p.id===pack.id),ref=builtin?.lods?.lod2;
  if(!ref||pack.lods?.lod2!==ref||nativeLodResources.has(ref))continue;
  if(!builtinLodPending.has(ref))builtinLodPending.set(ref,(async()=>{
   if(window.mapDesktop?.builtinLod){const file=desktopFile(await window.mapDesktop.builtinLod(pack.id));const native=await registerNativeLod(file,{pack:builtin,level:'lod2'});nativeLodResources.set(ref,nativeLodResources.get(native));return;}
   if(!globalThis.MAP_BUILTIN_LODS?.[pack.id])await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/'+pack.id+'-lod2.js';script.onload=resolve;script.onerror=()=>reject(Error('内置 LOD2 文件缺失，请保留程序 assets 文件夹'));document.head.append(script);});
   const parsed=readLodGlb(lodBytes(globalThis.MAP_BUILTIN_LODS[pack.id]));parsed.cacheId='builtin-'+pack.id+'-lod2';nativeLodResources.set(ref,parsed);
  })().finally(()=>builtinLodPending.delete(ref)));
  await builtinLodPending.get(ref);
 }
}
