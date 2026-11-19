import {SIZE,roadInfo,defaultLayerColor} from './model.js';

// All geometry and dash lengths are in map metres, independent of screen zoom.
export function networkDisplay(feature,editor,scale){
 const route=feature.kind==='route'||feature.type==='bus';
 const type=route?({train:'rail',water:'waterway',air:'bus',other:'bus'}[feature.type]||feature.type):feature.type;
 const style={...roadInfo(type),...editor.roadStyles[type]};
 const structure=feature.structure==='bridge'?'elevated':feature.structure||'ground';
 const colors=style;
 const color=route?(editor.layers['route:'+feature.type]?.color||feature.color||defaultLayerColor('route:'+feature.type)):((editor.layers['road:'+type]?.color?null:feature.color)||(structure==='tunnel'?colors.tunnelColor:structure==='elevated'?colors.elevatedColor:colors.color));
 const actualWidth=route?editor.routeWidth:feature.width;
 const width=editor.widthMode==='overview'?Math.max(actualWidth,(route?.35:1)/scale):actualWidth;
 const edgeWidth=route||structure==='ground'?0:Math.min(width*.16,3,Math.max(1,width*.08));
 const darken=hex=>'#'+hex.slice(1).match(/../g).map(n=>Math.round(parseInt(n,16)*.62).toString(16).padStart(2,'0')).join('');
 return {route,type,color,width,actualWidth,structure,edgeWidth,edgeColor:darken(color),opacity:type==='waterway'&&!route?.55:1,
  dash:null,railSegment:editor.railSegment*width/16,railWhite:structure==='tunnel'?'#c5cbd0':'#ffffff'};
}

// Native scrollbar offsets correspond to the SVG camera, including fitted views.
export function mapScrollAxis(center,scale,pixels){
 const extent=Math.max(pixels,SIZE*scale),maxOffset=extent-pixels;
 const offset=Math.max(0,Math.min(maxOffset,center*scale-pixels/2));
 return {extent,offset,center:maxOffset>0?(offset+pixels/2)/scale:SIZE/2};
}

// Coalesce navigation into one camera update per frame; rebuild detail only at rest.
export function createViewportScheduler(update,rebuild,{frame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,later=setTimeout,cancelLater=clearTimeout,delay=160}={}){
 let pending=null,idle=null;
 const cancel=()=>{if(pending!==null)cancelFrame(pending);if(idle!==null)cancelLater(idle);pending=idle=null;};
 return {schedule(){if(pending===null)pending=frame(()=>{pending=null;update();});if(idle!==null)cancelLater(idle);idle=later(()=>{idle=null;if(pending!==null){cancelFrame(pending);pending=null;update();}rebuild();},delay);},cancel};
}

export function wheelZoomFactor(delta,mode=0,pageHeight=800){
 return Math.exp(-delta*(mode===1?16:mode===2?pageHeight:1)*.0015);
}

// Accumulate wheel input independently of display refresh rate. Keep the map
// point under the pointer fixed throughout the animation, including reversals.
export function createZoomAnimator(read,apply,limits,{frame=requestAnimationFrame,cancelFrame=cancelAnimationFrame,now=()=>performance.now(),duration=65}={}){
 let pending=null,target=null,focus=null,offset=null,last=0,direction=0;
 const cancel=()=>{if(pending!==null)cancelFrame(pending);pending=null;target=null;direction=0;};
 const tick=time=>{
  pending=null;
  const current=read(),dt=Math.max(0,time-last);last=time;
  const remaining=Math.log(target/current.scale),done=Math.abs(remaining)<.0005;
  const scale=done?target:current.scale*Math.exp(remaining*(1-Math.exp(-dt/duration)));
  apply({scale,cx:focus[0]-offset[0]/scale,cy:focus[1]-offset[1]/scale});
  if(done){target=null;direction=0;}else pending=frame(tick);
 };
 return {cancel,zoom(factor,at){
  const current=read(),sign=Math.sign(Math.log(factor)),[min,max]=limits();
  // Discard outstanding motion when the user reverses the wheel.
  if(target===null||sign&&direction&&sign!==direction)target=current.scale;
  target=Math.max(min,Math.min(max,target*factor));direction=sign||direction;
  focus=at||[current.cx,current.cy];offset=[(focus[0]-current.cx)*current.scale,(focus[1]-current.cy)*current.scale];
  if(pending===null){last=now();pending=frame(tick);}
 }};
}
