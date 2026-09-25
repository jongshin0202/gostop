'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');

const ranked=fs.readFileSync(require.resolve('../ranked-client.js'),'utf8');
const app=fs.readFileSync(require.resolve('../app.js'),'utf8');

test('low-end phones automatically use the lightweight motion profile without changing gameplay rules',()=>{
  assert.match(ranked,/const PERFORMANCE_LITE_CLASS='gostop-performance-lite'/);
  assert.match(ranked,/navigator\.deviceMemory/);
  assert.match(ranked,/navigator\.hardwareConcurrency/);
  assert.match(ranked,/memory>0&&memory<=4/);
  assert.match(ranked,/cores>0&&cores<=4/);
  assert.match(ranked,/p90>28\|\|slow>=Math\.max\(6,Math\.ceil\(deltas\.length\*\.25\)\)/);
  assert.match(ranked,/document\.documentElement\.classList\.add\(PERFORMANCE_LITE_CLASS\)/);
  assert.match(ranked,/html\.gostop-performance-lite \.menu-submenu\{[^]*?transition:opacity \.12s ease/);
  assert.match(ranked,/html\.gostop-performance-lite \.ambient-room\{filter:none!important;transform:none!important\}/);
  assert.match(ranked,/html\.gostop-performance-lite dialog::backdrop\{backdrop-filter:none!important\}/);
  assert.match(ranked,/html\.gostop-performance-lite \.leaderboard-card-fan\{display:none!important\}/);
  assert.doesNotMatch(ranked,/submenu\.scrollHeight|--submenu-open-height/);
  assert.match(ranked,/\.menu-submenu\{display:none!important[\s\S]*?\.menu-category-block\.expanded \.menu-submenu\{display:grid!important\}/);
  assert.match(ranked,/touch-action:manipulation/);
  assert.match(app,/const performanceLite=\(\)=>globalThis\.GOSTOP_PERFORMANCE_LITE===true/);
  assert.match(app,/const motionDuration=ms=>performanceLite\(\)\?Math\.max\(110,Math\.round\(ms\*\.58\)\):ms/);
  assert.match(app,/const frames=performanceLite\(\)\?\[/);
  assert.match(app,/const dealStep=performanceLite\(\)\?2:1,dealDelay=performanceLite\(\)\?44:72/);
  assert.doesNotMatch(ranked,/GameRoom|settleTerminal|applyNormalTurnAction/);
});
