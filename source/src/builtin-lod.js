import {BUILTIN_BUILDING_PACKS} from './building-asset-data.js';
import {registerNativeLod,nativeLodResources} from './native-lod.js';
import {desktopFile} from './desktop-runtime.js';
import {readLodGlb,lodBytes} from './asset-3d.js';
let builtinLodPending=null;
export async function ensureBuiltinLods(packs){
 const ref='builtin-lod:blob:lod2';if(!packs.some(p=>p.lods?.lod2===ref)||nativeLodResources.has(ref))return;
 if(!builtinLodPending)builtinLodPending=(async()=>{
  if(window.mapDesktop?.builtinLod){const file=desktopFile(await window.mapDesktop.builtinLod());const native=await registerNativeLod(file,{pack:BUILTIN_BUILDING_PACKS.find(p=>p.id==='blob'),level:'lod2'});nativeLodResources.set(ref,nativeLodResources.get(native));return;}
  if(!globalThis.MAP_BUILTIN_LOD2)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src='assets/blob-lod2.js';script.onload=resolve;script.onerror=()=>reject(Error('内置 LOD2 文件缺失，请保留程序 assets 文件夹'));document.head.append(script);});
  const parsed=readLodGlb(lodBytes(globalThis.MAP_BUILTIN_LOD2));parsed.cacheId='builtin-blob-lod2';nativeLodResources.set(ref,parsed);
 })().catch(error=>{builtinLodPending=null;throw error;});
 await builtinLodPending;
}
