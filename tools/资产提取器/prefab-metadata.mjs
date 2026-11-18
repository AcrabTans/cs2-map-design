import fs from 'node:fs';
import path from 'node:path';
import {openCok,parsePrefab} from './cok-reader.mjs';
import {parseBinaryPrefab} from './binary-prefab.mjs';

export function companionPrefabs(source){
 const suffix=path.basename(source).replace(/^Blob_/,'');
 return ['Prefabs_'+suffix,...(path.basename(source)==='Blob.cok'?['Prefabs.cok']:[])]
  .map(name=>path.join(path.dirname(source),name)).filter(file=>file!==source&&fs.existsSync(file));
}

export const prefabItems=value=>value?.$rcontent||[];
export const readPrefab=data=>data[0]===123?parsePrefab(data.toString('utf8')):parseBinaryPrefab(data);
export const isBuildingDefinition=prefab=>String(prefab?.$type).includes('BuildingPrefab')&&prefab.m_LotWidth>0&&prefab.m_LotDepth>0;
export const isSurfaceUpgrade=prefab=>!prefabItems(prefab.m_Meshes).length&&prefabItems(prefab.components).some(item=>item.name==='ServiceUpgrade');

export function readChineseNames(archives,localeFile){
 const titles=new Map();
 const locale=localeFile&&fs.existsSync(localeFile)?openCok(localeFile):null;
 try{
  for(const archive of [...archives,...(locale?[locale]:[])])for(const entry of archive.entries.values()){
   if(!entry.name.endsWith('.loc')||(archive===locale&&!/zh-HANS/.test(entry.name)))continue;
   try{
    const data=archive.read(entry.name);let at=2;
    function string(){
     let length=0;
     for(let shift=0;shift<=28;shift+=7){
      const byte=data[at++];
      if(byte===undefined)break;
      length+=(byte&127)*2**shift;
      if(byte&128)continue;
      if(at+length>data.length)break;
      const value=data.toString('utf8',at,at+length);at+=length;return value;
     }
     throw Error('Invalid localization string');
    }
    string();if(string()!=='zh-HANS')continue;string();
    const count=data.readUInt32LE(at);at+=4;
    for(let i=0;i<count;i++){
     const key=string(),value=string();
     if(key.startsWith('Assets.NAME[')&&key.endsWith(']')&&value.trim())titles.set(key.slice(12,-1),value.trim());
    }
   }catch{/* Optional names may use an unsupported localization format. */}
  }
 }finally{locale?.close();}
 return titles;
}
