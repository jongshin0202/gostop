import test from 'node:test';
import assert from 'node:assert/strict';
import {AccountStore,passwordProblem} from '../server/account-store.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const makeStore=(iso='2026-09-15T03:30:00.000Z')=>new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:globalThis.crypto,now:()=>iso});
const post=(path,body,headers={})=>new Request(`https://accounts${path}`,{method:'POST',headers:{'content-type':'application/json',...headers},body:JSON.stringify(body)});

const makeVerificationStore=(initialIso='2026-09-15T03:30:00.000Z')=>{
  let now=initialIso;const sent=[];
  const env={EMAIL_VERIFICATION_REQUIRED:'true',RESEND_API_KEY:'re_test',EMAIL_FROM:'GoStop Live <noreply@gostoplive.com>',EMAIL_VERIFY_BASE_URL:'https://gostoplive.com'};
  const fetchApi=async(url,options={})=>{sent.push({url,options});return new Response(JSON.stringify({id:`email-${sent.length}`}),{status:200,headers:{'content-type':'application/json'}});};
  const store=new AccountStore({storage:new MemoryStorage()},env,{cryptoApi:globalThis.crypto,now:()=>now,fetchApi});
  return {store,sent,setNow:value=>{now=value;}};
};
const verificationTokenFrom=sent=>{
  const payload=JSON.parse(sent.at(-1).options.body),match=String(payload.html||'').match(/[#?&]verify=([a-f0-9]{64})/i);
  assert.ok(match,'verification email should contain a 64-character token');return match[1];
};

test('verification-enabled registration reserves identity but grants no Coins or session until email is verified',async()=>{
  const {store,sent}=makeVerificationStore();
  const response=await store.fetch(post('/register',{email:'verify@example.com',nickname:'VerifyPlayer',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  assert.equal(response.status,202);const pending=await response.json();
  assert.equal(pending.ok,true);assert.equal(pending.verificationPending,true);assert.equal(pending.email,'verify@example.com');assert.equal(pending.session,undefined);assert.equal(sent.length,1);
  const mail=JSON.parse(sent[0].options.body);assert.equal(mail.from,'GoStop Live <noreply@gostoplive.com>');assert.equal(sent[0].options.headers.authorization,'Bearer re_test');assert.match(mail.html,/#verify=[a-f0-9]{64}/i);assert.doesNotMatch(mail.html,/\?verify=/i);
  const account=await store.accountByEmail('verify@example.com');assert.equal(account.emailVerified,false);assert.equal(account.walletCoins,0);assert.equal(account.signupAwardedAt,undefined);
  const login=await store.fetch(post('/login',{email:'verify@example.com',password:'BetterPass9'}));assert.equal(login.status,403);assert.equal((await login.json()).error.code,'EMAIL_NOT_VERIFIED');
  const board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json();assert.equal(board.global.some(row=>row.nickname==='VerifyPlayer'),false);
  const search=await (await store.fetch(post('/internal/player-search',{query:'VerifyPlayer'}))).json();assert.equal(search.players.length,0);
});

test('single-use verification link activates the account, awards signup plus daily Coins, and creates a session',async()=>{
  const {store,sent}=makeVerificationStore();
  await store.fetch(post('/register',{email:'activate@example.com',nickname:'ActivateMe',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  const token=verificationTokenFrom(sent);
  const verifiedResponse=await store.fetch(post('/verify-email',{token},{'x-gostop-timezone':'America/Chicago'}));assert.equal(verifiedResponse.status,200);
  const verified=await verifiedResponse.json();assert.equal(verified.account.emailVerified,true);assert.equal(verified.account.walletCoins,200);assert.equal(verified.awards.signupCoins,100);assert.equal(verified.awards.dailyCoins,100);assert.ok(verified.session.token.length>=40);
  const stored=await store.accountByEmail('activate@example.com');assert.ok(stored.signupAwardedAt);assert.ok(stored.emailVerifiedAt);assert.equal(stored.emailVerificationTokenHash,undefined);
  const reuse=await store.fetch(post('/verify-email',{token}));assert.equal(reuse.status,400);assert.equal((await reuse.json()).error.code,'INVALID_VERIFICATION_TOKEN');
  const login=await (await store.fetch(post('/login',{email:'activate@example.com',password:'BetterPass9'}))).json();assert.equal(login.account.walletCoins,200);assert.equal(login.awards.dailyCoins,0);
});

test('resending verification requires the account password, rate limits requests, and invalidates the old link',async()=>{
  const {store,sent,setNow}=makeVerificationStore();
  await store.fetch(post('/register',{email:'resend@example.com',nickname:'ResendMe',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  const oldToken=verificationTokenFrom(sent);
  const wrong=await store.fetch(post('/resend-verification',{email:'resend@example.com',password:'WrongPass9'}));assert.equal(wrong.status,401);
  const limited=await store.fetch(post('/resend-verification',{email:'resend@example.com',password:'BetterPass9'}));assert.equal(limited.status,429);assert.equal((await limited.json()).error.code,'VERIFICATION_RATE_LIMIT');
  setNow('2026-09-15T03:31:01.000Z');
  const resent=await store.fetch(post('/resend-verification',{email:'resend@example.com',password:'BetterPass9'}));assert.equal(resent.status,200);assert.equal(sent.length,2);
  const newToken=verificationTokenFrom(sent);assert.notEqual(newToken,oldToken);
  const oldResult=await store.fetch(post('/verify-email',{token:oldToken}));assert.equal(oldResult.status,400);
  const newResult=await store.fetch(post('/verify-email',{token:newToken}));assert.equal(newResult.status,200);
});

test('failed initial email delivery keeps the pending account recoverable and allows immediate resend',async()=>{
  let attempts=0;const storage=new MemoryStorage(),env={EMAIL_VERIFICATION_REQUIRED:'true',RESEND_API_KEY:'re_test',EMAIL_FROM:'GoStop Live <noreply@gostoplive.com>',EMAIL_VERIFY_BASE_URL:'https://gostoplive.com'};
  const store=new AccountStore({storage},env,{cryptoApi:globalThis.crypto,now:()=> '2026-09-15T03:30:00.000Z',fetchApi:async()=>new Response('{}',{status:++attempts===1?500:200,headers:{'content-type':'application/json'}})});
  const registered=await store.fetch(post('/register',{email:'recover@example.com',nickname:'RecoverMe',password:'BetterPass9',confirmPassword:'BetterPass9'}));assert.equal(registered.status,503);assert.equal((await registered.json()).error.code,'EMAIL_SEND_FAILED');
  let account=await store.accountByEmail('recover@example.com');assert.equal(account.emailVerified,false);assert.equal(account.emailVerificationSentAt,undefined);assert.equal(account.emailVerificationTokenHash,undefined);
  const resent=await store.fetch(post('/resend-verification',{email:'recover@example.com',password:'BetterPass9'}));assert.equal(resent.status,200);assert.equal(attempts,2);
  account=await store.accountByEmail('recover@example.com');assert.ok(account.emailVerificationSentAt);assert.ok(account.emailVerificationTokenHash);
});

test('verification-required registration fails safely before reserving an account when email delivery is not configured',async()=>{
  const store=new AccountStore({storage:new MemoryStorage()},{EMAIL_VERIFICATION_REQUIRED:'true'},{cryptoApi:globalThis.crypto,now:()=> '2026-09-15T03:30:00.000Z'});
  const response=await store.fetch(post('/register',{email:'nomailer@example.com',nickname:'NoMailer',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  assert.equal(response.status,503);assert.equal((await response.json()).error.code,'EMAIL_SERVICE_NOT_CONFIGURED');assert.equal(await store.accountByEmail('nomailer@example.com'),null);
});

test('registration creates account, awards signup and first daily coins, and returns a session',async()=>{
  const store=makeStore();
  const response=await store.fetch(post('/register',{email:'Player@example.com',nickname:'Player One',password:'BetterPass9',confirmPassword:'BetterPass9'}));
  assert.equal(response.status,201);const body=await response.json();
  assert.equal(body.ok,true);assert.equal(body.account.walletCoins,200);assert.equal(body.awards.signupCoins,100);assert.equal(body.awards.dailyCoins,100);assert.ok(body.session.token.length>=40);
});

test('daily login reward is awarded only once per UTC day',async()=>{
  const store=makeStore();
  const registered=await (await store.fetch(post('/register',{email:'daily@example.com',nickname:'DailyPlayer',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const login=await (await store.fetch(post('/login',{email:'daily@example.com',password:'BetterPass9'}))).json();
  assert.equal(login.awards.dailyCoins,0);assert.equal(login.account.walletCoins,200);
  const me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${registered.session.token}`}}))).json();
  assert.equal(me.awards.dailyCoins,0);assert.equal(me.account.walletCoins,200);
});

test('stale active ranked pointer can be cleared only for its expected session',async()=>{
  const store=makeStore();
  const registered=await (await store.fetch(post('/register',{email:'stale-active@example.com',nickname:'StaleActive',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const account=await store.accountById(registered.account.id);account.activeRanked={sessionId:'session-old',mode:'solo',roomCode:'ABCDEFGHJK2345',startedAt:'2026-09-15T03:00:00.000Z'};await store.storage.put(`account:${account.id}`,account);
  const wrong=await (await store.fetch(post('/internal/active-ranked/clear',{accountId:account.id,sessionId:'different-session'}))).json();
  assert.equal(wrong.account.activeRanked.sessionId,'session-old');
  const cleared=await (await store.fetch(post('/internal/active-ranked/clear',{accountId:account.id,sessionId:'session-old'}))).json();
  assert.equal(cleared.account.activeRanked,null);assert.equal((await store.accountById(account.id)).activeRanked,null);
});

test('leaderboard counts only coins won while wallet includes wins and losses',async()=>{
  const store=makeStore();
  const a=await (await store.fetch(post('/register',{email:'a@example.com',nickname:'Alpha',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const b=await (await store.fetch(post('/register',{email:'b@example.com',nickname:'Beta',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  await store.fetch(post('/internal/game/settle',{gameId:'g1',mode:'online',participants:[{accountId:a.account.id,won:true,walletDelta:17,coinsWon:17},{accountId:b.account.id,won:false,walletDelta:-17,coinsWon:0}]}));
  await store.fetch(post('/internal/game/settle',{gameId:'g2',mode:'online',participants:[{accountId:a.account.id,won:false,walletDelta:-12,coinsWon:0},{accountId:b.account.id,won:true,walletDelta:12,coinsWon:12}]}));
  const board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json();
  const alpha=board.global.find(row=>row.nickname==='Alpha'),beta=board.global.find(row=>row.nickname==='Beta');
  assert.equal(alpha.totalCoins,17);assert.equal(alpha.gamesPlayed,2);assert.equal(alpha.wins,1);assert.equal(alpha.losses,1);assert.equal(alpha.score,8.5);assert.equal(beta.totalCoins,12);assert.equal(beta.wins,1);assert.equal(beta.losses,1);assert.equal(beta.score,6);
  const storedA=await store.accountById(a.account.id);assert.equal(storedA.walletCoins,205);
});


test('Global leaderboard repairs stale zero global stats from accumulated monthly history',async()=>{
  const store=makeStore('2026-09-19T17:30:00.000Z');
  const registered=await (await store.fetch(post('/register',{email:'global-repair@example.com',nickname:'GlobalRepair',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const account=await store.accountById(registered.account.id);
  account.stats={global:{gamesPlayed:0,wins:0,losses:0,totalCoinsWon:0,milestones:{}},monthly:{
    '2026-08':{gamesPlayed:3,wins:2,losses:1,totalCoinsWon:24,milestones:{ppeok:1}},
    '2026-09':{gamesPlayed:4,wins:1,losses:3,totalCoinsWon:28,milestones:{ppeok:2}}
  }};
  await store.storage.put(`account:${account.id}`,account);
  const board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json();
  const global=board.global.find(row=>row.nickname==='GlobalRepair'),monthly=board.monthly.find(row=>row.nickname==='GlobalRepair');
  assert.equal(global.gamesPlayed,7);assert.equal(global.wins,3);assert.equal(global.losses,4);assert.equal(global.totalCoins,52);assert.equal(global.score,52/7);
  assert.equal(monthly.gamesPlayed,4);assert.equal(monthly.totalCoins,28);
});

test('player directory search returns wallet wins losses leaderboard score and rank for offline lookup',async()=>{
  const store=makeStore();
  const a=await (await store.fetch(post('/register',{email:'lookup-a@example.com',nickname:'LookupAlpha',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const b=await (await store.fetch(post('/register',{email:'lookup-b@example.com',nickname:'LookupBeta',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  await store.fetch(post('/internal/game/settle',{gameId:'lookup-1',mode:'online',winnerPlayerId:'a',participants:[{accountId:a.account.id,playerId:'a',won:true,walletDelta:9,coinsWon:9},{accountId:b.account.id,playerId:'b',won:false,walletDelta:-9,coinsWon:0}]}));
  const result=await (await store.fetch(post('/internal/player-search',{query:'lookupalpha'}))).json();
  assert.equal(result.players.length,1);const player=result.players[0];
  assert.equal(player.nickname,'LookupAlpha');assert.equal(player.accountId,a.account.id);assert.equal(player.walletCoins,209);assert.equal(player.gamesPlayed,1);assert.equal(player.wins,1);assert.equal(player.losses,0);assert.equal(player.score,9);assert.equal(player.rank,0);assert.equal(player.globalRank,0);assert.equal(player.monthlyRank,0);
});

test('rank stays zero through nine lifetime games and becomes a positive stored rank after game ten',async()=>{
  const store=makeStore(),a=await (await store.fetch(post('/register',{email:'rank-ten@example.com',nickname:'RankTen',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  for(let i=1;i<=9;i++)await store.fetch(post('/internal/game/settle',{gameId:`rank-ten-${i}`,mode:'solo',winnerPlayerId:'a',participants:[{accountId:a.account.id,playerId:'a',nickname:'RankTen',won:true,walletDelta:1,coinsWon:1}]}));
  let board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json(),row=board.global.find(item=>item.nickname==='RankTen'),monthRow=board.monthly.find(item=>item.nickname==='RankTen');
  assert.equal(row.gamesPlayed,9);assert.equal(row.rank,0);assert.equal(monthRow.rank,0);
  await store.fetch(post('/internal/game/settle',{gameId:'rank-ten-10',mode:'solo',winnerPlayerId:'a',participants:[{accountId:a.account.id,playerId:'a',nickname:'RankTen',won:true,walletDelta:1,coinsWon:1}]}));
  board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json();row=board.global.find(item=>item.nickname==='RankTen');monthRow=board.monthly.find(item=>item.nickname==='RankTen');
  assert.equal(row.gamesPlayed,10);assert.equal(row.rank,1);assert.equal(row.provisional,false);assert.equal(monthRow.rank,1);
});

test('player directory returns Global and Monthly ranks plus head-to-head history against the viewer',async()=>{
  const store=makeStore('2026-09-20T12:00:00.000Z');
  const viewer=await (await store.fetch(post('/register',{email:'viewer@example.com',nickname:'Viewer',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const opponent=await (await store.fetch(post('/register',{email:'opponent@example.com',nickname:'Opponent',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  await store.fetch(post('/internal/game/settle',{gameId:'h2h-1',mode:'online',recordedAt:'2026-09-18T12:00:00.000Z',winnerPlayerId:'viewer-seat',participants:[{accountId:viewer.account.id,playerId:'viewer-seat',won:true,walletDelta:11,coinsWon:11},{accountId:opponent.account.id,playerId:'opponent-seat',won:false,walletDelta:-11,coinsWon:0}]}));
  await store.fetch(post('/internal/game/settle',{gameId:'h2h-2',mode:'online',recordedAt:'2026-09-19T12:00:00.000Z',winnerPlayerId:'opponent-seat',participants:[{accountId:viewer.account.id,playerId:'viewer-seat',won:false,walletDelta:-7,coinsWon:0},{accountId:opponent.account.id,playerId:'opponent-seat',won:true,walletDelta:7,coinsWon:7}]}));
  const result=await (await store.fetch(post('/internal/player-search',{query:'Opponent',requesterAccountId:viewer.account.id}))).json();
  assert.equal(result.players.length,1);const player=result.players[0];
  assert.ok(Number.isInteger(player.globalRank));assert.ok(Number.isInteger(player.monthlyRank));
  assert.equal(player.headToHead.wins,1);assert.equal(player.headToHead.losses,1);assert.equal(player.headToHead.draws,0);
  assert.equal(player.headToHead.coinsWon,11);assert.equal(player.headToHead.coinsLost,7);assert.equal(player.headToHead.lastPlayedAt,'2026-09-19T12:00:00.000Z');
});

test('outcome-history repair restores a historical protected disconnect loss from authoritative game records',async()=>{
  const store=makeStore('2026-09-20T12:00:00.000Z');
  const quitter=await (await store.fetch(post('/register',{email:'repair-loss@example.com',nickname:'RepairLoss',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const winner=await (await store.fetch(post('/register',{email:'repair-win@example.com',nickname:'RepairWin',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const account=await store.accountById(quitter.account.id);account.stats={global:{gamesPlayed:1,wins:0,losses:0,totalCoinsWon:0,milestones:{}},monthly:{'2026-09':{gamesPlayed:1,wins:0,losses:0,totalCoinsWon:0,milestones:{}}}};await store.storage.put(`account:${account.id}`,account);
  await store.storage.put('game:historical-protected',{gameId:'historical-protected',type:'abandonment',mode:'online',accountId:quitter.account.id,opponentAccountId:winner.account.id,settlementType:'current-settlement',penaltyCoins:0,opponentRewardCoins:13,recordedAt:'2026-09-18T12:00:00.000Z'});
  const board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json(),row=board.global.find(item=>item.nickname==='RepairLoss');
  assert.equal(row.gamesPlayed,1);assert.equal(row.losses,1);
  const stored=await store.accountById(quitter.account.id);assert.equal(stored.stats.global.losses,1);assert.equal(stored.stats.monthly['2026-09'].losses,1);
});

test('nagari-style settlement increments games but not wins or losses',async()=>{
  const store=makeStore(),a=await (await store.fetch(post('/register',{email:'nagari-profile@example.com',nickname:'NagariProfile',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  await store.fetch(post('/internal/game/settle',{gameId:'nagari-profile-1',mode:'solo',winnerPlayerId:null,participants:[{accountId:a.account.id,playerId:'a',won:false,walletDelta:0,coinsWon:0}]}));
  const board=await (await store.fetch(new Request('https://accounts/leaderboards'))).json(),row=board.global.find(item=>item.nickname==='NagariProfile');
  assert.equal(row.gamesPlayed,1);assert.equal(row.wins,0);assert.equal(row.losses,0);
});
test('duplicate game settlement is idempotent',async()=>{
  const store=makeStore();
  const a=await (await store.fetch(post('/register',{email:'idempotent@example.com',nickname:'Idempotent',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const settlement={gameId:'same-game',mode:'solo',participants:[{accountId:a.account.id,won:true,walletDelta:9,coinsWon:9}]};
  assert.equal((await (await store.fetch(post('/internal/game/settle',settlement))).json()).ok,true);
  assert.equal((await (await store.fetch(post('/internal/game/settle',settlement))).json()).duplicate,true);
  assert.equal((await store.accountById(a.account.id)).walletCoins,209);
});

test('common and too-short passwords are rejected',()=>{
  assert.ok(passwordProblem('12345'));assert.ok(passwordProblem('qwerty'));assert.ok(passwordProblem('short7'));assert.equal(passwordProblem('UsefulPass9'),null);
});

test('daily award records Wallet before/after and acknowledgement never removes the credited Coins',async()=>{
  const store=makeStore('2026-09-18T19:24:00.000Z');
  const registered=await (await store.fetch(post('/register',{email:'wallet-transition@example.com',nickname:'WalletTransition',password:'BetterPass9',confirmPassword:'BetterPass9'}))).json();
  const account=await store.accountById(registered.account.id);
  account.walletCoins=539;
  account.lastDailyAwardAt='2026-09-17T19:24:00.000Z';
  account.lastDailyAwardDate='2026-09-17';
  account.pendingNotices=[];
  await store.storage.put(`account:${account.id}`,account);
  const me=await (await store.fetch(new Request('https://accounts/me',{headers:{Authorization:`Bearer ${registered.session.token}`,'x-gostop-timezone':'America/Chicago'}}))).json();
  assert.equal(me.account.walletCoins,639);
  const daily=me.notices.find(item=>item.type==='daily-login');
  assert.ok(daily);
  assert.equal(daily.coins,100);
  assert.equal(daily.walletBefore,539);
  assert.equal(daily.walletAfter,639);
  const ack=await (await store.fetch(post('/notices/ack',{noticeId:daily.id},{Authorization:`Bearer ${registered.session.token}`}))).json();
  assert.equal(ack.account.walletCoins,639);
  assert.equal((await store.accountById(account.id)).walletCoins,639);
});
