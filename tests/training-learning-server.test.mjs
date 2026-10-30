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
