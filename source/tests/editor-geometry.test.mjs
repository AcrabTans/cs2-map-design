import test from 'node:test';
import assert from 'node:assert/strict';
import {editorShape,geometryInsideEditorBox,findEditorReference} from '../src/editor-geometry.js';
import {initialProject,insertGeometryNodes,prepareEditor,layerKey,visibleInEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';

test('road loops close and semicircular roads use an open arc',()=>{
 const controls=[[200,200],[250,200],[200,250]];
 const street=editorShape('circle',controls.slice(0,2),false);
 const district=editorShape('circle',controls.slice(0,2),true);
 assert.deepEqual(street.points[0],street.points.at(-1));
 assert.equal(street.points.length,district.points.length+1);
 assert.equal(street.markers[0].label,'圆心');
 const arc=editorShape('semicircle',controls,false);
 assert.deepEqual(arc.points[0],[250,200]);
 assert.deepEqual(arc.points.at(-1),[150,200]);
 assert(arc.points.every(([,y])=>y>=200));
 assert.deepEqual(arc.lines[0],{points:[[150,200],[250,200]],label:'直径'});
 assert.equal(arc.lines[1].label,'半径');
});

test('ellipse axes and foci survive saving an editable shape',async()=>{
 const geometry=editorShape('ellipse',[[200,200],[200,250],[230,210]],true);
 assert.deepEqual(geometry.controls,[[200,200],[200,250],[230,200]]);
 assert.deepEqual(geometry.markers.slice(1).map(item=>item.point),[[200,160],[200,240]]);
 assert.deepEqual(geometry.lines.map(({label,points:[a,b]})=>[label,Math.hypot(a[0]-b[0],a[1]-b[1])]),[['长轴',100],['短轴',60],['焦距',80]]);
 const f={id:'ellipse',kind:'district',level:'large',name:'椭圆片区',notes:'',color:'#658c8b',points:geometry.points,shape:{type:'ellipse',controls:geometry.controls}};
 const project=prepareEditor({...initialProject(),features:[f]});
 project.settings.editor.geometryGuides=false;
 const reopened=(await unpackProject(packProject(project))).project,restored=reopened.features[0];
 assert.equal(reopened.settings.editor.geometryGuides,false);
 assert.deepEqual(restored.shape,f.shape);
 const edited=insertGeometryNodes(restored,[{partIndex:0,index:0,t:.5,point:geometry.points[0].map((v,i)=>(v+geometry.points[1][i])/2)}]);
 assert.equal(edited.shape,undefined);
 assert.equal(edited.points.length,restored.points.length+1);
});

test('box selection requires the entire geometry, including all parts and stroke',()=>{
 const box=[3,3,6,6],outer=[[0,0],[9,0],[9,9],[0,9]];
 const inside=[[4,4],[5,4],[5,5],[4,5]];
 assert(geometryInsideEditorBox([inside],box));
 assert(geometryInsideEditorBox([[[3,3]]],box));
 assert(!geometryInsideEditorBox([[[0,4],[9,4]]],box));
 assert(!geometryInsideEditorBox([outer],box));
 assert(!geometryInsideEditorBox([inside,[[7,7],[8,8]]],box));
 assert(!geometryInsideEditorBox([[[3.5,4],[5,4]]],box,1));
});

test('reference snapping takes precedence nearby and alignment can use each axis independently',()=>{
 const refs=[{id:'a',points:[[100,250]]},{id:'b',points:[[500,200]]}];
 assert.deepEqual(findEditorReference([105,245],refs,{snap:true,align:true,radius:10}).point,[100,250]);
 assert.deepEqual(findEditorReference([105,204],refs,{snap:false,align:true,radius:10}).point,[100,200]);
 assert.equal(findEditorReference([105,204],refs,{snap:true,align:false,radius:10}),null);
 assert.equal(findEditorReference([105,245],refs,{snap:true,align:false,radius:10,exclude:'a'}),null);
});

test('reference points save in their own layer and stay visible when planning is hidden',async()=>{
 const reference={id:'anchor',kind:'reference',type:'point',geometryType:'point',name:'参考点',notes:'',points:[[1440.25,2600]]};
 const project=prepareEditor({...initialProject(),features:[reference]});
 project.settings.editor.origins.planning=false;
 project.settings.editor.referenceAlign=true;
 const reopened=(await unpackProject(packProject(project))).project;
 assert.equal(layerKey(reopened.features[0]),'reference:point');
 assert.equal(visibleInEditor(reopened,reopened.features[0]),true);
 assert.equal(reopened.settings.editor.referenceAlign,true);
 assert.deepEqual(reopened.features[0].points,reference.points);
 reopened.settings.editor.groups.reference=false;
 assert.equal(visibleInEditor(reopened,reopened.features[0]),false);
});
