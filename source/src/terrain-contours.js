// Average nearby elevation pixels for a legible full-map contour drawing.
function contourGrid(elevation,depth,seaLevel){
 const size=Math.min(512,elevation.width),values=new Float32Array(size*size);
 const {width}=elevation;
 let min=Infinity,max=-Infinity;
 for(let y=0;y<size;y++){
  const top=Math.floor(y*width/size),bottom=Math.floor((y+1)*width/size);
  for(let x=0;x<size;x++){
   const index=y*size+x;
   if(depth){
    const dx=Math.floor((x+.5)*depth.width/size),dy=Math.floor((y+.5)*depth.height/size);
    if(depth.values[dy*depth.width+dx]>0){values[index]=NaN;continue;}
   }
   const left=Math.floor(x*width/size),right=Math.floor((x+1)*width/size);
   let sum=0,count=0;
   for(let row=top;row<bottom;row++)for(let col=left;col<right;col++){
    const value=elevation.values[row*width+col];
    if(Number.isFinite(value)){sum+=value;count++;}
   }
   const value=count?sum/count-seaLevel:NaN;
   values[index]=value;
   if(Number.isFinite(value)){min=Math.min(min,value);max=Math.max(max,value);}
  }
 }
 return {size,values,min,max};
}

export function terrainContourInterval(min,max){
 const target=Math.max(1,(max-min)/8),scale=10**Math.floor(Math.log10(target));
 // Keep numbers on round elevation steps, with three intermediate contours.
 return [1,2,5,10].map(n=>n*scale).find(n=>n>=target)/4;
}

// Marching squares. Adjacent cells share edge IDs so lines join without gaps.
function contourPaths(grid,level){
 const {size,values}=grid,nodes=new Map(),vertical=size*(size-1);
 for(let y=0;y<size-1;y++)for(let x=0;x<size-1;x++){
  const at=y*size+x,a=values[at],b=values[at+1],c=values[at+size+1],d=values[at+size];
  if(!Number.isFinite(a+b+c+d)||Math.min(a,b,c,d)>=level||Math.max(a,b,c,d)<level)continue;
  const corners=[a,b,c,d],high=corners.map(value=>value>=level);
  const crossing=[];
  for(let edge=0;edge<4;edge++){
   const next=(edge+1)%4;
   if(high[edge]===high[next])continue;
   const t=(level-corners[edge])/(corners[next]-corners[edge]);
   const ids=[y*(size-1)+x,vertical+y*size+x+1,(y+1)*(size-1)+x,vertical+y*size+x];
   const id=ids[edge];
   if(!nodes.has(id)){
    const point=[[x+t,y],[x+1,y+t],[x+1-t,y+1],[x,y+1-t]][edge];
    nodes.set(id,{point:[(point[0]+.5)/size,(point[1]+.5)/size],links:[]});
   }
   crossing.push(id);
  }
  const link=(a,b)=>{nodes.get(a).links.push(b);nodes.get(b).links.push(a);};
  if(crossing.length===2)link(...crossing);
  else if(crossing.length===4){
   const centerHigh=(a+b+c+d)/4>=level;
   const [top,right,bottom,left]=crossing;
   if(centerHigh===high[0]){link(top,right);link(bottom,left);}
   else{link(top,left);link(right,bottom);}
  }
 }
 const paths=[],visited=new Set();
 function trace(start){
  const points=[];
  let id=start,previous=null;
  while(id!==undefined&&!visited.has(id)){
   visited.add(id);
   const node=nodes.get(id);
   points.push(node.point);
   const next=node.links.find(link=>link!==previous);
   previous=id;id=next;
  }
  if(id===start)points.push(nodes.get(start).point);
  if(points.length>1)paths.push(points);
 }
 for(const [id,node] of nodes)if(node.links.length===1&&!visited.has(id))trace(id);
 for(const id of nodes.keys())if(!visited.has(id))trace(id);
 return paths;
}

export function terrainContours(elevation,depth=null,seaLevel=0){
 const grid=contourGrid(elevation,depth,seaLevel);
 const {min,max}=grid;
 if(!(max>min))return {interval:0,levels:[]};
 const interval=terrainContourInterval(min,max),levels=[];
 for(let i=Math.floor(min/interval)+1;i*interval<max;i++){
  const level=i*interval,paths=contourPaths(grid,level);
  if(paths.length)levels.push({level,paths});
 }
 return {interval,levels};
}

function contourLength(points){
 let distance=0;
 const offsets=[0];
 for(let i=1;i<points.length;i++){
  distance+=Math.hypot(points[i][0]-points[i-1][0],points[i][1]-points[i-1][1]);
  offsets.push(distance);
 }
 return {points,offsets,distance};
}

function contourPointAt(path,distance){
 const {points,offsets}=path;
 const i=offsets.findIndex(offset=>offset>=distance);
 const a=points[i-1],b=points[i],t=(distance-offsets[i-1])/(offsets[i]-offsets[i-1]);
 return [a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])];
}

export function drawTerrainContours(context,size,{interval,levels}){
 const labels=[],fontSize=Math.max(11,Math.round(size*.0065)),spacing=.28,clearance=.065;
 const labelInterval=interval*4,baseWidth=Math.max(.9,size/2048);
 context.save();
 context.globalAlpha=1;
 context.lineJoin='round';context.lineCap='round';
 const candidates=[];
 for(const {level,paths} of levels){
  const major=level%labelInterval===0;
  context.strokeStyle=major?'rgba(61,54,42,.67)':'rgba(61,54,42,.42)';
  context.lineWidth=baseWidth*(major?(level%(5*labelInterval)===0?1.5:1):.65);
  context.beginPath();
  for(const points of paths){
   const path=contourLength(points);
   if(path.distance<.003)continue;
   context.moveTo(points[0][0]*size,points[0][1]*size);
   for(const [x,y] of points.slice(1))context.lineTo(x*size,y*size);
   if(major&&path.distance>=.025)candidates.push({...path,level});
  }
  context.stroke();
 }
 // Label long lines first, at spaced intervals, with room between nearby labels.
 for(const path of candidates.sort((a,b)=>b.distance-a.distance)){
  const count=Math.max(1,Math.floor(path.distance/spacing));
  for(let i=0;i<count;i++){
   const distance=(i+.5)*path.distance/count;
   const [x,y]=contourPointAt(path,distance);
   if(x<clearance||x>1-clearance||y<clearance||y>1-clearance||labels.some(label=>Math.hypot(label.x-x,label.y-y)<clearance))continue;
   const tangent=Math.min(.012,path.distance/count/4);
   const a=contourPointAt(path,distance-tangent),b=contourPointAt(path,distance+tangent);
   let angle=Math.atan2(b[1]-a[1],b[0]-a[0]);
   if(angle>Math.PI/2)angle-=Math.PI;
   if(angle<-Math.PI/2)angle+=Math.PI;
   labels.push({x,y,angle,text:path.level+' m'});
  }
 }
 context.font='500 '+fontSize+'px "Segoe UI", sans-serif';
 context.textAlign='center';context.textBaseline='middle';
 context.strokeStyle='rgba(251,250,241,.95)';context.lineWidth=Math.max(3,fontSize*.19);
 context.fillStyle='#473a2b';
 for(const {x,y,angle,text} of labels){
  context.save();context.translate(x*size,y*size);context.rotate(angle);
  context.strokeText(text,0,0);context.fillText(text,0,0);
  context.restore();
 }
 context.restore();
}
