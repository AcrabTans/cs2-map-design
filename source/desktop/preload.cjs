const {contextBridge,ipcRenderer}=require('electron');
const invoke=(name,...args)=>ipcRenderer.invoke('md:'+name,...args);
contextBridge.exposeInMainWorld('mapDesktop',{
 menus:()=>invoke('menus'),menuAction:id=>invoke('menuAction',id),setTitle:title=>invoke('title',title),onCommand:callback=>{const listener=(_event,id)=>callback(id);ipcRenderer.on('md:command',listener);return ()=>ipcRenderer.removeListener('md:command',listener);},
 pick:type=>invoke('pick',type),savePick:name=>invoke('savePick',name),stat:id=>invoke('stat',id),read:(id,start,end)=>invoke('read',id,start,end),write:(id,bytes)=>invoke('write',id,bytes),entries:id=>invoke('entries',id),child:(id,name,kind,create)=>invoke('child',id,name,kind,create),relative:(id,p)=>invoke('relative',id,p),cache:bytes=>invoke('cache',bytes),prepareLods:(id,items)=>invoke('prepareLods',id,items)
});
