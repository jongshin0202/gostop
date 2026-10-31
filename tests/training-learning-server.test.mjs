import test from 'node:test';
import assert from 'node:assert/strict';
import worker,{TrainingLearningStore} from '../training-learning/worker.mjs';
const ORIGIN='https://gostop-dev.vercel.app';
const AUTH='Bearer development-account-demo-token';
const card=(id,month,type,flags=[])=>({id,month,type,flags});
const moves=[
 {card:card('m6-3',6,'pi'),target:card('m6-2',6,'ribbon'),moveId:'m6-3|m6-2'},
 {card:card('m6-4',6,'pi',['doublePi']),target:card('m6-2',6,'ribbon'),moveId:'m6-4|m6-2'}
];
const feedback=(gameId='dev-training-1')=>({
 gameId,feedbackId:'feedback-12345',choice:'mine',
 recommended:{hand:'m6-3',target:'m6-2'},
 played:{hand:'m6-4',target:'m6-2'},legalMoves:moves
});
function fixture(){
 const store=new Map();
 const storage={
  get:async k=>structuredClone(store.get(k)),
  put:async(k,v)=>{store.set(k,structuredClone(v));}
 };
 const durable=new TrainingLearningStore({storage},{});
 let email='jwshin1@gmail.com';
 const env={DEV_AUTH_URL:'https://gostop-authority-dev.jwshin1.workers.dev/api/me',
   DEV_AUTH:{fetch:async()=>new Response(JSON.stringify({ok:true,account:{id:'dev-account-id-123',email}}),{status:200,headers:{'content-type':'application/json'}})},
   TRAINING_DATA:{idFromName:name=>name,get:id=>({fetch:request=>durable.fetch(request)})}
 };
 const request=(path,{method='GET',body,origin=ORIGIN,authorization=AUTH}={})=>{
  const headers={origin,authorization};
  if(body)headers['content-type']='application/json';
  return worker.fetch(new Request('https://learning.dev'+path,{method,headers,...(body?{body:JSON.stringify(body)}:{})}),env);
 };
 return {store,request,setEmail:v=>{email=v;},restore:()=>{}};
}
test('learning Worker rejects production origins and unauthenticated requests',async()=>{
 const t=fixture();try{
  assert.equal((await t.request('/api/training/state',{origin:'https://gostoplive.com'})).status,403);
  assert.equal((await t.request('/api/training/state',{authorization:''})).status,401);
  t.setEmail('other@example.com');
  assert.equal((await t.request('/api/training/state')).status,401);
 }finally{t.restore();}
});
test('expert confirmed feedback persists across sessions and trains only at completion',async()=>{
 const t=fixture();try{
  const initial=await(await t.request('/api/training/state')).json();
  assert.equal(initial.model.examples,0);
  const saved=await t.request('/api/training/feedback',{method:'POST',body:feedback()});
  assert.equal(saved.status,200,await saved.text());
  const acrossDevice=await(await t.request('/api/training/state')).json();
  assert.equal(acrossDevice.feedbackCount,1);
  assert.equal(acrossDevice.confirmedCount,1);
  assert.equal(acrossDevice.model.examples,0);
  const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'dev-training-1'}})).json();
  assert.equal(done.trained,1);
  const model=await(await t.request('/api/training/state')).json();
  assert.equal(model.model.examples,1);
  const history=await(await t.request('/api/training/history')).json();
  assert.equal(history.feedback.length,1);
  assert.equal(history.feedback[0].choice,'mine');
  assert.equal((await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'dev-training-1'}})).json()).duplicate,true);
  assert.equal((await(await t.request('/api/training/feedback',{method:'POST',body:feedback()})).json()).duplicate,true);
 }finally{t.restore();}
});
test('uncertain feedback is stored remotely but never trains model',async()=>{
 const t=fixture();try{
  const entry=feedback('dev-training-2');entry.choice='unsure';
  const saved=await t.request('/api/training/feedback',{method:'POST',body:entry});
  assert.equal(saved.status,200);
  const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:entry.gameId}})).json();
  assert.equal(done.trained,0);
  assert.equal((await(await t.request('/api/training/state')).json()).model.examples,0);
 }finally{t.restore();}
});
test('server refuses invented move labels and other invalid positions',async()=>{
 const t=fixture();try{
  let entry=feedback('dev-training-3');
  entry.played={hand:'fake',target:'fake'};
  assert.equal((await t.request('/api/training/feedback',{method:'POST',body:entry})).status,400);
  entry=feedback('dev-training-4');entry.legalMoves=[...entry.legalMoves,moves[0]];
  assert.equal((await t.request('/api/training/feedback',{method:'POST',body:entry})).status,400);
 }finally{t.restore();}
});
test('preflight permits development origin without allowing other origins',async()=>{
 const t=fixture();try{
  const response=await worker.fetch(new Request('https://learning.dev/api/training/state',{method:'OPTIONS',headers:{
   origin:ORIGIN,'access-control-request-method':'POST','access-control-request-headers':'authorization,content-type'
  }}),{});
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),ORIGIN);
 }finally{t.restore();}
});


test('every completed Training game counts exactly once even without feedback',async()=>{
 const t=fixture();try{
  for(let n=1;n<=20;n++){
   const response=await(await t.request('/api/training/complete',{
     method:'POST',body:{gameId:'clean-game-'+n,hadDisagreement:false}
   })).json();
   assert.equal(response.ok,true);
   assert.equal(response.publishedToLive,false);
   assert.equal(response.completedGames,n);
  }
  const summary=await(await t.request('/api/training/state')).json();
  assert.equal(summary.completedGames,20);
  assert.equal(summary.eligibilityReason,'20-completed-games');
  assert.equal(summary.pendingLiveUpdate,undefined,'No weights changed, so no candidate is published');
  const duplicate=await(await t.request('/api/training/complete',{
   method:'POST',body:{gameId:'clean-game-20',hadDisagreement:false}
  })).json();
  assert.equal(duplicate.duplicate,true);
  assert.equal((await(await t.request('/api/training/state')).json()).completedGames,20);
 }finally{t.restore();}
});
test('a disagreement followed by ten clean games stages a versioned candidate without claiming live deployment',async()=>{
 const t=fixture();try{
  await t.request('/api/training/feedback',{method:'POST',body:feedback('dispute-game-1')});
  const first=await(await t.request('/api/training/complete',{
   method:'POST',body:{gameId:'dispute-game-1',hadDisagreement:true}
  })).json();
  assert.equal(first.trained,1);
  for(let n=1;n<=9;n++){
   const r=await(await t.request('/api/training/complete',{
     method:'POST',body:{gameId:'agreement-'+n,hadDisagreement:false}
   })).json();
   assert.equal(r.promotionPending,false);
  }
  const tenth=await(await t.request('/api/training/complete',{
    method:'POST',body:{gameId:'agreement-10',hadDisagreement:false}
  })).json();
  assert.equal(tenth.promotionPending,true);
  assert.equal(tenth.updateTrigger,'10-agreement-games-after-disagreement');
  assert.equal(tenth.publishedToLive,false);
  const state=await(await t.request('/api/training/state')).json();
  assert.equal(state.completedGames,11);
  assert.equal(state.pendingLiveUpdate.modelExamples,1);
  const candidate=t.store.get('promotionCandidate');
  assert.equal(candidate.reason,'10-agreement-games-after-disagreement');
  assert.equal(candidate.model.weights.length,16);
  assert.equal(candidate.model.examples,1);
 }finally{t.restore();}
});

const specialEntry=(gameId='special-game-1',kind='shake',bombReady=false,choice='mine')=>({
 gameId,feedbackId:'special-feedback-0001',choice,
 recommendedAction:kind==='shake'?(bombReady?'bomb':'shake'):'bomb',
 playedAction:kind==='shake'?(bombReady?'shake':'keepForBomb'):'playOne',
 legalActions:kind==='shake'?(bombReady?['shake','bomb']:['shake','keepForBomb']):['bomb','playOne'],
 context:{kind,bombReady:kind==='bomb'?true:bombReady,month:11,cardIds:['m11-1','m11-2','m11-3']},
 visible:{hand:['m11-1','m11-2','m11-3'],floor:['m6-2'],humanCaptured:[],computerCaptured:[]}
});
test('confirmed Shake-versus-Keep feedback is stored and trains only at completion',async()=>{
 const t=fixture();try{
  const x=specialEntry();
  assert.equal((await t.request('/api/training/special-feedback',{method:'POST',body:x})).status,200);
  const before=await(await t.request('/api/training/state')).json();
  assert.equal(before.feedbackCount,1);assert.equal(before.confirmedCount,1);
  assert.equal(before.specialModel.examples,0);
  const r=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}})).json();
  assert.equal(r.trained,1);assert.equal(r.specialModelExamples,1);
  assert.equal(r.publishedToLive,false);
  const after=await(await t.request('/api/training/state')).json();
  assert.equal(after.specialModel.examples,1);
  const history=await(await t.request('/api/training/history')).json();
  assert.equal(history.feedback[0].kind,'special');
  assert.equal(history.feedback[0].recommendedAction,'shake');
  assert.equal(history.feedback[0].playedAction,'keepForBomb');
  assert.equal((await(await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}})).json()).duplicate,true);
 }finally{t.restore();}
});
test('Bomb-versus-Shake and Bomb-versus-Play One judgments train separately',async()=>{
 const t=fixture();try{
  const shake=specialEntry('special-game-shake','shake',true,'recommended');
  const bomb=specialEntry('special-game-bomb','bomb',true,'mine');
  for(const x of [shake,bomb]){
   const r=await t.request('/api/training/special-feedback',{method:'POST',body:x});
   assert.equal(r.status,200,await r.text());
   const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}})).json();
   assert.equal(done.trained,1);
  }
  const state=await(await t.request('/api/training/state')).json();
  assert.equal(state.specialModel.examples,2);
  assert.equal(state.model.examples,0);
 }finally{t.restore();}
});
test('uncertain special feedback counts as disagreement but never trains',async()=>{
 const t=fixture();try{
  const x=specialEntry('special-uncertain','shake',true,'unsure');
  assert.equal((await t.request('/api/training/special-feedback',{method:'POST',body:x})).status,200);
  const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}})).json();
  assert.equal(done.trained,0);assert.equal(done.specialModelExamples,0);
  const state=await(await t.request('/api/training/state')).json();
  assert.equal(state.consecutiveAgreementGames,0);
  assert.equal(state.disagreementObservedAfterUpdate,true);
  assert.equal(state.feedbackCount,1);assert.equal(state.confirmedCount,0);
 }finally{t.restore();}
});
test('server validates special action pairs, visible cards and duplicate feedback',async()=>{
 const t=fixture();try{
  const good=specialEntry('special-valid');
  assert.equal((await t.request('/api/training/special-feedback',{method:'POST',body:good})).status,200);
  assert.equal((await(await t.request('/api/training/special-feedback',{method:'POST',body:good})).json()).duplicate,true);
  const attempts=[
    {...specialEntry('special-bad-1'),playedAction:'invented'},
    {...specialEntry('special-bad-2'),legalActions:['shake','playOne']},
    {...specialEntry('special-bad-3'),context:{...good.context,month:12}},
    {...specialEntry('special-bad-4'),visible:{...good.visible,hand:[]}},
    {...specialEntry('special-bad-5'),recommendedAction:'keepForBomb',playedAction:'keepForBomb'},
    {...specialEntry('special-bad-6'),context:{...good.context,cardIds:['m11-1','m11-1','m11-2']}},
  ];
  for(const x of attempts)assert.equal((await t.request('/api/training/special-feedback',{method:'POST',body:x})).status,400);
  assert.equal((await t.request('/api/training/special-feedback',{method:'POST',body:specialEntry('special-noauth'),authorization:''})).status,401);
  await t.request('/api/training/complete',{method:'POST',body:{gameId:'special-valid'}});
  const late={...good,feedbackId:'special-feedback-late'};
  assert.equal((await t.request('/api/training/special-feedback',{method:'POST',body:late})).status,409);
 }finally{t.restore();}
});
test('special-only learning is included in staged weights after the update threshold',async()=>{
 const t=fixture();try{
  const x=specialEntry('special-trigger-game');
  await t.request('/api/training/special-feedback',{method:'POST',body:x});
  await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}});
  for(let n=1;n<10;n++){
   const r=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'special-clean-'+n}})).json();
   assert.equal(r.promotionPending,false);
  }
  const last=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'special-clean-10'}})).json();
  assert.equal(last.updateTrigger,'10-agreement-games-after-disagreement');
  assert.equal(last.promotionPending,true);
  assert.equal(last.publishedToLive,false);
  const candidate=t.store.get('promotionCandidate');
  assert.equal(candidate.specialModel.examples,1);
  assert.equal(candidate.specialModel.weights.length,16);
  assert.equal(candidate.model.examples,0);
 }finally{t.restore();}
});


const openingEntry=(gameId='opening-expert-1',choice='confirmed')=>({
 gameId,feedbackId:'opening-feedback-0001',choice,
 suggested:['singles'],selected:choice==='confirmed'?['singles','brights']:[],
 evidence:[1,.2,.2,.1,0,0,0,0,.5,.2,0,0],
 visible:{hand:['m1-1','m2-4','m3-4','m4-4'],floor:['m8-1'],
  humanCaptured:[],computerCaptured:[]}
});
test('opening expert can select multiple goals, saved on server and trained only on completion',async()=>{
 const t=fixture();try{
  const x=openingEntry();
  const first=await t.request('/api/training/opening-feedback',{method:'POST',body:x});
  assert.equal(first.status,200,await first.text());
  const before=await(await t.request('/api/training/state')).json();
  assert.equal(before.feedbackCount,1);assert.equal(before.confirmedCount,1);
  assert.equal(before.openingModel.examples,0);
  const duplicate=await(await t.request('/api/training/opening-feedback',{method:'POST',body:{
   ...x,feedbackId:'opening-feedback-0002'}})).json();
  assert.equal(duplicate.duplicate,true);
  const result=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}})).json();
  assert.equal(result.trained,1);assert.equal(result.openingModelExamples,1);
  assert.equal(result.publishedToLive,false);
  const state=await(await t.request('/api/training/state')).json();
  assert.equal(state.openingModel.examples,1);
  assert.equal(state.disagreementObservedAfterUpdate,true);
  const history=await(await t.request('/api/training/history')).json();
  assert.equal(history.feedback[0].kind,'opening');
  assert.deepEqual(history.feedback[0].selected,['singles','brights']);
 }finally{t.restore();}
});
test('not-sure opening feedback never trains and does not count a disagreement',async()=>{
 const t=fixture();try{
  const x=openingEntry('opening-unsure','unsure');
  assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:x})).status,200);
  const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:x.gameId}})).json();
  assert.equal(done.trained,0);assert.equal(done.openingModelExamples,0);
  const state=await(await t.request('/api/training/state')).json();
  assert.equal(state.disagreementObservedAfterUpdate,false);
  assert.equal(state.confirmedCount,0);
 }finally{t.restore();}
});
test('opening endpoint refuses unknown goals, invalid features, blank selections, completed or unauthorized games',async()=>{
 const t=fixture();try{
  const good=openingEntry('opening-valid');
  const invalid=[
   {...openingEntry('opening-invalid-1'),selected:['brights','invented']},
   {...openingEntry('opening-invalid-2'),selected:[]},
   {...openingEntry('opening-invalid-3'),suggested:['singles','singles']},
   {...openingEntry('opening-invalid-4'),evidence:[1,10,0]},
   {...openingEntry('opening-invalid-5'),visible:{...good.visible,hand:['invalid card id']}},
   {...openingEntry('opening-invalid-6'),visible:{...good.visible,floor:[]},choice:'incorrect'},
  ];
  for(const x of invalid)assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:x})).status,400);
  assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:good,authorization:''})).status,401);
  await t.request('/api/training/complete',{method:'POST',body:{gameId:'opening-finished'}});
  assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:openingEntry('opening-finished')})).status,409);
 }finally{t.restore();}
});
test('ten agreement games after an opening-strategy correction stage separate opening weights only',async()=>{
 const t=fixture();try{
  const first=openingEntry('opening-threshold-1');
  await t.request('/api/training/opening-feedback',{method:'POST',body:first});
  const a=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:first.gameId}})).json();
  assert.equal(a.openingModelExamples,1);
  for(let n=1;n<=9;n++){
   const result=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'opening-clean-'+n}})).json();
   assert.equal(result.promotionPending,false);
  }
  const result=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'opening-clean-10'}})).json();
  assert.equal(result.updateTrigger,'10-agreement-games-after-disagreement');
  assert.equal(result.publishedToLive,false);
  const candidate=t.store.get('promotionCandidate');
  assert.equal(candidate.openingModel.examples,1);
  assert.equal(candidate.openingModel.weights.length,8);
  assert.equal(candidate.model.examples,0);
  assert.equal(candidate.specialModel.examples,0);
 }finally{t.restore();}
});


const openingEntry=(gameId='opening-game-1',choice='confirmed')=>({
 gameId,feedbackId:'opening-feedback-0001',choice,
 suggested:['singles'],selected:choice==='confirmed'?['brights','singles']:[],
 evidence:[1,.2,.2,0,0,.1,0,0,.5,.1,0,0],
 visible:{hand:['m1-1','m1-2'],floor:['m8-1'],humanCaptured:[],computerCaptured:[]}
});
test('opening strategy feedback is authenticated, visible-only, one per game and trains only on completion',async()=>{
 const t=fixture();
 const entry=openingEntry();
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:entry,authorization:''})).status,401);
 const response=await t.request('/api/training/opening-feedback',{method:'POST',body:entry});
 assert.equal(response.status,200,await response.text());
 const before=await(await t.request('/api/training/state')).json();
 assert.equal(before.feedbackCount,1);assert.equal(before.openingModel.examples,0);
 assert.equal((await(await t.request('/api/training/opening-feedback',{method:'POST',body:{...entry,feedbackId:'opening-duplicate',selected:['godori']}})).json()).duplicate,true);
 const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:entry.gameId}})).json();
 assert.equal(done.trained,1);assert.equal(done.openingModelExamples,1);
 assert.equal(done.publishedToLive,false);
 const after=await(await t.request('/api/training/state')).json();
 assert.equal(after.openingModel.examples,1);
 assert.ok(after.openingModel.weights[0].some(v=>v>0),'Bright expert selection learns');
 const history=await(await t.request('/api/training/history')).json();
 assert.equal(history.feedback.filter(x=>x.kind==='opening').length,1);
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:openingEntry('opening-game-2','confirmed') ,origin:'https://gostoplive.com'})).status,403);
});
test('uncertain opening feedback is saved without changing weights or counting a disagreement',async()=>{
 const t=fixture(),entry=openingEntry('opening-uncertain','unsure');
 const saved=await t.request('/api/training/opening-feedback',{method:'POST',body:entry});
 assert.equal(saved.status,200);
 const done=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:entry.gameId}})).json();
 assert.equal(done.trained,0);
 const after=await(await t.request('/api/training/state')).json();
 assert.equal(after.openingModel.examples,0);
 assert.equal(after.consecutiveAgreementGames,1);
});
test('opening labels and numeric evidence are strictly validated',async()=>{
 const t=fixture(),entry=openingEntry('opening-invalid');
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:{...entry,selected:['fake']}})).status,400);
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:{...entry,evidence:Array(12).fill(100)}})).status,400);
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:{...entry,selected:[]}})).status,400);
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:{...entry,visible:{...entry.visible,hand:['m1-1','m1-1']}}})).status,400);
});
test('opening disagreements are considered at 20-completed-game update eligibility but never auto-publish production weights',async()=>{
 const t=fixture(),entry=openingEntry('opening-eligible');
 assert.equal((await t.request('/api/training/opening-feedback',{method:'POST',body:entry})).status,200);
 const first=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:entry.gameId}})).json();
 assert.equal(first.trained,1);
 for(let n=1;n<=19;n++){
  const result=await(await t.request('/api/training/complete',{method:'POST',body:{gameId:'opening-clean-'+n}})).json();
  if(n===19)assert.equal(result.promotionPending,true);
 }
 const state=await(await t.request('/api/training/state')).json();
 assert.equal(state.completedGames,20);
 assert.equal(state.pendingLiveUpdate.openingModelExamples,1);
 assert.equal(t.store.get('promotionCandidate').openingModel.examples,1);
 assert.equal(state.pendingLiveUpdate.reason,'20-completed-games');
});
