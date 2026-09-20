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
function gameSummary(game){return {gameId:game.gameId,type:gameKind(game),mode:game.mode||'unknown',recordedAt:game.recordedAt||null,sessionId:game.sessionId||null,winnerPlayerId:game.winnerPlayerId||null,finalPoints:Number(game.finalPoints??game.fairPoints)||0,settlementType:game.settlementType||null,settlementReasons:clone(game.settlementReasons||[]),formulaSteps:clone(game.formulaSteps||[]),reason:game.reason||null,penaltyCoins:Number(game.penaltyCoins)||0,opponentRewardCoins:Number(game.opponentRewardCoins)||0,firstOfMonth:!!game.firstOfMonth,participants:clone(game.participants||[]),computer:clone(game.computer||null),account:clone(game.account||null),opponent:clone(game.opponent||null),accountIds:gameAccountIds(game),hasHistory:!!game.history,adminCorrections:clone(game.adminCorrections||[]),adminConnections:clone(game.adminConnections||null),adminLocations:clone(game.adminLocations||null)};}

const SESSION_MILESTONES=['5_BRIGHTS','5_BIRDIES','3_STRIPES','SHAKE','THREE_GO','FLUSH','CLEAN_SWEEP','KISS','POOPED','FIRST_POOP','BOMB','CONQUER','THREE_PPEOK'];
function milestoneFromHistoryEvent(event){
  if(event?.type==='shakeDeclared')return 'SHAKE';
  if(event?.type==='bombDeclared')return 'BOMB';
  if(event?.type==='ppeokFormed')return 'POOPED';
  if(event?.type==='firstPpeokAwarded')return 'FIRST_POOP';
  if(event?.type==='sweepTriggered')return 'CLEAN_SWEEP';
  if(event?.type==='chongtongDeclared')return 'CONQUER';
  if(event?.type==='threePpeokDeclared')return 'THREE_PPEOK';
  if(event?.type==='goDeclared'&&Number(event.goCount)===3)return 'THREE_GO';
  if(event?.type==='cardsCaptured'&&event.rule==='jjok')return 'KISS';
  if(event?.type==='cardsCaptured'&&event.rule==='ttadak')return 'FLUSH';
  return null;
}
function historyMilestones(game,playerId){
  const history=game?.history;if(!history||!playerId)return {};
  const seat=history.seatByPlayer?.[playerId]||playerId,bucket={};
  for(const event of history.events||[]){if(event?.actorId!==seat&&event?.playerId!==seat&&event?.actorId!==playerId)continue;const name=milestoneFromHistoryEvent(event);if(name)bucket[name]=(bucket[name]||0)+1;}
  const side=seat==='playerA'?'human':seat==='playerB'?'ai':null,captured=side?history.finalState?.[side]?.captured||[]:[];
  if(captured.length){
    if([2,4,8].every(month=>captured.some(card=>card.month===month&&card.flags?.includes('godori'))))bucket['5_BIRDIES']=Math.max(1,bucket['5_BIRDIES']||0);
    let stripeSets=0;for(const [set,months] of Object.entries({red:[1,2,3],blue:[6,9,10],grass:[4,5,7]}))if(months.every(month=>captured.some(card=>card.month===month&&card.ribbonSet===set)))stripeSets++;
    if(stripeSets)bucket['3_STRIPES']=Math.max(stripeSets,bucket['3_STRIPES']||0);
    if(captured.filter(card=>card.type==='bright').length>=5)bucket['5_BRIGHTS']=Math.max(1,bucket['5_BRIGHTS']||0);
  }
  return bucket;
}
function mergedMilestones(primary={},fallback={}){
  const result={...clone(fallback||{}),...clone(primary||{})};for(const key of SESSION_MILESTONES)if(!Number.isFinite(Number(result[key])))result[key]=0;return result;
}
function normalizedGamePlayers(game,session=null){
  const result=[],historyIds=Object.keys(game?.history?.seatByPlayer||{});
  if(gameKind(game)==='completed'){
    for(const item of game.participants||[]){
      result.push({key:item.accountId||item.playerId,accountId:item.accountId||null,playerId:item.playerId||null,nickname:item.nickname||item.accountId||'Player',won:!!item.won,points:Number(item.points)||0,rawScore:Number(item.rawScore)||0,walletDelta:Number(item.walletDelta)||0,coinsWon:Math.max(0,Number(item.coinsWon)||0),milestones:mergedMilestones(item.milestones,historyMilestones(game,item.playerId))});
    }
    if(game.mode==='solo'){
      const human=result[0]||null,computer=game.computer||{},computerPlayerId=computer.playerId||historyIds.find(id=>id!==human?.playerId)||null,won=typeof computer.won==='boolean'?computer.won:!!game.winnerPlayerId&&game.winnerPlayerId===computerPlayerId||!!human&&!human.won&&!!game.winnerPlayerId;
      const finalPoints=Number(game.finalPoints)||0,level=Number(computer.level||session?.opponent?.level)||1;
      result.push({key:'computer',accountId:null,playerId:computerPlayerId,nickname:computer.nickname||('Computer #'+level),won,points:Number(computer.points)||0,rawScore:Number(computer.rawScore)||0,walletDelta:Number.isFinite(Number(computer.walletDelta))?Number(computer.walletDelta):(won?finalPoints:human?.won?-finalPoints:0),coinsWon:Number.isFinite(Number(computer.coinsWon))?Math.max(0,Number(computer.coinsWon)):(won?finalPoints:0),milestones:mergedMilestones(computer.milestones,historyMilestones(game,computerPlayerId))});
    }
    return result;
  }
  const quitterId=game.accountId||game.account?.id||null,opponentId=game.opponentAccountId||game.opponent?.id||null,historyQuitterId=historyIds.find(id=>id===game.account?.playerId)||historyIds[0]||null,historyOpponentId=historyIds.find(id=>id!==historyQuitterId)||null,nagari=game.settlementType==='nagari';
  result.push({key:quitterId||historyQuitterId||'quitter',accountId:quitterId,playerId:historyQuitterId,nickname:game.account?.nickname||'Player',won:false,points:Number(game.quitterScore)||0,rawScore:Number(game.quitterScore)||0,walletDelta:-Math.max(0,Number(game.penaltyCoins)||0),coinsWon:0,milestones:mergedMilestones(game.quitterMilestones,historyMilestones(game,historyQuitterId))});
  const solo=game.mode==='solo',level=Number(session?.opponent?.level)||1;
  result.push({key:solo?'computer':opponentId||historyOpponentId||'opponent',accountId:solo?null:opponentId,playerId:historyOpponentId,nickname:solo?'Computer #'+level:(game.opponent?.nickname||'Opponent'),won:!nagari,points:Number(game.opponentScore)||0,rawScore:Number(game.opponentScore)||0,walletDelta:nagari?0:Math.max(0,Number(game.opponentRewardCoins)||0),coinsWon:nagari?0:Math.max(0,Number(game.opponentRewardCoins)||0),milestones:mergedMilestones(game.opponentMilestones,historyMilestones(game,historyOpponentId))});
  return result;
}
function blankSessionPlayer(key,{accountId=null,nickname='Player'}={}){return {key,accountId,nickname,gamesPlayed:0,wins:0,losses:0,points:0,coinsWon:0,coinsLost:0,netCoins:0,milestones:Object.fromEntries(SESSION_MILESTONES.map(name=>[name,0]))};}
function sessionGameDetail(game,session){return {...gameSummary(game),players:normalizedGamePlayers(game,session)};}
function enrichSession(session,sessionGames,accountMap){
  const players=new Map();
  for(const accountId of session.accountIds||[]){const account=accountMap.get(accountId);players.set(accountId,blankSessionPlayer(accountId,{accountId,nickname:account?.nickname||accountId}));}
  if(session.mode==='solo'){const level=Number(session.opponent?.level)||1;players.set('computer',blankSessionPlayer('computer',{nickname:'Computer #'+level}));}
  const detailedGames=sessionGames.map(game=>sessionGameDetail(game,session));
  for(const game of detailedGames)for(const item of game.players||[]){const key=item.key||item.accountId||item.playerId||item.nickname;if(!players.has(key))players.set(key,blankSessionPlayer(key,{accountId:item.accountId||null,nickname:item.nickname||key}));const row=players.get(key);row.nickname=item.nickname||row.nickname;row.gamesPlayed++;if(item.won)row.wins++;else if(game.type==='abandoned'?game.settlementType!=='nagari':!!game.winnerPlayerId)row.losses++;row.points+=Number(item.points)||0;row.coinsWon+=Math.max(0,Number(item.coinsWon)||0);const delta=Number(item.walletDelta)||0;if(delta<0)row.coinsLost+=Math.abs(delta);row.netCoins+=delta;for(const [name,count] of Object.entries(item.milestones||{}))row.milestones[name]=(row.milestones[name]||0)+(Number(count)||0);}
  return {id:session.id,mode:session.mode||'unknown',roomCode:session.roomCode||null,matchId:session.matchId||null,status:session.endedAt?'ended':'active',startedAt:session.startedAt||null,endedAt:session.endedAt||null,durationMs:session.endedAt&&session.startedAt?Math.max(0,Date.parse(session.endedAt)-Date.parse(session.startedAt)):null,gamesPlayed:detailedGames.length,players:[...players.values()],storedSummary:clone(session.summary||null),games:detailedGames};
}


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
  const {from,to}=queryRange(url),status=lower(url.searchParams.get('status')),allGames=await games(store),allAccounts=await accounts(store),accountMap=new Map(allAccounts.map(account=>[account.id,account]));
  let rows=(await values(store,'gameSession:')).filter(item=>inRange(item,from,to));
  if(status==='active')rows=rows.filter(item=>!item.endedAt);if(status==='ended')rows=rows.filter(item=>!!item.endedAt);
  rows.sort((a,b)=>Date.parse(b.startedAt)-Date.parse(a.startedAt));
  const sessions=rows.slice(0,clampLimit(url.searchParams.get('limit'))).map(session=>{const enriched=enrichSession(session,allGames.filter(game=>game.sessionId===session.id),accountMap);delete enriched.games;return enriched;});
  return {sessions};
}
async function sessionDetail(store,id){
  const session=await store.storage.get(`gameSession:${id}`);if(!session)return null;
  const [allGames,allAccounts]=await Promise.all([games(store),accounts(store)]),accountMap=new Map(allAccounts.map(account=>[account.id,account]));
  return enrichSession(session,allGames.filter(game=>game.sessionId===id).sort((a,b)=>Date.parse(whenOf(a))-Date.parse(whenOf(b))),accountMap);
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


const snapshotEncoder=new TextEncoder();
const constantTimeEqual=(a,b)=>{a=String(a||'');b=String(b||'');if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
function requireConfirmationPassword(store,body){
  const configured=String(store.env?.ADMIN_TOKEN||'');if(!configured){const error=new Error('Admin password verification is not configured.');error.status=503;error.code='ADMIN_NOT_CONFIGURED';throw error;}
  if(!constantTimeEqual(body?.confirmPassword,configured)){const error=new Error('The admin password was not accepted.');error.status=403;error.code='ADMIN_PASSWORD_INVALID';throw error;}
}
const canonicalSnapshot=value=>Array.isArray(value)?value.map(canonicalSnapshot):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonicalSnapshot(value[key])])):value;
async function fingerprintSnapshot(store,snapshot){
  const normalized={accountEntries:[...(snapshot.accountEntries||[])].sort((a,b)=>a.key.localeCompare(b.key)),rooms:[...(snapshot.rooms||[])].sort((a,b)=>a.roomCode.localeCompare(b.roomCode))};
  const digest=await store.crypto.subtle.digest('SHA-256',snapshotEncoder.encode(JSON.stringify(canonicalSnapshot(normalized))));
  return Array.from(new Uint8Array(digest),byte=>byte.toString(16).padStart(2,'0')).join('');
}
async function allStorageEntries(store){return [...(await store.storage.list()).entries()].sort(([a],[b])=>a.localeCompare(b)).map(([key,value])=>({key,value:clone(value)}));}
async function clearStoreStorage(store){if(typeof store.storage.deleteAll==='function')await store.storage.deleteAll();else{const rows=await store.storage.list();for(const key of rows.keys())await store.storage.delete(key);}}
async function replaceStoreEntries(store,entries){await clearStoreStorage(store);for(const entry of entries||[])if(entry?.key)await store.storage.put(entry.key,clone(entry.value));}
function roomCodesFromEntries(entries){
  const codes=new Set();
  for(const entry of entries||[]){
    const value=entry?.value;
    if(entry?.key?.startsWith('roomRegistry:')&&value?.roomCode)codes.add(String(value.roomCode));
    if(entry?.key?.startsWith('account:')&&value?.activeRanked?.roomCode)codes.add(String(value.activeRanked.roomCode));
    if(entry?.key?.startsWith('gameSession:')&&!value?.endedAt&&value?.roomCode)codes.add(String(value.roomCode));
  }
  return [...codes].filter(code=>/^[A-Z2-9]{14}$/.test(code)).sort();
}
async function roomSystemRequest(store,roomCode,path,{method='GET',body}={}){
  const binding=store.env?.GAME_ROOMS;if(!binding)return null;
  const stub=binding.get(binding.idFromName(roomCode)),headers=new Headers({'x-gostop-system-admin':'1'});if(body!==undefined)headers.set('content-type','application/json');
  const response=await stub.fetch(new Request(`https://room${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)}));
  const data=await response.json().catch(()=>({}));if(!response.ok||data.ok===false){const error=new Error(data.error?.message||`Room ${roomCode} system operation failed.`);error.status=response.status;error.code=data.error?.code||'ROOM_SYSTEM_ERROR';throw error;}return data;
}
async function captureRooms(store,entries){
  const rooms=[];for(const roomCode of roomCodesFromEntries(entries)){const data=await roomSystemRequest(store,roomCode,'/system-snapshot');if(data)rooms.push({roomCode,room:clone(data.room||null)});}return rooms;
}
async function resetRooms(store,roomCodes){for(const roomCode of [...new Set(roomCodes||[])])await roomSystemRequest(store,roomCode,'/system-reset',{method:'POST',body:{}});}
async function restoreRooms(store,rooms){for(const item of rooms||[])if(item?.roomCode)await roomSystemRequest(store,item.roomCode,'/system-restore',{method:'POST',body:{room:clone(item.room||null)}});}
async function captureSystemSnapshot(store){
  const accountEntries=await allStorageEntries(store),rooms=await captureRooms(store,accountEntries),snapshot={accountEntries,rooms},fingerprint=await fingerprintSnapshot(store,snapshot);
  const count=prefix=>accountEntries.filter(item=>item.key.startsWith(prefix)).length;
  return {snapshot,fingerprint,accountCount:count('account:'),gameCount:count('game:'),sessionCount:count('gameSession:')};
}
function backupStoreStub(store){const binding=store.env?.BACKUP_STORE;if(!binding){const error=new Error('System backup storage is not configured.');error.status=503;error.code='BACKUP_NOT_CONFIGURED';throw error;}return binding.get(binding.idFromName('global'));}
async function backupRequest(store,path,{method='GET',body}={}){
  const headers=new Headers();if(body!==undefined)headers.set('content-type','application/json');
  const response=await backupStoreStub(store).fetch(new Request(`https://backup${path}`,{method,headers,body:body===undefined?undefined:JSON.stringify(body)})),data=await response.json().catch(()=>({}));
  if(!response.ok||data.ok===false){const error=new Error(data.error?.message||'Backup storage operation failed.');error.status=response.status;error.code=data.error?.code||'BACKUP_ERROR';throw error;}return data;
}
async function writeBackup(store,slot,captured,{resetMode=null,reason=null}={}){
  const result=await backupRequest(store,'/snapshot/write',{method:'POST',body:{slot,snapshot:captured.snapshot,metadata:{fingerprint:captured.fingerprint,resetMode,reason,accountCount:captured.accountCount,gameCount:captured.gameCount,sessionCount:captured.sessionCount}}});return result.metadata;
}
async function systemResetStatus(store){const status=await backupRequest(store,'/status');return {backupAvailable:!!status.primary,primary:status.primary||null,safety:status.safety||null};}
async function performSystemReset(store,request,body){
  const reason=reasonOf(body);requireConfirmationPassword(store,body);const mode=clean(body.mode);
  if(!['preserve-accounts','full'].includes(mode))return json({ok:false,error:{code:'INVALID_RESET_MODE',message:'Reset mode must preserve accounts or clear the full system.'}},400);
  const captured=await captureSystemSnapshot(store),backup=await writeBackup(store,'primary',captured,{resetMode:mode,reason});
  await resetRooms(store,captured.snapshot.rooms.map(item=>item.roomCode));
  if(mode==='full')await clearStoreStorage(store);
  else{
    const preserved=captured.snapshot.accountEntries.filter(entry=>entry.key.startsWith('account:')||entry.key.startsWith('email:')||entry.key.startsWith('nickname:')).map(entry=>{
      if(!entry.key.startsWith('account:'))return entry;
      const account=clone(entry.value);if(account?.activeRanked)account.activeRanked=null;return {key:entry.key,value:account};
    });
    await replaceStoreEntries(store,preserved);
  }
  return json({ok:true,mode,backup,accountsPreserved:mode==='preserve-accounts'?captured.accountCount:0});
}
async function performSystemRestore(store,request,body){
  const reason=reasonOf(body);requireConfirmationPassword(store,body);
  const primaryData=await backupRequest(store,'/snapshot/primary'),target=primaryData.snapshot;if(!target)throw Object.assign(new Error('No reset point is available.'),{status:404,code:'BACKUP_NOT_FOUND'});
  const current=await captureSystemSnapshot(store);await writeBackup(store,'safety',current,{resetMode:'pre-restore-safety',reason});
  const targetFingerprint=target.metadata?.fingerprint||await fingerprintSnapshot(store,target),roomCodes=[...new Set([...current.snapshot.rooms.map(item=>item.roomCode),...(target.rooms||[]).map(item=>item.roomCode)])];
  try{
    await resetRooms(store,roomCodes);await replaceStoreEntries(store,target.accountEntries||[]);await restoreRooms(store,target.rooms||[]);
    const verified=await captureSystemSnapshot(store),actualFingerprint=await fingerprintSnapshot(store,verified.snapshot);
    if(actualFingerprint!==targetFingerprint){const error=new Error('Restore verification failed. The current system will be rolled back to its safety copy.');error.code='RESTORE_VERIFY_FAILED';error.status=500;throw error;}
    const promoted=await backupRequest(store,'/promote-safety',{method:'POST',body:{}});
    return json({ok:true,restoredFrom:target.metadata||null,backup:promoted.primary||null,reason});
  }catch(error){
    try{await resetRooms(store,roomCodes);await replaceStoreEntries(store,current.snapshot.accountEntries);await restoreRooms(store,current.snapshot.rooms);}catch(_){}
    throw error;
  }
}
function entryReferencesAccount(key,value,id,account){
  if(key===`account:${id}`||key.startsWith(`ledger:${id}:`)||key.startsWith(`connection:${id}:`))return true;
  if((key.startsWith('email:')||key.startsWith('nickname:'))&&String(value)===id)return true;
  if(key.startsWith('auth:')&&String(value?.accountId||'')===id)return true;
  if(key.startsWith('game:')&&gameAccountIds(value).includes(id))return true;
  if(key.startsWith('forceQuit:')&&[value?.accountId,value?.opponentAccountId,value?.account?.id,value?.opponent?.id].map(String).includes(id))return true;
  if(key.startsWith('gameSession:')&&(value?.accountIds||[]).map(String).includes(id))return true;
  if(key.startsWith('leaderboardArchive:')||key.startsWith('adminAudit:'))return JSON.stringify(value||{}).includes(id);
  if(key.startsWith('emailVerification:')||key.startsWith('passwordReset:'))return JSON.stringify(value||{}).includes(id);
  if(account&&key===`email:${String(account.email||'').toLowerCase()}`)return true;
  if(account&&key===`nickname:${String(account.nicknameKey||account.nickname||'').toLowerCase()}`)return true;
  return false;
}
async function deletePlayerCompletely(store,request,id,body){
  const reason=reasonOf(body);requireConfirmationPassword(store,body);const account=await store.accountById(id);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
  const activeRoom=account.activeRanked?.roomCode;if(activeRoom&&/^[A-Z2-9]{14}$/.test(activeRoom))await resetRooms(store,[activeRoom]);
  if(store.env?.BACKUP_STORE)await backupRequest(store,'/purge-account',{method:'POST',body:{accountId:id}});
  const rows=await store.storage.list(),deleteKeys=[];for(const [key,value] of rows)if(entryReferencesAccount(key,value,id,account))deleteKeys.push(key);
  for(const key of deleteKeys)await store.storage.delete(key);
  if(activeRoom){
    const others=await store.storage.list({prefix:'account:'});
    for(const [key,value] of others)if(value?.activeRanked?.roomCode===activeRoom){value.activeRanked=null;await store.storage.put(key,value);}
    await store.storage.delete(`roomRegistry:${activeRoom}`);
  }
  return json({ok:true,deletedAccountId:id,recordsDeleted:deleteKeys.length,reason});
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
    if(request.method==='GET'&&(match=path.match(/^\/admin\/sessions\/([^/]+)$/))){const data=await sessionDetail(store,decodeURIComponent(match[1]));return data?json({ok:true,session:data}):json({ok:false,error:{code:'SESSION_NOT_FOUND',message:'Session not found.'}},404);}
    if(request.method==='GET'&&path==='/admin/geography')return json({ok:true,...await geography(store,url)});
    if(request.method==='GET'&&path==='/admin/abuse')return json({ok:true,...await abuseSignals(store,url)});
    if(request.method==='GET'&&path==='/admin/system')return json({ok:true,...await systemStatus(store)});
    if(request.method==='GET'&&path==='/admin/system-reset/status')return json({ok:true,...await systemResetStatus(store)});
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/wallet$/)))return await walletAdjust(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/disconnect-reset$/)))return await resetDisconnect(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/profile$/)))return await editProfile(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/players\/([^/]+)\/delete$/)))return await deletePlayerCompletely(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    if(request.method==='POST'&&path==='/admin/system-reset')return await performSystemReset(store,request,await request.json().catch(()=>({})));
    if(request.method==='POST'&&path==='/admin/system-restore')return await performSystemRestore(store,request,await request.json().catch(()=>({})));
    if(request.method==='POST'&&path==='/admin/leaderboards/reset')return await resetLeaderboard(store,request,await request.json().catch(()=>({})));
    if(request.method==='POST'&&path==='/admin/leaderboards/rebuild')return await rebuildLeaderboard(store,request,await request.json().catch(()=>({})));
    if(request.method==='POST'&&(match=path.match(/^\/admin\/games\/([^/]+)\/correct$/)))return await correctGame(store,request,decodeURIComponent(match[1]),await request.json().catch(()=>({})));
    return json({ok:false,error:{code:'NOT_FOUND',message:'Admin endpoint not found.'}},404);
  }catch(error){return json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message||'Admin request failed.'}},error.status||500);}
}
