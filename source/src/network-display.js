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
