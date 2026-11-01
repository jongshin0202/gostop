import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {instrumentDevCompetitiveSoloPeerSync} from '../dev-site/instrument-competitive-solo-peer-sync.mjs';
const require=createRequire(import.meta.url);
const sync=require('../dev-site/competitive-solo-peer-sync.js');
const snapshot=(revision,{pendingTargetIds=null,mode='animal',matchId='same-account-solo',ranked=true}={})=>({
 matchId,revision,ranked,seatId:'playerA',state:{
  human:{gukjinMode:mode,captured:[{id:'m9-1'}]},
  pendingDecision:pendingTargetIds?{
   type:'chooseFloorTarget',source:'drawn',legalTargetIds:pendingTargetIds}:null
 },
 nextAction:null
});
const room={rankedMode:'solo'};
test('selecting one of two targets on the second device invalidates the first device target waiter',()=>{
 const first=snapshot(11,{pendingTargetIds:['m9-2','m9-3']});
 const selected=snapshot(12);
 assert.ok(sync.targetMatches(['m9-2','m9-3'],sync.targetDecision(first)));
 assert.equal(sync.targetMatches(['m9-2','m9-3'],sync.targetDecision(selected)),false);
 assert.equal(sync.stale(first,selected),true);
 assert.equal(sync.isRankedSolo(selected,room),true);
});
test('keep legitimate pending target choice intact on same-revision sync',()=>{
 const snap=snapshot(12,{pendingTargetIds:['m9-3','m9-2']});
 assert.equal(sync.targetMatches(['m9-2','m9-3'],sync.targetDecision(snap)),true);
 assert.equal(sync.targetMatches(['m9-2','m9-4'],sync.targetDecision(snap)),false);
 assert.equal(sync.stale(snap,snap),false);
});
test('remote 2x Single selection is detected from public authority event, including when original mode is unchanged',()=>{
 const msg={type:'gukjinModeChanged',actorId:'playerA',mode:'pi'};
 assert.equal(sync.gukjinModeEvent([msg],'playerA'),true);
 assert.equal(sync.gukjinModeEvent([{...msg,mode:'animal'}],'playerA'),true);
 assert.equal(sync.gukjinModeEvent([msg],'playerB'),false);
 assert.equal(sync.gukjinModeEvent([], 'playerA'),false);
});
test('do not merge revisions across a different hand, and leave regular multiplayer alone',()=>{
 assert.equal(sync.stale(snapshot(30),snapshot(2,{matchId:'new-hand'})),false);
 assert.equal(sync.isRankedSolo(snapshot(2),{rankedMode:'online'}),false);
 assert.equal(sync.isRankedSolo(snapshot(2,{ranked:false}),room),false);
 assert.equal(sync.stale(snapshot(3),snapshot(3)),false);
});
test('development copy has three guarded hooks and production main game source stays unchanged',async()=>{
 const source=await readFile(new URL('../app.js',import.meta.url),'utf8');
 const transformed=instrumentDevCompetitiveSoloPeerSync(source);
 assert.ok(transformed.includes('GoStopDevPeerSync?.reconcile?.('));
 assert.ok(transformed.includes('GoStopDevPeerSync?.staleDecision?.('));
 assert.ok(transformed.includes('GoStopDevPeerSync?.skipGukjinPrompt?.('));
 assert.ok(!source.includes('GoStopDevPeerSync?.reconcile?.('));
 assert.equal(source.includes('async function driveOnline(snapshot,events=[])'),true);
 assert.notEqual(source,transformed);
 assert.throws(()=>instrumentDevCompetitiveSoloPeerSync(source.replace(
  'async function driveOnline(snapshot,events=[])','async function renamedDriveOnline(snapshot,events=[])'
  )),/Refusing unsafe development instrumentation/);
});
