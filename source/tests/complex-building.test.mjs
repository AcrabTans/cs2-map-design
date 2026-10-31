import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {readBuildingLibrary,makeBuildingAssetFeature} from '../src/building-assets.js';
import {initialProject,prepareEditor} from '../src/model.js';
import {packProject,unpackProject} from '../src/project-file.js';
test('Synthetic complex retains all 306 footprint rings through import, placement and project save',async()=>{
 const a=JSON.parse(fs.readFileSync(new URL('./fixtures/uk-parish-church.json',import.meta.url),'utf8'));
 const [pack]=readBuildingLibrary({format:'cs2-building-assets',version:1,packs:[{id:'synthetic-complex-pack',name:'Synthetic Complex Pack',assets:[a]}]});
 assert.equal(a.rings.length,306);
 const f=makeBuildingAssetFeature(pack,a,[7000,7000],30,'church');
 const p=prepareEditor({...initialProject(),assetPacks:[pack],features:[f]}),saved=await unpackProject(packProject(p));
 assert.deepEqual(saved.project.assetPacks[0].assets[0].rings,a.rings);
 assert.deepEqual(saved.project.features[0].additionalParts,f.additionalParts);
});
