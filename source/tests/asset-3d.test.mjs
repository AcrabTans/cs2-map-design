import test from 'node:test';
import assert from 'node:assert/strict';
import {readAssetSelection,readLodGlb,buildingBaseHeight,lodBytes} from '../src/asset-3d.js';
import {terrainSampler,classifyProjectionRings,MapView3D} from '../src/view-3d.js';
import * as THREE from '../src/vendor/three.module.min.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {makeBuildingAssetFeature} from '../src/building-assets.js';
import {readProjectFolder,saveFolderLibraries} from '../src/project-folder.js';
const asset={id:'house',code:'house',name:'House',type:'residential',lot:[8,8],height:10,area:16,rings:[[[-2,-2],[2,-2],[2,2],[-2,2]]]},pack={id:'test',name:'Test',assets:[asset]};
function glb(lod='lod2',packId='test'){
 const bin=Buffer.alloc(48);[0,0,0,2,0,0,0,3,0].forEach((n,i)=>bin.writeFloatLE(n,i*4));[0,1,2].forEach((n,i)=>bin.writeUInt32LE(n,36+i*4));
 const d={asset:{version:'2.0'},extras:{format:'cs2-building-lod',version:1,lod,packId,assets:[{id:'house',node:0,status:'available'}]},scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:48}],bufferViews:[{buffer:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:12}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5125,count:3,type:'SCALAR'}]};let j=Buffer.from(JSON.stringify(d));j=Buffer.concat([j,Buffer.alloc((4-j.length%4)%4,32)]);const h=Buffer.alloc(20),bh=Buffer.alloc(8);h.writeUInt32LE(0x46546c67);h.writeUInt32LE(2,4);h.writeUInt32LE(28+j.length+48,8);h.writeUInt32LE(j.length,12);h.writeUInt32LE(0x4e4f534a,16);bh.writeUInt32LE(48);bh.writeUInt32LE(0x004e4942,4);return Buffer.concat([h,j,bh,bin]);
}
const projection=()=>new File([JSON.stringify({format:'cs2-building-assets',version:1,packs:[pack]})],'test.cs2assets');
test('projection required; permitted combinations and matching pack IDs enforced',async()=>{
 for(const levels of [[],['lod2'],['lod2','lod1']]){const p=await readAssetSelection([projection(),...levels.map(l=>new File([glb(l)],l+'.glb'))]);assert.equal(Object.keys(p[0].lods||{}).length,levels.length);}
 await assert.rejects(readAssetSelection([new File([glb()],'lod2.glb')]));
 await assert.rejects(readAssetSelection([projection(),new File([glb('lod1')],'lod1.glb')]),/LOD2/);
 await assert.rejects(readAssetSelection([projection(),new File([glb('lod2','other')],'lod2.glb')]),/编号/);
});
test('LOD and height offset survive project ZIP and folder roundtrips',async()=>{
 const packs=await readAssetSelection([projection(),new File([glb()],'lod2.glb')]),f=makeBuildingAssetFeature(packs[0],asset,[500,500],0,'one');f.assetPlacement.heightOffset=2.5;
 const p=prepareEditor({...initialProject(),assetPacks:packs,features:[f]}),doc=await unpackProject(packProject(p));assert.deepEqual(lodBytes(doc.project.assetPacks[0].lods.lod2),new Uint8Array(glb()));assert.equal(doc.project.features[0].assetPlacement.heightOffset,2.5);
 const writes=new Map(),dir=prefix=>({getDirectoryHandle:async n=>dir(prefix+n+'/'),getFileHandle:async n=>({createWritable:async()=>({write:async v=>writes.set(prefix+n,v),close:async()=>{}})})});
 await saveFolderLibraries({handle:dir(''),name:'Test',projectFile:'map.cs2map',assetsDirectory:'assets',assetPaths:new Map([['test','assets/test.cs2assets']])},packs);
 writes.set('map.cs2map',packProject(initialProject()));const entries=[...writes].map(([path,v])=>({path,file:new File([v],path.split('/').at(-1))}));const opened=await readProjectFolder(entries);assert.equal(readLodGlb(lodBytes(opened.project.assetPacks[0].lods.lod2)).meta.lod,'lod2');
});
test('read-only geometry creation leaves asset data unchanged',async()=>{
 const [p]=await readAssetSelection([projection(),new File([glb()],'lod2.glb')]),before=JSON.stringify(p),viewer={T:THREE,glbs:new Map(),meshGeometries:new Map()};
 const object=await MapView3D.prototype.lodNode.call(viewer,p,'lod2','house'),bounds=new THREE.Box3().setFromObject(object);assert.equal(bounds.max.y,3);assert.equal(JSON.stringify(p),before);
 assert.equal(buildingBaseHeight({poi:[1,2],assetPlacement:{heightOffset:2}},()=>20),22);
});
test('terrain water mask and projection holes are preserved',()=>{
 const s=terrainSampler({width:2,height:2,values:[10,20,30,40]},{width:2,height:2,values:[NaN,4,NaN,NaN]},100,0);assert.equal(s.ground([0,0]),10);assert.equal(s.ground([100,0]),-4);assert.equal(s.water([100,0]),true);
 const rings=[[[0,0],[10,0],[10,10],[0,10]],[[2,2],[3,2],[3,3],[2,3]],[[20,0],[21,0],[21,1],[20,1]]];const shapes=classifyProjectionRings(rings);assert.equal(shapes.length,2);assert.equal(shapes[0].holes.length,1);
});
