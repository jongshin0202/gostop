'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {OnlineSessionAdapter,PROTOCOL_VERSION,viewerCanStartTurn,viewerCanInteract}=require('../online-client.js');

function adapter(){return new OnlineSessionAdapter({baseUrl:'https://example.test',WebSocketImpl:class {}});}
function message(type,extra={}){return {type,protocolVersion:PROTOCOL_VERSION,...extra};}

test('transport emits each snapshot exactly once without type fallthrough',()=>{
  const client=adapter(),seen=[];
  client.addEventListener('snapshot',event=>seen.push(event.detail));
  client.receive(message('snapshot',{snapshot:{revision:4,state:{}},events:[{type:'cardsCaptured',rule:'jjok'}]}));
  assert.equal(client.revision,4);assert.equal(seen.length,1);assert.equal(seen[0].events.length,1);
});

test('accepted, rejected, and ordinary transport messages each emit exactly once',()=>{
  for(const type of ['actionAccepted','actionRejected','pong']){
    const client=adapter();let calls=0;client.pendingActionId='pending';client.addEventListener(type,()=>calls++);client.receive(message(type,{actionId:'pending'}));
    assert.equal(calls,1);assert.equal(client.pendingActionId,type==='pong'?'pending':null);
  }
});

test('snapshot-before-ack keeps input locked until acknowledgement then unlocks only the authoritative viewer',()=>{
  const client=adapter(),snapshot={seatId:'playerB',revision:8,state:{turn:'playerB',legalActions:['attemptPlayCard']}};client.pendingActionId='go-action';
  client.receive(message('snapshot',{snapshot,events:[{type:'goDeclared',actorId:'playerA'}]}));
  assert.equal(client.pendingActionId,'go-action');assert.equal(viewerCanInteract(snapshot,{connected:true,pendingActionId:client.pendingActionId}),false);
  client.receive(message('actionAccepted',{actionId:'go-action'}));
  assert.equal(client.pendingActionId,null);assert.equal(viewerCanInteract(snapshot,{connected:true,pendingActionId:client.pendingActionId}),true);
  assert.equal(viewerCanInteract({...snapshot,seatId:'playerA'},{connected:true}),false);
});

test('rejected room-flow acknowledgement can resync and unlock only the fresh-hand starter',()=>{
  const client=adapter(),snapshot={seatId:'playerB',revision:9,state:{turn:'playerB',legalActions:['attemptPlayCard']}};
  client.pendingActionId='stale-ready';
  assert.equal(viewerCanInteract(snapshot,{connected:true,pendingActionId:client.pendingActionId}),false);
  client.receive(message('actionRejected',{actionId:'stale-ready',error:{code:'HAND_IN_PROGRESS'}}));
  assert.equal(client.pendingActionId,null);
  assert.equal(viewerCanInteract(snapshot,{connected:true,pendingActionId:client.pendingActionId}),true);
  assert.equal(viewerCanInteract({...snapshot,seatId:'playerA'},{connected:true,pendingActionId:client.pendingActionId}),false);
});

test('one authoritative Jjok snapshot produces one presentation request per client',()=>{
  for(let viewer=0;viewer<2;viewer++){
    const client=adapter();let snapshots=0,kisses=0,sounds=0,overlays=0;
    client.addEventListener('snapshot',event=>{snapshots++;for(const item of event.detail.events)if(item.type==='cardsCaptured'&&item.rule==='jjok'){kisses++;sounds++;overlays++;}});
    client.receive(message('snapshot',{snapshot:{revision:9,state:{}},events:[{type:'cardsCaptured',rule:'jjok',cardIds:['m10-3','m10-4']}]}));
    assert.deepEqual({snapshots,kisses,sounds,overlays},{snapshots:1,kisses:1,sounds:1,overlays:1});
  }
});

test('rejection unlock permission is derived solely from the latest authoritative viewer snapshot',()=>{
  const base={seatId:'playerA',state:{turn:'playerA',legalActions:['attemptPlayCard']}};
  assert.equal(viewerCanStartTurn(base),true);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,turn:'playerB'}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,legalActions:[]}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,pendingDecision:{type:'goStopDecision'}}}),false);
  assert.equal(viewerCanStartTurn(null),false);
  assert.equal(viewerCanInteract(base,{connected:true}),true);
  assert.equal(viewerCanInteract(base,{connected:false}),false);
  assert.equal(viewerCanInteract(base,{connected:true,pendingActionId:'pending'}),false);
  assert.equal(viewerCanInteract(base,{connected:true,blocked:true}),false);
});
