const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const source=readFileSync(join(__dirname,'..','server','lobby.mjs'),'utf8');

test('global Lobby uses Cloudflare hibernatable WebSockets instead of pinning the Durable Object',()=>{
  assert.match(source,/state\.acceptWebSocket\(serverSocket\)/);
  assert.match(source,/getWebSockets\(\)/);
  assert.match(source,/serializeAttachment\(attachment\)/);
  assert.match(source,/deserializeAttachment/);
  assert.match(source,/async webSocketMessage\(socket,message\)/);
  assert.match(source,/async webSocketClose\(socket\)/);
  assert.match(source,/async webSocketError\(socket\)/);
  assert.doesNotMatch(source,/serverSocket\.accept\(\)/);
  assert.doesNotMatch(source,/serverSocket\.addEventListener\(['"]message/);
  assert.doesNotMatch(source,/serverSocket\.addEventListener\(['"]close/);
  assert.doesNotMatch(source,/serverSocket\.addEventListener\(['"]error/);
});

test('Lobby rebuilds presence and matchmaking client state from WebSocket attachments after hibernation',async()=>{
  const {Lobby}=await import('../server/lobby.mjs');
  class Socket{
    constructor(attachment){this.attachment=attachment;this.serialized=null;}
    deserializeAttachment(){return this.attachment;}
    serializeAttachment(value){this.serialized=value;this.attachment=value;}
    send(){}
    close(){}
  }
  const socket=new Socket({
    version:1,
    clientId:'client-1',
    account:{id:'account-1',nickname:'Player One',walletCoins:321,countryCode:'US',regionCode:'IL'},
    available:true,
    twoPlayer:false,
    mode:'menu',
    tabId:'tab-1',
    autoMatching:true,
    autoMatchTried:['account-2','account-3'],
    autoMatchCandidateId:'account-4',
    searchQuery:'player',
    connectedAt:1000,
    lastActivityAt:2000,
    lastPresenceAt:3000,
    foreground:true,
    notificationsEnabled:true
  });
  const state={getWebSockets(){return [socket];}};
  const lobby=new Lobby(state,{});
  const client=lobby.clients.get(socket);
  assert.ok(client);
  assert.equal(client.clientId,'client-1');
  assert.equal(client.account.id,'account-1');
  assert.equal(client.tabId,'tab-1');
  assert.equal(client.autoMatching,true);
  assert.deepEqual([...client.autoMatchTried],['account-2','account-3']);
  assert.equal(client.autoMatchCandidateId,'account-4');
  assert.equal(client.messageQueue instanceof Promise,true);

  client.available=false;
  client.autoMatchTried.add('account-5');
  lobby.syncAllClientAttachments();
  assert.equal(socket.serialized.available,false);
  assert.deepEqual(socket.serialized.autoMatchTried,['account-2','account-3','account-5']);
  assert.equal(socket.serialized.account.id,'account-1');
  assert.equal(Object.hasOwn(socket.serialized.account,'activeRanked'),false);
});

test('closing hibernated Lobby socket can be restored for disconnect handling',async()=>{
  const {Lobby}=await import('../server/lobby.mjs');
  class Socket{
    constructor(attachment){this.attachment=attachment;}
    deserializeAttachment(){return this.attachment;}
    serializeAttachment(value){this.attachment=value;}
    send(){}
    close(){}
  }
  const remaining=new Socket({version:1,clientId:'remaining',account:{id:'a',nickname:'A',walletCoins:1},available:true,twoPlayer:false,mode:'menu',tabId:'tab-a',autoMatching:false,autoMatchTried:[],autoMatchCandidateId:null,searchQuery:'',connectedAt:1,lastActivityAt:1,lastPresenceAt:1,foreground:true,notificationsEnabled:false});
  const closing=new Socket({version:1,clientId:'closing',account:{id:'b',nickname:'B',walletCoins:2},available:true,twoPlayer:false,mode:'menu',tabId:'tab-b',autoMatching:false,autoMatchTried:[],autoMatchCandidateId:null,searchQuery:'',connectedAt:1,lastActivityAt:1,lastPresenceAt:1,foreground:true,notificationsEnabled:false});
  const state={getWebSockets(){return [remaining];}};
  const lobby=new Lobby(state,{});
  lobby.restoreHibernatingClients(closing);
  assert.equal(lobby.clients.get(remaining)?.clientId,'remaining');
  assert.equal(lobby.clients.get(closing)?.clientId,'closing');
});


test('overlapping lobby presence and Auto Match messages keep the same client and queue',async()=>{
  const {Lobby}=await import('../server/lobby.mjs');
  const now=Date.now(),messages=[];
  class FakeSocket{
    constructor(){this.attachment={version:1,clientId:'live-1',account:{id:'player-1',nickname:'Player One',walletCoins:500},available:false,twoPlayer:false,mode:'menu',tabId:'tab-1',autoMatching:false,autoMatchTried:[],connectedAt:now,lastActivityAt:now,lastPresenceAt:now,foreground:true};}
    deserializeAttachment(){return this.attachment;}
    serializeAttachment(value){this.attachment=value;}
    send(data){messages.push(JSON.parse(data));}
    close(){}
  }
  const socket=new FakeSocket(),state={getWebSockets(){return [socket]}};
  const lobby=new Lobby(state,{});
  let wakeBroadcast,releaseBroadcast,broadcasts=0;
  const broadcastStarted=new Promise(resolve=>{wakeBroadcast=resolve;});
  lobby.broadcastRecommendations=async()=>{
    if(++broadcasts===1){wakeBroadcast();await new Promise(resolve=>{releaseBroadcast=resolve;});}
  };
  lobby.tryWaitingAutoMatches=async()=>{};
  // setAvailability is pending; the attachment still says available=false.
  const first=lobby.webSocketMessage(socket,JSON.stringify({type:'setAvailability',tabId:'tab-1',available:true,twoPlayer:false,foreground:true,lastActivityAt:now,mode:'menu'}));
  await broadcastStarted;
  const current=lobby.clients.get(socket);
  assert.equal(current.available,true);
  assert.equal(socket.attachment.available,false);
  const second=lobby.webSocketMessage(socket,JSON.stringify({type:'autoMatchStart'}));
  assert.equal(lobby.clients.get(socket),current,'do not replace a live client during an async handler');
  releaseBroadcast();
  await Promise.all([first,second]);
  assert.equal(lobby.clients.get(socket),current);
  assert.equal(lobby.clients.get(socket).available,true);
  assert.equal(socket.attachment.available,true);
  assert.ok(messages.some(message=>message.type==='autoMatchWaiting'),'eligible player reaches waiting state');
  assert.ok(!messages.some(message=>message.type==='challengeError'),'do not falsely accuse the player of being in a two-player game');
});

test('Auto Match reports unready lobby separately from a genuine active two-player game',async()=>{
  const {Lobby}=await import('../server/lobby.mjs');
  const now=Date.now(),sent=[];
  const socket={attachment:{version:1,clientId:'live-2',account:{id:'player-2',nickname:'Player Two'},available:false,twoPlayer:false,mode:'menu',tabId:'tab-2',autoMatching:false,autoMatchTried:[],connectedAt:now,lastActivityAt:now,lastPresenceAt:now,foreground:true},deserializeAttachment(){return this.attachment;},serializeAttachment(value){this.attachment=value;},send(data){sent.push(JSON.parse(data));},close(){}};
  const lobby=new Lobby({getWebSockets(){return [socket]}},{});
  lobby.pruneChallenges=async()=>{};
  await lobby.webSocketMessage(socket,JSON.stringify({type:'autoMatchStart'}));
  assert.equal(sent.at(-1)?.code,'PLAYER_NOT_AVAILABLE');
  assert.match(sent.at(-1)?.message,/availability/i);
  lobby.clients.get(socket).twoPlayer=true;
  await lobby.webSocketMessage(socket,JSON.stringify({type:'autoMatchStart'}));
  assert.equal(sent.at(-1)?.code,'PLAYER_IN_GAME');
});
