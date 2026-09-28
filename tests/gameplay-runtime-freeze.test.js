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
  assert.equal(gitBlobSha('app.js'),'353e91bd2c2941bf5b759bbb817897fec3cc5cb9');
  assert.equal(gitBlobSha('presentation-plan.js'),'ee82171a3a5b371fd72b340419ee36d5a649d43c');
  assert.equal(gitBlobSha('game-engine.js'),'36aa58f8815a2e9ced62361986200ecd9741e2af');
  assert.equal(gitBlobSha('session-authority.js'),'44ab368976a2f9fac2cae337bf5b9c3d0baba222');
});
