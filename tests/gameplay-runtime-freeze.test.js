'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');

const root=path.join(__dirname,'..');
function gitBlobSha(file){
  const content=fs.readFileSync(path.join(root,file));
  const header=Buffer.from(`blob ${content.length}\0`);
  return crypto.createHash('sha1').update(header).update(content).digest('hex');
}

test('verified gameplay runtime remains frozen unless explicitly updated',()=>{
  assert.equal(gitBlobSha('app.js'),'fedcf7a41ac08301a332c44e8edf7d36dc5bb7d9');
  assert.equal(gitBlobSha('presentation-plan.js'),'adfa065dfaef6456d06fd114e6c22ddb8a0ca498');
  assert.equal(gitBlobSha('game-engine.js'),'36aa58f8815a2e9ced62361986200ecd9741e2af');
  assert.equal(gitBlobSha('session-authority.js'),'44ab368976a2f9fac2cae337bf5b9c3d0baba222');
});
