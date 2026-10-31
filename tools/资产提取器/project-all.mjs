import {fileURLToPath} from 'node:url';
import fs from 'node:fs';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {createHash} from 'node:crypto';
import {openCok,decodeGeometry} from './cok-reader.mjs';
const root=new URL('./',import.meta.url),work=process.argv[3],data=JSON.parse(fs.readFileSync(work+'/definitions.json','utf8'));
const cok=openCok(process.argv[2]);
const cached=new Set();
try{for(const line of fs.readFileSync(work+'/projection-cache.jsonl','utf8').split('\n')){try{cached.add(JSON.parse(line).key);}catch{}}}catch{}
const py=spawn(process.env.CS2_PYTHON||'python',[fileURLToPath(new URL('project-stream.py',root)),work],{stdio:['pipe','inherit','inherit']});
const completed=once(py,'exit');let count=0;
for(const a of data.assets){
 const projectionKey=createHash('sha256').update(JSON.stringify({version:1,asset:a,entries:a.meshes.map(m=>cok.entries.get(m.geometry))})).digest('hex');
 const decodedMeshes=[];const modelWarnings=[];
 for(const m of a.meshes){
  const g=await decodeGeometry(cok.read(m.geometry));
  const vertices=g.parts.reduce((n,p)=>n+p.vertexCount,0),indices=g.parts.reduce((n,p)=>n+p.indexCount,0);
  if(vertices!==m.vertices||indices!==m.indices)modelWarnings.push({code:a.name,geometry:m.geometry,kind:'prefab-count-mismatch',declared:[m.vertices,m.indices],actual:[vertices,indices]});
  if(['min','max'].some(edge=>g.bounds[edge].some((v,k)=>Math.abs(v-m.bounds[edge]['xyz'[k]])>.03)))modelWarnings.push({code:a.name,geometry:m.geometry,kind:'prefab-bounds-mismatch',declared:m.bounds,actual:g.bounds});
  if(!cached.has(projectionKey))for(const part of g.parts)decodedMeshes.push({position:m.position,rotation:m.rotation,vertices:part.vertices,indices:part.indices});
 }
 const line=JSON.stringify(cached.has(projectionKey)?{projectionKey,modelWarnings}:{...a,projectionKey,modelWarnings,decodedMeshes})+'\n';if(!py.stdin.write(line))await once(py.stdin,'drain');count++;
}
py.stdin.end();const [code]=await completed;if(code!==0)throw Error('Projection failed '+code);const result=JSON.parse(fs.readFileSync(work+'/projected.json','utf8'));fs.writeFileSync(work+'/model-warnings.json',JSON.stringify(result.checks.flatMap(c=>c.modelWarnings||[])));cok.close();console.log('All projected:',count);
