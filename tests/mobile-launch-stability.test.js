import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const ranked=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8');
const app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8');
const adminCss=fs.readFileSync(new URL('../admin.css',import.meta.url),'utf8');
const gameCss=fs.readFileSync(new URL('../styles.css',import.meta.url),'utf8');

test('ranked Solo and Online entry are single-flight and cannot overlap while a notice is pending',()=>{
  assert.match(ranked,/let rankedEntryPending=null/);
  assert.match(ranked,/function setRankedEntryPending\(kind=null\)/);
  assert.match(ranked,/rankedSolo\.disabled=busy/);
  assert.match(ranked,/onlinePlay\.disabled=busy/);
  assert.match(ranked,/function beginRankedEntry\(kind,launch\)/);
  assert.match(ranked,/if\(rankedEntryPending\)return/);
  assert.match(ranked,/rankedSolo\.addEventListener\('click',\(\)=>beginRankedEntry\('solo'/);
  assert.match(ranked,/onlinePlay\.addEventListener\('click',\(\)=>beginRankedEntry\('online'/);
  assert.match(ranked,/gostop-online-launch-settled/);
});

test('Daily Bonus OK uses acknowledgement payload and never blocks on a second account refresh',()=>{
  const start=ranked.indexOf("if(accountNoticeDialog.dataset.dailyLaunch==='1')");
  const end=ranked.indexOf("await acknowledgeVisibleAccountNotice()",start);
  const block=ranked.slice(start,end);
  assert.match(block,/await acknowledgeAccountNotice\(id\)/);
  assert.doesNotMatch(block,/await refreshAccount\(\)/);
  assert.match(block,/accountNoticeDialog\.close\(\)/);
  assert.match(block,/if\(next\)next\(\)/);
  assert.match(ranked,/accountNoticeDialog\.addEventListener\('cancel'[^]*event\.preventDefault\(\)/);
});


test('room join itself is single-flight and releases the menu launch lock only when settled',()=>{
  assert.match(app,/onlineJoinInFlight=false/);
  assert.match(app,/if\(onlineJoinInFlight\)return;onlineJoinInFlight=true/);
  assert.match(app,/gostop-online-launch-settled[^]*ok:true/);
  assert.match(app,/gostop-online-launch-settled[^]*ok:false/);
  assert.match(app,/finally\{onlineJoinInFlight=false;\}/);
});

test('only the current online session adapter may update gameplay or opening presentation',()=>{
  assert.match(app,/onlineSessionGeneration=0/);
  assert.match(app,/const generation=\+\+onlineSessionGeneration,previous=globalThis\.goStopOnlineSession/);
  assert.match(app,/if\(previous&&previous!==adapter\)\{try\{previous\.close\(\)/);
  assert.match(app,/const isCurrent=\(\)=>generation===onlineSessionGeneration&&globalThis\.goStopOnlineSession===adapter/);
  assert.match(app,/adapter\.addEventListener\('snapshot',event=>\{if\(!isCurrent\(\)\)return/);
  assert.match(app,/sessionGeneration:generation/);
  assert.match(app,/const generation=event\.detail\.sessionGeneration,epoch=event\.detail\.presentationEpoch\?\?onlinePresentationEpoch;if\(generation!==onlineSessionGeneration\|\|epoch!==onlinePresentationEpoch\)return;const \{snapshot\}=event\.detail/);
  assert.match(app,/onlinePresentationQueue=onlinePresentationQueue\.then\(\(\)=>\{if\(generation!==onlineSessionGeneration\|\|epoch!==onlinePresentationEpoch\)return;/);
});

test('leaving an online game invalidates all stale session events',()=>{
  const start=app.indexOf('function returnOnlineToMenu');
  const end=app.indexOf("els.opponentEndedOkBtn.addEventListener",start);
  const block=app.slice(start,end);
  assert.match(block,/onlineSessionGeneration\+\+/);
  assert.match(block,/goStopOnlineSession\?\.close\(\)/);
});

test('phone portrait keeps the player identity row fully inside the fixed mobile game stage',()=>{
  const portrait=gameCss.slice(gameCss.indexOf('/* Mobile web layout pass'),gameCss.indexOf('/* Phones wider than the portrait breakpoint'));
  assert.match(portrait,/\.player-zone\{grid-template-rows:44px 96px 50px!important/);
  assert.match(portrait,/\.player-row\{grid-column:1!important;grid-row:1!important;min-height:0;align-items:center\}/);
  assert.match(portrait,/\.hand\{grid-column:1!important;grid-row:2!important;height:96px/);
  assert.match(portrait,/\.player-capture-panel\{grid-column:1!important;grid-row:3!important\}/);
  assert.match(portrait,/\.game-capture-panel\{height:50px;min-height:0;max-height:50px/);
});

test('admin tables fit desktop width and only use horizontal scrolling on small screens',()=>{
  assert.match(adminCss,/table\{[^}]*table-layout:fixed/);
  assert.match(adminCss,/th,td\{[^}]*overflow-wrap:anywhere/);
  assert.match(adminCss,/\.table-wrap\{[^}]*overflow-x:hidden/);
  assert.match(adminCss,/@media\(max-width:760px\)\{\.table-wrap\{overflow-x:auto\}/);
});
