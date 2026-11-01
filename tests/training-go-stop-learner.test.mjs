import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {GoStopDecisionRanker,goStopFeatures} from '../training-learning/go-stop-learner.mjs';
const require=createRequire(import.meta.url);
const advice=require('../dev-site/training-go-stop-advice.js');

const scene={hand:['m3-4'],floor:['m3-2','m8-1'],playerScore:8,
 opponentScore:0,goCount:0,nativeDecision:'stop',
 nativeReason:'STOP. Only one scoring turn remains.'};

test('one last hand card matching floor against 0-point opponent favors GO over generic last-turn STOP',()=>{
 const result=advice.evaluate(scene);
 assert.equal(result.oneCard,true);assert.equal(result.hasMatch,true);
 assert.equal(result.recommended,'go');assert.equal(result.changed,true);
});
test('matching-month cards are opportunities, never used as unconditional guaranteed points',()=>{
 assert.equal(advice.evaluate({...scene,floor:['m2-2']}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,opponentScore:5}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,goCount:3}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,playerScore:6}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,hand:['m3-4','m3-1']}).recommended,'stop');
 assert.equal(advice.evaluate({...scene,nativeReason:
  'STOP. The computer is at 0. If it captures both Brights, enough to reach the finish threshold.'}).recommended,'stop');
});
test('GO STOP ranker learns only confirmed choices at completed-game Finish and tracks independent weights',()=>{
 const context={playerScore:8,opponentScore:0,remainingCards:1,goCount:0,hasMatch:true};
 assert.equal(goStopFeatures(context,'go').length,16);
 const ranker=new GoStopDecisionRanker();
 assert.equal(ranker.examples,0);
 assert.throws(()=>ranker.trainGame({id:'unfinished',complete:false,decisions:[]}));
 assert.equal(ranker.trainGame({id:'finished',complete:true,decisions:[
  {context,chosenAction:'go'},{context,chosenAction:null}]}),1);
 assert.equal(ranker.examples,1);
 assert.equal(ranker.rank(context).action,'go');
 assert.equal(ranker.trainGame({id:'finished',complete:true,decisions:[{context,chosenAction:'stop'}]}),0);
 const restored=new GoStopDecisionRanker(ranker.export());
 assert.equal(restored.examples,1);
 assert.equal(restored.rank(context).action,'go');
});

test('an already played final card can still trigger a GO/STOP expert comparison',()=>{
 const c={playerScore:8,opponentScore:1,remainingCards:0,goCount:0,hasMatch:false};
 assert.equal(goStopFeatures(c,'go').length,16);
 const ranker=new GoStopDecisionRanker();
 assert.equal(ranker.trainGame({id:'last-card-zero-hand',complete:true,decisions:[{context:c,chosenAction:'go'}]}),1);
});
test('public-card next-turn opponent ceiling is scored from all visible floor combinations',()=>{
 const card=(id,month,type='pi')=>({id,month,type,flags:[]});
 const deck=[card('m1-1',1),card('m1-2',1),card('m1-3',1),card('m1-4',1),
  card('m2-1',2),card('m2-2',2),card('m2-3',2),card('m2-4',2)];
 const points=player=>player.captured.length;
 const ceiling=advice.opponentNextTurnCeiling({
  deck,floorIds:['m1-1','m2-1'],ownHandIds:['m1-4'],
  ownCapturedIds:[],opponentCapturedIds:[],opponentScore:1,
  scorePlayer:player=>({total:points(player)})
 });
 assert.equal(ceiling,5,'two matched captures add exactly four cards');
 const none=advice.opponentNextTurnCeiling({
  deck,floorIds:[],ownHandIds:['m1-4'],
  ownCapturedIds:[],opponentCapturedIds:[],opponentScore:1,
  scorePlayer:player=>({total:points(player)})
 });
 assert.equal(none,1);
});
