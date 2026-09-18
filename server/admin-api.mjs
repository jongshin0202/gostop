const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const clone=value=>value==null?value:JSON.parse(JSON.stringify(value));
const blankStats=()=>({gamesPlayed:0,wins:0,totalCoinsWon:0,milestones:{}});
const monthOf=value=>String(value||'').slice(0,7);
const whenOf=record=>record?.recordedAt||record?.endedAt||record?.createdAt||record?.startedAt||'';
const clean=value=>String(value||'').trim();
const lower=value=>clean(value).toLowerCase();
const clampLimit=value=>Math.max(1,Math.min(1000,Number(value)||100));
const randomId=store=>store.crypto?.randomUUID?.()||Math.random().toString(36).slice(2);
const safeAccount=account=>({
  id:account.id,email:account.email,nickname:account.nickname,walletCoins:Number(account.walletCoins)||0,
  forceQuits:Number(account.forceQuits)||0,computerBankruptcies:Number(account.computerBankruptcies)||0,
  createdAt:account.createdAt,updatedAt:account.updatedAt,emailVerified:account.emailVerified!==false,
  suspended:!!account.suspended,suspensionReason:account.suspensionReason||null,
  location:clone(account.location||null),lastConnection:clone(account.lastConnection||null),
  disconnectsByMonth:clone(account.disconnectsByMonth||{}),stats:clone(account.stats||{global:blankStats(),monthly:{}}),
  pendingNotices:clone(account.pendingNotices||[]),lastDailyAwardDate:account.lastDailyAwardDate||null,
  lastDailyAwardAt:account.lastDailyAwardAt||null,dailyAwardTimeZone:account.dailyAwardTimeZone||null
});
const gameAccountIds=game=>{
  const ids=new Set();
  for(const item of game?.participants||[])if(item?.accountId)ids.add(item.accountId);
  if(game?.accountId)ids.add(game.accountId);if(game?.opponentAccountId)ids.add(game.opponentAccountId);
  if(game?.account?.id)ids.add(game.account.id);if(game?.opponent?.id)ids.add(game.opponent.id);
  return [...ids];
};
const gameKind=game=>game?.type==='abandonment'?'abandoned':'completed';
const inRange=(record,from,to)=>{
  const time=Date.parse(whenOf(record));if(!Number.isFinite(time))return !from&&!to;
  return (!from||time>=Date.parse(from))&&(!to||time<=Date.parse(to));
};
const queryRange=url=>{
  const from=url.searchParams.get('from'),to=url.searchParams.get('to');
  return {from:from&&Number.isFinite(Date.parse(from))?from:null,to:to&&Number.isFinite(Date.parse(to))?to:null};
};
const score=stats=>stats.gamesPlayed?stats.totalCoinsWon/stats.gamesPlayed:0;
const addMilestones=(stats,milestones={})=>{for(const [name,count] of Object.entries(milestones||{}))stats.milestones[name]=(stats.milestones[name]||0)+(Number(count)||0);};
const addNormalToStats=(stats,item)=>{stats.gamesPlayed++;if(item.won){stats.wins++;stats.totalCoinsWon+=Math.max(0,Number(item.coinsWon)||0);}addMilestones(stats,item.milestones);};
const addAbandonToStats=(stats,won,coins,milestones)=>{stats.gamesPlayed++;if(won){stats.wins++;stats.totalCoinsWon+=Math.max(0,Number(coins)||0);}addMilestones(stats,milestones);};

async function values(store,prefix){return [...(await store.storage.list({prefix})).values()];}
async function games(store){return values(store,'game:');}
async function accounts(store){return values(store,'account:');}

function actorFrom(request){return {ip:request.headers.get('x-gostop-ip')||null,city:request.headers.get('x-gostop-city')||null,region:request.headers.get('x-gostop-region-name')||null,regionCode:request.headers.get('x-gostop-region')||null,countryCode:request.headers.get('x-gostop-country')||null,timeZone:request.headers.get('x-gostop-timezone')||null};}
async function audit(store,request,{action,target,reason,before=null,after=null,details=null}){
  const createdAt=store.now(),entry={id:`audit_${randomId(store)}`,action,target,reason:clean(reason),actor:actorFrom(request),before:clone(before),after:clone(after),details:clone(details),createdAt};
  await store.storage.put(`adminAudit:${createdAt}:${entry.id}`,entry);return entry;
}
function reasonOf(body){const reason=clean(body?.reason);if(reason.length<3){const error=new Error('Admin reason is required.');error.status=400;error.code='ADMIN_REASON_REQUIRED';throw error;}return reason;}

function filteredGames(all,url){
  const {from,to}=queryRange(url),mode=lower(url.searchParams.get('mode')),kind=lower(url.searchParams.get('kind')),player=lower(url.searchParams.get('player')),reason=lower(url.searchParams.get('reason'));
  return all.filter(game=>{
    if(!inRange(game,from,to))return false;
    if(mode&&lower(game.mode)!==mode)return false;
    if(kind&&kind!=='all'&&gameKind(game)!==kind)return false;
    if(reason&&!lower(game.reason).includes(reason))return false;
    if(player){
      const hay=[game.gameId,game.sessionId,game.account?.nickname,game.opponent?.nickname,...(game.participants||[]).flatMap(item=>[item.accountId,item.playerId,item.nickname]),...gameAccountIds(game)].map(lower).join(' ');
      if(!hay.includes(player))return false;
    }
    return true;
  });
}
function gameSummary(game){return {gameId:game.gameId,type:gameKind(game),mode:game.mode||'unknown',recordedAt:game.recordedAt||null,sessionId:game.sessionId||null,winnerPlayerId:game.winnerPlayerId||null,finalPoints:Number(game.finalPoints??game.fairPoints)||0,settlementType:game.settlementType||null,reason:game.reason||null,penaltyCoins:Number(game.penaltyCoins)||0,opponentRewardCoins:Number(game.opponentRewardCoins)||0,firstOfMonth:!!game.firstOfMonth,participants:clone(game.participants||[]),account:clone(game.account||null),opponent:clone(game.opponent||null),accountIds:gameAccountIds(game),hasHistory:!!game.history,adminCorrections:clone(game.adminCorrections||[]),adminConnections:clone(game.adminConnections||null),adminLocations:clone(game.adminLocations||null)};}

async function overview(store,url){
  const allAccounts=await accounts(store),allGames=filteredGames(await games(store),url),sessions=await values(store,'gameSession:'),ledgers=await values(store,'ledger:');
  const {from,to}=queryRange(url),newAccounts=allAccounts.filter(item=>inRange({recordedAt:item.createdAt},from,to)),rangeLedger=ledgers.filter(item=>inRange(item,from,to));
  const completed=allGames.filter(item=>gameKind(item)==='completed'),abandoned=allGames.filter(item=>gameKind(item)==='abandoned'),daily=rangeLedger.filter(item=>item.type==='daily-login');
  return {generatedAt:store.now(),players:{total:allAccounts.length,new:newAccounts.length,suspended:allAccounts.filter(item=>item.suspended).length},games:{total:allGames.length,completed:completed.length,abandoned:abandoned.length,solo:allGames.filter(item=>item.mode==='solo').length,online:allGames.filter(item=>item.mode==='online').length,activeSessions:sessions.filter(item=>!item.endedAt).length},coins:{inCirculation:allAccounts.reduce((sum,item)=>sum+(Number(item.walletCoins)||0),0),dailyAwarded:daily.reduce((sum,item)=>sum+Math.max(0,Number(item.amount)||0),0),dailyAwards:daily.length},range:{from,to}};
}

async function listPlayers(store,url){
  const query=lower(url.searchParams.get('q')),sort=clean(url.searchParams.get('sort')||'createdAt'),dir=url.searchParams.get('dir')==='asc'?1:-1,limit=clampLimit(url.searchParams.get('limit')),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
  let rows=(await accounts(store)).map(safeAccount);
  if(query)rows=rows.filter(item=>[item.id,item.email,item.nickname,item.location?.city,item.location?.region,item.location?.countryCode,item.lastConnection?.ip].map(lower).join(' ').includes(query));
  const getter=item=>sort==='walletCoins'?item.walletCoins:sort==='gamesPlayed'?(item.stats?.global?.gamesPlayed||0):sort==='wins'?(item.stats?.global?.wins||0):sort==='abandons'?item.forceQuits:sort==='nickname'?lower(item.nickname):Date.parse(item[sort]||0)||0;
  rows.sort((a,b)=>{const av=getter(a),bv=getter(b);return (av>bv?1:av<bv?-1:0)*dir;});
  return {total:rows.length,offset,limit,players:rows.slice(offset,offset+limit)};
}
async function playerDetail(store,id){
  const account=await store.accountById(id);if(!account)return null;
  const [connections,ledger,allGames]=await Promise.all([values(store,`connection:${id}:`),values(store,`ledger:${id}:`),games(store)]);
  const playerGames=allGames.filter(game=>gameAccountIds(game).includes(id)).sort((a,b)=>Date.parse(whenOf(b))-Date.parse(whenOf(a)));
  return {player:safeAccount(account),connections:connections.sort((a,b)=>Date.parse(b.recordedAt)-Date.parse(a.recordedAt)),ledger:ledger.sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt)),games:playerGames.map(gameSummary)};
}
async function listGames(store,url){
  const limit=clampLimit(url.searchParams.get('limit')),offset=Math.max(0,Number(url.searchParams.get('offset'))||0);
  const rows=filteredGames(await games(store),url).sort((a,b)=>Date.parse(whenOf(b))-Date.parse(whenOf(a)));
  return {total:rows.length,offset,limit,games:rows.slice(offset,offset+limit).map(gameSummary)};
}
async function gameDetail(store,id){const game=await store.storage.get(`game:${id}`);return game?clone(game):null;}

async function rankings(store,url){
  const metric=clean(url.searchParams.get('metric')||'wins'),limit=Math.max(1,Math.min(250,Number(url.searchParams.get('limit'))||50)),rows=new Map();
  const ensure=id=>{if(!id)return null;if(!rows.has(id))rows.set(id,{accountId:id,nickname:null,games:0,wins:0,points:0,coinsWon:0,coinsLost:0,netCoins:0,abandons:0,protectedAbandons:0});return rows.get(id);};
  for(const game of filteredGames(await games(store),url)){
    if(gameKind(game)==='completed'){
      for(const item of game.participants||[]){const row=ensure(item.accountId);if(!row)continue;row.nickname=item.nickname||row.nickname;row.games++;if(item.won)row.wins++;row.points+=Number(item.points)||0;row.coinsWon+=Math.max(0,Number(item.coinsWon)||0);row.netCoins+=Number(item.walletDelta)||0;if((Number(item.walletDelta)||0)<0)row.coinsLost+=Math.abs(Number(item.walletDelta)||0);}
    }else{
      const quitterId=game.accountId||game.account?.id,row=ensure(quitterId);if(row){row.nickname=game.account?.nickname||row.nickname;row.abandons++;if(game.firstOfMonth)row.protectedAbandons++;row.coinsLost+=Math.max(0,Number(game.penaltyCoins)||0);row.netCoins-=Math.max(0,Number(game.penaltyCoins)||0);if(game.settlementType!=='nagari'&&!game.firstOfMonth)row.games++;}
      const opponentId=game.opponentAccountId||game.opponent?.id,opp=ensure(opponentId);if(opp&&game.settlementType!=='nagari'){opp.nickname=game.opponent?.nickname||opp.nickname;opp.games++;opp.wins++;opp.coinsWon+=Math.max(0,Number(game.opponentRewardCoins)||0);opp.netCoins+=Math.max(0,Number(game.opponentRewardCoins)||0);}
    }
  }
  const accountMap=new Map((await accounts(store)).map(item=>[item.id,item])),country=lower(url.searchParams.get('country')),region=lower(url.searchParams.get('region')),city=lower(url.searchParams.get('city'));
  for(const row of rows.values()){const account=accountMap.get(row.accountId);row.nickname=row.nickname||account?.nickname||row.accountId;row.abandonRate=row.games?row.abandons/row.games:row.abandons?1:0;row.winRate=row.games?row.wins/row.games:0;row.location=clone(account?.location||null);}
  const eligible=[...rows.values()].filter(row=>{const loc=row.location||{};return (!country||lower(loc.countryCode)===country)&&(!region||(lower(loc.regionCode)===region||lower(loc.region)===region))&&(!city||lower(loc.city)===city);});
  const getter=row=>metric==='games'?row.games:metric==='winRate'?row.winRate:metric==='coinsWon'?row.coinsWon:metric==='coinsLost'?row.coinsLost:metric==='netCoins'?row.netCoins:metric==='points'?row.points:metric==='abandons'?row.abandons:metric==='abandonRate'?row.abandonRate:row.wins;
  return {metric,rankings:eligible.sort((a,b)=>getter(b)-getter(a)||b.games-a.games||a.nickname.localeCompare(b.nickname)).slice(0,limit).map((row,index)=>({...row,rank:index+1}))};
}
async function leaderboards(store,url){
  const month=clean(url.searchParams.get('month')||monthOf(store.now())),all=await accounts(store);
  const make=(selector)=>all.map(account=>{const stats=selector(account)||blankStats();return {accountId:account.id,nickname:account.nickname,score:score(stats),gamesPlayed:stats.gamesPlayed,wins:stats.wins,totalCoinsWon:stats.totalCoinsWon,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null};}).sort((a,b)=>b.score-a.score||b.gamesPlayed-a.gamesPlayed||b.totalCoinsWon-a.totalCoinsWon||a.nickname.localeCompare(b.nickname)).map((row,index)=>({...row,rank:index+1}));
  return {month,global:make(account=>account.stats?.global),monthly:make(account=>account.stats?.monthly?.[month])};
}
async function listAudit(store,url){
  const limit=clampLimit(url.searchParams.get('limit')),all=(await values(store,'adminAudit:')).sort((a,b)=>Date.parse(b.createdAt)-Date.parse(a.createdAt));
  return {total:all.length,audit:all.slice(0,limit)};
}
async function systemStatus(store){
  const [playerRows,gameRows,sessionRows,connectionRows,auditRows,archiveRows]=await Promise.all([values(store,'account:'),values(store,'game:'),values(store,'gameSession:'),values(store,'connection:'),values(store,'adminAudit:'),values(store,'leaderboardArchive:')]);
  return {generatedAt:store.now(),storage:{players:playerRows.length,games:gameRows.length,sessions:sessionRows.length,activeSessions:sessionRows.filter(item=>!item.endedAt).length,connections:connectionRows.length,auditRecords:auditRows.length,leaderboardArchives:archiveRows.length},features:{adminAudit:true,rawIpHistory:true,authoritativeGameHistory:true,leaderboardReset:true,leaderboardRebuild:true}};
}

async function geography(store,url){
  const {from,to}=queryRange(url),connections=(await values(store,'connection:')).filter(item=>inRange(item,from,to));
  const aggregate=keyFn=>{
    const map=new Map();
    for(const item of connections){const key=clean(keyFn(item));if(!key)continue;const row=map.get(key)||{key,connections:0,accounts:new Set(),lastSeen:null};row.connections++;row.accounts.add(item.accountId);if(!row.lastSeen||Date.parse(item.recordedAt)>Date.parse(row.lastSeen))row.lastSeen=item.recordedAt;map.set(key,row);}
    return [...map.values()].map(row=>({key:row.key,connections:row.connections,accounts:row.accounts.size,lastSeen:row.lastSeen})).sort((a,b)=>b.connections-a.connections||b.accounts-a.accounts||a.key.localeCompare(b.key));
  };
  const ipMap=new Map();
  for(const item of connections){if(!item.ip)continue;const row=ipMap.get(item.ip)||{ip:item.ip,connections:0,accountIds:new Set(),cities:new Set(),regions:new Set(),countries:new Set(),lastSeen:null};row.connections++;row.accountIds.add(item.accountId);if(item.city)row.cities.add(item.city);if(item.region||item.regionCode)row.regions.add(item.region||item.regionCode);if(item.countryCode)row.countries.add(item.countryCode);if(!row.lastSeen||Date.parse(item.recordedAt)>Date.parse(row.lastSeen))row.lastSeen=item.recordedAt;ipMap.set(item.ip,row);}
  const ips=[...ipMap.values()].map(row=>({ip:row.ip,connections:row.connections,accounts:row.accountIds.size,accountIds:[...row.accountIds],cities:[...row.cities],regions:[...row.regions],countries:[...row.countries],lastSeen:row.lastSeen})).sort((a,b)=>b.accounts-a.accounts||b.connections-a.connections);
  return {connections:connections.length,ips:ips.slice(0,500),countries:aggregate(item=>item.countryCode).slice(0,250),regions:aggregate(item=>[item.countryCode,item.region||item.regionCode].filter(Boolean).join(' / ')).slice(0,250),cities:aggregate(item=>[item.city,item.region||item.regionCode,item.countryCode].filter(Boolean).join(', ')).slice(0,250)};
}
async function abuseSignals(store,url){
  const rankUrl=new URL(url);rankUrl.searchParams.set('metric','abandons');rankUrl.searchParams.set('limit','500');
  const abandon=(await rankings(store,rankUrl)).rankings,geo=await geography(store,url);
  return {generatedAt:store.now(),note:'Signals only. No automatic enforcement.',highAbandonPlayers:abandon.filter(row=>row.abandons>=2||row.abandonRate>=0.2).sort((a,b)=>b.abandons-a.abandons||b.abandonRate-a.abandonRate).slice(0,200),sharedIps:geo.ips.filter(row=>row.accounts>1).slice(0,200)};
}

async function listSessions(store,url){
  const {from,to}=queryRange(url),status=lower(url.searchParams.get('status'));
  let rows=(await values(store,'gameSession:')).filter(item=>inRange(item,from,to));
  if(status==='active')rows=rows.filter(item=>!item.endedAt);if(status==='ended')rows=rows.filter(item=>!!item.endedAt);
  rows.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));return {sessions:rows.slice(0,clampLimit(url.searchParams.get('limit')))};
}

async function walletAdjust(store,request,id,body){
  const reason=reasonOf(body),account=await store.accountById(id);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
  const delta=Math.trunc(Number(body.delta));if(!Number.isFinite(delta)||delta===0)return json({ok:false,error:{code:'INVALID_DELTA',message:'A non-zero integer Coin delta is required.'}},400);
  const before=safeAccount(account);account.walletCoins=(Number(account.walletCoins)||0)+delta;account.updatedAt=store.now();await store.storage.put(`account:${id}`,account);await store.appendLedger(id,{type:'admin-adjustment',amount:delta,reason,createdAt:store.now()});
  await audit(store,request,{action:'wallet-adjust',target:`account:${id}`,reason,before,after:safeAccount(account),details:{delta}});return json({ok:true,player:safeAccount(account)});
}
async function resetDisconnect(store,request,id,body){
  const reason=reasonOf(body),account=await store.accountById(id);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
  const month=clean(body.month||monthOf(store.now()));if(!/^\d{4}-\d{2}$/.test(month))return json({ok:false,error:{code:'INVALID_MONTH',message:'Month must be YYYY-MM.'}},400);
  const before=safeAccount(account);account.disconnectsByMonth={...(account.disconnectsByMonth||{}),[month]:0};account.updatedAt=store.now();await store.storage.put(`account:${id}`,account);
  await audit(store,request,{action:'disconnect-reset',target:`account:${id}`,reason,before,after:safeAccount(account),details:{month}});return json({ok:true,player:safeAccount(account)});
}
async function editProfile(store,request,id,body){
  const reason=reasonOf(body),account=await store.accountById(id);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);const before=safeAccount(account);
  if(Object.hasOwn(body,'nickname')){const nickname=clean(body.nickname).replace(/\s+/g,' ');if(nickname.length<3||nickname.length>16)return json({ok:false,error:{code:'INVALID_NICKNAME',message:'Nickname must be 3-16 characters.'}},400);const key=nickname.toLowerCase(),existing=await store.storage.get(`nickname:${key}`);if(existing&&existing!==id)return json({ok:false,error:{code:'NICKNAME_IN_USE',message:'Nickname is already in use.'}},409);await store.storage.delete(`nickname:${account.nicknameKey}`);account.nickname=nickname;account.nicknameKey=key;await store.storage.put(`nickname:${key}`,id);}
  if(Object.hasOwn(body,'email')){const email=lower(body.email);if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:{code:'INVALID_EMAIL',message:'Invalid email.'}},400);const existing=await store.storage.get(`email:${email}`);if(existing&&existing!==id)return json({ok:false,error:{code:'EMAIL_IN_USE',message:'Email is already in use.'}},409);await store.storage.delete(`email:${account.email}`);account.email=email;await store.storage.put(`email:${email}`,id);}
  if(Object.hasOwn(body,'suspended')){account.suspended=!!body.suspended;account.suspensionReason=account.suspended?clean(body.suspensionReason||reason):null;}
  account.updatedAt=store.now();await store.storage.put(`account:${id}`,account);await audit(store,request,{action:'profile-edit',target:`account:${id}`,reason,before,after:safeAccount(account)});return json({ok:true,player:safeAccount(account)});
}
async function resetLeaderboard(store,request,body){
  const reason=reasonOf(body),scope=clean(body.scope),month=clean(body.month||monthOf(store.now())),accountId=clean(body.accountId),all=await accounts(store),targets=accountId?all.filter(item=>item.id===accountId):all;
  if(!['global','month','player-global','player-month'].includes(scope))return json({ok:false,error:{code:'INVALID_SCOPE',message:'Invalid leaderboard reset scope.'}},400);
  if(scope.includes('player')&&!accountId)return json({ok:false,error:{code:'ACCOUNT_REQUIRED',message:'Player reset requires accountId.'}},400);
  if((scope==='month'||scope==='player-month')&&!/^\d{4}-\d{2}$/.test(month))return json({ok:false,error:{code:'INVALID_MONTH',message:'Month must be YYYY-MM.'}},400);
  const before=targets.map(account=>({accountId:account.id,global:clone(account.stats?.global||blankStats()),monthly:clone(account.stats?.monthly?.[month]||blankStats())})),createdAt=store.now(),archive={id:`lb_${randomId(store)}`,scope,month,accountId:accountId||null,reason,createdAt,before};
  await store.storage.put(`leaderboardArchive:${createdAt}:${archive.id}`,archive);
  for(const account of targets){account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.monthly=account.stats.monthly||{};if(scope==='global'||scope==='player-global')account.stats.global=blankStats();else account.stats.monthly[month]=blankStats();account.updatedAt=createdAt;await store.storage.put(`account:${account.id}`,account);}
  await audit(store,request,{action:'leaderboard-reset',target:scope,reason,details:{month,accountId:accountId||null,archiveId:archive.id,accounts:targets.length}});return json({ok:true,archiveId:archive.id,accountsReset:targets.length,scope,month});
}
async function rebuildLeaderboard(store,request,body){
  const reason=reasonOf(body),scope=clean(body.scope||'global'),month=clean(body.month||monthOf(store.now()));if(!['global','month'].includes(scope))return json({ok:false,error:{code:'INVALID_SCOPE',message:'Rebuild scope must be global or month.'}},400);
  const allAccounts=await accounts(store),map=new Map(allAccounts.map(account=>[account.id,blankStats()])),allGames=await games(store);
  for(const game of allGames){
    if(scope==='month'&&monthOf(whenOf(game))!==month)continue;
    if(gameKind(game)==='completed'){
      for(const item of game.participants||[]){const stats=map.get(item.accountId);if(stats)addNormalToStats(stats,item);}
    }else if(game.settlementType!=='nagari'){
      const quitterId=game.accountId||game.account?.id;if(!game.firstOfMonth&&map.has(quitterId))addAbandonToStats(map.get(quitterId),false,0,game.quitterMilestones);
      const opponentId=game.opponentAccountId||game.opponent?.id;if(map.has(opponentId))addAbandonToStats(map.get(opponentId),true,game.opponentRewardCoins,game.opponentMilestones);
    }
  }
  for(const account of allAccounts){account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.monthly=account.stats.monthly||{};if(scope==='global')account.stats.global=map.get(account.id)||blankStats();else account.stats.monthly[month]=map.get(account.id)||blankStats();account.updatedAt=store.now();await store.storage.put(`account:${account.id}`,account);}
  await audit(store,request,{action:'leaderboard-rebuild',target:scope,reason,details:{month,accounts:allAccounts.length,games:allGames.length}});return json({ok:true,scope,month,accountsRebuilt:allAccounts.length});
}
async function correctGame(store,request,id,body){
  const reason=reasonOf(body),key=`game:${id}`,game=await store.storage.get(key);if(!game)return json({ok:false,error:{code:'GAME_NOT_FOUND',message:'Game not found.'}},404);
  const before=clone(game),createdAt=store.now(),walletAdjustments=Array.isArray(body.walletAdjustments)?body.walletAdjustments:[],applied=[];
  for(const item of walletAdjustments){const accountId=clean(item.accountId),delta=Math.trunc(Number(item.delta));if(!accountId||!Number.isFinite(delta)||!delta)continue;const account=await store.accountById(accountId);if(!account)continue;account.walletCoins=(Number(account.walletCoins)||0)+delta;account.updatedAt=createdAt;await store.storage.put(`account:${accountId}`,account);await store.appendLedger(accountId,{type:'admin-game-correction',amount:delta,gameId:id,reason,createdAt});applied.push({accountId,delta,walletAfter:account.walletCoins});}
  const patch=body.patch&&typeof body.patch==='object'?body.patch:{},allowed=['mode','recordedAt','winnerPlayerId','finalPoints','scores','participants','computer','settlementType','fairPoints','penaltyCoins','opponentRewardCoins','reason','quitterScore','opponentScore','firstOfMonth','settlementReasons','formulaSteps'];
  const effective={};for(const name of allowed)if(Object.hasOwn(patch,name))effective[name]=clone(patch[name]);
  const correction={id:`correction_${randomId(store)}`,reason,createdAt,patch:effective,walletAdjustments:applied};game.adminCorrections=[...(game.adminCorrections||[]),correction];game.adminOverride={...(game.adminOverride||{}),...effective};for(const [name,value] of Object.entries(effective))game[name]=clone(value);await store.storage.put(key,game);
  await audit(store,request,{action:'game-correction',target:key,reason,before:gameSummary(before),after:gameSummary(game),details:correction});return json({ok:true,game,correction,leaderboardRebuildRecommended:true});
}

export async function handleAdminRequest(store,request){
  if(request.headers.get('x-gostop-admin')!=='1')return json({ok:false,error:{code:'ADMIN_AUTH_REQUIRED',message:'Admin authorization required.'}},401);
  const url=new URL(request.url),path=url.pathname;
  try{
    if(request.method==='GET'&&path==='/admin/overview')return json({ok:true,...await overview(store,url)});
    if(request.method==='GET'&&path==='/admin/players')return json({ok:true,...await listPlayers(store,url)});
    let match;
    if(request.method==='GET'&&(match=path.match(/^\/admin\/players\/([^/]+)$/))){const data=await playerDetail(store,decodeURIComponent(match[1]));return data?json({ok:true,...data}):json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);}
    if(request.method==='GET'&&path==='/admin/games')return json({ok:true,...await listGames(store,url)});
    if(request.method==='GET'&&(match=path.match(/^\/admin\/games\/([^/]+)$/))){const data=await gameDetail(store,decodeURIComponent(match[1]));return data?json({ok:true,game:data}):json({ok:false,error:{code:'GAME_NOT_FOUND',message:'Game not found.'}},404);}
    if(request.method==='GET'&&path==='/admin/rankings')return json({ok:true,...await rankings(store,url)});
    if(request.method==='GET'&&path==='/admin/leaderboards')return json({ok:true,...await leaderboards(store,url)});
    if(request.method==='GET'&&path==='/admin/audit')return json({ok:true,...await listAudit(store,url)});
    if(request.method==='GET'&&path==='/admin/sessions')return json({ok:true,...await listSessions(store,url)});
    if(request.method==='GET'&&path==='/admin/geography')return json({ok:true,...await geography(store,url)});
    if(request.method==='GET'&&path==='/admin/abuse')return json({ok:true,...await abuseSignals(store,url)});
    if(request.method==='GET'&&path==='/admin/system')return json({ok:true,...await systemStatus(store)});
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/wallet$/)))return await walletAdjust(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/disconnect-reset$/)))return await resetDisconnect(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/profile$/)))return await editProfile(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&path==='/admin/leaderboards/reset')return await resetLeaderboard(store,request,await request.json().catch(()=>({})));
    if(request.method==='POST'&&path==='/admin/leaderboards/rebuild')return await rebuildLeaderboard(store,request,await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/games\/([^/]+)\/correct$/)))return await correctGame(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    return json({ok:false,error:{code:'NOT_FOUND',message:'Admin endpoint not found.'}},404);
  }catch(error){return json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message||'Admin request failed.'}},error.status||500);}
}
