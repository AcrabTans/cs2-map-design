import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),sourceRoot=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
test('native host restricts file writes, saves resources beside the project and rejects path escapes',async()=>{
 const temp=await fs.mkdtemp(path.join(sourceRoot,'.native-test-')),handlers=new Map();let openPaths=[],savePath,menu,sent;
 class Window{constructor(){Window.last=this;this.webContents={mainFrame:{},send:(...args)=>sent=args,on(){},setWindowOpenHandler(){},session:{on(){}}};}getTitle(){return this.title;}setTitle(title){this.title=title;}async loadFile(){}}
 const electron={BrowserWindow:Window,Menu:{setApplicationMenu:items=>menu=items,buildFromTemplate:items=>items},ipcMain:{handle:(key,fn)=>handlers.set(key,fn)},dialog:{showOpenDialog:async()=>({canceled:false,filePaths:openPaths}),showSaveDialog:async()=>({canceled:false,filePath:savePath})},app:{setName(){},setPath(){},setAppLogsPath(){},whenReady:()=>Promise.resolve(),on(){},quit(){}}};
 try{
  await fs.mkdir(path.join(temp,'resources/app'),{recursive:true});await fs.mkdir(path.join(temp,'projects'));
  const code=await fs.readFile(path.resolve(sourceRoot,'../resources/app/main.cjs'),'utf8');vm.runInNewContext(code,{require:id=>id==='electron'?electron:id==='./desktop-menu.cjs'?require(path.resolve(sourceRoot,'../resources/app/desktop-menu.cjs')):require(id),__dirname:path.join(temp,'resources/app'),process,console,Buffer,Uint8Array});await new Promise(setImmediate);
  const event={sender:Window.last.webContents,senderFrame:Window.last.webContents.mainFrame},call=(name,...args)=>handlers.get('md:'+name)(event,...args);
  menu=await call('menus');assert.equal(menu.length,7);assert.equal(menu[3].label,'图层(&L)');
  await call('menuAction',menu[0].submenu.find(i=>i.accelerator==='Ctrl+S').key);assert.deepEqual(sent,['md:command','saveProjectTop']);
  await call('title','测试工程.cs2map · 未保存');assert.match(Window.last.title,/测试工程.cs2map · 未保存/);
  const asset=path.join(temp,'source.glb');await fs.writeFile(asset,'geometry');openPaths=[asset];const [readOnly]=await call('pick','assets');
  assert.equal(Buffer.from(await call('read',readOnly.id,0,4)).toString(),'geom');await assert.rejects(call('write',readOnly.id,new Uint8Array([1])));
  savePath=path.join(temp,'projects/demo.cs2map');const target=await call('savePick','demo.cs2map');await call('write',target.id,new TextEncoder().encode('project'));assert.equal(await fs.readFile(savePath,'utf8'),'project');
  const map=await call('prepareLods',target.id,[{fileId:readOnly.id,packId:'pack',level:'lod1',ref:'native-lod:test'}]);const relative=map['native-lod:test'].path;assert(relative.startsWith('demo.assets/'));assert.equal(await fs.readFile(path.join(temp,'projects',relative),'utf8'),'geometry');
  const resource=await call('relative',target.id,relative);assert.equal(Buffer.from(await call('read',resource.id)).toString(),'geometry');await assert.rejects(call('relative',target.id,'../../source.glb'));
  await assert.rejects(handlers.get('md:stat')({sender:{},senderFrame:{}},target.id));
 }finally{assert(temp.startsWith(sourceRoot+path.sep));await fs.rm(temp,{recursive:true,force:true});}
});
