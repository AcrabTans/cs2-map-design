export function desktopFile(info){
 const api=window.mapDesktop;
 const range=(start=0,end=info.size)=>({arrayBuffer:async()=>{const bytes=await api.read(info.id,start,end);return new Uint8Array(bytes).buffer;},text:async()=>new TextDecoder().decode(await api.read(info.id,start,end))});
 return {name:info.name,size:info.size,nativeId:info.id,...range(),slice:range};
}
export function desktopHandle(info){
 const api=window.mapDesktop;
 if(info.kind==='directory')return {name:info.name,kind:'directory',nativeId:info.id,async *entries(){for(const child of await api.entries(info.id))yield [child.name,desktopHandle(child)];},getDirectoryHandle:async(name,o={})=>desktopHandle(await api.child(info.id,name,'directory',!!o.create)),getFileHandle:async(name,o={})=>desktopHandle(await api.child(info.id,name,'file',!!o.create))};
 return {name:info.name,kind:'file',nativeId:info.id,getFile:async()=>desktopFile({...await api.stat(info.id),id:info.id}),createWritable:async()=>{let bytes;return {write:async data=>{bytes=typeof data==='string'?new TextEncoder().encode(data):data;},close:async()=>{if(bytes!==undefined)await api.write(info.id,bytes);},abort:async()=>{bytes=undefined;}};}};
}
export function installDesktopPickers(){
 if(!window.mapDesktop)return;
 document.documentElement.classList.add('desktop-app');
 installDesktopMenu();
 const cancelled=()=>new DOMException('已取消','AbortError');
 window.showOpenFilePicker=async()=>{const info=await window.mapDesktop.pick('project');if(!info)throw cancelled();return info.map(desktopHandle);};
 window.showSaveFilePicker=async options=>{const info=await window.mapDesktop.savePick(options?.suggestedName);if(!info)throw cancelled();return desktopHandle(info);};
 window.showDirectoryPicker=async()=>{const info=await window.mapDesktop.pick('directory');if(!info)throw cancelled();return desktopHandle(info);};
}
export function lightHistorySnapshot(project){
 const {assetPacks,basemaps,rasters,...state}=project;
 return {state:JSON.stringify(state),assetPacks:(assetPacks||[]).map(p=>({...p})),basemaps:(basemaps||[]).map(b=>({...b})),rasters:(rasters||[]).map(r=>({...r,metadata:{...r.metadata}}))};
}
export function restoreHistorySnapshot(snapshot){return {...JSON.parse(snapshot.state),assetPacks:snapshot.assetPacks,basemaps:snapshot.basemaps,rasters:snapshot.rasters};}

async function installDesktopMenu(){
 const api=window.mapDesktop,bar=document.createElement('nav');bar.className='desktop-menubar';bar.setAttribute('aria-label','应用菜单');document.body.prepend(bar);
 const menus=await api.menus(),shortcuts=new Map();let active=null;
 const close=()=>{if(active){active.open=false;active.querySelector('summary').setAttribute('aria-expanded','false');active=null;}};
 for(const menu of menus){const folder=document.createElement('details'),summary=document.createElement('summary'),popup=document.createElement('div');summary.textContent=menu.label.replace(/\(&.\)/g,'');summary.setAttribute('aria-expanded','false');popup.className='desktop-menu-popup';folder.append(summary,popup);bar.append(folder);
  summary.onclick=e=>{e.preventDefault();const open=!folder.open;for(const b of bar.querySelectorAll('[data-menu-setting]')){const checked=!!document.getElementById(b.dataset.menuSetting)?.checked;b.firstChild.textContent=(checked?'✓ ':'　 ')+b.dataset.menuLabel;b.setAttribute('aria-checked',String(checked));}close();folder.open=open;if(open){active=folder;summary.setAttribute('aria-expanded','true');}};
  summary.onmouseenter=()=>{if(active&&active!==folder){close();folder.open=true;active=folder;summary.setAttribute('aria-expanded','true');}};
  for(const item of menu.submenu){if(item.type==='separator'){popup.append(document.createElement('hr'));continue;}const button=document.createElement('button');button.textContent=item.label;if(item.setting){button.dataset.menuSetting=item.setting;button.dataset.menuLabel=item.label;button.setAttribute('role','menuitemcheckbox');}const shortcut=document.createElement('small');shortcut.textContent=item.accelerator||'';button.append(shortcut);button.onclick=()=>{close();api.menuAction(item.key);};popup.append(button);if(item.accelerator)shortcuts.set(item.accelerator.toLowerCase(),item.key);}
 }
 const tools=document.querySelector('.editor-tools');tools.classList.add('desktop-tools');bar.append(tools);document.getElementById('baseImportBtn').hidden=true;
 document.addEventListener('pointerdown',e=>{if(!bar.contains(e.target))close();});document.addEventListener('keydown',e=>{if(e.key==='Escape'){close();return;}const chord=(e.ctrlKey?'ctrl+':'')+(e.shiftKey?'shift+':'')+e.key.toLowerCase();if(['ctrl+s','ctrl+shift+s','ctrl+z','ctrl+shift+z'].includes(chord))return;const key=shortcuts.get(chord);if(key){e.preventDefault();api.menuAction(key);}});
}
