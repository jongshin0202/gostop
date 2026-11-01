import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevCompetitiveLobby} from '../dev-site/instrument-competitive-lobby.mjs';
test('generated development ranked client adds fourth button, paged roster and immediate cancellation',async()=>{
 const source=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const transformed=instrumentDevCompetitiveLobby(source);
 assert.match(transformed,/id="allOnlinePlayersBtn"/);
 assert.match(transformed,/id="onlinePrevPageBtn"/);
 assert.match(transformed,/id="onlineNextPageBtn"/);
 assert.match(transformed,/type:'onlinePlayersPage'/);
 assert.match(transformed,/locallyCancelledChallenge=true/);
 assert.match(transformed,/type:'challengeCancel'/);
 assert.equal(source.includes('allOnlinePlayersBtn'),false,'protected tracked ranked source unchanged');
 assert.notEqual(source,transformed);
});
test('client transform refuses mismatched protected source',async()=>{
 const original=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 assert.throws(()=>instrumentDevCompetitiveLobby(original.replace('id="searchPlayersBtn"','id="searchPeopleBtn"')),/Unsafe lobby instrumentation/);
});
