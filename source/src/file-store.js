// Serialize writes and stop on conflicts or permission failures.
export class LinkedFileStore {
 constructor(onState=()=>{}){this.onState=onState;this.handle=null;this.baseline=null;this.paused=false;this.tail=Promise.resolve();this.pending=0;this.generation=0;}
 attach(handle,baseline){this.generation++;this.handle=handle;this.baseline=baseline;this.paused=false;this.tail=Promise.resolve();this.pending=0;}
 pause(error){this.paused=true;this.onState({state:'error',handle:this.handle,error});}
 save(text){
  if(!this.handle||this.paused)return Promise.resolve(false);
  const generation=this.generation,handle=this.handle;this.pending++;this.onState({state:'saving',handle});
  const job=this.tail.then(async()=>{
   if(this.paused||generation!==this.generation)return false;
   let writable;
   try{
    const file=await handle.getFile();const disk=await file.text();
    if(disk!==this.baseline){const error=new Error('文件已被外部修改，请先导入文件或重新关联');error.name='FileConflictError';throw error;}
    if(text!==disk){writable=await handle.createWritable();await writable.write(text);await writable.close();writable=null;}
    this.baseline=text;this.pending--;if(!this.pending)this.onState({state:'saved',handle,text});return true;
   }catch(error){if(writable)try{await writable.abort()}catch{}this.pending--;this.pause(error);return false;}
  });
  this.tail=job.catch(()=>false);return job;
 }
}

export function fileHandleRecord(mode,value){
 return new Promise((resolve,reject)=>{
  if(typeof indexedDB==='undefined'){reject(new Error('文件关联记忆不可用'));return;}
  const request=indexedDB.open('island-planner-files',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('handles');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result;const tx=db.transaction('handles',mode==='get'?'readonly':'readwrite');const store=tx.objectStore('handles');const op=mode==='get'?store.get('active'):store.put(value,'active');let result;op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)}};
 });
}

// Full snapshots (including imported basemaps) exceed localStorage's small quota.
export function projectBackup(mode,key,value){
 return new Promise((resolve,reject)=>{
  const request=indexedDB.open('island-planner-projects',1);
  request.onupgradeneeded=()=>request.result.createObjectStore('projects');
  request.onerror=()=>reject(request.error);
  request.onsuccess=()=>{const db=request.result,tx=db.transaction('projects',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('projects');let result;const op=mode==='get'?store.get(key):store.put(value,key);op.onsuccess=()=>result=op.result;tx.oncomplete=()=>{db.close();resolve(result)};tx.onerror=()=>{db.close();reject(tx.error)};tx.onabort=()=>{db.close();reject(tx.error)}};
 });
}
