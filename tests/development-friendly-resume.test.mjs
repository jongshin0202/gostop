import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {instrumentDevFriendlyResume} from '../dev-site/instrument-friendly-resume.mjs';
import {instrumentDevFriendlyInvite} from '../dev-site/instrument-friendly-invite.mjs';
test('generated development app keeps guest credential and rejoins same seat after tab returns',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const output=instrumentDevFriendlyResume(source);
 assert.notEqual(output,source);
 assert.match(output,/adapter\.join\(code,resumed\?saved\.credential:undefined\)/);
 assert.match(output,/resumeExisting:resumed/);
 assert.match(output,/error\?\.code!=='INVALID_CREDENTIAL'/);
 assert.ok(!source.includes('resumeExisting:resumed'));
 assert.match(source,/sessionStorage\.removeItem\(`gostop-room-\$\{code\}`\)/);
});
test('generated development invitation reports join failure and provides same-room retry',async()=>{
 const source=await readFile(new URL('../ranked-client.js',import.meta.url),'utf8');
 const output=instrumentDevFriendlyInvite(source);
 assert.match(output,/ux\.showJoinFailure\(error,\(\)=>launchInviteRoom\(\)\)/);
 assert.match(output,/gateFriendInvite/);
 assert.ok(!source.includes('ux.showJoinFailure'));
});
test('source guard rejects a changed Friendly join definition',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 assert.throws(()=>instrumentDevFriendlyResume(source.replace('async joinFreeRoom(roomCode)','async renamedJoin(roomCode)')),
 /Unsafe development Friendly resume instrumentation/);
});
