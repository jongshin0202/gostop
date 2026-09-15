import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');

test('normal landed cards render their authoritative replacement before removing the physical stage',()=>{
  assert.match(source,/presentation\.floorSlotReservations\.delete\(event\.card\.id\);\s*render\(\);\s*removeStage\(event\.card\.id\)/);
});

test('eventless authoritative sync renders before stale staged-card cleanup',()=>{
  assert.match(source,/const staleStageIds=.*?state=incomingMapped\.state;onlineLastEvents=\[\];render\(\);\s*staleStageIds\.forEach\(cleanupStagedCard\)/s);
});

test('online cardLanded planning never removes the physical stage before authoritative render',()=>{
  assert.doesNotMatch(source,/step\.kind==='landedCleanup'\)cleanupStagedCard/);
  assert.match(source,/state=incomingMapped\.state;onlineLastEvents=presentationEvents;render\(\);\s*for\(const cardId of \[\.\.\.presentation\.stagedCards\.keys\(\)\]\)if\(!Object\.hasOwn\(onlineStageState,cardId\)\)cleanupStagedCard\(cardId\)/);
});
