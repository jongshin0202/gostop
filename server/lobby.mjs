const CHALLENGE_TTL_MS=60000;
const ACCEPTED_CHALLENGE_TTL_MS=120000;
const REQUEST_COOLDOWN_MS=5000;
const clone=value=>JSON.parse(JSON.stringify(value));
const randomId=(cryptoApi,prefix,bytes=16)=>{const data=new Uint8Array(bytes);cryptoApi.getRandomValues(data);return `${prefix}_${Array.from(data,b=>b.toString(16).padStart(2,'0')).join('')}`;};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
function distance(a,b){
  const score=Math.abs((a.score||0)-(b.score||0))/Math.max(1,Math.abs(a.score||0),Math.abs(b.score||0));
  const games=Math.abs((a.gamesPlayed||0)-(b.gamesPlayed||0))/Math.max(10,a.gamesPlayed||0,b.gamesPlayed||0);
  const coins=Math.abs((a.walletCoins||0)-(b.walletCoins||0))/Math.max(100,Math.abs(a.walletCoins||0),Math.abs(b.walletCoins||0));
  return (score+games+coins)/3;
}

export class Lobby{
  constructor(state,env){this.state=state;this.env=env;this.crypto=globalThis.crypto;this.clients=new Map();this.challenges=new Map();this.lastRequestAt=new Map();}
  accountStore(){return this.env.ACCOUNT_STORE.get(this.env.ACCOUNT_STORE.idFromName('global'));}
  async resolveAccount(token,geoHeaders={}){if(!token)return null;const headers=new Headers({Authorization:`Bearer ${token}`});if(geoHeaders.country)headers.set('x-gostop-country',geoHeaders.country);if(geoHeaders.region)headers.set('x-gostop-region',geoHeaders.region);const response=await this.accountStore().fetch(new Request('https://accounts/internal/resolve',{headers}));if(!response.ok)return null;return (await response.json()).account||null;}
  async leaderboardRows(){const response=await this.accountStore().fetch(new Request('https://accounts/leaderboards'));if(!response.ok)return new Map();const body=await response.json();return new Map((body.global||[]).map(row=>[String(row.nickname||'').toLowerCase(),row]));}
  send(socket,message){try{socket.send(JSON.stringify(message));}catch(_){}}
  profile(client,rows){const row=rows.get(String(client.account.nickname||'').toLowerCase())||{};return {accountId:client.account.id,nickname:client.account.nickname,score:Number(row.score)||0,gamesPlayed:Number(row.gamesPlayed)||0,walletCoins:Number(client.account.walletCoins)||0,rank:Number(row.rank)||null,provisional:!!row.provisional,countryCode:client.account.countryCode||row.countryCode||null,regionCode:client.account.regionCode||row.regionCode||null,online:true};}
  clientByAccountId(accountId){for(const client of this.clients.values())if(client.account.id===accountId)return client;return null;}
  async recommendations(client){const rows=await this.leaderboardRows(),me=this.profile(client,rows);return [...this.clients.values()].filter(candidate=>candidate!==client&&candidate.available!==false).map(candidate=>this.profile(candidate,rows)).sort((a,b)=>distance(me,a)-distance(me,b)||b.gamesPlayed-a.gamesPlayed||a.nickname.localeCompare(b.nickname)).slice(0,5);}
  async search(client,query){const rows=await this.leaderboardRows(),needle=String(query||'').trim().toLowerCase();return [...this.clients.values()].filter(candidate=>candidate!==client&&candidate.available!==false&&candidate.account.nickname.toLowerCase().includes(needle)).map(candidate=>this.profile(candidate,rows)).sort((a,b)=>{const ax=a.nickname.toLowerCase()===needle?0:1,bx=b.nickname.toLowerCase()===needle?0:1;return ax-bx||a.nickname.localeCompare(b.nickname);}).slice(0,10);}
  pruneChallenges(){const now=Date.now();for(const [id,challenge] of this.challenges){if(challenge.expiresAt>now)continue;const from=this.clientByAccountId(challenge.from),to=this.clientByAccountId(challenge.to);if(challenge.status==='accepted'){if(from)from.available=true;if(to)to.available=true;}if(from)this.send(from.socket,{type:'challengeCancelled',requestId:id,message:'The play request expired.'});if(to)this.send(to.socket,{type:'challengeCancelled',requestId:id,message:'The play request expired.'});this.challenges.delete(id);}}
  async handle(client,data){
    let message;try{message=JSON.parse(data);}catch(_){return this.send(client.socket,{type:'error',code:'MALFORMED_MESSAGE',message:'Lobby message is invalid.'});}
    this.pruneChallenges();
    if(message.type==='recommendations'){this.send(client.socket,{type:'recommendations',players:await this.recommendations(client)});return;}
    if(message.type==='search'){this.send(client.socket,{type:'searchResults',query:String(message.query||''),players:await this.search(client,message.query)});return;}
    if(message.type==='setAvailability'){client.available=message.available!==false;return;}
    if(message.type==='challenge'){
      const now=Date.now(),last=this.lastRequestAt.get(client.account.id)||0;if(now-last<REQUEST_COOLDOWN_MS)return this.send(client.socket,{type:'challengeError',code:'REQUEST_COOLDOWN',message:'Please wait a moment before sending another request.'});this.lastRequestAt.set(client.account.id,now);
      const target=this.clientByAccountId(message.accountId);if(!target||target.available===false)return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'That player is no longer available.'});
      if(target.account.id===client.account.id)return;
      const rows=await this.leaderboardRows(),id=randomId(this.crypto,'challenge'),challenge={id,from:client.account.id,to:target.account.id,status:'pending',createdAt:now,expiresAt:now+CHALLENGE_TTL_MS};this.challenges.set(id,challenge);
      this.send(target.socket,{type:'playRequest',requestId:id,expiresInSeconds:60,from:this.profile(client,rows)});
      this.send(client.socket,{type:'challengeSent',requestId:id,to:this.profile(target,rows)});return;
    }
    if(message.type==='challengeResponse'){
      const challenge=this.challenges.get(message.requestId);if(!challenge||challenge.status!=='pending'||challenge.to!==client.account.id)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That play request has expired.'});
      const challenger=this.clientByAccountId(challenge.from);if(!challenger){this.challenges.delete(challenge.id);return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'The requesting player is no longer online.'});}
      if(!message.accept){this.challenges.delete(challenge.id);this.send(challenger.socket,{type:'challengeDeclined',requestId:challenge.id,by:{accountId:client.account.id,nickname:client.account.nickname}});return;}
      challenger.available=false;client.available=false;challenge.status='accepted';challenge.acceptedAt=Date.now();challenge.expiresAt=Date.now()+ACCEPTED_CHALLENGE_TTL_MS;
      const rows=await this.leaderboardRows();this.send(challenger.socket,{type:'challengeAcceptedCreateRoom',requestId:challenge.id,opponent:this.profile(client,rows)});this.send(client.socket,{type:'challengeAcceptedWaiting',requestId:challenge.id,opponent:this.profile(challenger,rows)});return;
    }
    if(message.type==='challengeRoomReady'){
      const challenge=this.challenges.get(message.requestId),roomCode=String(message.roomCode||'').trim().toUpperCase();if(!challenge||challenge.status!=='accepted'||challenge.from!==client.account.id)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That accepted request is no longer active.'});
      if(!/^[A-Z2-9]{14}$/.test(roomCode))return this.send(client.socket,{type:'challengeError',code:'INVALID_ROOM',message:'The room could not be shared.'});
      const target=this.clientByAccountId(challenge.to);if(!target){client.available=true;this.challenges.delete(challenge.id);return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'The other player went offline before joining.'});}
      this.send(target.socket,{type:'challengeRoomReady',requestId:challenge.id,roomCode});this.send(client.socket,{type:'challengeRoomHandoffComplete',requestId:challenge.id,roomCode});this.challenges.delete(challenge.id);return;
    }
  }
  disconnect(socket){const client=this.clients.get(socket);if(!client)return;this.clients.delete(socket);for(const [id,challenge] of this.challenges){if(challenge.from===client.account.id||challenge.to===client.account.id){const otherId=challenge.from===client.account.id?challenge.to:challenge.from,other=this.clientByAccountId(otherId);if(other){other.available=true;this.send(other.socket,{type:'challengeCancelled',requestId:id,message:'The other player went offline.'});}this.challenges.delete(id);}}}
  async fetch(request){
    const url=new URL(request.url);if(request.method!=='GET'||url.pathname!=='/connect')return json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404);
    if(request.headers.get('Upgrade')!=='websocket')return json({ok:false,error:{code:'UPGRADE_REQUIRED',message:'WebSocket upgrade required.'}},426);
    const protocol=request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(value=>value.trim()).find(value=>value.startsWith('gostop-auth.')),token=protocol?.slice('gostop-auth.'.length),geoHeaders={country:request.headers.get('x-gostop-country')||'',region:request.headers.get('x-gostop-region')||''},account=await this.resolveAccount(token,geoHeaders);if(!account)return json({ok:false,error:{code:'AUTH_REQUIRED',message:'Login required.'}},401);
    const pair=new WebSocketPair(),clientSocket=pair[0],serverSocket=pair[1];serverSocket.accept();const client={socket:serverSocket,account:clone(account),available:true};this.clients.set(serverSocket,client);serverSocket.addEventListener('message',event=>this.handle(client,event.data));serverSocket.addEventListener('close',()=>this.disconnect(serverSocket));serverSocket.addEventListener('error',()=>this.disconnect(serverSocket));this.send(serverSocket,{type:'connected',account:{id:account.id,nickname:account.nickname,walletCoins:account.walletCoins,countryCode:account.countryCode||null,regionCode:account.regionCode||null}});this.send(serverSocket,{type:'recommendations',players:await this.recommendations(client)});return new Response(null,{status:101,webSocket:clientSocket,headers:{'Sec-WebSocket-Protocol':protocol}});
  }
}

export {distance,CHALLENGE_TTL_MS,ACCEPTED_CHALLENGE_TTL_MS};
