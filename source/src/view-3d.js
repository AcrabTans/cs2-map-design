import {featureDisplayColor} from './model.js';
import {readTerrainTiff} from './terrain.js';
import {buildingPacksFor} from './building-assets.js';
import {desktopFile} from './desktop-runtime.js';
import {openCokLodGlb} from './lod-glb.js';
export function terrainSampler(elevation,depth,size,waterLevel=0){
 const value=(r,p)=>{if(!r)return NaN;const x=Math.max(0,Math.min(r.width-1,p[0]/size*(r.width-1))),y=Math.max(0,Math.min(r.height-1,p[1]/size*(r.height-1))),a=Math.floor(x),b=Math.floor(y),at=(i,j)=>r.values[j*r.width+i];return at(a,b);};
 return {water:p=>{const n=value(depth,p);return Number.isFinite(n)&&n>0;},ground:p=>{const d=value(depth,p),e=value(elevation,p);return Number.isFinite(d)&&d>0?waterLevel-d:Number.isFinite(e)?e:0;},land:p=>{const e=value(elevation,p);return Number.isFinite(e)?e:waterLevel;}};
}
export function classifyProjectionRings(rings){
 const area=r=>Math.abs(r.reduce((s,p,i)=>{const q=r[(i+1)%r.length];return s+p[0]*q[1]-q[0]*p[1];},0))/2;
 const inside=(p,r)=>{let yes=false;for(let i=0,j=r.length-1;i<r.length;j=i++){const a=r[i],b=r[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 const records=rings.map(r=>({ring:r,area:area(r),depth:0,parent:null})).sort((a,b)=>b.area-a.area),shapes=[];
 for(let i=0;i<records.length;i++){const a=records[i];for(let j=i-1;j>=0;j--)if(inside(a.ring[0],records[j].ring)){a.parent=records[j];a.depth=a.parent.depth+1;break;}if(a.depth%2===0){a.shape={outer:a.ring,holes:[]};shapes.push(a.shape);}else a.parent.shape.holes.push(a.ring);}
 return shapes;
}
export class MapView3D{
 constructor(T,host,status){
  this.T=T;this.host=host;this.status=status;this.renderer=new T.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.append(this.renderer.domElement);this.scene=new T.Scene();this.scene.background=new T.Color('#cbdce4');this.camera=new T.PerspectiveCamera(45,1,1,100000);this.scene.add(new T.HemisphereLight(0xffffff,0x52634f,2));const sun=new T.DirectionalLight(0xffffff,2.3);sun.position.set(-5000,10000,6000);this.scene.add(sun);this.content=new T.Group();this.scene.add(this.content);this.target=new T.Vector3(7168,0,7168);this.radius=20000;this.azimuth=.5;this.polar=.65;this.options={terrain:true,water:true,buildings:true,roads:true,areas:false,quality:'auto',waterLevel:0};this.meshGeometries=new Map();this.modelKeys=new WeakMap();this.nextModelKey=0;this.geometryBytes=0;this.lodMaterial=new T.MeshStandardMaterial({color:'#a8b5b7',roughness:1});
  const canvas=this.renderer.domElement;let drag=null;canvas.oncontextmenu=e=>e.preventDefault();canvas.onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,pan:e.button===2||e.shiftKey};canvas.setPointerCapture(e.pointerId);};canvas.onpointerup=()=>{drag=null;this.scheduleLod();};canvas.onpointercancel=()=>drag=null;canvas.onpointermove=e=>{if(!drag)return;const dx=e.clientX-drag.x,dy=e.clientY-drag.y;drag.x=e.clientX;drag.y=e.clientY;if(drag.pan){const scale=this.radius/host.clientHeight;this.target.x+=(-dx*Math.cos(this.azimuth)-dy*Math.sin(this.azimuth))*scale;this.target.z+=(dx*Math.sin(this.azimuth)-dy*Math.cos(this.azimuth))*scale;}else{this.azimuth-=dx*.005;this.polar=Math.max(.05,Math.min(1.5,this.polar+dy*.005));}this.draw();};canvas.onwheel=e=>{e.preventDefault();this.radius=Math.max(30,Math.min(60000,this.radius*Math.exp(e.deltaY*.001)));this.draw();this.scheduleLod();};
  this.observer=new ResizeObserver(()=>this.draw());this.observer.observe(host);
 }
 scheduleLod(){
  if(this.options.quality!=='auto'||!this.options.buildings||!this.snapshot?.lods.size)return;
  clearTimeout(this.lodTimer);
  this.lodTimer=setTimeout(()=>this.update(this.snapshot).catch(error=>{
   if(!this.disposed)this.status.textContent='3D 显示未完成 · '+error.message;
  }),200);
 }
 reset(size){
  this.target.set(size/2,0,size/2);
  this.radius=size*1.9/Math.min(1,this.host.clientWidth/Math.max(1,this.host.clientHeight)||1);
  this.azimuth=.5;this.polar=.65;this.draw();
 }
 draw(){if(this.disposed||!this.host.clientWidth||!this.host.clientHeight)return;const w=this.host.clientWidth,h=this.host.clientHeight;this.renderer.setSize(w,h,false);this.camera.aspect=w/h;this.camera.updateProjectionMatrix();this.camera.position.set(this.target.x+this.radius*Math.sin(this.polar)*Math.sin(this.azimuth),this.target.y+this.radius*Math.cos(this.polar),this.target.z+this.radius*Math.sin(this.polar)*Math.cos(this.azimuth));this.camera.lookAt(this.target);this.renderer.render(this.scene,this.camera);}
 clear(){this.content.traverse(o=>{if(o.geometry&&!o.userData.shared)o.geometry.dispose();if(o.material&&!o.userData.shared){for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});this.content.clear();}
 async lodNode(packId,level,id,lods,isCurrent){
  const T=this.T,parsed=lods.get(packId)?.get(level);
  const record=parsed?.packs.get(packId).get(id);
  if(record?.status!=='available')return null;
  const {doc,access}=parsed;
  if(!this.modelKeys.has(parsed))this.modelKeys.set(parsed,this.nextModelKey++);
  const build=async(index,parents=new Set())=>{
   if(!isCurrent())return null;
   const n=doc.nodes[index];
   if(!n||parents.has(index)||parents.size>=40)throw Error('LOD 节点无效');
   parents.add(index);
   const group=new T.Group();
   if(n.matrix)group.applyMatrix4(new T.Matrix4().fromArray(n.matrix));
   else{
    if(n.translation)group.position.fromArray(n.translation);
    if(n.rotation)group.quaternion.fromArray(n.rotation);
    if(n.scale)group.scale.fromArray(n.scale);
   }
   if(n.mesh!==undefined){
    const mesh=doc.meshes?.[n.mesh];
    if(!mesh)throw Error('LOD 模型缺失');
    for(const [i,p] of mesh.primitives.entries()){
     if(p.mode!==undefined&&p.mode!==4)throw Error('LOD 模型应使用三角面');
     const key=this.modelKeys.get(parsed)+':'+n.mesh+':'+i;
     let geometry=this.meshGeometries.get(key);
     if(!geometry){
      const [positions,indices,normals]=await Promise.all([
       access(p.attributes.POSITION,'VEC3',[5126]),access(p.indices,'SCALAR',[5125,5123]),
       p.attributes.NORMAL===undefined?null:access(p.attributes.NORMAL,'VEC3',[5126])
      ]);
      if(!isCurrent())return null;
      if(indices.length%3||indices.some(n=>n>=positions.length/3)||positions.some(v=>!Number.isFinite(v))||
       (normals&&(normals.length!==positions.length||normals.some(v=>!Number.isFinite(v)))))throw Error('LOD 三角面无效');
      const required=positions.byteLength+indices.byteLength+(normals?.byteLength||positions.byteLength);
      if(this.geometryBytes+required>96*1024*1024)throw Error('3D 视图网格达到内存上限');
      geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.BufferAttribute(positions,3));
      geometry.setIndex(new T.BufferAttribute(indices,1));
      if(normals)geometry.setAttribute('normal',new T.BufferAttribute(normals,3));
      else geometry.computeVertexNormals();
      this.geometryBytes+=required;
      this.meshGeometries.set(key,geometry);
     }
     const part=new T.Mesh(geometry,this.lodMaterial);
     part.userData.shared=true;group.add(part);
    }
   }
   for(const child of n.children||[]){
    const part=await build(child,parents);
    if(!isCurrent())return null;
    group.add(part);
   }
   parents.delete(index);
   return group;
  };
  const model=new T.Group(),reflected=new T.Group();
  // GLB uses Z=-gameZ, while the map uses the game's south-positive axis.
  const root=await build(record.node);
  if(!isCurrent())return null;
  reflected.scale.z=-1;reflected.add(root);model.add(reflected);
  return model;
 }
 async update(snapshot){
  if(!snapshot||this.disposed)return;
  const pending=this.renderRequest=Symbol(),isCurrent=()=>!this.disposed&&this.renderRequest===pending;
  this.snapshot=snapshot;clearTimeout(this.lodTimer);const {project,raw,features,lods}=snapshot,T=this.T,size=project.mapSize;this.clear();if((this.geometryBytes||0)>64*1024*1024){for(const g of this.meshGeometries.values())g.dispose();this.meshGeometries.clear();this.geometryBytes=0;}let elevation=null,depth=null;
  for(const id of ['elevation','depth']){const bytes=raw.get(id);if(!bytes)continue;let cached=this[id];if(cached?.bytes!==bytes){cached={bytes,raster:readTerrainTiff(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength))};this[id]=cached;}if(id==='elevation')elevation=cached.raster;else depth=cached.raster;}
  const sampler=terrainSampler(elevation,depth,size,this.options.waterLevel),N=elevation||depth?256:1,positions=[],colors=[],indices=[],water=[];const color=new T.Color();
  for(let y=0;y<=N;y++)for(let x=0;x<=N;x++){const p=[x/N*size,y/N*size],h=sampler.ground(p);positions.push(p[0],h,p[1]);color.set(sampler.water(p)?'#809591':h>100?'#bac0a0':'#8fa77e');colors.push(color.r,color.g,color.b);}
  const displayGround=p=>{const x=Math.max(0,Math.min(N-.000001,p[0]/size*N)),y=Math.max(0,Math.min(N-.000001,p[1]/size*N)),i=Math.floor(x),j=Math.floor(y),u=x-i,v=y-j,h=(dx,dy)=>positions[((j+dy)*(N+1)+i+dx)*3+1],A=h(0,0),B=h(1,0),C=h(0,1),D=h(1,1);return u+v<=1?A+(B-A)*u+(C-A)*v:D+(C-D)*(1-u)+(B-D)*(1-v);};this.groundAt=displayGround;
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const a=y*(N+1)+x,b=a+1,c=a+N+1,d=c+1;indices.push(a,c,b,b,c,d);if(sampler.water([(x+.5)/N*size,(y+.5)/N*size]))water.push(a,c,b,b,c,d);}
  if(this.options.terrain){const terrain=new T.BufferGeometry();terrain.setAttribute('position',new T.Float32BufferAttribute(positions,3));terrain.setAttribute('color',new T.Float32BufferAttribute(colors,3));terrain.setIndex(indices);terrain.computeVertexNormals();const ground=new T.Mesh(terrain,new T.MeshStandardMaterial({vertexColors:true,roughness:1}));ground.visible=this.options.terrain;this.content.add(ground);}
  if(this.options.water&&water.length){const wp=positions.map((v,i)=>i%3===1?this.options.waterLevel+.15:v),g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(wp,3));g.setIndex(water);g.computeVertexNormals();this.content.add(new T.Mesh(g,new T.MeshStandardMaterial({color:'#3898b7',transparent:true,opacity:.72,roughness:.3,side:T.DoubleSide})));}
  let modeled=0,fallback=0,errors=0;
  for(const f of features){
   const a=f.assetPlacement;
   if(a&&this.options.buildings){
    const center=f.poi,near=Math.hypot(center[0]-this.camera.position.x,center[1]-this.camera.position.z,this.camera.position.y)<2500;
    const level=this.options.quality==='auto'?(near?'lod1':'lod2'):this.options.quality;
    let object=null;
    if(level!=='blocks'&&lods.has(a.packId)){
     const levels=[level,level==='lod1'?'lod2':'lod1'];
     for(const quality of levels){
      try{object=await this.lodNode(a.packId,quality,a.assetId,lods,isCurrent);if(object)break;}
      catch{errors++;}
      if(!isCurrent())return;
     }
    }
    if(object)modeled++;else{fallback++;object=new T.Group();const angle=-a.rotation*Math.PI/180,c=Math.cos(angle),s=Math.sin(angle),local=[f.points,...(f.additionalParts||[])].map(r=>r.map(([x,y])=>{const dx=x-center[0],dy=y-center[1];return [dx*c-dy*s,dx*s+dy*c];}));for(const part of classifyProjectionRings(local)){const shape=new T.Shape(part.outer.map(([x,y])=>new T.Vector2(x,-y)));for(const hole of part.holes)shape.holes.push(new T.Path(hole.map(([x,y])=>new T.Vector2(x,-y))));const g=new T.ExtrudeGeometry(shape,{depth:a.height,bevelEnabled:false});g.rotateX(-Math.PI/2);object.add(new T.Mesh(g,new T.MeshStandardMaterial({color:f.color||'#9cabb0',roughness:1})));}}
    object.traverse(o=>{if(o.isMesh&&!o.userData.shared)o.material.color.set(featureDisplayColor(project,f));});
    object.position.set(center[0],displayGround(center)+(a.heightOffset||0),center[1]);object.rotation.y=-a.rotation*Math.PI/180;this.content.add(object);
   }else if(this.options.roads&&['road','route'].includes(f.kind)&&f.geometryType!=='polygon'){
    const structure=f.structure||'ground',offset=structure==='tunnel'?-10:['elevated','bridge'].includes(structure)?10:1,color=f.color||project.settings.editor.layers['road:'+f.type]?.color||'#d69b53';
    const positions=[],width=f.kind==='route'?2:Math.max(1,f.width||20);
    for(let j=1;j<f.points.length;j++){const a=f.points[j-1],b=f.points[j],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(!length)continue;const nx=-dz/length*width/2,nz=dx/length*width/2,count=Math.ceil(length/40);for(let i=0;i<count;i++){const t=i/count,u=(i+1)/count,p=[a[0]+dx*t,a[1]+dz*t],q=[a[0]+dx*u,a[1]+dz*u],h=displayGround(p)+offset,k=displayGround(q)+offset,A=[p[0]+nx,h,p[1]+nz],B=[p[0]-nx,h,p[1]-nz],C=[q[0]+nx,k,q[1]+nz],D=[q[0]-nx,k,q[1]-nz];positions.push(...A,...C,...B,...B,...C,...D);}}
    const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.computeVertexNormals();this.content.add(new T.Mesh(g,new T.MeshStandardMaterial({color,side:T.DoubleSide,transparent:structure==='tunnel',opacity:structure==='tunnel'?.35:1})));
   }else if(this.options.buildings&&f.kind==='building'&&!a){const points=f.points.map(p=>new T.Vector3(p[0],sampler.land(p)+1,p[1]));if(points.length)points.push(points[0].clone());this.content.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:f.color||'#9cabb0'})));
   }else if(this.options.areas&&['zone','district','interchange'].includes(f.kind)){const points=f.points.map(p=>new T.Vector3(p[0],sampler.land(p)+1.5,p[1]));if(points.length)points.push(points[0].clone());this.content.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color:f.color||'#d8ba77'})));}
  }
  this.status.textContent=`只读 · LOD 模型 ${modeled} · 无可用LOD的简化体块 ${fallback}${errors?' · 模型异常 '+errors:''} · ${elevation?'已读取原始高程':'无高程，按平地显示'} · 道路桥隧为层级示意`;
  this.draw();
 }
 dispose(){this.disposed=true;this.release();this.observer.disconnect();this.lodMaterial.dispose();this.renderer.dispose();this.renderer.forceContextLoss();this.renderer.domElement.remove();}
 release(){clearTimeout(this.lodTimer);this.clear();for(const g of this.meshGeometries.values())g.dispose();this.meshGeometries.clear();this.geometryBytes=0;this.elevation=null;this.depth=null;this.snapshot=null;}
}

async function loadMapThreeEngine(){
 if(typeof THREE_SOURCE==='undefined')return import('./vendor/three.module.min.js');
 const url=URL.createObjectURL(new Blob([THREE_SOURCE],{type:'text/javascript'}));
 try{return await import(url);}
 finally{URL.revokeObjectURL(url);}
}

export function bindMapThreeView({snapshot,selection,toast}){
 const id=name=>document.getElementById(name);
 const open=id('openThreeView'),dialog=id('threeDialog'),status=id('threeStatus'),host=id('threeHost');
 const levels=id('threeQuality'),load=id('threeLoadLod'),files=id('threeLodFiles');
 const presetStatus=id('threePresetStatus');
 const layers=[...dialog.querySelectorAll('[data-three-layer]')];
 const lods=new Map();
 let engine,presetModels,viewer,current,viewRequest=0;
 async function refresh(){
  if(!viewer||!current)return;
  for(const control of layers)viewer.options[control.dataset.threeLayer]=control.checked;
  viewer.options.quality=levels.value;
  const active=viewer;
  try{await active.update({...current,lods});}
  catch(error){if(viewer===active)status.textContent='3D 显示未完成 · '+error.message;}
 }
 open.onclick=async()=>{
  if(dialog.open)return;
  viewer?.dispose();viewer=null;current=null;
  const menu=open.closest('details');if(menu)menu.open=false;
  const request=++viewRequest;
  status.textContent='正在加载 3D 视图…';status.title='';load.disabled=true;
  dialog.showModal();
  try{
   engine??=loadMapThreeEngine().catch(error=>{engine=null;throw error;});
   presetModels??=loadPresetModels();
   const [T,next,presets]=await Promise.all([engine,snapshot(),presetModels]);
   if(request!==viewRequest||!dialog.open)return;
   if(presets){
    const {count,warnings}=presets;
    presetStatus.textContent=[
     count?'已识别 '+count+' 个预置 LOD 文件':'',
     warnings.length?warnings.length+' 个预置来源读取失败':''
    ].filter(Boolean).join(' · ')||'可将 GLB 放入程序旁的 lod 文件夹';
    presetStatus.title=warnings.join('；');
   }
   viewer=new MapView3D(T,host,status);current=next;
   viewer.reset(current.project.mapSize);refresh();load.disabled=false;
  }catch(error){
   if(request===viewRequest&&dialog.open)status.textContent='无法启动 3D 视图 · '+error.message;
  }
 };
 dialog.addEventListener('close',()=>{if(!dialog.open){viewer?.dispose();viewer=null;current=null;}});
 for(const control of [...layers,levels])control.onchange=refresh;
 id('threeReset').onclick=()=>{if(viewer){viewer.reset(current.project.mapSize);refresh();}};
 id('threeFocus').onclick=()=>{
  if(!viewer)return;
  const feature=selection(),center=feature?.poi||feature?.points[0];
  if(!center){toast('请先在二维地图中选择对象');return;}
  const height=feature.assetPlacement?.height||0;
  viewer.target.set(center[0],(viewer.groundAt?.(center)||0)+(feature.assetPlacement?.heightOffset||0)+height*.4,center[1]);
  viewer.radius=Math.max(250,height*5);viewer.draw();refresh();
 };
 function registerLod(parsed,packs,keepExisting=false){
  let found=0;
  for(const [packId,records] of parsed.packs){
   if(packs){
    const assets=packs.get(packId);
    if(!assets||![...records.keys()].some(key=>assets.has(key)))continue;
   }
   if(!lods.has(packId))lods.set(packId,new Map());
   const available=lods.get(packId);
   if(!keepExisting||!available.has(parsed.lod))available.set(parsed.lod,parsed);
   found++;
  }
  return found;
 }
 async function loadPresetModels(){
  const api=window.mapDesktop;
  if(!api?.presetLodFiles)return null;
  let count=0;
  const warnings=[];
  try{
   for(const info of await api.presetLodFiles()){
    try{
     const model=await openCokLodGlb(desktopFile(info));
     if(!registerLod(model,null,true))throw Error('文件未包含建筑模型索引');
     count++;
    }catch(error){warnings.push(info.name+' · '+error.message);}
   }
  }catch(error){warnings.push('lod 文件夹 · '+error.message);}
  return {count,warnings};
 }
 const assetIdsByPack=packs=>new Map(packs.map(p=>[p.id,new Set(p.assets.map(a=>a.id))]));
 async function loadFiles(list){
  if(!list.length||!current)return;
  const request=viewRequest,packs=assetIdsByPack(buildingPacksFor(current.project));
  load.disabled=true;
  let matched=0;
  const warnings=[];
  for(const file of list){
   if(request===viewRequest&&dialog.open)status.textContent='正在加载 '+file.name+'…';
   try{
    const parsed=await openCokLodGlb(file);
    const found=registerLod(parsed,packs);
    if(!found)warnings.push(file.name+' 未匹配到投影资产包');
    matched+=found;
   }catch(error){warnings.push(file.name+' · '+error.message);}
  }
  if(request!==viewRequest||!dialog.open)return;
  load.disabled=false;await refresh();
  if(request!==viewRequest||!dialog.open)return;
  const report=[matched?'已加载 '+matched+' 组模型':'',...warnings].filter(Boolean).join('；');
  if(report){status.textContent+=' · '+report;status.title=report;}
 }
 load.onclick=async()=>{
  if(!window.mapDesktop){files.click();return;}
  try{const selected=await window.mapDesktop.pick('lod');if(selected?.length)await loadFiles(selected.map(desktopFile));}
  catch(error){status.textContent='打开 LOD 失败 · '+error.message;}
 };
 files.onchange=()=>{const selected=[...files.files];files.value='';void loadFiles(selected);};
 return (models,packs)=>{
  const ids=assetIdsByPack(packs);
  return models.reduce((count,parsed)=>count+registerLod(parsed,ids),0);
 };
}
