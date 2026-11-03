import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor} from '../src/model.js';
import {exportCarto} from '../src/carto-export.js';
import {readZip} from '../src/archive.js';
import {inspectCartoFolder,mergeCartoImport} from '../src/carto.js';
const road=(id,y)=>({id,kind:'road',type:'arterial',name:id,notes:'',points:[[100,y],[900,y]],width:40,corridor:64,structure:'ground'});
async function inspect(features){
 const entries=await readZip(exportCarto(prepareEditor({...initialProject(),features})).bytes);
 return inspectCartoFolder([...entries].map(([path,bytes])=>({name:path.split('/').at(-1),webkitRelativePath:path,size:bytes.length,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),text:async()=>new TextDecoder().decode(bytes)})));
}
test('updating a same-map Carto snapshot replaces its old/deleted roads and retains separate hand-drawn planning',async()=>{
 const first=await inspect([road('existing-a',200),road('deleted-in-game',400)]);
 let project=mergeCartoImport(prepareEditor(initialProject()),first,[]).project;
 const planned=road('unfinished-planning',700);project.features.push(planned);
 const next=await inspect([road('existing-a',250),road('newly-built',600)]);
 assert.equal(first.dataset,next.dataset);
 const result=mergeCartoImport(project,next,[]);
 assert.equal(result.replaced,2);assert.equal(result.project.features.length,3);
 assert.deepEqual(result.project.features.find(f=>f.id===planned.id),planned);
 assert(!result.project.features.some(f=>f.name==='deleted-in-game'));
 assert(result.project.features.filter(f=>f.carto).every(f=>f.name!=='unfinished-planning'));
});
