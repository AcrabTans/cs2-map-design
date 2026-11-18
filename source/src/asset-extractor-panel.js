import {createCokBatch,extractCokForMap,extractCokPackage,isOfficialModAuthor} from './asset-extractor.js';
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
 const formats=[...dialog.querySelectorAll('[data-extractor-format]')];
 const exportMode=id('extractorExportMode');
 const formatNames={projection:'二维投影',lod1:'LOD1',lod2:'LOD2'};
 const checked=new Set();
 let rows=[],output=null,current=null,busy=false;
 const currentFormats=()=>formats.filter(box=>box.checked).map(box=>box.value);
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
   return !term||[row.name,row.author,row.mod,row.input?.file.name,...(row.names||[]),...(row.otherAssets||[]).map(item=>item.name)]
    .some(value=>value?.toLowerCase().includes(term));
  });
 }
 function refreshControls(showing=visibleRows()){
  for(const control of [pickFolder,pickFiles,pickOutput,close,exportMode,...formats])control.disabled=busy;
  checkAll.disabled=busy||!showing.some(row=>row.supported&&!checked.has(row.id));
  clear.disabled=busy||!checked.size;
  start.disabled=busy||!output||!checked.size||!currentFormats().length;
  importButton.disabled=busy||!checked.size;
  id('extractorSelected').textContent='显示 '+showing.length+' / '+rows.length+' 条 · 已勾选 '+checked.size+' 包';
  const destination=id('extractorDestination');
  destination.textContent=output?.name||'未选择输出目录';
  destination.title=output?.name||'';
 }
 function paragraph(text){
  const p=document.createElement('p');p.textContent=text;return p;
 }
 function selectRow(row){
  current=row;
  for(const tr of list.rows)tr.classList.toggle('selected',tr.dataset.packageId===row?.id);
  detail.replaceChildren();
  if(!row){detail.append(paragraph('选择一行，可查看包内资产名称和提取限制。'));return;}
  detail.append(paragraph([row.name,row.input?.file.name,row.mod].filter(Boolean).join(' · ')));
  detail.append(paragraph('作者 · '+(row.author||'未知')+(isOfficialModAuthor(row.author)?' · 官方':'')));
  if(row.notes?.length)detail.append(paragraph(row.notes.join('。')+'。'));
  if(row.buildingCount)detail.append(paragraph('建筑 '+row.buildingCount+' 栋 · 有包内主模型 '+row.supported+' 栋'));
  if(row.names?.length||row.otherAssets?.length){
   const names=document.createElement('ul');
   for(const label of [...(row.names||[]).map(name=>'建筑 · '+name),...(row.otherAssets||[]).map(item=>item.type+' · '+item.name)]){
    const li=document.createElement('li');li.textContent=label;names.append(li);
   }
   detail.append(names);
  }
 }
 function renderRows(){
  const showing=visibleRows(),fragment=document.createDocumentFragment();
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
   cell(tr,row.buildingCount==null?'—':row.supported===row.buildingCount?String(row.buildingCount):row.buildingCount+'（'+row.supported+' 可提）');
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
  rows=found;checked.clear();current=null;query.value='';filter.value='';results.replaceChildren();
  const authors=[...new Set(rows.map(row=>row.author).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh'));
  authorFilter.replaceChildren(new Option('全部作者',''),...authors.map(name=>new Option(name,'author:'+name)));
  if(rows.some(row=>!row.author))authorFilter.add(new Option('未知作者','unknown'));
  if(!fromFolder)for(const row of rows)if(row.supported)checked.add(row.id);
  status.textContent='识别到 '+rows.length+' 条记录，'+rows.filter(row=>row.supported).length+' 包有可提取的包内建筑模型。';
 }
 id('openAssetExtractor').onclick=()=>{renderRows();dialog.showModal();};
 dialog.addEventListener('cancel',event=>{if(busy)event.preventDefault();});
 pickFolder.onclick=()=>task(async()=>{
  const root=await api.pick('asset-directory');
  if(!root)return;
  status.textContent='正在扫描 '+root.name+'…';
  const scanned=await scanDesktopMods(api,root,(done,total)=>{
   progress.max=total||1;progress.value=done;
   status.textContent='正在识别 '+root.name+' · '+done+'/'+total+' 个目录';
  });
  loadCatalog(scanned,true);
 });
 pickFiles.onclick=()=>task(async()=>{
  const files=await api.pick('cok');
  if(files?.length){
   status.textContent='正在读取资产包定义…';
   loadCatalog(await inspectDesktopCokFiles(files),false);
  }
 });
 pickOutput.onclick=()=>task(async()=>{output=await api.pick('directory')||output;});
 query.oninput=renderRows;filter.onchange=renderRows;authorFilter.onchange=renderRows;
 for(const box of formats)box.onchange=()=>refreshControls();
 checkAll.onclick=()=>{for(const row of visibleRows())if(row.supported)checked.add(row.id);renderRows();};
 clear.onclick=()=>{checked.clear();renderRows();};
 start.onclick=()=>task(()=>runExtraction(false));
 importButton.onclick=()=>task(()=>runExtraction(true));
 async function runExtraction(importing){
  const queue=rows.filter(row=>checked.has(row.id));
  if(!queue.length||(!importing&&!output))return;
  const formats=currentFormats();
  const selected=importing?['projection',...formats.filter(format=>format!=='projection')]:formats;
  if(!selected.length)return;
  const merged=!importing&&exportMode.value==='merged',write=(name,bytes)=>api.writeExtractedAsset(output.id,name,bytes);
  const batch=merged?createCokBatch(write):null;
  const extract=importing?extractCokForMap:batch?batch.collect:extractCokPackage;
  const importPacks=new Map(),importLods=[];
  const steps=queue.length*selected.length;
  progress.max=steps+(merged?selected.length:0);progress.value=0;results.replaceChildren();
  let files=0,packs=0,failures=0;
  function log(text,error=false){
   const item=document.createElement('li');item.textContent=text;
   if(error){item.className='extractor-error';failures++;}
   results.append(item);results.scrollTop=results.scrollHeight;
  }
  for(const [i,row] of queue.entries()){
   status.textContent='提取 '+(i+1)+'/'+queue.length+' · '+row.name;
   try{
    const outcome=await extract({...row.input,author:row.author},api.assetCodecs,{
     formats:selected,write,
     onProgress:(format,done,total)=>{
      progress.value=i*selected.length+selected.indexOf(format)+done/total;
      status.textContent='提取 '+(i+1)+'/'+queue.length+' · '+row.name+' · '+formatNames[format]+' '+done+'/'+total;
     }
    });
    if(outcome.projection){
     if(importPacks.has(outcome.projection.id))throw Error('建筑资产包编号重复，已收录一个副本');
     importPacks.set(outcome.projection.id,outcome.projection);
     for(const model of outcome.lods)importLods.push(model);
    }
    let exported=false;
    for(const entry of outcome.results){
     if(entry.error){log(row.name+' · '+formatNames[entry.format]+' · '+entry.error,true);continue;}
     const count=entry.count+' 栋'+(entry.missing?'，'+entry.missing+' 栋缺少对应 LOD':'');
     if(importing)log(row.name+' · '+formatNames[entry.format]+' · '+count);
     else if(!merged){log(entry.name+' · '+count);files++;}
     exported=true;
    }
    if(exported)packs++;
    if(outcome.notes.length)log(row.name+' · '+outcome.notes.join('，'));
   }catch(error){log(row.name+' · '+String(error.message||error),true);}
   progress.value=(i+1)*selected.length;
  }
  if(importing){
   if(!importPacks.size){status.textContent='没有可导入的资产包，请查看提取结果。';return;}
   importIntoMap([...importPacks.values()],importLods);
   status.textContent='已导入当前地图 · '+importPacks.size+' 包'+(failures?' · '+failures+' 项失败':'');
   if(!failures)dialog.close();
   return;
  }
  if(batch){
   let step=steps;
   for(const entry of await batch.finish(format=>{
    progress.value=step++;
    status.textContent='正在合并 '+formatNames[format]+'…';
   })){
    if(entry.error){log(formatNames[entry.format]+' · '+entry.error,true);continue;}
    log(entry.name+' · '+entry.packs+' 包 · '+entry.count+' 栋'+(entry.missing?'，'+entry.missing+' 栋缺少对应 LOD':''));
    files++;
   }
   progress.value=progress.max;
   status.textContent='已处理 '+queue.length+' 包，生成 '+files+' 个合并文件。';
  }else status.textContent='已处理 '+queue.length+' 包，'+packs+' 包生成了 '+files+' 个文件。';
 }
}
