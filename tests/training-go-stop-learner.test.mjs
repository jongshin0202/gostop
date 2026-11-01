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
