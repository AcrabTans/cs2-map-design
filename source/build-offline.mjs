import {unpackProject} from './src/project-file.js';
import {terrainFingerprint} from './src/terrain.js';
import {deflateSync} from 'node:zlib';
import {readFile,writeFile,mkdir,readdir,copyFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateProject} from './src/model.js';
const root=path.dirname(fileURLToPath(import.meta.url));
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--project','--output','--storage-key','--title','--save-name','--patch','--satellite'].includes(args[i])||!args[i+1])throw Error('Unsupported or incomplete build option');options[args[i]]=args[i+1];}
const storageKey=options['--storage-key']||'map-design-program-v1';
if(!/^[a-z0-9-]{1,80}$/.test(storageKey))throw Error('Invalid storage key');
const seedDocument=options['--project']?await unpackProject(new Uint8Array(await readFile(path.resolve(root,options['--project'])))):null;
const seed=seedDocument?validateProject(seedDocument.project):null;if(seed&&seedDocument.savedAt)seed.editorSavedAt=Date.parse(seedDocument.savedAt)||seed.editorSavedAt;
const read=f=>readFile(path.join(root,f),'utf8');
const images={...seedDocument?.baseImages};if(options['--satellite'])images.satellite='data:image/png;base64,'+(await readFile(path.resolve(root,options['--satellite']))).toString('base64');
const desktopRuntime=(await read('src/desktop-runtime.js')).replace(/^export /gm,'');
const nativeLod=(await read('src/native-lod.js')).replace(/^export /gm,'');
const archiveSource=(await read('src/archive.js')).replace(/^export /gm,'');
const projectFileSource=(await read('src/project-file.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const cartoExportSource=(await read('src/carto-export.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const seedTerrainFiles={};if(seed)for(const r of seed.rasters||[]){try{const raw=seedDocument.terrainFiles.get(r.id);if(!raw)continue;seedTerrainFiles[r.id]={sha256:r.source?.sha256,previewFingerprint:terrainFingerprint(r.data),deflated:deflateSync(raw).toString('base64')};}catch{}}
const projectSeedExtras=seed?'const SEED_FILE_NAME='+JSON.stringify(path.basename(options['--project']).replace(/\.json$/i,'.cs2map'))+';const SEED_TERRAIN_FILES='+JSON.stringify(seedTerrainFiles)+';\n':'';
const projectFolderSource=(await read('src/project-folder.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const buildingAssetData=(await read('src/building-asset-data.js')).replace(/^export /gm,'');
const buildingAssetSource=(await read('src/building-assets.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const model=(await read('src/model.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const networkDisplaySource=(await read('src/network-display.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const networkCrossingsSource=(await read('src/network-crossings.js')).replace(/^export /gm,'');
const terrain=(await read('src/terrain.js')).replace(/^export /gm,'');
const carto=(await read('src/carto.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
let fileStore=(await read('src/file-store.js')).replace(/^export /gm,'');
const threeModuleUrl='data:text/javascript;base64,'+(await readFile(path.join(root,'src/vendor/three.module.min.js'))).toString('base64');
const asset3d=(await read('src/asset-3d.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
const view3d=(await read('src/view-3d.js')).replace(/^import .*?;\r?\n/gm,'').replace(/^export /gm,'');
let app=(await read('src/app.js')).replace(/^import .*?;\r?\n/gm,'');
app=app.replace("KEY='island-planner-v1'",`KEY='${storageKey}'`);
if(seed){
 app=app.replace('let project=initialProject(),','let project=validateProject(SEED_PROJECT),');
 app=app.replace("suggestedName:'岛屿蓝图-实时.json'",`suggestedName:${JSON.stringify(options['--save-name']||'岛屿蓝图-优化初稿-实时.json')}`);
 fileStore=fileStore.replace("'island-planner-files'",`'island-planner-files-${storageKey}'`);
}
app=app.replaceAll('`assets/${settings.base===\'satellite\'?\'satellite\':\'qgis\'}.png`',"BASEMAPS[settings.base==='satellite'?'satellite':'qgis']");
app=app.replaceAll('`assets/${project.settings.base===\'satellite\'?\'satellite\':\'qgis\'}.png`',"BASEMAPS[project.settings.base==='satellite'?'satellite':'qgis']");
let html=await read('src/index.html');
let terrainCorrection=null;try{terrainCorrection=JSON.parse(await read('config/terrain-source-correction.json'));}catch(error){if(error.code!=='ENOENT')throw error;}
const terrainCorrectionScript=seed&&terrainCorrection?'const TERRAIN_CORRECTION='+JSON.stringify(terrainCorrection)+';\n':'';
const seedScript=seed?`const SEED_PROJECT=${JSON.stringify(seed).replaceAll('<','\\u003c')};\n`:'';
const patch=options['--patch']?JSON.parse(await readFile(path.resolve(root,options['--patch']),'utf8')):null;
const patchScript=patch?`const PROJECT_PATCH=${JSON.stringify(patch).replaceAll('<','\\u003c')};\n`:'';
html=html.replace('<link rel="stylesheet" href="style.css">',`<style>${await read('src/style.css')}</style>`).replace('href="assets/qgis.png"',`href="${images.qgis||''}"`).replace('<script type="module" src="app.js"></script>',`<script type="module">const BASEMAPS=${JSON.stringify(images)};const THREE_MODULE_URL=${JSON.stringify(threeModuleUrl)};\n${seedScript}${projectSeedExtras}${terrainCorrectionScript}${patchScript}${buildingAssetData}
${desktopRuntime}\n${nativeLod}\n${buildingAssetSource}
${model}\n${archiveSource}\n${projectFileSource}\n${projectFolderSource}\n${cartoExportSource}\n${networkDisplaySource}\n${networkCrossingsSource}\n${terrain}\n${carto}\n${fileStore}\n${asset3d}\n${view3d}\n${app}</script>`);
if(seed){const title=String(options['--title']||'优化初稿 01').replace(/[<>&"']/g,'');html=html.replace('<title>岛屿蓝图 · 天际线 II 规划台</title>',`<title>岛屿蓝图 · ${title}</title>`).replace('天际线 II <small>',`${title} <small>`).replace('REVISION 02',String(seed.proposal?.revision||'本轮建议').replace(/[<>&"']/g,''));}
const output=path.resolve(root,options['--output']||'../index.html');
await mkdir(path.dirname(output),{recursive:true});
await writeFile(output,html);
if(path.dirname(output)===path.resolve(root,'../resources/app'))for(const file of await readdir(path.join(root,'desktop')))if(file.endsWith('.cjs'))await copyFile(path.join(root,'desktop',file),path.join(path.dirname(output),file));
console.log('Offline HTML generated: '+output);
