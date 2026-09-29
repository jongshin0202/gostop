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
