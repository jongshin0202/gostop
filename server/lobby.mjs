const CHALLENGE_TTL_MS=60000;
const ACCEPTED_CHALLENGE_TTL_MS=120000;
const REQUEST_COOLDOWN_MS=5000;
const MAX_LOBBY_RESULTS=10;
const MAX_SEARCH_RESULTS=20;
const MATCH_WEIGHTS=Object.freeze({coinsPerGame:.60,gamesPlayed:.25,walletCoins:.15});
const clone=value=>JSON.parse(JSON.stringify(value));
const randomId=(cryptoApi,prefix,bytes=16)=>{const data=new Uint8Array(bytes);cryptoApi.getRandomValues(data);return `${prefix}_${Array.from(data,b=>b.toString(16).padStart(2,'0')).join('')}`;};
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const finite=value=>Number.isFinite(Number(value))?Number(value):0;
const normalizedGap=(a,b,floor)=>Math.abs(finite(a)-finite(b))/Math.max(floor,Math.abs(finite(a)),Math.abs(finite(b)));
function coinsPerGame(profile){const explicit=Number(profile?.coinsPerGame??profile?.score);if(Number.isFinite(explicit))return explicit;const games=Math.max(0,finite(profile?.gamesPlayed));return games?finite(profile?.totalCoinsEarned)/games:0;}
function distance(a,b){
  const rate=normalizedGap(coinsPerGame(a),coinsPerGame(b),1);
  const games=normalizedGap(a?.gamesPlayed,b?.gamesPlayed,10);
  const wallet=normalizedGap(a?.walletCoins,b?.walletCoins,100);
  return rate*MATCH_WEIGHTS.coinsPerGame+games*MATCH_WEIGHTS.gamesPlayed+wallet*MATCH_WEIGHTS.walletCoins;
}
const similarityPercent=(a,b)=>Math.max(0,Math.min(100,Math.round((1-distance(a,b))*100)));

export class Lobby{
  constructor(state,env){this.state=state;this.env=env;this.crypto=globalThis.crypto;this.clients=new Map();this.challenges=new Map();this.lastRequestAt=new Map();}
  accountStore(){return this.env.ACCOUNT_STORE.get(this.env.ACCOUNT_STORE.idFromName('global'));}
  async resolveAccount(token,geoHeaders={}){if(!token)return null;const headers=new Headers({Authorization:`Bearer ${token}`});if(geoHeaders.country)headers.set('x-gostop-country',geoHeaders.country);if(geoHeaders.region)headers.set('x-gostop-region',geoHeaders.region);const response=await this.accountStore().fetch(new Request('https://accounts/internal/resolve',{headers}));if(!response.ok)return null;return (await response.json()).account||null;}
  async leaderboardRows(){const response=await this.accountStore().fetch(new Request('https://accounts/leaderboards'));if(!response.ok)return new Map();const body=await response.json();return new Map((body.global||[]).map(row=>[String(row.nickname||'').toLowerCase(),row]));}
  send(socket,message){try{socket.send(JSON.stringify(message));}catch(_){}}
  clientsForAccount(accountId){return [...this.clients.values()].filter(client=>client.account.id===accountId);}
  clientByAccountId(accountId){return this.clientsForAccount(accountId).find(client=>client.available!==false&&!client.twoPlayer)||this.clientsForAccount(accountId)[0]||null;}
  sendToAccount(accountId,message){for(const client of this.clientsForAccount(accountId))this.send(client.socket,message);}
  pendingChallengeFor(accountId){for(const challenge of this.challenges.values())if(challenge.status==='pending'&&(challenge.from===accountId||challenge.to===accountId))return challenge;return null;}
  accountTwoPlayerBusy(accountId){return this.clientsForAccount(accountId).some(client=>!!client.twoPlayer);}
  accountAvailable(accountId){return !this.accountTwoPlayerBusy(accountId)&&this.clientsForAccount(accountId).some(client=>client.available!==false);}
  profile(client,rows){const row=rows.get(String(client.account.nickname||'').toLowerCase())||{},gamesPlayed=finite(row.gamesPlayed),totalCoinsEarned=finite(row.totalCoins),rate=Number.isFinite(Number(row.score))?Number(row.score):(gamesPlayed?totalCoinsEarned/gamesPlayed:0);return {accountId:client.account.id,nickname:client.account.nickname,score:rate,coinsPerGame:rate,totalCoinsEarned,gamesPlayed,walletCoins:finite(client.account.walletCoins),rank:Number(row.rank)||null,provisional:!!row.provisional,countryCode:client.account.countryCode||row.countryCode||null,regionCode:client.account.regionCode||row.regionCode||null,online:true};}
  candidateClients(client){const unique=new Map();for(const candidate of this.clients.values()){const id=candidate.account.id;if(candidate===client||id===client.account.id||candidate.available===false||candidate.twoPlayer||this.accountTwoPlayerBusy(id)||this.pendingChallengeFor(id))continue;if(!unique.has(id))unique.set(id,candidate);}return [...unique.values()];}
  rankedProfiles(client,rows,candidates=this.candidateClients(client)){const me=this.profile(client,rows);return candidates.map(candidate=>{const profile=this.profile(candidate,rows);return {...profile,similarity:similarityPercent(me,profile)};}).sort((a,b)=>distance(me,a)-distance(me,b)||b.gamesPlayed-a.gamesPlayed||a.nickname.localeCompare(b.nickname));}
  async recommendations(client,rows=null){rows=rows||await this.leaderboardRows();return this.rankedProfiles(client,rows).slice(0,MAX_LOBBY_RESULTS);}
  async search(client,query,rows=null){rows=rows||await this.leaderboardRows();const needle=String(query||'').trim().toLowerCase(),me=this.profile(client,rows);return this.candidateClients(client).map(candidate=>this.profile(candidate,rows)).filter(profile=>profile.nickname.toLowerCase().includes(needle)).map(profile=>({...profile,similarity:similarityPercent(me,profile)})).sort((a,b)=>{const ax=a.nickname.toLowerCase()===needle?0:1,bx=b.nickname.toLowerCase()===needle?0:1;return ax-bx||distance(me,a)-distance(me,b)||a.nickname.localeCompare(b.nickname);}).slice(0,MAX_SEARCH_RESULTS);}
  async broadcastRecommendations(){const rows=await this.leaderboardRows();for(const client of this.clients.values()){if(client.available===false||client.twoPlayer)continue;const query=String(client.searchQuery||'').trim();this.send(client.socket,{type:query?'searchResults':'recommendations',query,players:query?await this.search(client,query,rows):await this.recommendations(client,rows),onlineCount:this.candidateClients(client).length,autoMatching:!!client.autoMatching});}}
  challengeParticipantsAvailable(challenge){return this.accountAvailable(challenge.from)&&this.accountAvailable(challenge.to);}
  startChallenge(creator,target,rows,{automatic=false}={}){
    if(!creator||!target||creator.account.id===target.account.id||!this.accountAvailable(creator.account.id)||!this.accountAvailable(target.account.id)||this.pendingChallengeFor(creator.account.id)||this.pendingChallengeFor(target.account.id))return null;
    const now=Date.now(),id=randomId(this.crypto,'challenge'),challenge={id,from:creator.account.id,to:target.account.id,status:'pending',automatic,createdAt:now,expiresAt:now+CHALLENGE_TTL_MS};this.challenges.set(id,challenge);creator.autoMatching=!!automatic;
    const fromProfile=this.profile(creator,rows),toProfile=this.profile(target,rows);
    this.sendToAccount(target.account.id,{type:'playRequest',requestId:id,automatic,expiresInSeconds:60,from:fromProfile});
    this.send(creator.socket,{type:'challengeSent',requestId:id,automatic,to:toProfile});
    return challenge;
  }
  releaseChallenge(challenge){if(!challenge)return;for(const client of this.clientsForAccount(challenge.from))client.autoMatching=false;for(const client of this.clientsForAccount(challenge.to))client.autoMatching=false;}
  async tryAutoMatch(client){
    if(client.available===false||client.twoPlayer||this.pendingChallengeFor(client.account.id))return false;
    const rows=await this.leaderboardRows(),candidates=this.candidateClients(client);
    if(!candidates.length){client.autoMatching=true;this.send(client.socket,{type:'autoMatchWaiting'});return false;}
    const me=this.profile(client,rows),partner=candidates.map(candidate=>({candidate,profile:this.profile(candidate,rows)})).sort((a,b)=>distance(me,a.profile)-distance(me,b.profile)||b.profile.gamesPlayed-a.profile.gamesPlayed||a.profile.nickname.localeCompare(b.profile.nickname))[0].candidate;
    const challenge=this.startChallenge(client,partner,rows,{automatic:true});if(!challenge){this.send(client.socket,{type:'autoMatchWaiting'});return false;}
    return true;
  }
  cancelPendingChallenge(challenge,message='The play request was cancelled.'){if(!challenge)return;this.releaseChallenge(challenge);this.sendToAccount(challenge.from,{type:'challengeCancelled',requestId:challenge.id,message});this.sendToAccount(challenge.to,{type:'challengeCancelled',requestId:challenge.id,message});this.challenges.delete(challenge.id);}
  pruneChallenges(){const now=Date.now();for(const [id,challenge] of this.challenges){if(challenge.expiresAt>now)continue;if(challenge.status==='accepted'){for(const client of this.clientsForAccount(challenge.from))client.available=true;for(const client of this.clientsForAccount(challenge.to))client.available=true;}this.releaseChallenge(challenge);this.sendToAccount(challenge.from,{type:'challengeCancelled',requestId:id,message:'The play request expired.'});this.sendToAccount(challenge.to,{type:'challengeCancelled',requestId:id,message:'The play request expired.'});this.challenges.delete(id);}}
  async handle(client,data){
    let message;try{message=JSON.parse(data);}catch(_){return this.send(client.socket,{type:'error',code:'MALFORMED_MESSAGE',message:'Lobby message is invalid.'});}
    this.pruneChallenges();
    if(message.type==='recommendations'){client.searchQuery='';const rows=await this.leaderboardRows();this.send(client.socket,{type:'recommendations',players:await this.recommendations(client,rows),onlineCount:this.candidateClients(client).length,autoMatching:!!client.autoMatching});return;}
    if(message.type==='search'){client.searchQuery=String(message.query||'').trim();const rows=await this.leaderboardRows();this.send(client.socket,{type:'searchResults',query:client.searchQuery,players:await this.search(client,client.searchQuery,rows),onlineCount:this.candidateClients(client).length,autoMatching:!!client.autoMatching});return;}
    if(message.type==='autoMatchStart'){if(client.available===false||client.twoPlayer)return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'You are already in a two-player game.'});client.autoMatching=true;await this.tryAutoMatch(client);await this.broadcastRecommendations();return;}
    if(message.type==='autoMatchCancel'){const pending=this.pendingChallengeFor(client.account.id);if(pending?.automatic)this.cancelPendingChallenge(pending,'Auto Match was cancelled.');client.autoMatching=false;this.send(client.socket,{type:'autoMatchCancelled'});await this.broadcastRecommendations();return;}
    if(message.type==='setAvailability'){
      client.available=message.available!==false;client.twoPlayer=!!message.twoPlayer;if(client.twoPlayer||!client.available){client.autoMatching=false;const pending=this.pendingChallengeFor(client.account.id);if(pending)this.cancelPendingChallenge(pending,'The player is no longer available.');}
      await this.broadcastRecommendations();return;
    }
    if(message.type==='challenge'){
      client.autoMatching=false;
      const now=Date.now(),last=this.lastRequestAt.get(client.account.id)||0;if(now-last<REQUEST_COOLDOWN_MS)return this.send(client.socket,{type:'challengeError',code:'REQUEST_COOLDOWN',message:'Please wait a moment before sending another request.'});this.lastRequestAt.set(client.account.id,now);
      const target=this.clientByAccountId(message.accountId),rows=await this.leaderboardRows(),challenge=this.startChallenge(client,target,rows,{automatic:false});if(!challenge)return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'That player is no longer available.'});
      await this.broadcastRecommendations();return;
    }
    if(message.type==='challengeResponse'){
      const challenge=this.challenges.get(message.requestId);if(!challenge||challenge.status!=='pending'||challenge.to!==client.account.id)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That play request has expired.'});
      const challenger=this.clientByAccountId(challenge.from);if(!challenger){this.cancelPendingChallenge(challenge,'The requesting player is no longer online.');await this.broadcastRecommendations();return;}
      if(!message.accept){this.releaseChallenge(challenge);this.challenges.delete(challenge.id);this.sendToAccount(challenge.from,{type:'challengeDeclined',requestId:challenge.id,by:{accountId:client.account.id,nickname:client.account.nickname}});this.sendToAccount(challenge.to,{type:'challengeResolved',requestId:challenge.id});await this.broadcastRecommendations();return;}
      if(!this.challengeParticipantsAvailable(challenge)){this.cancelPendingChallenge(challenge,'One of the players is already in a two-player game.');await this.broadcastRecommendations();return;}
      const rows=await this.leaderboardRows();this.releaseChallenge(challenge);for(const item of this.clientsForAccount(challenge.from)){item.available=false;item.autoMatching=false;}for(const item of this.clientsForAccount(challenge.to)){item.available=false;item.autoMatching=false;}challenge.status='accepted';challenge.acceptedAt=Date.now();challenge.expiresAt=Date.now()+ACCEPTED_CHALLENGE_TTL_MS;
      this.send(challenger.socket,{type:'challengeAcceptedCreateRoom',requestId:challenge.id,automatic:!!challenge.automatic,opponent:this.profile(client,rows)});this.sendToAccount(challenge.to,{type:'challengeAcceptedWaiting',requestId:challenge.id,automatic:!!challenge.automatic,opponent:this.profile(challenger,rows)});await this.broadcastRecommendations();return;
    }
    if(message.type==='challengeRoomReady'){
      const challenge=this.challenges.get(message.requestId),roomCode=String(message.roomCode||'').trim().toUpperCase();if(!challenge||challenge.status!=='accepted'||challenge.from!==client.account.id)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That accepted request is no longer active.'});
      if(!/^[A-Z2-9]{14}$/.test(roomCode))return this.send(client.socket,{type:'challengeError',code:'INVALID_ROOM',message:'The room could not be shared.'});
      const target=this.clientByAccountId(challenge.to);if(!target){for(const item of this.clientsForAccount(challenge.from))item.available=true;this.challenges.delete(challenge.id);await this.broadcastRecommendations();return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'The other player went offline before joining.'});}
      this.sendToAccount(challenge.to,{type:'challengeRoomReady',requestId:challenge.id,roomCode});this.send(client.socket,{type:'challengeRoomHandoffComplete',requestId:challenge.id,roomCode});this.challenges.delete(challenge.id);return;
    }
  }
  async disconnect(socket){const client=this.clients.get(socket);if(!client)return;this.clients.delete(socket);const pending=this.pendingChallengeFor(client.account.id);if(pending&&!this.clientsForAccount(client.account.id).length)this.cancelPendingChallenge(pending,'The other player went offline.');await this.broadcastRecommendations();}
  async fetch(request){
    const url=new URL(request.url);if(request.method!=='GET'||url.pathname!=='/connect')return json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404);
    if(request.headers.get('Upgrade')!=='websocket')return json({ok:false,error:{code:'UPGRADE_REQUIRED',message:'WebSocket upgrade required.'}},426);
    const protocol=request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(value=>value.trim()).find(value=>value.startsWith('gostop-auth.')),token=protocol?.slice('gostop-auth.'.length),geoHeaders={country:request.headers.get('x-gostop-country')||'',region:request.headers.get('x-gostop-region')||''},account=await this.resolveAccount(token,geoHeaders);if(!account)return json({ok:false,error:{code:'AUTH_REQUIRED',message:'Login required.'}},401);
    const pair=new WebSocketPair(),clientSocket=pair[0],serverSocket=pair[1];serverSocket.accept();const client={socket:serverSocket,account:clone(account),available:false,twoPlayer:false,autoMatching:false,searchQuery:''};this.clients.set(serverSocket,client);serverSocket.addEventListener('message',event=>{void this.handle(client,event.data);});serverSocket.addEventListener('close',()=>{void this.disconnect(serverSocket);});serverSocket.addEventListener('error',()=>{void this.disconnect(serverSocket);});this.send(serverSocket,{type:'connected',account:{id:account.id,nickname:account.nickname,walletCoins:account.walletCoins,countryCode:account.countryCode||null,regionCode:account.regionCode||null}});await this.broadcastRecommendations();return new Response(null,{status:101,webSocket:clientSocket,headers:{'Sec-WebSocket-Protocol':protocol}});
  }
}

export {distance,similarityPercent,MATCH_WEIGHTS,MAX_LOBBY_RESULTS,CHALLENGE_TTL_MS,ACCEPTED_CHALLENGE_TTL_MS};
