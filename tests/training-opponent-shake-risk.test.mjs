import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const game=require('../game-engine.js');
const shake=require('../dev-site/training-opponent-shake-priority.js');
const risk=require('../dev-site/training-go-stop-risk.js');
const byId=new Map(game.masterDeck.map(c=>[c.id,c]));
const deck=game.masterDeck;
const score=game.score;
const base={deck,score,handIds:['m4-4','m6-4'],floorIds:['m4-3','m6-2'],
 humanCapturedIds:[],opponentCapturedIds:[],revealedOpponentIds:['m4-1','m4-2','m4-3'],
 recommendedHandId:'m6-4',recommendedFloorId:'m6-2'};
test('capture opponent-shaken discard when matching card is held and no winning alternate exists',()=>{
 const found=shake.select(base);
 assert.equal(found.handId,'m4-4');assert.equal(found.floorId,'m4-3');
 assert.equal(found.reason,'opponent-shaken-card');
});
test('never infer a Shake from matching month alone or from unrevealed cards',()=>{
 assert.equal(shake.select({...base,revealedOpponentIds:[]}),null);
 assert.equal(shake.select({...base,floorIds:['m6-2']}),null);
 assert.equal(shake.select({...base,handIds:['m6-4']}),null);
});
test('an immediate 5-BIRDIES completion is a must-have over a shaken Single',()=>{
 const scene={...base,
  handIds:['m8-3','m6-4'],floorIds:['m8-2','m6-3'],
  humanCapturedIds:['m2-1','m4-1'],
  revealedOpponentIds:['m6-1','m6-2','m6-3'],
  recommendedHandId:'m8-3',recommendedFloorId:'m8-2'};
 assert.equal(shake.select(scene),null);
});
test('a third Bright or immediate 7-point winning capture is not displaced',()=>{
 const scene={...base,
  handIds:['m8-3','m6-4'],floorIds:['m8-1','m6-3'],
  humanCapturedIds:['m1-1','m3-1'],
  revealedOpponentIds:['m6-1','m6-2','m6-3'],
  recommendedHandId:'m8-3',recommendedFloorId:'m8-1'};
 assert.equal(shake.select(scene),null);
});
test('opponent Shake priority does not disturb an already recommended Shake capture',()=>{
 assert.equal(shake.select({...base,recommendedHandId:'m4-4',recommendedFloorId:'m4-3'}),null);
});
const safeCaptured=deck.filter(c=>c.type==='pi'&&!['m11-3','m11-4','m8-3','m8-4'].includes(c.id)).slice(0,10).map(c=>c.id);
test('maximum possible next-turn table-capture score below 7 is safe for GO when own match exists',()=>{
 const data=risk.analyze({deck,score,playerHandIds:['m8-4'],
 floorIds:['m8-3','m6-2'],opponentCapturedIds:safeCaptured,
 opponentScore:score(safeCaptured.map(id=>byId.get(id))).total});
 assert.ok(data);
 assert.equal(data.currentOpponentScore,1);
 assert.equal(data.canReachSeven,false);
 assert.ok(data.maxOpponentScore<7);
});
test('visible-table ceiling detects opponent immediate third Birdie plus Double Single threat',()=>{
 const captured=[...safeCaptured,'m2-1','m4-1'];
 const opponentScore=score(captured.map(id=>byId.get(id))).total;
 const data=risk.analyze({deck,score,playerHandIds:['m6-4'],
 floorIds:['m8-2','m11-3'],opponentCapturedIds:captured,
 opponentScore});
 assert.ok(data);
 assert.equal(data.canReachSeven,true);
 assert.ok(data.maxOpponentScore>=7);
});
test('unknown or incomplete visible-state evidence fails closed',()=>{
 assert.equal(risk.analyze({deck:[],floorIds:[],score,opponentScore:1}),null);
 assert.equal(risk.analyze({deck,score,opponentScore:1,floorIds:['invented']}),null);
 assert.equal(risk.analyze({deck,score,opponentScore:null}),null);
});
