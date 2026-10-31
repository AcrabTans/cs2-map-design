// Carto's single-band, uncompressed GeoTIFF exports; no external dependencies.
export function terrainType(name){return /(?:^|[\\/])elevation\.(tiff?)$/i.test(name)?'elevation':/(?:^|[\\/])depth\.(tiff?)$/i.test(name)?'depth':null;}
export function terrainFingerprint(data){let hash=2166136261;for(let i=0;i<data.length;i++)hash=Math.imul(hash^data.charCodeAt(i),16777619);return data.length+':'+(hash>>>0).toString(36);}
// Only replace the exact known wrong-map previews; unrelated imported terrain is retained.
export function correctTerrainSource(project,seed,manifest){
 const ids=(project.rasters||[]).filter(r=>manifest?.replacedHashes?.[r.id]?.includes(terrainFingerprint(r.data))&&seed?.rasters?.some(s=>s.id===r.id)).map(r=>r.id);
 if(!ids.length)return {project,changedIds:[]};
 const next=structuredClone(project);
 next.rasters=next.rasters.map(r=>ids.includes(r.id)?{...structuredClone(seed.rasters.find(s=>s.id===r.id)),opacity:r.opacity}:r);
 return {project:next,changedIds:ids};
}
export function readTerrainTiff(buffer){
 if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<8)throw Error('不是有效的 TIFF 文件');
 const v=new DataView(buffer),order=v.getUint16(0),le=order===0x4949;
 if(!le&&order!==0x4d4d)throw Error('无法识别 TIFF 字节序');
 const u16=o=>v.getUint16(o,le),u32=o=>v.getUint32(o,le),check=(o,n)=>{if(!Number.isSafeInteger(o)||o<0||o+n>v.byteLength)throw Error('TIFF 数据不完整');};
 if(u16(2)!==42)throw Error('请选择标准 TIFF，暂不支持 BigTIFF');
 const ifd=u32(4);check(ifd,2);const count=u16(ifd);check(ifd+2,count*12+4);
 const tags=new Map(),sizes={1:1,2:1,3:2,4:4,5:8,6:1,7:1,8:2,9:4,10:8,11:4,12:8};
 for(let i=0;i<count;i++){
  const o=ifd+2+i*12,id=u16(o),type=u16(o+2),n=u32(o+4),size=sizes[type];if(!size)continue;
  const bytes=size*n,at=bytes<=4?o+8:u32(o+8);check(at,bytes);
  if(type===2){tags.set(id,new TextDecoder().decode(new Uint8Array(buffer,at,n)).replace(/\0.*$/s,''));continue;}
  const out=[];for(let j=0;j<n;j++){const p=at+j*size;out.push(type===3?u16(p):type===4?u32(p):type===5?u32(p)/u32(p+4):type===6?v.getInt8(p):type===8?v.getInt16(p,le):type===9?v.getInt32(p,le):type===10?v.getInt32(p,le)/v.getInt32(p+4,le):type===11?v.getFloat32(p,le):type===12?v.getFloat64(p,le):v.getUint8(p));}tags.set(id,out);
 }
 const first=(id,fallback)=>tags.get(id)?.[0]??fallback,width=first(256),height=first(257),bits=first(258),format=first(339,1);
 if(!Number.isInteger(width)||width<1||width!==height||width>8192)throw Error('地形图必须为不超过 8192 × 8192 的正方形');
 if(first(259,1)!==1)throw Error('请选择 Carto 导出的未压缩 GeoTIFF');
 if(first(277,1)!==1||first(274,1)!==1||first(317,1)!==1||![8,16,32].includes(bits)||![1,2,3].includes(format)||format===3&&bits!==32)throw Error('暂不支持这种 TIFF 波段、方向或像元格式');
 const offsets=tags.get(273),counts=tags.get(279),rows=first(278,height),step=bits/8;
 if(!offsets||!counts||!Number.isInteger(rows)||rows<1||offsets.length!==Math.ceil(height/rows)||counts.length!==offsets.length)throw Error('缺少有效的 TIFF 条带数据');
 const rawNoData=tags.get(42113),noData=typeof rawNoData==='string'&&rawNoData.trim()!==''?Number(rawNoData):null;
 if(noData!==null&&!Number.isFinite(noData)&&!Number.isNaN(noData))throw Error('无效的 NoData 标记');
 const values=new Float32Array(width*height);let min=Infinity,max=-Infinity,validCount=0;
 for(let s=0;s<offsets.length;s++){
  const pixels=Math.min(rows,height-s*rows)*width,bytes=pixels*step;check(offsets[s],bytes);if(counts[s]<bytes)throw Error('TIFF 条带长度不足');
  for(let j=0;j<pixels;j++){
   const at=offsets[s]+j*step,n=format===3?v.getFloat32(at,le):format===2?(bits===8?v.getInt8(at):bits===16?v.getInt16(at,le):v.getInt32(at,le)):(bits===8?v.getUint8(at):bits===16?u16(at):u32(at));
   const valid=Number.isFinite(n)&&(noData===null||n!==noData);values[s*rows*width+j]=valid?n:NaN;
   if(valid){min=Math.min(min,n);max=Math.max(max,n);validCount++;}
  }
 }
 if(!validCount)throw Error('该 TIFF 没有有效的地形或水深数据');
 const scale=tags.get(33550),tie=tags.get(33922),transform=tags.get(34264);let bounds=null,pixelSize=null;
 if(transform)throw Error('暂不支持旋转的 GeoTIFF，请使用 Carto 原始导出');
 if(scale&&tie){
  if(scale.length<2||tie.length<6||!(scale[0]>0&&scale[1]>0)||![...scale,...tie].every(Number.isFinite))throw Error('GeoTIFF 坐标信息无效');
  const left=tie[3]-tie[0]*scale[0],top=tie[4]+tie[1]*scale[1];bounds=[left,top-height*scale[1],left+width*scale[0],top];pixelSize=scale.slice(0,2);
 }
 const keys=tags.get(34735)||[];let crs='';for(let i=4;i+3<keys.length;i+=4)if([3072,2048].includes(keys[i])&&keys[i+1]===0&&keys[i+2]===1&&keys[i+3]!==32767)crs='EPSG:'+keys[i+3];
 return {width,height,values,metadata:{width,height,min,max,validCount,noData:Number.isFinite(noData)?noData:null,pixelSize,bounds,crs,bits,sampleFormat:format}};
}
export function checkTerrainExtent(metadata,mapSize,existing=[]){
 if(!metadata.bounds)return;
 const b=metadata.bounds,w=b[2]-b[0],h=b[3]-b[1];
 if(Math.abs(w-mapSize)>1||Math.abs(h-mapSize)>1)throw Error(`该地形范围为 ${(w/1000).toFixed(3)} × ${(h/1000).toFixed(3)} km，与当前地图不一致`);
 for(const r of existing){const other=r.metadata?.bounds;if(other&&(r.metadata.crs&&metadata.crs&&r.metadata.crs!==metadata.crs||b.some((n,i)=>Math.abs(n-other[i])>1)))throw Error('Elevation 与 Depth 的地理范围或坐标系不一致');}
}
export function terrainPixels(raster,type,maxSize=2048){
 const size=Math.min(maxSize,raster.width),pixels=new Uint8ClampedArray(size*size*4),{min,max}=raster.metadata;
 const stops=type==='depth'?[[0,132,199,216],[.5,49,133,176],[1,24,74,126]]:[[0,158,182,139],[.32,124,153,107],[.6,161,154,121],[.82,191,180,154],[1,231,228,213]];
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const value=raster.values[Math.min(raster.height-1,Math.floor((y+.5)*raster.height/size))*raster.width+Math.min(raster.width-1,Math.floor((x+.5)*raster.width/size))],at=(y*size+x)*4;if(!Number.isFinite(value))continue;
  const t=Math.max(0,Math.min(1,(value-min)/(max-min||1)));let k=1;while(k<stops.length-1&&t>stops[k][0])k++;
  const a=stops[k-1],b=stops[k],f=(t-a[0])/(b[0]-a[0]);for(let c=0;c<3;c++)pixels[at+c]=Math.round(a[c+1]+(b[c+1]-a[c+1])*f);pixels[at+3]=255;
 }
 return {width:size,height:size,pixels};
}
