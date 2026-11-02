import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevCompetitiveInviteLifecycle} from '../dev-site/instrument-competitive-invite-lifecycle.mjs';

test('dev generated lobby never interrupts an active Competitive Online game with a new or missed invitation',async()=>{
 const original=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const generated=instrumentDevCompetitiveInviteLifecycle(original);
 assert.equal(original.includes('devCompetitivePlaying()'),false,'production client remains unmodified');
 assert.match(generated,/function devCompetitivePlaying\(\)/);
 assert.match(generated,/if\(devCompetitivePlaying\(\)\)\{\s*lobbySend\(\{type:'challengeResponse',requestId:message.requestId,accept:false\}\);/);
 assert.match(generated,/function enqueueMissedRequest\(message\)\{\s*if\(devCompetitivePlaying\(\)\)return;/);
 assert.match(generated,/function maybeShowMissedRequests\(\)\{if\(devCompetitivePlaying\(\)\)/);
 assert.match(generated,/closeRequestDialog\(missedRequestDialog\)/);
 assert.equal(generated.split("if(devCompetitivePlaying())").length-1,4,
  'only active-game request handling and missed-request flows are guarded');
 assert.throws(()=>instrumentDevCompetitiveInviteLifecycle(original.replace(
   "function enqueueMissedRequest(message){","function renamedMissedRequest(message){"
  )),/Unsafe development invitation lifecycle anchor/);
});
test('dev generated outgoing challenge has explicit 30-second cleanup if server notice is lost',async()=>{
 const original=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const generated=instrumentDevCompetitiveInviteLifecycle(original);
 assert.match(generated,/const trackedId=message.requestId,deadline=/);
 assert.match(generated,/pendingOutgoingRequest\?\.requestId!==trackedId/);
 assert.match(generated,/closeRequestDialog\(outgoingRequestDialog\)/);
 assert.match(generated,/lobbySend\(\{type:'challengeCancel',requestId:trackedId\}\)/);
 assert.match(generated,/showToast\(rt\('noResponseTitle'\),5000\)/);
 const build=await readFile(new URL('../dev-site/build.mjs',import.meta.url),'utf8');
 assert.match(build,/instrumentDevCompetitiveInviteLifecycle/);
 assert.match(build,/ranked-client\.js\?v=20261102-invite-lifecycle-1/);
});
