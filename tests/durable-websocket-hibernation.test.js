const test=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {join}=require('node:path');

const source=readFileSync(join(__dirname,'..','server','game-room.mjs'),'utf8');

test('GameRoom uses Cloudflare hibernatable WebSockets instead of pinning Durable Objects in memory',()=>{
  assert.match(source,/state\.acceptWebSocket\(server\)/);
  assert.match(source,/server\.serializeAttachment\(\{playerId:participant\.playerId,multiSocket:!!participant\.accountId\}\)/);
  assert.match(source,/getWebSockets\(\)/);
  assert.match(source,/deserializeAttachment\(\)/);
  assert.match(source,/async webSocketMessage\(socket,message\)/);
  assert.match(source,/async webSocketClose\(socket\)/);
  assert.match(source,/async webSocketError\(socket\)/);
  assert.doesNotMatch(source,/server\.accept\(\)/);
  assert.doesNotMatch(source,/server\.addEventListener\(['"]message/);
  assert.doesNotMatch(source,/server\.addEventListener\(['"]close/);
  assert.doesNotMatch(source,/server\.addEventListener\(['"]error/);
});

test('hibernation restoration preserves single-device and multi-device player socket ownership',async()=>{
  const {GameRoom}=await import('../server/game-room.mjs');
  class Storage{async get(){return undefined;}async put(){}}
  class Socket{
    constructor(attachment){this.attachment=attachment;}
    deserializeAttachment(){return this.attachment;}
    send(){}
    close(){}
  }
  const anonymous=new Socket({playerId:'anon-player',multiSocket:false});
  const accountOne=new Socket({playerId:'account-player',multiSocket:true});
  const accountTwo=new Socket({playerId:'account-player',multiSocket:true});
  const state={storage:new Storage(),getWebSockets(){return [anonymous,accountOne,accountTwo];}};
  const room=new GameRoom(state,{});
  assert.equal(room.core.sockets.get('anon-player'),anonymous);
  const accountSockets=room.core.sockets.get('account-player');
  assert.ok(accountSockets instanceof Set);
  assert.equal(accountSockets.size,2);
  assert.ok(accountSockets.has(accountOne));
  assert.ok(accountSockets.has(accountTwo));
  assert.equal(anonymous.__playerId,'anon-player');
  assert.equal(accountOne.__playerId,'account-player');
});

test('a closing socket is restored into the runtime map so disconnect semantics survive hibernation',async()=>{
  const {GameRoom}=await import('../server/game-room.mjs');
  class Storage{async get(){return undefined;}async put(){}}
  class Socket{
    constructor(attachment){this.attachment=attachment;}
    deserializeAttachment(){return this.attachment;}
    send(){}
    close(){}
  }
  const remaining=new Socket({playerId:'account-player',multiSocket:true});
  const closing=new Socket({playerId:'account-player',multiSocket:true});
  const state={storage:new Storage(),getWebSockets(){return [remaining];}};
  const room=new GameRoom(state,{});
  room.restoreHibernatingSockets(closing);
  const sockets=room.core.sockets.get('account-player');
  assert.ok(sockets instanceof Set);
  assert.equal(sockets.size,2);
  assert.ok(sockets.has(remaining));
  assert.ok(sockets.has(closing));
  assert.equal(closing.__playerId,'account-player');
});
