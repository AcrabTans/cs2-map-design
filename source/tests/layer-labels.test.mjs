import test from 'node:test';
import assert from 'node:assert/strict';
import {initialProject,prepareEditor,labelsVisibleInEditor,visibleInEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
import {lightHistorySnapshot,restoreHistorySnapshot} from '../src/desktop-runtime.js';
const road={kind:'road',type:'arterial',structure:'ground'},other={kind:'road',type:'secondary',structure:'ground'},building={kind:'building',type:'education'};
test('new and legacy projects default to hidden labels while retaining visible geometry',()=>{
 const p=prepareEditor(initialProject());
 for(const f of [road,other,building]){assert.equal(labelsVisibleInEditor(p,f),false);assert.equal(visibleInEditor(p,f),true);}
 delete p.settings.editor.groupLabels;for(const l of Object.values(p.settings.editor.layers))delete l.labelsVisible;
 assert.equal(labelsVisibleInEditor(prepareEditor(p),road),false);
});
test('group, individual and global gates are independent; hiding labels does not hide features',()=>{
 const p=prepareEditor(initialProject()),e=p.settings.editor;e.groupLabels.network=true;e.layers['road:arterial'].labelsVisible=true;
 assert.equal(labelsVisibleInEditor(p,road),true);assert.equal(labelsVisibleInEditor(p,other),false);assert.equal(labelsVisibleInEditor(p,building),false);
 e.groupLabels.network=false;assert.equal(labelsVisibleInEditor(p,road),false);assert.equal(e.layers['road:arterial'].labelsVisible,true);
 e.groupLabels.network=true;p.settings.notesVisible=false;assert.equal(labelsVisibleInEditor(p,road),false);
 p.settings.notesVisible=true;e.groups.network=false;assert.equal(labelsVisibleInEditor(p,road),false);
});
test('label choices survive project save/open and undo snapshots',async()=>{
 const p=prepareEditor(initialProject());p.settings.editor.groupLabels.network=true;p.settings.editor.layers['road:arterial'].labelsVisible=true;
 const snapshot=lightHistorySnapshot(p),doc=await unpackProject(packProject(p));assert.equal(labelsVisibleInEditor(doc.project,road),true);assert.equal(labelsVisibleInEditor(doc.project,other),false);
 p.settings.editor.layers['road:arterial'].labelsVisible=false;assert.equal(labelsVisibleInEditor(p,road),false);assert.equal(labelsVisibleInEditor(prepareEditor(restoreHistorySnapshot(snapshot)),road),true);
});
