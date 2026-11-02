import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevCompetitiveJoinProof} from '../dev-site/instrument-competitive-join-proof.mjs';
import {instrumentDevOpponentEndedCopy} from '../dev-site/instrument-online-ended-locales.mjs';
const source=()=>readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
test('development lobby must prove actual game socket before telling server the invited user joined',async()=>{
 const original=await source(),generated=instrumentDevCompetitiveJoinProof(original);
 assert.equal(original.includes('GoStopDevConnectionProof'),false,'protected production client is unchanged');
 assert.equal(generated.split('GoStopDevConnectionProof.waitForConnection').length-1,2,
  'both creator and recipient handoff require socket proof');
 assert.match(generated,/waitForConnection\(room.roomCode,'playerA'\)/);
 assert.match(generated,/waitForConnection\(room.roomCode,'playerB'\)/);
 assert.throws(()=>instrumentDevCompetitiveJoinProof(original.replace(
  "sendLobbyMessage({type:'challengeJoined',requestId:message.requestId,roomCode:room.roomCode});",
  "sendLobbyMessage({type:'changed',requestId:message.requestId,roomCode:room.roomCode});"
 )),/Unsafe development/);
});
test('dev-only explicit Quit text is localized without editing frozen i18n',async()=>{
 const original=await readFile(new URL('../i18n.js',import.meta.url),'utf8');
 const generated=instrumentDevOpponentEndedCopy(original);
 assert.ok(original.includes("opponentEnded:'Session Ended'"));
 assert.ok(generated.includes("opponentEnded:'Your opponent ended the game.'"));
 assert.ok(generated.includes("opponentEnded:'상대방이 게임을 종료했습니다.'"));
 assert.equal(generated.includes("opponentEnded:'Session Ended'"),false);
 assert.throws(()=>instrumentDevOpponentEndedCopy(original.replace(
  "opponentEnded:'Session Ended'","opponentEnded:'Other'")) ,/Unsafe i18n/);
});
test('dev-only web socket gate and waiting overlay cannot contaminate production source',async()=>{
 const [gate,wait,build]=await Promise.all([
  readFile(new URL('../dev-site/competitive-join-proof.js',import.meta.url),'utf8'),
  readFile(new URL('../dev-site/competitive-waiting-overlay.js',import.meta.url),'utf8'),
  readFile(new URL('../dev-site/build.mjs',import.meta.url),'utf8')
 ]);
 assert.match(gate,/gostop-online-message/);
 assert.match(gate,/waitForConnection/);
 assert.match(wait,/waitingForOpponentConnection/);
 assert.match(build,/instrumentDevCompetitiveJoinProof/);
 assert.match(build,/dev-competitive-join-proof\.js/);
 assert.match(build,/dev-competitive-waiting-overlay\.js/);
});
