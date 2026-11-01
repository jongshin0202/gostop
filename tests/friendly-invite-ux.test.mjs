import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevFriendlyInvite} from '../dev-site/instrument-friendly-invite.mjs';
test('development patch adds Friend fullscreen gate without changing protected ranked client',async()=>{
 const original=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const generated=instrumentDevFriendlyInvite(original);
 assert.ok(generated.includes("if(inviteMode==='free')await globalThis.GoStopDevFriendlyInvite?.gateFriendInvite?.();"));
 assert.ok(original.includes('async function launchInviteRoom(){'));
 assert.ok(!original.includes('GoStopDevFriendlyInvite?.gateFriendInvite'));
 assert.equal(generated.split('GoStopDevFriendlyInvite?.gateFriendInvite').length-1,1);
});
test('instrumentation fails closed on missing or duplicated anchors',async()=>{
 const original=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 assert.throws(()=>instrumentDevFriendlyInvite(''),/Expected frozen/);
 const anchor="async function launchInviteRoom(){\n    if(!validRoomParam)return;";
 assert.throws(()=>instrumentDevFriendlyInvite(original.replace(anchor,'async function renamedLaunch(){')),/Refusing unsafe/);
 assert.throws(()=>instrumentDevFriendlyInvite(original+'\n'+anchor),/Refusing unsafe/);
});
