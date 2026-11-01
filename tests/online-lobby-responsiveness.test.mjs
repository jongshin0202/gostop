import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevResponsiveLobby} from '../dev-site/instrument-online-lobby-responsiveness.mjs';
test('generated development client recognizes immediate Auto Match ack and recoverable search errors',async()=>{
 const source=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const compiled=instrumentDevResponsiveLobby(source);
 assert.match(compiled,/message\.type==='autoMatchStarted'/);
 assert.match(compiled,/message\.type==='searchError'/);
 assert.match(compiled,/message\.type==='searchStarted'/);
 assert.match(compiled,/finishAutoMatchStart\(\);autoMatchSearching=true/);
 assert.ok(!source.includes("if(message.type==='autoMatchStarted')"),'never modify protected ranked client');
 assert.notEqual(compiled,source);
});
test('compiled lobby instrumentation requires exactly one known source anchor',async()=>{
 const source=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const anchor="  function handleLobbyMessage(message){\n    if(message.type==='connected')";
 assert.throws(()=>instrumentDevResponsiveLobby(''),/Expected protected/);
 assert.throws(()=>instrumentDevResponsiveLobby(source.replace(anchor,'')),/missing or duplicated/);
 assert.throws(()=>instrumentDevResponsiveLobby(source+'\n'+anchor),/missing or duplicated/);
});
