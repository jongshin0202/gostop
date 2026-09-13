'use strict';

const test=require('node:test');
const assert=require('node:assert/strict');
const {OnlineSessionAdapter,PROTOCOL_VERSION,viewerCanStartTurn}=require('../online-client.js');

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
});
