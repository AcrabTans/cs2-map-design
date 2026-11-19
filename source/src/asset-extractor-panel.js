import {createCokBatch,extractCokPackage,isOfficialModAuthor} from './asset-extractor.js';
import {readAssetSelection} from './building-assets.js';
import {desktopFile} from './desktop-runtime.js';
import {openCokLodGlb} from './lod-glb.js';
import {inspectDesktopCokFiles,scanDesktopMods} from './mod-catalog.js';

export function bindAssetExtractor(api,importIntoMap){
 if(!api?.assetCodecs)return;
 const id=name=>document.getElementById(name);
 const dialog=id('assetExtractorDialog'),close=dialog.querySelector('[data-close]');
 const pickFolder=id('extractorPickFolder'),pickFiles=id('extractorPickFiles'),pickOutput=id('extractorPickOutput');
 const list=id('extractorCatalog'),detail=id('extractorDetails'),query=id('extractorSearch'),filter=id('extractorFilter');
 const authorFilter=id('extractorAuthorFilter');
 const checkAll=id('extractorCheckAll'),clear=id('extractorClear'),start=id('extractorStart'),importButton=id('extractorImport');
 const progress=id('extractorProgress'),status=id('extractorStatus'),results=id('extractorResults');
 const taskButton=id('extractorTask'),taskMenu=id('extractorTaskMenu'),pause=id('extractorPause'),cancel=id('extractorCancel');
 const scanHint=id('extractorScanHint'),sortButtons=[...dialog.querySelectorAll('[data-extractor-sort]')];
 const collator=new Intl.Collator('zh',{numeric:true,sensitivity:'base'});
 const formats=[...dialog.querySelectorAll('[data-extractor-format]')];
 const exportMode=id('extractorExportMode');
 const formatNames={projection:'二维投影',lod1:'LOD1',lod2:'LOD2'};
 const checked=new Set();
 let rows=[],output=null,current=null,busy=false,job=null,sortKey='',sortDirection=1;
 let completed=null;
 const currentFormats=()=>formats.filter(box=>box.checked).map(box=>box.value);
 const extractionKey=()=>JSON.stringify([output?.id,exportMode.value,currentFormats(),[...checked].sort()]);
 const canImport=()=>completed?.key===extractionKey();
 const catalogType=row=>[row.type,...new Set(row.otherAssets?.map(item=>item.type)),...(row.code&&row.type!=='代码 Mod'?['代码']:[])].join(' · ');

 function visibleRows(){
  const term=query.value.trim().toLowerCase();
  return rows.filter(row=>{
   const mode=filter.value;
   if(mode==='ready'&&!row.supported||mode==='building'&&row.type!=='建筑资产'||
    mode==='other'&&!['其他资产','COK 资源'].includes(row.type)||
    mode==='code'&&!row.code||mode==='unidentified'&&!['其他 Mod','读取失败'].includes(row.type))return false;
   const authorKey=row.author?'author:'+row.author:'unknown';
   if(authorFilter.value&&authorFilter.value!==authorKey)return false;
   return !term||[row.name,row.author,row.mod,row.input?.name,row.input?.file.name,...(row.names||[]),...(row.otherAssets||[]).map(item=>item.name)]
    .some(value=>value?.toLowerCase().includes(term));
  });
 }
 function refreshControls(showing=visibleRows()){
  for(const control of [pickFolder,pickFiles,pickOutput,close,exportMode,...formats])control.disabled=busy;
  checkAll.disabled=busy||!showing.some(row=>row.supported&&!checked.has(row.id));
  clear.disabled=busy||!checked.size;
  start.disabled=busy||!output||!checked.size||!currentFormats().length;
  importButton.disabled=busy||!canImport();
  taskButton.disabled=!job||job.cancelled;
  taskButton.textContent=job?.waiting?'继续 / 取消':'暂停 / 取消';
  pause.textContent=job?.waiting?'继续':'暂停';
  id('extractorSelected').textContent='显示 '+showing.length+' / '+rows.length+' 条 · 已勾选 '+checked.size+' 包';
  const destination=id('extractorDestination');
  const path=output?.path||output?.name;
  destination.textContent=path||'未选择输出目录';
  destination.title=path||'';
 }
 function paragraph(text){
  const p=document.createElement('p');p.textContent=text;return p;
 }
 function selectRow(row){
  current=row;
  for(const tr of list.rows)tr.classList.toggle('selected',tr.dataset.packageId===row?.id);
  detail.replaceChildren();
  if(!row){detail.append(paragraph('选择一行，可查看包内资产名称和提取限制。'));return;}
  const originalName=row.input?.name;
  detail.append(paragraph([row.name,originalName&&originalName!==row.name?'原包名 '+originalName:'',row.input?.file.name,row.mod].filter(Boolean).join(' · ')));
  if(row.buildingCount!=null)detail.append(paragraph('建筑总数 '+row.buildingCount+' 栋 · 可提取 '+row.supported+' 栋'));
  detail.append(paragraph('作者 · '+(row.author||'未知')+(isOfficialModAuthor(row.author)?' · 官方':'')));
  if(row.notes?.length)detail.append(paragraph(row.notes.join('。')+'。'));
  if(row.names?.length||row.otherAssets?.length){
   const names=document.createElement('ul');
   for(const label of [...(row.names||[]).map(name=>'建筑 · '+name),...(row.otherAssets||[]).map(item=>item.type+' · '+item.name)]){
    const li=document.createElement('li');li.textContent=label;names.append(li);
   }
   detail.append(names);
  }
  detail.scrollTop=0;
 }
 function compareRows(a,b){
  const first=sortKey==='type'?catalogType(a):a[sortKey];
  const second=sortKey==='type'?catalogType(b):b[sortKey];
  if(first==null||first==='')return second==null||second===''?0:1;
  if(second==null||second==='')return -1;
  const order=typeof first==='number'?first-second:collator.compare(first,second);
  return sortDirection*order;
 }
 function renderRows(){
  const showing=visibleRows(),fragment=document.createDocumentFragment();
  if(sortKey)showing.sort(compareRows);
  for(const button of sortButtons){
   const heading=button.closest('th');
   if(button.dataset.extractorSort===sortKey)heading.setAttribute('aria-sort',sortDirection===1?'ascending':'descending');
   else heading.removeAttribute('aria-sort');
  }
  function cell(row,value){const td=row.insertCell();td.textContent=value;td.title=value;return td;}
  for(const row of showing){
   const tr=document.createElement('tr');tr.dataset.packageId=row.id;
   const official=isOfficialModAuthor(row.author);
   if(official)tr.classList.add('extractor-official');
   const select=tr.insertCell();
   if(row.supported){
    const box=document.createElement('input');box.type='checkbox';box.checked=checked.has(row.id);box.disabled=busy;
    box.setAttribute('aria-label','选择 '+row.name);
    box.onchange=()=>{if(box.checked)checked.add(row.id);else checked.delete(row.id);refreshControls();};
    select.append(box);
   }else select.textContent='—';
   const title=document.createElement('button');title.type='button';title.textContent=row.name;title.className='extractor-name';
   title.title=row.name;title.onclick=()=>selectRow(row);tr.insertCell().append(title);
   const author=cell(tr,row.author||'未知');
   if(official){
    const badge=document.createElement('span');badge.className='extractor-official-label';badge.textContent='官方';
    author.prepend(badge);
   }
   cell(tr,catalogType(row));
   const count=row.buildingCount==null?'—':row.buildingCount+' 栋';
   cell(tr,row.supported<row.buildingCount?count+'（'+row.supported+' 可提）':count);
   cell(tr,row.mod||'—');
   cell(tr,row.size==null?'—':(row.size/1048576).toFixed(1)+' MB');
   fragment.append(tr);
  }
  if(!showing.length){
   const row=document.createElement('tr'),td=row.insertCell();td.colSpan=7;td.className='extractor-empty';
   td.textContent=rows.length?'没有符合条件的扫描结果。':'扫描 Mod 文件夹或选择 .cok 文件。';fragment.append(row);
  }
  list.replaceChildren(fragment);
  selectRow(showing.includes(current)?current:showing[0]);
  refreshControls(showing);
 }
 async function task(action){
  if(busy)return;
  busy=true;
  list.querySelectorAll('input').forEach(box=>box.disabled=true);
  refreshControls();
  try{await action();}catch(error){status.textContent=String(error.message||error);}
  finally{busy=false;renderRows();}
 }
 function loadCatalog(found,fromFolder){
  completed=null;
  rows=found;checked.clear();current=null;query.value='';filter.value='';results.replaceChildren();
  const authors=[...new Set(rows.map(row=>row.author).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh'));
  authorFilter.replaceChildren(new Option('全部作者',''),...authors.map(name=>new Option(name,'author:'+name)));
  if(rows.some(row=>!row.author))authorFilter.add(new Option('未知作者','unknown'));
  if(!fromFolder)for(const row of rows)if(row.supported)checked.add(row.id);
  status.textContent='识别到 '+rows.length+' 条记录，'+rows.filter(row=>row.supported).length+' 包有可提取的包内建筑模型。';
 }
 id('openAssetExtractor').onclick=()=>{renderRows();dialog.showModal();};
 dialog.addEventListener('cancel',event=>{if(busy){event.preventDefault();showTaskMenu(false);}});
 pickFolder.onmouseenter=()=>{
  if(busy)return;
  const rect=pickFolder.getBoundingClientRect();
  scanHint.style.left=Math.min(rect.left,Math.max(12,innerWidth-532))+'px';
  scanHint.style.top=rect.bottom+4+'px';scanHint.hidden=false;
 };
 pickFolder.onmouseleave=()=>{scanHint.hidden=true;};
 pickFolder.onclick=()=>{
  scanHint.hidden=true;
  return task(async()=>{
  const root=await api.pick('asset-directory');
  if(!root)return;
  status.textContent='正在扫描 '+root.name+'…';
  const scanned=await scanDesktopMods(api,root,(done,total)=>{
   progress.max=total||1;progress.value=done;
   status.textContent='正在识别 '+root.name+' · '+done+'/'+total+' 个目录';
  });
  loadCatalog(scanned,true);
  });
 };
 pickFiles.onclick=()=>task(async()=>{
  const files=await api.pick('cok');
  if(files?.length){
   status.textContent='正在读取资产包定义…';
   loadCatalog(await inspectDesktopCokFiles(files),false);
  }
 });
 pickOutput.onclick=()=>task(async()=>{output=await api.pick('directory')||output;});
 query.oninput=renderRows;filter.onchange=renderRows;authorFilter.onchange=renderRows;
 for(const button of sortButtons)button.onclick=()=>{
  const key=button.dataset.extractorSort;
  sortDirection=key===sortKey?-sortDirection:1;
  sortKey=key;renderRows();
 };
 for(const box of formats)box.onchange=()=>refreshControls();
 exportMode.onchange=()=>refreshControls();
 checkAll.onclick=()=>{for(const row of visibleRows())if(row.supported)checked.add(row.id);renderRows();};
 clear.onclick=()=>{checked.clear();renderRows();};
 function showTaskMenu(open){
  taskMenu.hidden=!open;
  taskButton.setAttribute('aria-expanded',String(open));
 }
 taskButton.onclick=()=>showTaskMenu(taskMenu.hidden);
 dialog.addEventListener('click',event=>{
  if(!event.target.closest('.extractor-task-control'))showTaskMenu(false);
 });
 function resumeJob(){
  job.release?.();
  job.waiting=null;job.release=null;
 }
 pause.onclick=()=>{
  if(job.waiting){
   resumeJob();status.textContent='正在继续提取…';
  }else{
   job.waiting=new Promise(resolve=>{job.release=resolve;});
   status.textContent='已暂停，正在完成的操作会先结束。';
  }
  showTaskMenu(false);refreshControls();
 };
 cancel.onclick=()=>{
  job.cancelled=true;resumeJob();showTaskMenu(false);refreshControls();
  status.textContent='正在取消…';
 };
 function launchExtraction(){
  return task(async()=>{
   const key=extractionKey(),directory=output?.id;
   completed=null;
   const control={cancelled:false,waiting:null,release:null,files:[]};
   job=control;refreshControls();
   const checkpoint=async()=>{
    if(control.waiting)await control.waiting;
    if(control.cancelled)throw new DOMException('已取消','AbortError');
   };
   try{
    const succeeded=await runExtraction(checkpoint,control);
    if(succeeded&&control.files.some(name=>name.endsWith('.cs2assets'))){
     completed={key,directory,files:control.files};
     status.textContent+=' 可以导入到地图。';
    }
   }
   catch(error){
    if(error.name!=='AbortError')throw error;
    status.textContent='已取消任务'+(control.files.length?'，保留已写入的 '+control.files.length+' 个文件。':'。');
   }finally{job=null;showTaskMenu(false);}
  });
 }
 start.onclick=launchExtraction;
 importButton.onclick=()=>task(async()=>{
  if(!canImport())return;
  status.textContent='正在载入本次提取的资产…';
  const {directory,files}=completed;
  const extracted=await Promise.all(files.map(async name=>desktopFile(await api.child(directory,name,'file',false))));
  const packs=await readAssetSelection(extracted.filter(file=>file.name.endsWith('.cs2assets')));
  const lods=await Promise.all(extracted.filter(file=>file.name.endsWith('.glb')).map(openCokLodGlb));
  importIntoMap(packs,lods);
  status.textContent='已导入当前地图 · '+packs.length+' 包';
  dialog.close();
 });
 async function runExtraction(checkpoint,control){
  const queue=rows.filter(row=>checked.has(row.id));
  const selected=currentFormats();
  if(!queue.length||!output||!selected.length)return false;
  const merged=exportMode.value==='merged';
  const write=async(name,bytes)=>{
   await checkpoint();
   const result=await api.writeExtractedAsset(output.id,name,bytes);
   control.files.push(result);
   return result;
  };
  const batch=merged?createCokBatch(write):null;
  const extract=batch?batch.collect:extractCokPackage;
  const steps=queue.length*selected.length;
  progress.max=steps+(merged?selected.length:0);progress.value=0;results.replaceChildren();
  let files=0,packs=0,failures=0;
  function log(text,error=false){
   const item=document.createElement('li');item.textContent=text;
   if(error){item.className='extractor-error';failures++;}
   results.append(item);results.scrollTop=results.scrollHeight;
  }
  for(const [i,row] of queue.entries()){
   await checkpoint();
   status.textContent='提取 '+(i+1)+'/'+queue.length+' · '+row.name;
   try{
    const outcome=await extract({...row.input,author:row.author,modId:row.modId},api.assetCodecs,{
     formats:selected,write,checkpoint,
     onProgress:(format,done,total)=>{
      progress.value=i*selected.length+selected.indexOf(format)+done/total;
      if(!control.waiting&&!control.cancelled)status.textContent='提取 '+(i+1)+'/'+queue.length+' · '+row.name+' · '+formatNames[format]+' '+done+'/'+total;
     }
    });
    let exported=false;
    for(const entry of outcome.results){
     if(entry.error){log(row.name+' · '+formatNames[entry.format]+' · '+entry.error,true);continue;}
     const count=entry.count+' 栋'+(entry.missing?'，'+entry.missing+' 栋缺少对应 LOD':'');
     if(!merged){log(entry.name+' · '+count);files++;}
     exported=true;
    }
    if(exported)packs++;
    if(outcome.notes.length)log(row.name+' · '+outcome.notes.join('，'));
   }catch(error){if(error.name==='AbortError')throw error;log(row.name+' · '+String(error.message||error),true);}
   progress.value=(i+1)*selected.length;
  }
  await checkpoint();
  if(batch){
   let step=steps;
   for(const entry of await batch.finish(format=>{
    progress.value=step++;
    status.textContent='正在合并 '+formatNames[format]+'…';
   },checkpoint)){
    if(entry.error){log(formatNames[entry.format]+' · '+entry.error,true);continue;}
    log(entry.name+' · '+entry.packs+' 包 · '+entry.count+' 栋'+(entry.missing?'，'+entry.missing+' 栋缺少对应 LOD':''));
    files++;
   }
   await checkpoint();
   progress.value=progress.max;
   status.textContent='已处理 '+queue.length+' 包，生成 '+files+' 个合并文件。';
  }else status.textContent='已处理 '+queue.length+' 包，'+packs+' 包生成了 '+files+' 个文件。';
  return failures===0;
 }
}
