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

test('post-opening permission unlocks either New Game starter only after both Shake decisions resolve',()=>{
  for(const seatId of ['playerA','playerB']){
    const waiting={seatId,state:{turn:seatId,pendingDecision:{type:'openingTripleDecision'},legalActions:['declareShake','keepShakeSecret']}};
    assert.equal(viewerCanInteract(waiting,{connected:true}),false);
    const resolved={seatId,state:{turn:seatId,pendingDecision:null,legalActions:['attemptPlayCard']}};
    assert.equal(viewerCanInteract(resolved,{connected:true,pendingActionId:null,blocked:false}),true);
    assert.equal(viewerCanInteract(resolved,{connected:true,pendingActionId:'stale-opening-action',blocked:false}),false);
    assert.equal(viewerCanInteract(resolved,{connected:false,pendingActionId:null,blocked:false}),false);
    assert.equal(viewerCanInteract(resolved,{connected:true,pendingActionId:null,blocked:true}),false);
  }
});


test('fresh Solo replay turn unlocks from authoritative state even when derived legalActions is stale',()=>{
  const base={seatId:'playerB',state:{turn:'playerB',winner:null,pendingTurn:null,pendingDecision:null,openingSpecialsComplete:true,human:{},ai:{hand:[{id:'m1-1'}]},legalActions:[]}};
  assert.equal(viewerCanStartTurn(base),true);
  assert.equal(viewerCanInteract(base,{connected:true,pendingActionId:null,blocked:false}),true);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,openingSpecialsComplete:false}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,pendingTurn:{phase:'awaitingDraw'}}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,pendingDecision:{type:'goStopDecision'}}}),false);
  assert.equal(viewerCanStartTurn({...base,state:{...base.state,ai:{hand:[]}}}),false);
});


test('same-account takeover close code stops the displaced device from fighting to reconnect',()=>{
  class FakeSocket{
    static instances=[];
    constructor(){this.readyState=1;FakeSocket.instances.push(this);}
    send(){}
    close(){}
  }
  const client=new OnlineSessionAdapter({baseUrl:'https://example.test',WebSocketImpl:FakeSocket});
  client.room={roomCode:'ABCDEFGHJK2345',credential:'room_'+('a'.repeat(64))};
  let takeoverMessage=null;const oldDispatch=globalThis.dispatchEvent;
  globalThis.dispatchEvent=event=>{if(event?.detail?.type==='sessionTakenOver')takeoverMessage=event.detail;return true;};
  try{
    client.connect();const socket=FakeSocket.instances.at(-1);
    socket.onclose({code:4001,reason:'Reconnected elsewhere'});
    assert.equal(client.explicitlyClosed,true);assert.equal(client.reconnectTimer,null);assert.equal(client.socket,null);
    assert.equal(takeoverMessage.type,'sessionTakenOver');assert.equal(takeoverMessage.code,4001);
  }finally{globalThis.dispatchEvent=oldDispatch;}
});


test('anonymous Free Gaming rooms never send a ranked account token',async()=>{
  const oldFetch=globalThis.fetch,oldRanked=globalThis.GoStopRanked;
  const seen=[];
  globalThis.GoStopRanked={getAuthToken:()=> 'ranked-account-token'};
  globalThis.fetch=async(url,options={})=>{
    seen.push({url:String(url),authorization:options.headers?.authorization||null});
    return {ok:true,json:async()=>({room:{roomCode:'ABCDEFGHJK2345',credential:'room_'+('a'.repeat(64))}})};
  };
  try{
    const free=new OnlineSessionAdapter({baseUrl:'https://example.test',WebSocketImpl:class {},anonymous:true});
    await free.create();
    assert.equal(seen.at(-1).authorization,null);
    const competitive=new OnlineSessionAdapter({baseUrl:'https://example.test',WebSocketImpl:class {}});
    await competitive.create();
    assert.equal(seen.at(-1).authorization,'Bearer ranked-account-token');
  }finally{
    globalThis.fetch=oldFetch;
    if(oldRanked===undefined)delete globalThis.GoStopRanked;else globalThis.GoStopRanked=oldRanked;
  }
});


test('room creator adapter connects with the exact credential returned by create',async()=>{
  const oldFetch=globalThis.fetch;
  class FakeSocket{
    static OPEN=1;
    static instances=[];
    constructor(url,protocol){this.url=String(url);this.protocol=protocol;this.readyState=1;FakeSocket.instances.push(this);}
    send(){}
    close(){}
  }
  const room={roomCode:'ABCDEFGHJK2345',credential:'room_'+('c'.repeat(64))};
  globalThis.fetch=async()=>({ok:true,json:async()=>({room})});
  try{
    const client=new OnlineSessionAdapter({baseUrl:'https://example.test',WebSocketImpl:FakeSocket,anonymous:true});
    const created=await client.create();
    assert.equal(created.credential,room.credential);
    client.connect();
    const socket=FakeSocket.instances.at(-1);
    assert.equal(socket.url,'wss://example.test/api/rooms/ABCDEFGHJK2345/ws');
    assert.equal(socket.protocol,`gostop-token.${room.credential}`);
    assert.equal(client.room,created);
  }finally{globalThis.fetch=oldFetch;}
});
