'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');

test('ranked game launches synchronously cancel attract mode before async account or room work',()=>{
  assert.match(ranked,/rankedSolo\.addEventListener\('click',\(\)=>\{stopAttractForGameLaunch\(\);requireAccount/);
  assert.match(ranked,/onlinePlay\.addEventListener\('click',\(\)=>\{stopAttractForGameLaunch\(\);requireAccount/);
  assert.match(ranked,/function stopAttractForGameLaunch\(\)\{lastMenuActivityAt=Date\.now\(\);attractMode=false;leaderboardScreen\.hidden=true;[\s\S]*leaderboardTimer=null;\}/);
  assert.doesNotMatch(ranked,/function stopAttractForGameLaunch\(\)\{stopAttractTimer\(\)/);
});

test('attract capture can never swallow gameplay clicks once an online session exists',()=>{
  assert.match(ranked,/if\(!attractMode\|\|leaderboardScreen\.hidden\|\|globalThis\.goStopOnlineSession\)return;event\.preventDefault\(\);event\.stopPropagation\(\)/);
  assert.match(ranked,/if\(attractMode&&!globalThis\.goStopOnlineSession\)\{event\.preventDefault\(\);event\.stopPropagation\(\)/);
});
