const CHALLENGE_TTL_MS=30000;
const CHALLENGE_DELIVERY_RETRY_MS=1500;
const ACCEPTED_CHALLENGE_TTL_MS=120000;
const REQUEST_COOLDOWN_MS=5000;
const PRESENCE_AWAY_MS=300000;
const PRESENCE_HEARTBEAT_STALE_MS=90000;
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
  enqueueClientMessage(client,data){const previous=client.messageQueue||Promise.resolve();const next=previous.catch(()=>{}).then(()=>this.handle(client,data));client.messageQueue=next;return next;}
  async resolveAccount(token,geoHeaders={}){if(!token)return null;const headers=new Headers({Authorization:`Bearer ${token}`});if(geoHeaders.country)headers.set('x-gostop-country',geoHeaders.country);if(geoHeaders.region)headers.set('x-gostop-region',geoHeaders.region);const response=await this.accountStore().fetch(new Request('https://accounts/internal/resolve',{headers}));if(!response.ok)return null;return (await response.json()).account||null;}
  async leaderboardRows(){
    const response=await this.accountStore().fetch(new Request('https://accounts/leaderboards'));if(!response.ok)return new Map();const body=await response.json(),monthly=new Map((body.monthly||[]).map(row=>[String(row.nickname||'').toLowerCase(),row]));
    return new Map((body.global||[]).map(row=>{const key=String(row.nickname||'').toLowerCase(),monthRow=monthly.get(key);return [key,{...row,globalRank:Number.isFinite(Number(row.rank))?Number(row.rank):0,globalProvisional:!!row.provisional,monthlyRank:Number.isFinite(Number(monthRow?.rank))?Number(monthRow.rank):0,monthlyProvisional:!!monthRow?.provisional}];}));
  }
  async directorySearch(query,requesterAccountId=null){const response=await this.accountStore().fetch(new Request('https://accounts/internal/player-search',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({query,requesterAccountId})}));if(!response.ok)return [];const body=await response.json();return Array.isArray(body.players)?body.players:[];}
  async directoryProfiles(accountIds,requesterAccountId=null){
    if(!this.env?.ACCOUNT_STORE||!Array.isArray(accountIds)||!accountIds.length)return [];
    const response=await this.accountStore().fetch(new Request('https://accounts/internal/player-profiles',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountIds,requesterAccountId})}));if(!response.ok)return [];const body=await response.json();return Array.isArray(body.players)?body.players:[];
  }
  send(socket,message){try{socket.send(JSON.stringify(message));}catch(_){}}
  clientsForAccount(accountId){return [...this.clients.values()].filter(client=>client.account.id===accountId);}
  clientById(clientId){for(const client of this.clients.values())if(client.clientId===clientId)return client;return null;}
  clientPresence(client,now=Date.now()){
    if(!client)return {active:false,away:false,notifyable:false,heartbeatFresh:false};
    const last=Math.min(now,Number(client.lastActivityAt)||Number(client.connectedAt)||0),recent=last>0&&now-last<=PRESENCE_AWAY_MS,foreground=client.foreground===true,lastPresence=Math.min(now,Number(client.lastPresenceAt)||Number(client.connectedAt)||0),heartbeatFresh=lastPresence>0&&now-lastPresence<=PRESENCE_HEARTBEAT_STALE_MS;
    const available=heartbeatFresh&&!client.twoPlayer&&client.available!==false,active=available&&foreground&&recent,away=available&&(!foreground||!recent),notifyable=away&&client.notificationsEnabled===true;
    return {active,away,notifyable,recent,foreground,heartbeatFresh};
  }
  clientCanReceiveChallenge(client){const state=this.clientPresence(client);return !client?.twoPlayer&&client.available!==false&&state.heartbeatFresh&&(state.active||state.away);}
  autoMatchSocketDebug(client,now=Date.now()){
    if(!client)return null;
    const presence=this.clientPresence(client,now);
    return {clientId:client.clientId,nickname:client.account?.nickname||null,available:client.available!==false,twoPlayer:!!client.twoPlayer,mode:client.mode||null,foreground:client.foreground===true,connectedAgeMs:Math.max(0,now-(Number(client.connectedAt)||now)),heartbeatAgeMs:Math.max(0,now-(Number(client.lastPresenceAt)||Number(client.connectedAt)||now)),lastActivityAgeMs:Math.max(0,now-(Number(client.lastActivityAt)||Number(client.connectedAt)||now)),heartbeatFresh:presence.heartbeatFresh,active:presence.active,away:presence.away,activeRanked:client.account?.activeRanked||null};
  }
  clientByAccountId(accountId,{challengeableOnly=false,activeOnly=false}={}){
    const clients=this.clientsForAccount(accountId).slice().sort((a,b)=>{const ap=this.clientPresence(a),bp=this.clientPresence(b),ar=ap.active?0:ap.away?1:2,br=bp.active?0:bp.away?1:2;return ar-br||(Number(b.lastActivityAt)||0)-(Number(a.lastActivityAt)||0);});
    if(activeOnly)return clients.find(client=>this.clientPresence(client).active)||null;
    if(challengeableOnly)return clients.find(client=>this.clientCanReceiveChallenge(client))||null;
    return clients[0]||null;
  }
  sendToAccount(accountId,message){for(const client of this.clientsForAccount(accountId))this.send(client.socket,message);}
  sendToChallengeClient(challenge,side,message){const client=this.clientById(side==='from'?challenge?.fromClientId:challenge?.toClientId);if(client)this.send(client.socket,message);else if(side==='to'&&challenge?.to)this.sendToAccount(challenge.to,message);}
  pendingChallengeFor(accountId){for(const challenge of this.challenges.values())if(challenge.status==='pending'&&(challenge.from===accountId||challenge.to===accountId))return challenge;return null;}
  pendingIncomingChallengeFor(accountId){for(const challenge of this.challenges.values())if(challenge.status==='pending'&&challenge.to===accountId)return challenge;return null;}
  challengeRequestMessage(challenge){return {type:'playRequest',requestId:challenge.id,automatic:!!challenge.automatic,expiresInSeconds:Math.max(0,Math.round(((Number(challenge.expiresAt)||Date.now())-Date.now())/1000)),createdAt:challenge.createdAt,from:challenge.fromProfile||{accountId:challenge.from,nickname:'Player'}};}
  deliverPendingChallenge(client){const challenge=this.pendingIncomingChallengeFor(client?.account?.id);if(!challenge||challenge.expiresAt<=Date.now())return false;challenge.deliveryReceipts=challenge.deliveryReceipts instanceof Set?challenge.deliveryReceipts:new Set();if(challenge.deliveryReceipts.has(client.clientId))return false;this.send(client.socket,this.challengeRequestMessage(challenge));return true;}
  activeChallengeFor(accountId){for(const challenge of this.challenges.values())if(['pending','accepted','room-ready'].includes(challenge.status)&&(challenge.from===accountId||challenge.to===accountId))return challenge;return null;}
  accountTwoPlayerBusy(accountId){return this.clientsForAccount(accountId).some(client=>!!client.twoPlayer&&this.clientPresence(client).heartbeatFresh);}
  accountAvailable(accountId){return !this.accountTwoPlayerBusy(accountId)&&this.clientsForAccount(accountId).some(client=>this.clientCanReceiveChallenge(client));}
  onlineAccountCount(client){const ids=new Set();for(const item of this.clients.values())if(item.account.id!==client.account.id&&this.clientPresence(item).heartbeatFresh)ids.add(item.account.id);return ids.size;}
  presenceForAccount(accountId){
    const clients=this.clientsForAccount(accountId),liveClients=clients.filter(client=>this.clientPresence(client).heartbeatFresh);if(!liveClients.length)return {online:false,challengeable:false,status:'offline',mode:'offline'};
    const twoPlayer=liveClients.find(client=>client.twoPlayer);if(twoPlayer)return {online:true,challengeable:false,status:'in-game',mode:twoPlayer.mode||'two-player'};
    const active=liveClients.find(client=>this.clientPresence(client).active);if(active)return {online:true,challengeable:!this.pendingChallengeFor(accountId),status:'available',mode:active.mode||'menu'};
    const away=liveClients.slice().sort((a,b)=>(Number(b.lastActivityAt)||0)-(Number(a.lastActivityAt)||0)).find(client=>this.clientPresence(client).away),notifyable=liveClients.some(client=>this.clientPresence(client).notifyable);
    if(away)return {online:true,challengeable:!this.pendingChallengeFor(accountId),status:'away',mode:away.mode||'menu',notificationsEnabled:notifyable};
    return {online:true,challengeable:false,status:'not-available',mode:liveClients[0]?.mode||'menu'};
  }
  profile(client,rows){const row=rows.get(String(client.account.nickname||'').toLowerCase())||{},gamesPlayed=finite(row.gamesPlayed),wins=finite(row.wins),totalCoinsEarned=finite(row.totalCoins),rate=Number.isFinite(Number(row.score))?Number(row.score):(gamesPlayed?totalCoinsEarned/gamesPlayed:0),presence=this.presenceForAccount(client.account.id),globalRank=Number.isFinite(Number(row.globalRank??row.rank))?Number(row.globalRank??row.rank):0;return {accountId:client.account.id,nickname:client.account.nickname,score:rate,coinsPerGame:rate,totalCoinsEarned,gamesPlayed,wins,losses:Number.isFinite(Number(row.losses))?Math.max(0,Number(row.losses)):Math.max(0,gamesPlayed-wins),walletCoins:finite(client.account.walletCoins),rank:globalRank,globalRank,globalProvisional:!!(row.globalProvisional??row.provisional),monthlyRank:Number.isFinite(Number(row.monthlyRank))?Number(row.monthlyRank):0,monthlyProvisional:!!row.monthlyProvisional,headToHead:row.headToHead||null,countryCode:client.account.countryCode||row.countryCode||null,regionCode:client.account.regionCode||row.regionCode||null,...presence};}
  candidateClients(client,{activeOnly=false}={}){const unique=new Map();for(const candidate of this.clients.values()){const id=candidate.account.id,presence=this.clientPresence(candidate);if(candidate===client||id===client.account.id||candidate.twoPlayer||this.accountTwoPlayerBusy(id)||this.activeChallengeFor(id))continue;if(activeOnly?!presence.active:!this.clientCanReceiveChallenge(candidate))continue;const prior=unique.get(id);if(!prior||this.clientPresence(candidate).active&&!this.clientPresence(prior).active||(Number(candidate.lastActivityAt)||0)>(Number(prior.lastActivityAt)||0))unique.set(id,candidate);}return [...unique.values()];}
  rankedProfiles(client,rows,candidates=this.candidateClients(client)){const me=this.profile(client,rows);return candidates.map(candidate=>{const profile=this.profile(candidate,rows);return {...profile,similarity:similarityPercent(me,profile)};}).sort((a,b)=>distance(me,a)-distance(me,b)||b.gamesPlayed-a.gamesPlayed||a.nickname.localeCompare(b.nickname));}
  async recommendations(client,rows=null){
    rows=rows||await this.leaderboardRows();const ranked=this.rankedProfiles(client,rows).slice(0,MAX_LOBBY_RESULTS),details=await this.directoryProfiles(ranked.map(player=>player.accountId),client.account.id),byId=new Map(details.map(player=>[String(player.accountId),player]));
    return ranked.map(player=>{const detail=byId.get(String(player.accountId));return detail?{...player,...detail,...this.presenceForAccount(player.accountId),similarity:player.similarity}:player;});
  }
  async search(client,query,rows=null){
    rows=rows||await this.leaderboardRows();const me=this.profile(client,rows),directory=await this.directorySearch(query,client.account.id);
    return directory.filter(player=>player.accountId!==client.account.id).map(player=>{
      const presence=this.presenceForAccount(player.accountId),gamesPlayed=finite(player.gamesPlayed),wins=finite(player.wins),globalRank=Number.isFinite(Number(player.globalRank??player.rank))?Number(player.globalRank??player.rank):0,profile={...player,totalCoinsEarned:finite(player.totalCoins),coinsPerGame:finite(player.score),score:finite(player.score),gamesPlayed,wins,losses:Number.isFinite(Number(player.losses))?Math.max(0,Number(player.losses)):Math.max(0,gamesPlayed-wins),walletCoins:finite(player.walletCoins),rank:globalRank,globalRank,monthlyRank:Number.isFinite(Number(player.monthlyRank))?Number(player.monthlyRank):0,...presence};
      return {...profile,similarity:similarityPercent(me,profile)};
    }).slice(0,MAX_SEARCH_RESULTS);
  }
  async broadcastRecommendations(){
    const rows=await this.leaderboardRows();for(const client of this.clients.values()){if(client.available===false||client.twoPlayer)continue;const query=String(client.searchQuery||'').trim(),onlineCount=this.onlineAccountCount(client);this.send(client.socket,{type:'recommendations',players:await this.recommendations(client,rows),onlineCount,autoMatching:!!client.autoMatching});if(query)this.send(client.socket,{type:'searchResults',query,players:await this.search(client,query,rows),onlineCount,autoMatching:!!client.autoMatching});}
  }
  challengeParticipantsAvailable(challenge){const from=this.clientById(challenge.fromClientId),to=challenge.toClientId?this.clientById(challenge.toClientId):null;return !!from&&!from.twoPlayer&&this.clientCanReceiveChallenge(from)&&this.accountAvailable(challenge.to)&&(!to||!to.twoPlayer&&this.clientCanReceiveChallenge(to));}
  clearChallengeTimer(challenge){if(challenge?.expiryTimer){clearTimeout(challenge.expiryTimer);challenge.expiryTimer=null;}}
  armChallengeExpiry(challenge){if(!challenge)return;this.clearChallengeTimer(challenge);const delay=Math.max(0,Number(challenge.expiresAt||0)-Date.now());challenge.expiryTimer=setTimeout(()=>{void this.expireChallenge(challenge.id);},delay);challenge.expiryTimer?.unref?.();}
  clearChallengeDeliveryTimer(challenge){if(challenge?.deliveryTimer){clearTimeout(challenge.deliveryTimer);challenge.deliveryTimer=null;}}
  armChallengeDeliveryRetry(challenge){if(!challenge||challenge.status!=='pending'||challenge.deliveryReceipts?.size)return;this.clearChallengeDeliveryTimer(challenge);const remaining=Number(challenge.expiresAt||0)-Date.now();if(remaining<=100)return;const delay=Math.min(CHALLENGE_DELIVERY_RETRY_MS,Math.max(100,remaining-50));challenge.deliveryTimer=setTimeout(()=>{this.retryChallengeDelivery(challenge.id);},delay);challenge.deliveryTimer?.unref?.();}
  retryChallengeDelivery(id){const challenge=this.challenges.get(id);if(!challenge||challenge.status!=='pending'||Number(challenge.expiresAt||0)<=Date.now()||challenge.deliveryReceipts?.size){this.clearChallengeDeliveryTimer(challenge);return false;}this.sendToAccount(challenge.to,this.challengeRequestMessage(challenge));this.armChallengeDeliveryRetry(challenge);return true;}
  startChallenge(creator,target,rows,{automatic=false,toProfileOverride=null}={}){
    if(!creator||!target||creator.account.id===target.account.id||!this.clientCanReceiveChallenge(creator)||!this.clientCanReceiveChallenge(target)||this.accountTwoPlayerBusy(creator.account.id)||this.accountTwoPlayerBusy(target.account.id)||this.activeChallengeFor(creator.account.id)||this.activeChallengeFor(target.account.id))return null;
    const now=Date.now(),id=randomId(this.crypto,'challenge'),fromProfile=this.profile(creator,rows),baseToProfile=this.profile(target,rows),toProfile=toProfileOverride?{...baseToProfile,...toProfileOverride,...this.presenceForAccount(target.account.id)}:baseToProfile,challenge={id,from:creator.account.id,to:target.account.id,fromClientId:creator.clientId,toClientId:null,status:'pending',automatic,createdAt:now,expiresAt:now+CHALLENGE_TTL_MS,fromProfile:clone(fromProfile),toProfile:clone(toProfile),deliveryReceipts:new Set(),deliveryNotified:false,deliveryTimer:null,expiryTimer:null};this.challenges.set(id,challenge);creator.autoMatching=!!automatic;if(automatic){creator.autoMatchTried=creator.autoMatchTried instanceof Set?creator.autoMatchTried:new Set();creator.autoMatchTried.add(target.account.id);}
    this.sendToAccount(target.account.id,this.challengeRequestMessage(challenge));
    this.armChallengeDeliveryRetry(challenge);
    this.send(creator.socket,{type:'challengeSent',requestId:id,automatic,expiresInSeconds:Math.round(CHALLENGE_TTL_MS/1000),createdAt:now,to:toProfile});
    this.armChallengeExpiry(challenge);
    return challenge;
  }
  releaseChallenge(challenge){if(!challenge)return;this.clearChallengeTimer(challenge);this.clearChallengeDeliveryTimer(challenge);for(const client of this.clientsForAccount(challenge.from))client.autoMatching=false;for(const client of this.clientsForAccount(challenge.to))client.autoMatching=false;}
  async expireChallenge(id){
    const challenge=this.challenges.get(id);if(!challenge)return false;
    const remaining=Number(challenge.expiresAt||0)-Date.now();if(remaining>5){this.armChallengeExpiry(challenge);return false;}
    this.clearChallengeTimer(challenge);this.clearChallengeDeliveryTimer(challenge);this.lastRequestAt.delete(challenge.from);
    if(challenge.status==='pending'){
      const creator=this.clientById(challenge.fromClientId),missed={type:'challengeMissed',requestId:challenge.id,automatic:!!challenge.automatic,createdAt:challenge.createdAt,from:challenge.fromProfile||{accountId:challenge.from,nickname:'Player'}};
      this.sendToAccount(challenge.to,missed);this.challenges.delete(challenge.id);
      if(challenge.automatic&&creator){
        for(const item of this.clientsForAccount(challenge.to))item.autoMatching=false;creator.autoMatching=true;creator.autoMatchCandidateId=null;
        await this.tryAutoMatch(creator);
      }else{
        this.releaseChallenge(challenge);if(creator)this.send(creator.socket,{type:'challengeNoAnswer',requestId:challenge.id,by:challenge.toProfile||{accountId:challenge.to,nickname:'Player'}});
      }
      await this.broadcastRecommendations();return true;
    }
    for(const item of this.clientsForAccount(challenge.from))item.available=true;for(const item of this.clientsForAccount(challenge.to))item.available=true;this.releaseChallenge(challenge);this.challenges.delete(challenge.id);
    this.sendToChallengeClient(challenge,'from',{type:'challengeCancelled',requestId:challenge.id,message:'The accepted play request expired.'});this.sendToChallengeClient(challenge,'to',{type:'challengeCancelled',requestId:challenge.id,message:'The accepted play request expired.'});await this.broadcastRecommendations();return true;
  }
  async tryAutoMatch(client){
    if(!this.clientCanReceiveChallenge(client)||client.twoPlayer||this.activeChallengeFor(client.account.id))return false;
    const rows=await this.leaderboardRows(),tried=client.autoMatchTried instanceof Set?client.autoMatchTried:new Set(),candidates=this.candidateClients(client).filter(candidate=>!tried.has(candidate.account.id));
    if(!candidates.length){client.autoMatching=true;client.autoMatchCandidateId=null;this.send(client.socket,{type:'autoMatchWaiting'});return false;}
    const me=this.profile(client,rows),partner=candidates.map(candidate=>({candidate,profile:this.profile(candidate,rows)})).sort((a,b)=>distance(me,a.profile)-distance(me,b.profile)||b.profile.gamesPlayed-a.profile.gamesPlayed||a.profile.nickname.localeCompare(b.profile.nickname))[0].candidate;
    const details=await this.directoryProfiles([partner.account.id],client.account.id),detail=details[0]||null,toProfile=detail?{...this.profile(partner,rows),...detail,...this.presenceForAccount(partner.account.id)}:this.profile(partner,rows);
    client.autoMatching=true;client.autoMatchCandidateId=partner.account.id;
    this.send(client.socket,{type:'autoMatchCandidate',candidate:toProfile});
    return true;
  }
  async acceptAutoMatchCandidate(client,requestedAccountId=null){
    const now=Date.now(),explicit=String(requestedAccountId||'').trim(),accountId=explicit||client.autoMatchCandidateId,creatorClients=this.clientsForAccount(client.account.id),creatorBusy=this.accountTwoPlayerBusy(client.account.id);
    console.log('AUTO_MATCH_CREATOR_SOCKETS',JSON.stringify({requestedAccountId:explicit||null,resolvedAccountId:accountId||null,currentClientId:client.clientId,creatorBusy,creatorActiveChallenge:!!this.activeChallengeFor(client.account.id),creatorClients:creatorClients.map(item=>this.autoMatchSocketDebug(item,now))}));
    if(this.activeChallengeFor(client.account.id))return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That Auto Match candidate is no longer available.'});
    if(!accountId||accountId===client.account.id)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That Auto Match candidate is no longer available.'});
    const targetClients=this.clientsForAccount(accountId),target=this.clientByAccountId(accountId,{challengeableOnly:true});
    console.log('AUTO_MATCH_TARGET_SOCKETS',JSON.stringify({targetFound:!!target,targetBusy:this.accountTwoPlayerBusy(accountId),targetActiveChallenge:!!this.activeChallengeFor(accountId),targetClients:targetClients.map(item=>this.autoMatchSocketDebug(item,now))}));
    if(!target){client.autoMatching=true;client.autoMatchTried=client.autoMatchTried instanceof Set?client.autoMatchTried:new Set();client.autoMatchTried.add(accountId);client.autoMatchCandidateId=null;console.log('AUTO_MATCH_ACCEPT_REJECTED',JSON.stringify({stage:'target-lookup',reason:'no-challengeable-target'}));await this.tryAutoMatch(client);return false;}
    const rows=await this.leaderboardRows(),details=await this.directoryProfiles([target.account.id],client.account.id),detail=details[0]||null,toProfile=detail?{...this.profile(target,rows),...detail,...this.presenceForAccount(target.account.id)}:this.profile(target,rows);
    client.autoMatching=true;client.autoMatchCandidateId=null;
    const reasons=[];if(!this.clientCanReceiveChallenge(client))reasons.push('creator-not-challengeable');if(!this.clientCanReceiveChallenge(target))reasons.push('target-not-challengeable');if(this.accountTwoPlayerBusy(client.account.id))reasons.push('creator-account-busy');if(this.accountTwoPlayerBusy(target.account.id))reasons.push('target-account-busy');if(this.activeChallengeFor(client.account.id))reasons.push('creator-active-challenge');if(this.activeChallengeFor(target.account.id))reasons.push('target-active-challenge');
    const challenge=this.startChallenge(client,target,rows,{automatic:true,toProfileOverride:toProfile});
    if(!challenge){console.log('AUTO_MATCH_ACCEPT_REJECTED',JSON.stringify({stage:'start-challenge',reasons}));client.autoMatchTried=client.autoMatchTried instanceof Set?client.autoMatchTried:new Set();client.autoMatchTried.add(accountId);await this.tryAutoMatch(client);return false;}
    console.log('AUTO_MATCH_ACCEPT_CREATED',JSON.stringify({requestId:challenge.id,fromClientId:challenge.fromClientId,toAccountId:challenge.to}));
    return true;
  }
  async tryWaitingAutoMatches(){
    const seen=new Set();
    for(const client of this.clients.values()){
      if(seen.has(client.account.id))continue;seen.add(client.account.id);
      if(!client.autoMatching||client.autoMatchCandidateId||!this.clientCanReceiveChallenge(client)||client.twoPlayer||this.activeChallengeFor(client.account.id))continue;
      if(await this.tryAutoMatch(client))break;
    }
  }
  cancelPendingChallenge(challenge,message='The play request was cancelled.'){if(!challenge)return;this.releaseChallenge(challenge);this.lastRequestAt.delete(challenge.from);this.sendToChallengeClient(challenge,'from',{type:'challengeCancelled',requestId:challenge.id,message});this.sendToAccount(challenge.to,{type:'challengeCancelled',requestId:challenge.id,message});this.challenges.delete(challenge.id);}
  async pruneChallenges(){const now=Date.now();for(const [id,challenge] of [...this.challenges])if(Number(challenge.expiresAt||0)<=now)await this.expireChallenge(id);}
  async handle(client,data){
    let message;try{message=JSON.parse(data);}catch(_){return this.send(client.socket,{type:'error',code:'MALFORMED_MESSAGE',message:'Lobby message is invalid.'});}
    await this.pruneChallenges();
    if(message.type==='recommendations'){client.searchQuery='';const rows=await this.leaderboardRows();this.send(client.socket,{type:'recommendations',players:await this.recommendations(client,rows),onlineCount:this.onlineAccountCount(client),autoMatching:!!client.autoMatching});return;}
    if(message.type==='search'){client.searchQuery=String(message.query||'').trim();const rows=await this.leaderboardRows();this.send(client.socket,{type:'searchResults',query:client.searchQuery,players:await this.search(client,client.searchQuery,rows),onlineCount:this.onlineAccountCount(client),autoMatching:!!client.autoMatching});return;}
    if(message.type==='autoMatchStart'){if(!this.clientCanReceiveChallenge(client)||client.twoPlayer)return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'You are already in a two-player game.'});client.autoMatching=true;client.autoMatchTried=new Set();client.autoMatchCandidateId=null;await this.tryAutoMatch(client);await this.broadcastRecommendations();return;}
    if(message.type==='autoMatchNext'){if(!client.autoMatching)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'Auto Match is no longer active.'});client.autoMatchTried=client.autoMatchTried instanceof Set?client.autoMatchTried:new Set();if(client.autoMatchCandidateId)client.autoMatchTried.add(client.autoMatchCandidateId);client.autoMatchCandidateId=null;await this.tryAutoMatch(client);await this.broadcastRecommendations();return;}
    if(message.type==='autoMatchAccept'){await this.acceptAutoMatchCandidate(client,message.accountId);await this.broadcastRecommendations();return;}
    if(message.type==='autoMatchCancel'){const pending=this.pendingChallengeFor(client.account.id);if(pending?.automatic)this.cancelPendingChallenge(pending,'Auto Match was cancelled.');client.autoMatching=false;client.autoMatchTried=new Set();client.autoMatchCandidateId=null;this.send(client.socket,{type:'autoMatchCancelled'});await this.broadcastRecommendations();return;}
    if(message.type==='setAvailability'){
      client.available=message.available!==false;client.twoPlayer=!!message.twoPlayer;client.mode=String(message.mode||'menu').slice(0,32);client.foreground=message.foreground===true;client.notificationsEnabled=message.notificationsEnabled===true;client.lastPresenceAt=Date.now();const reported=Number(message.lastActivityAt);if(Number.isFinite(reported)&&reported>0)client.lastActivityAt=Math.min(Date.now(),reported);
      if(client.twoPlayer){client.autoMatching=false;client.autoMatchCandidateId=null;const pending=this.pendingChallengeFor(client.account.id);if(pending)this.cancelPendingChallenge(pending,'The player is no longer available.');}
      else if(this.clientCanReceiveChallenge(client)){this.deliverPendingChallenge(client);await this.tryWaitingAutoMatches();}
      await this.broadcastRecommendations();return;
    }
    if(message.type==='challengeCancel'){
      const challenge=this.challenges.get(message.requestId);
      if(!challenge||challenge.status!=='pending'||challenge.from!==client.account.id||challenge.fromClientId!==client.clientId)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That play request can no longer be cancelled.'});
      this.releaseChallenge(challenge);this.lastRequestAt.delete(challenge.from);this.challenges.delete(challenge.id);
      this.sendToAccount(challenge.to,{type:'challengeCancelled',requestId:challenge.id,message:'The play request was cancelled.'});
      this.sendToChallengeClient(challenge,'from',{type:'challengeCancelled',requestId:challenge.id,message:'Play request cancelled.'});
      await this.broadcastRecommendations();return;
    }
    if(message.type==='challengeAbort'){
      const challenge=this.challenges.get(message.requestId);
      if(!challenge||!['accepted','room-ready'].includes(challenge.status)||![[challenge.from,challenge.fromClientId],[challenge.to,challenge.toClientId]].some(([accountId,clientId])=>accountId===client.account.id&&clientId===client.clientId))return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That game handoff is no longer active.'});
      this.releaseChallenge(challenge);this.lastRequestAt.delete(challenge.from);for(const item of this.clientsForAccount(challenge.from))item.available=true;for(const item of this.clientsForAccount(challenge.to))item.available=true;
      const ownSide=challenge.fromClientId===client.clientId?'from':'to',otherSide=ownSide==='from'?'to':'from';this.sendToChallengeClient(challenge,otherSide,{type:'challengeCancelled',requestId:challenge.id,message:'The game could not be started.'});this.sendToChallengeClient(challenge,ownSide,{type:'challengeCancelled',requestId:challenge.id,message:'The game could not be started.'});
      this.challenges.delete(challenge.id);await this.broadcastRecommendations();return;
    }
    if(message.type==='challenge'){
      client.autoMatching=false;client.autoMatchCandidateId=null;
      const now=Date.now(),last=this.lastRequestAt.get(client.account.id)||0;if(now-last<REQUEST_COOLDOWN_MS)return this.send(client.socket,{type:'challengeError',code:'REQUEST_COOLDOWN',message:'Please wait a moment before sending another request.'});this.lastRequestAt.set(client.account.id,now);
      const target=this.clientByAccountId(message.accountId,{challengeableOnly:true}),rows=await this.leaderboardRows(),challenge=this.startChallenge(client,target,rows,{automatic:false});if(!challenge)return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'That player is no longer available.'});
      await this.broadcastRecommendations();return;
    }
    if(message.type==='challengeReceipt'){
      const challenge=this.challenges.get(message.requestId);if(!challenge||challenge.status!=='pending'||challenge.to!==client.account.id)return;
      challenge.deliveryReceipts=challenge.deliveryReceipts instanceof Set?challenge.deliveryReceipts:new Set();challenge.deliveryReceipts.add(client.clientId);this.clearChallengeDeliveryTimer(challenge);
      if(!challenge.deliveryNotified){challenge.deliveryNotified=true;const challenger=this.clientById(challenge.fromClientId);if(challenger)this.send(challenger.socket,{type:'challengeDelivered',requestId:challenge.id,automatic:!!challenge.automatic});}
      return;
    }
    if(message.type==='challengeResponse'){
      const challenge=this.challenges.get(message.requestId);if(!challenge||challenge.status!=='pending'||challenge.to!==client.account.id)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That play request has expired.'});
      challenge.toClientId=client.clientId;this.clearChallengeDeliveryTimer(challenge);
      const challenger=this.clientById(challenge.fromClientId);if(!challenger){this.cancelPendingChallenge(challenge,'The requesting player is no longer online.');await this.broadcastRecommendations();return;}
      if(!message.accept){this.releaseChallenge(challenge);this.lastRequestAt.delete(challenge.from);this.challenges.delete(challenge.id);this.send(challenger.socket,{type:'challengeDeclined',requestId:challenge.id,by:{accountId:client.account.id,nickname:client.account.nickname}});this.sendToAccount(challenge.to,{type:'challengeResolved',requestId:challenge.id});await this.broadcastRecommendations();return;}
      if(!this.challengeParticipantsAvailable(challenge)){this.cancelPendingChallenge(challenge,'One of the players is already in a two-player game.');await this.broadcastRecommendations();return;}
      this.sendToAccount(challenge.to,{type:'challengeResolved',requestId:challenge.id});
      const rows=await this.leaderboardRows();this.releaseChallenge(challenge);for(const item of this.clientsForAccount(challenge.from)){item.available=false;item.autoMatching=false;item.autoMatchTried=new Set();item.autoMatchCandidateId=null;}for(const item of this.clientsForAccount(challenge.to)){item.available=false;item.autoMatching=false;}challenge.status='accepted';challenge.acceptedAt=Date.now();challenge.expiresAt=Date.now()+ACCEPTED_CHALLENGE_TTL_MS;this.armChallengeExpiry(challenge);
      this.send(challenger.socket,{type:'challengeAcceptedCreateRoom',requestId:challenge.id,automatic:!!challenge.automatic,opponent:this.profile(client,rows)});this.send(client.socket,{type:'challengeAcceptedWaiting',requestId:challenge.id,automatic:!!challenge.automatic,opponent:this.profile(challenger,rows)});await this.broadcastRecommendations();return;
    }
    if(message.type==='challengeRoomReady'){
      const challenge=this.challenges.get(message.requestId),roomCode=String(message.roomCode||'').trim().toUpperCase();if(!challenge||challenge.status!=='accepted'||challenge.from!==client.account.id||challenge.fromClientId!==client.clientId)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That accepted request is no longer active.'});
      if(!/^[A-Z2-9]{14}$/.test(roomCode))return this.send(client.socket,{type:'challengeError',code:'INVALID_ROOM',message:'The room could not be shared.'});
      const target=this.clientById(challenge.toClientId);if(!target){for(const item of this.clientsForAccount(challenge.from))item.available=true;for(const item of this.clientsForAccount(challenge.to))item.available=true;this.challenges.delete(challenge.id);await this.broadcastRecommendations();return this.send(client.socket,{type:'challengeError',code:'PLAYER_UNAVAILABLE',message:'The other player went offline before joining.'});}
      challenge.status='room-ready';challenge.roomCode=roomCode;challenge.expiresAt=Date.now()+ACCEPTED_CHALLENGE_TTL_MS;this.armChallengeExpiry(challenge);
      this.send(target.socket,{type:'challengeRoomReady',requestId:challenge.id,roomCode});this.send(client.socket,{type:'challengeRoomCreatedWaiting',requestId:challenge.id,roomCode});return;
    }
    if(message.type==='challengeJoined'){
      const challenge=this.challenges.get(message.requestId),roomCode=String(message.roomCode||'').trim().toUpperCase();
      if(!challenge||challenge.status!=='room-ready'||challenge.to!==client.account.id||challenge.toClientId!==client.clientId||challenge.roomCode!==roomCode)return this.send(client.socket,{type:'challengeError',code:'REQUEST_EXPIRED',message:'That game handoff is no longer active.'});
      const challenger=this.clientById(challenge.fromClientId);if(challenger)this.send(challenger.socket,{type:'challengeRoomHandoffComplete',requestId:challenge.id,roomCode});this.send(client.socket,{type:'challengeRoomHandoffComplete',requestId:challenge.id,roomCode});this.clearChallengeTimer(challenge);this.lastRequestAt.delete(challenge.from);this.challenges.delete(challenge.id);return;
    }
  }
  async disconnect(socket){const client=this.clients.get(socket);if(!client)return;this.clients.delete(socket);const challenge=this.activeChallengeFor(client.account.id),ownsChallenge=challenge&&(challenge.fromClientId===client.clientId||challenge.toClientId===client.clientId);if(ownsChallenge){if(challenge.status==='pending')this.cancelPendingChallenge(challenge,'The other player went offline.');else{this.releaseChallenge(challenge);const otherId=challenge.fromClientId===client.clientId?challenge.toClientId:challenge.fromClientId,other=this.clientById(otherId);if(other){other.available=true;this.send(other.socket,{type:'challengeCancelled',requestId:challenge.id,message:'The other player went offline before the game started.'});}this.challenges.delete(challenge.id);}}await this.broadcastRecommendations();}
  resetLobbyRuntime(reason='System reset'){
    for(const challenge of this.challenges.values())this.clearChallengeTimer(challenge);
    this.challenges.clear();this.lastRequestAt.clear();
    for(const client of this.clients.values()){try{client.socket.close(4002,reason);}catch(_){}}
    this.clients.clear();return {ok:true};
  }
  removeAccountRuntime(accountId){
    const id=String(accountId||'');for(const challenge of [...this.challenges.values()])if(challenge.from===id||challenge.to===id)this.cancelPendingChallenge(challenge,'The player account was removed.');
    this.lastRequestAt.delete(id);for(const [socket,client] of [...this.clients])if(client.account?.id===id){this.clients.delete(socket);try{socket.close(4003,'Account removed');}catch(_){}}
    return {ok:true};
  }
  async fetch(request){
    const url=new URL(request.url);
    if(url.pathname==='/system-reset'||url.pathname==='/system-delete-account'){
      if(request.headers.get('x-gostop-system-admin')!=='1')return json({ok:false,error:{code:'SYSTEM_ADMIN_REQUIRED',message:'System admin authorization required.'}},401);
      if(request.method!=='POST')return json({ok:false,error:{code:'METHOD_NOT_ALLOWED',message:'POST required.'}},405);
      if(url.pathname==='/system-reset')return json(this.resetLobbyRuntime());
      const body=await request.json().catch(()=>({}));return json(this.removeAccountRuntime(body.accountId));
    }
    if(request.method!=='GET'||url.pathname!=='/connect')return json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404);
    if(request.headers.get('Upgrade')!=='websocket')return json({ok:false,error:{code:'UPGRADE_REQUIRED',message:'WebSocket upgrade required.'}},426);
    const protocol=request.headers.get('Sec-WebSocket-Protocol')?.split(',').map(value=>value.trim()).find(value=>value.startsWith('gostop-auth.')),token=protocol?.slice('gostop-auth.'.length),geoHeaders={country:request.headers.get('x-gostop-country')||'',region:request.headers.get('x-gostop-region')||''},account=await this.resolveAccount(token,geoHeaders);if(!account)return json({ok:false,error:{code:'AUTH_REQUIRED',message:'Login required.'}},401);
    const pair=new WebSocketPair(),clientSocket=pair[0],serverSocket=pair[1];serverSocket.accept();const connectedAt=Date.now(),client={clientId:randomId(this.crypto,'client'),socket:serverSocket,account:clone(account),available:false,twoPlayer:false,mode:'menu',autoMatching:false,autoMatchTried:new Set(),autoMatchCandidateId:null,searchQuery:'',connectedAt,lastActivityAt:connectedAt,lastPresenceAt:connectedAt,foreground:false,notificationsEnabled:false,messageQueue:Promise.resolve()};this.clients.set(serverSocket,client);serverSocket.addEventListener('message',event=>{void this.enqueueClientMessage(client,event.data);});serverSocket.addEventListener('close',()=>{void this.disconnect(serverSocket);});serverSocket.addEventListener('error',()=>{void this.disconnect(serverSocket);});this.send(serverSocket,{type:'connected',account:{id:account.id,nickname:account.nickname,walletCoins:account.walletCoins,countryCode:account.countryCode||null,regionCode:account.regionCode||null}});await this.broadcastRecommendations();return new Response(null,{status:101,webSocket:clientSocket,headers:{'Sec-WebSocket-Protocol':protocol}});
  }
}

export {distance,similarityPercent,MATCH_WEIGHTS,MAX_LOBBY_RESULTS,CHALLENGE_TTL_MS,ACCEPTED_CHALLENGE_TTL_MS};
