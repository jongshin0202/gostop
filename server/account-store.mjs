const encoder=new TextEncoder();
const COMMON_PASSWORDS=new Set(['12345','123456','12345678','password','password1','qwerty','qwerty123','abc123','letmein','111111','000000']);
const PROVISIONAL_GAMES=10;
const SESSION_TTL_MS=1000*60*60*24*30;
const PBKDF2_ITERATIONS=100000;

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const normalizeNickname=value=>String(value||'').trim().replace(/\s+/g,' ');
const nicknameKey=value=>normalizeNickname(value).toLowerCase();
const utcDay=iso=>String(iso).slice(0,10);
const utcMonth=iso=>String(iso).slice(0,7);
const normalizeTimeZone=value=>{
  const timeZone=String(value||'').trim();
  if(!timeZone||timeZone.length>64||!/^[A-Za-z0-9_+./-]+$/.test(timeZone))return 'UTC';
  try{new Intl.DateTimeFormat('en-US',{timeZone}).format(new Date(0));return timeZone;}catch(_){return 'UTC';}
};
const dayInTimeZone=(iso,timeZone)=>{
  const parts=new Intl.DateTimeFormat('en-US',{timeZone:normalizeTimeZone(timeZone),year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date(iso));
  const values=Object.fromEntries(parts.filter(part=>part.type!=='literal').map(part=>[part.type,part.value]));
  return `${values.year}-${values.month}-${values.day}`;
};
const randomHex=(cryptoApi,bytes=24)=>{const data=new Uint8Array(bytes);cryptoApi.getRandomValues(data);return Array.from(data,b=>b.toString(16).padStart(2,'0')).join('');};
const randomId=(cryptoApi,prefix)=>`${prefix}_${randomHex(cryptoApi,16)}`;
const toHex=buffer=>Array.from(new Uint8Array(buffer),b=>b.toString(16).padStart(2,'0')).join('');
const fromHex=hex=>new Uint8Array(String(hex).match(/../g)?.map(v=>parseInt(v,16))||[]);
const safeEqual=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let d=0;for(let i=0;i<a.length;i++)d|=a.charCodeAt(i)^b.charCodeAt(i);return d===0;};
const coarseCode=(value,max=8)=>{const code=String(value||'').trim().toUpperCase();return code&&new RegExp(`^[A-Z0-9-]{1,${max}}$`).test(code)?code:null;};

async function hashToken(cryptoApi,token){return toHex(await cryptoApi.subtle.digest('SHA-256',encoder.encode(token)));}
async function hashPassword(cryptoApi,password,saltHex,iterations=PBKDF2_ITERATIONS){
  const key=await cryptoApi.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const bits=await cryptoApi.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:fromHex(saltHex),iterations},key,256);
  return toHex(bits);
}
function passwordProblem(password){
  const value=String(password||'');
  if(value.length<8)return 'Password must be at least 8 characters.';
  if(COMMON_PASSWORDS.has(value.toLowerCase()))return 'Choose a less common password.';
  if(/^(.)(\1)+$/.test(value))return 'Choose a less predictable password.';
  return null;
}
function timeZoneFromRequest(request){return normalizeTimeZone(request?.headers?.get('x-gostop-timezone'));}
const cleanText=(value,max=100)=>{const text=String(value||'').trim();return text&&text.length<=max?text:null;};
function connectionFromRequest(request){
  const ip=cleanText(request?.headers?.get('x-gostop-ip'),64),countryCode=coarseCode(request?.headers?.get('x-gostop-country'),2),regionCode=coarseCode(request?.headers?.get('x-gostop-region')),region=cleanText(request?.headers?.get('x-gostop-region-name'),80),city=cleanText(request?.headers?.get('x-gostop-city'),100),postalCode=cleanText(request?.headers?.get('x-gostop-postal'),24),timeZone=timeZoneFromRequest(request);
  if(!ip&&!countryCode&&!regionCode&&!region&&!city)return null;
  return {ip,countryCode,regionCode,region,city,postalCode,timeZone};
}
function locationFromRequest(request){
  const connection=connectionFromRequest(request);
  return connection?.countryCode?{countryCode:connection.countryCode,regionCode:connection.regionCode,region:connection.region,city:connection.city,postalCode:connection.postalCode,timeZone:connection.timeZone}:null;
}
function publicAccount(account){
  return {id:account.id,email:account.email,nickname:account.nickname,walletCoins:account.walletCoins,forceQuits:account.forceQuits||0,computerBankruptcies:account.computerBankruptcies||0,createdAt:account.createdAt,emailVerified:account.emailVerified!==false,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null};
}
function blankStats(){return {gamesPlayed:0,wins:0,totalCoinsWon:0,milestones:{}};}
function scoreFor(stats){return stats.gamesPlayed?stats.totalCoinsWon/stats.gamesPlayed:0;}
function leaderboardRow(account,stats){return {nickname:account.nickname,score:scoreFor(stats),totalCoins:stats.totalCoinsWon,gamesPlayed:stats.gamesPlayed,provisional:stats.gamesPlayed<PROVISIONAL_GAMES,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null};}
function sortRows(rows){return rows.sort((a,b)=>b.score-a.score||b.gamesPlayed-a.gamesPlayed||b.totalCoins-a.totalCoins||a.nickname.localeCompare(b.nickname));}

export class AccountStore{
  constructor(state,env,{cryptoApi=globalThis.crypto,now=()=>new Date().toISOString()}={}){this.state=state;this.storage=state.storage;this.env=env;this.crypto=cryptoApi;this.now=now;}

  async accountById(id){return id?await this.storage.get(`account:${id}`):null;}
  async accountByEmail(email){const id=await this.storage.get(`email:${normalizeEmail(email)}`);return id?this.accountById(id):null;}
  async accountFromToken(token){
    if(!token)return null;
    const hash=await hashToken(this.crypto,token),session=await this.storage.get(`auth:${hash}`);
    if(!session||Date.parse(session.expiresAt)<=Date.parse(this.now()))return null;
    return this.accountById(session.accountId);
  }
  bearer(request){const value=request.headers.get('Authorization')||'';return value.startsWith('Bearer ')?value.slice(7).trim():'';}
  applyCoarseLocation(account,request){
    const location=locationFromRequest(request);if(!location)return false;
    if(account.location?.countryCode===location.countryCode&&account.location?.regionCode===location.regionCode&&account.location?.region===location.region&&account.location?.city===location.city&&account.location?.postalCode===location.postalCode&&account.location?.timeZone===location.timeZone)return false;
    account.location={...location,source:'edge-coarse',updatedAt:this.now()};account.updatedAt=this.now();return true;
  }
  async recordConnection(account,request,kind){
    const connection=connectionFromRequest(request);if(!account||!connection)return null;
    const recordedAt=this.now(),event={id:randomId(this.crypto,'conn'),accountId:account.id,kind:String(kind||request?.headers?.get('x-gostop-event')||'request').slice(0,40),...connection,recordedAt};
    account.lastConnection={...connection,kind:event.kind,recordedAt};account.updatedAt=recordedAt;
    await this.storage.put(`connection:${account.id}:${recordedAt}:${event.id}`,event);await this.storage.put(`account:${account.id}`,account);return event;
  }
  noticeList(account){return (Array.isArray(account.pendingNotices)?account.pendingNotices:[]).filter(item=>!item.acknowledgedAt);}
  async prepareNotices(account){return account;}
  async latestDailyAwardAt(account){
    if(account.lastDailyAwardAt&&Number.isFinite(Date.parse(account.lastDailyAwardAt)))return account.lastDailyAwardAt;
    let latest=null;
    for(const notice of Array.isArray(account.pendingNotices)?account.pendingNotices:[])if(notice?.type==='daily-login'&&Number.isFinite(Date.parse(notice.createdAt))&&(!latest||Date.parse(notice.createdAt)>Date.parse(latest)))latest=notice.createdAt;
    if(this.storage?.list){
      const entries=await this.storage.list({prefix:`ledger:${account.id}:`});
      for(const entry of entries.values())if(entry?.type==='daily-login'&&Number.isFinite(Date.parse(entry.createdAt))&&(!latest||Date.parse(entry.createdAt)>Date.parse(latest)))latest=entry.createdAt;
    }
    return latest;
  }
  async awardDaily(account,request){
    const createdAt=this.now(),timeZone=timeZoneFromRequest(request),today=dayInTimeZone(createdAt,timeZone),latestAt=await this.latestDailyAwardAt(account),lastDay=latestAt?dayInTimeZone(latestAt,timeZone):account.lastDailyAwardDate;
    if(lastDay===today){
      let changed=false;
      if(latestAt&&account.lastDailyAwardAt!==latestAt){account.lastDailyAwardAt=latestAt;changed=true;}
      if(account.lastDailyAwardDate!==today){account.lastDailyAwardDate=today;changed=true;}
      if(account.dailyAwardTimeZone!==timeZone){account.dailyAwardTimeZone=timeZone;changed=true;}
      if(changed)await this.storage.put(`account:${account.id}`,account);
      return false;
    }
    const notice={id:`daily:${today}`,type:'daily-login',coins:100,createdAt,displayAt:'first-game',timeZone};
    account.lastDailyAwardDate=today;account.lastDailyAwardAt=createdAt;account.dailyAwardTimeZone=timeZone;account.walletCoins+=100;account.pendingNotices=(Array.isArray(account.pendingNotices)?account.pendingNotices:[]).filter(item=>item.id!==notice.id);account.pendingNotices.push(notice);await this.storage.put(`account:${account.id}`,account);
    await this.appendLedger(account.id,{type:'daily-login',amount:100,createdAt,day:today,timeZone});
    return true;
  }
  async appendLedger(accountId,entry){const id=randomId(this.crypto,'ledger');await this.storage.put(`ledger:${accountId}:${entry.createdAt}:${id}`,{id,accountId,...entry});}
  async createSession(account){
    const token=randomHex(this.crypto,32),hash=await hashToken(this.crypto,token),expiresAt=new Date(Date.parse(this.now())+SESSION_TTL_MS).toISOString();
    await this.storage.put(`auth:${hash}`,{accountId:account.id,createdAt:this.now(),expiresAt});
    return {token,expiresAt};
  }
  async requireAccount(request){const account=await this.accountFromToken(this.bearer(request));if(!account)throw Object.assign(new Error('Login required.'),{status:401,code:'AUTH_REQUIRED'});if(account.suspended)throw Object.assign(new Error('Account is suspended.'),{status:403,code:'ACCOUNT_SUSPENDED'});return account;}

  async register(request){
    const body=await request.json().catch(()=>({}));
    const email=normalizeEmail(body.email),nickname=normalizeNickname(body.nickname),password=String(body.password||''),confirm=String(body.confirmPassword??password);
    if(!email||!nickname||!password||!confirm)return json({ok:false,error:{code:'INCOMPLETE_REGISTRATION',message:'Please fill out all registration information.'}},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:{code:'INVALID_EMAIL',message:'Enter a valid email address.'}},400);
    if(nickname.length<3||nickname.length>16||!/^[\p{L}\p{N}_ -]+$/u.test(nickname))return json({ok:false,error:{code:'INVALID_NICKNAME',message:'Nickname must be 3-16 letters, numbers, spaces, underscores, or hyphens.'}},400);
    if(password!==confirm)return json({ok:false,error:{code:'PASSWORD_MISMATCH',message:'Password and confirmation do not match.'}},400);
    const problem=passwordProblem(password);if(problem)return json({ok:false,error:{code:'WEAK_PASSWORD',message:problem}},400);
    if(await this.storage.get(`email:${email}`))return json({ok:false,error:{code:'EMAIL_IN_USE',message:'An account already exists for this email.'}},409);
    const nickKey=nicknameKey(nickname);if(await this.storage.get(`nickname:${nickKey}`))return json({ok:false,error:{code:'NICKNAME_IN_USE',message:'That nickname is already in use.'}},409);
    const id=randomId(this.crypto,'acct'),salt=randomHex(this.crypto,16),passwordHash=await hashPassword(this.crypto,password,salt),coarseLocation=locationFromRequest(request);
    const account={id,email,nickname,nicknameKey:nickKey,passwordSalt:salt,passwordHash,passwordIterations:PBKDF2_ITERATIONS,emailVerified:true,walletCoins:100,lastDailyAwardDate:null,forceQuits:0,computerBankruptcies:0,stats:{global:blankStats(),monthly:{}},location:coarseLocation?{...coarseLocation,source:'edge-coarse',updatedAt:this.now()}:null,createdAt:this.now(),updatedAt:this.now()};
    await this.storage.put(`account:${id}`,account);await this.storage.put(`email:${email}`,id);await this.storage.put(`nickname:${nickKey}`,id);
    await this.appendLedger(id,{type:'signup',amount:100,createdAt:this.now()});await this.awardDaily(account,request);
    const session=await this.createSession(account);await this.recordConnection(account,request,'register');
    return json({ok:true,account:publicAccount(account),session,awards:{signupCoins:100,dailyCoins:100},notices:this.noticeList(account)},201);
  }

  async login(request){
    const body=await request.json().catch(()=>({})),email=normalizeEmail(body.email),password=String(body.password||'');
    const account=await this.accountByEmail(email);if(!account)return json({ok:false,error:{code:'INVALID_LOGIN',message:'Email or password is incorrect.'}},401);
    const candidate=await hashPassword(this.crypto,password,account.passwordSalt,account.passwordIterations||PBKDF2_ITERATIONS);
    if(!safeEqual(candidate,account.passwordHash))return json({ok:false,error:{code:'INVALID_LOGIN',message:'Email or password is incorrect.'}},401);
    if(account.suspended)return json({ok:false,error:{code:'ACCOUNT_SUSPENDED',message:'Account is suspended.'}},403);
    const locationChanged=this.applyCoarseLocation(account,request),dailyAwarded=await this.awardDaily(account,request);await this.prepareNotices(account);if(locationChanged&&!dailyAwarded)await this.storage.put(`account:${account.id}`,account);const session=await this.createSession(account);await this.recordConnection(account,request,'login');
    return json({ok:true,account:publicAccount(account),session,awards:{dailyCoins:dailyAwarded?100:0},notices:this.noticeList(account)});
  }

  async me(request){const account=await this.requireAccount(request),locationChanged=this.applyCoarseLocation(account,request),dailyAwarded=await this.awardDaily(account,request);await this.prepareNotices(account);if(locationChanged&&!dailyAwarded)await this.storage.put(`account:${account.id}`,account);await this.recordConnection(account,request,'me');return json({ok:true,account:publicAccount(account),awards:{dailyCoins:dailyAwarded?100:0},notices:this.noticeList(account)});}
  async acknowledgeNotice(request){
    const account=await this.requireAccount(request);await this.prepareNotices(account);const body=await request.json().catch(()=>({})),noticeId=String(body.noticeId||''),acknowledged=Array.isArray(account.acknowledgedNoticeIds)?account.acknowledgedNoticeIds:[];
    if(!noticeId)return json({ok:false,error:{code:'NOTICE_REQUIRED',message:'Notice ID is required.'}},400);
    if(acknowledged.includes(noticeId))return json({ok:true,duplicate:true,account:publicAccount(account),notices:this.noticeList(account)});
    const notices=Array.isArray(account.pendingNotices)?account.pendingNotices:[],index=notices.findIndex(item=>item.id===noticeId);if(index<0)return json({ok:true,duplicate:true,account:publicAccount(account),notices:this.noticeList(account)});
    const notice=notices[index],createdAt=this.now();let appliedCoins=0;
    if(notice.type==='abandonment'&&notice.refundable){appliedCoins=Math.max(0,Math.trunc(Number(notice.penaltyCoins)||0));account.walletCoins+=appliedCoins;if(appliedCoins)await this.appendLedger(account.id,{type:'abandonment-refund',amount:appliedCoins,gameId:notice.gameId,noticeId,createdAt});}
    if(notice.type==='opponent-abandonment-reward'){appliedCoins=Math.max(0,Math.trunc(Number(notice.rewardCoins)||0));account.walletCoins+=appliedCoins;if(appliedCoins)await this.appendLedger(account.id,{type:'abandonment-win',amount:appliedCoins,gameId:notice.gameId,noticeId,createdAt});}
    notices.splice(index,1);account.pendingNotices=notices;account.acknowledgedNoticeIds=[...acknowledged,noticeId].slice(-100);account.updatedAt=createdAt;await this.storage.put(`account:${account.id}`,account);
    return json({ok:true,account:publicAccount(account),notice:{...notice,appliedCoins,acknowledgedAt:createdAt},notices:this.noticeList(account)});
  }
  async logout(request){const token=this.bearer(request);if(token)await this.storage.delete(`auth:${await hashToken(this.crypto,token)}`);return json({ok:true});}

  async leaderboard(){
    const now=this.now(),month=utcMonth(now),accounts=[...(await this.storage.list({prefix:'account:'})).values()];
    const global=sortRows(accounts.map(account=>leaderboardRow(account,account.stats?.global||blankStats()))).map((row,index)=>({...row,rank:index+1}));
    const monthly=sortRows(accounts.map(account=>leaderboardRow(account,account.stats?.monthly?.[month]||blankStats()))).map((row,index)=>({...row,rank:index+1}));
    return json({ok:true,generatedAt:now,month,provisionalGames:PROVISIONAL_GAMES,global,monthly});
  }

  async startGameSession(request){const body=await request.json().catch(()=>({})),record={id:body.sessionId||randomId(this.crypto,'session'),mode:body.mode||'unknown',accountIds:Array.isArray(body.accountIds)?body.accountIds:[],opponent:body.opponent||null,roomCode:body.roomCode||null,matchId:body.matchId||null,gameSequence:Number(body.gameSequence)||0,startedAt:body.startedAt||this.now(),endedAt:null,summary:null};await this.storage.put(`gameSession:${record.id}`,record);return json({ok:true,session:record},201);}
  async endGameSession(request){const body=await request.json().catch(()=>({})),key=`gameSession:${body.sessionId}`,record=await this.storage.get(key);if(!record)return json({ok:false,error:{code:'SESSION_NOT_FOUND',message:'Session not found.'}},404);record.endedAt=body.endedAt||this.now();record.summary=body.summary||{};await this.storage.put(key,record);return json({ok:true,session:record});}

  async settleGame(request){
    const body=await request.json().catch(()=>({}));if(!body.gameId||!Array.isArray(body.participants)||!body.participants.length)return json({ok:false,error:{code:'INVALID_SETTLEMENT',message:'Game settlement is incomplete.'}},400);
    if(await this.storage.get(`game:${body.gameId}`))return json({ok:true,duplicate:true});
    const recordedAt=body.recordedAt||this.now(),month=utcMonth(recordedAt),storedParticipants=[];
    for(const item of body.participants){
      const account=await this.accountById(item.accountId);if(!account)continue;
      const walletDelta=Number(item.walletDelta)||0,coinsWon=Math.max(0,Number(item.coinsWon)||0),won=!!item.won;
      account.walletCoins+=walletDelta;account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};account.stats.monthly[month]=account.stats.monthly[month]||blankStats();
      for(const stats of [account.stats.global,account.stats.monthly[month]]){stats.gamesPlayed+=1;if(won){stats.wins+=1;stats.totalCoinsWon+=coinsWon;}for(const [name,count] of Object.entries(item.milestones||{}))stats.milestones[name]=(stats.milestones[name]||0)+(Number(count)||0);}
      if(Number(item.computerBankruptcies)>0)account.computerBankruptcies=(account.computerBankruptcies||0)+Number(item.computerBankruptcies);
      account.updatedAt=recordedAt;await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'game',amount:walletDelta,gameId:body.gameId,createdAt:recordedAt});storedParticipants.push({...item,walletAfter:account.walletCoins,adminConnection:account.lastConnection?{...account.lastConnection}:null,adminLocation:account.location?{...account.location}:null});
    }
    const game={...body,participants:storedParticipants,recordedAt};await this.storage.put(`game:${body.gameId}`,game);return json({ok:true,game});
  }

  async forceQuit(request){
    const body=await request.json().catch(()=>({})),account=await this.accountById(body.accountId);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
    const penalty=Math.max(0,Math.trunc(Number(body.penaltyCoins)||0)),gameId=body.gameId||randomId(this.crypto,'abandon');account.walletCoins-=penalty;account.forceQuits=(account.forceQuits||0)+1;
    const month=utcMonth(this.now());account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};account.stats.monthly[month]=account.stats.monthly[month]||blankStats();account.stats.global.gamesPlayed+=1;account.stats.monthly[month].gamesPlayed+=1;account.updatedAt=this.now();
    await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'force-quit',amount:-penalty,gameId,createdAt:this.now()});await this.storage.put(`forceQuit:${gameId}`,{...body,gameId,penaltyCoins:penalty,recordedAt:this.now()});return json({ok:true,penaltyCoins:penalty,account:publicAccount(account)});
  }

  async resolveSession(request){const account=await this.accountFromToken(this.bearer(request));if(account?.suspended)return json({ok:true,account:null});if(account){if(this.applyCoarseLocation(account,request))await this.storage.put(`account:${account.id}`,account);await this.recordConnection(account,request,request.headers.get('x-gostop-event')||'game-resolve');}return json({ok:true,account:account?publicAccount(account):null});}

  async fetch(request){
    const path=new URL(request.url).pathname;
    try{
      if(request.method==='POST'&&path==='/register')return await this.register(request);
      if(request.method==='POST'&&path==='/login')return await this.login(request);
      if(request.method==='POST'&&path==='/logout')return await this.logout(request);
      if(request.method==='POST'&&path==='/notices/ack')return await this.acknowledgeNotice(request);
      if(request.method==='GET'&&path==='/me')return await this.me(request);
      if(request.method==='GET'&&path==='/leaderboards')return await this.leaderboard();
      if(request.method==='GET'&&path==='/internal/resolve')return await this.resolveSession(request);
      if(request.method==='POST'&&path==='/internal/session/start')return await this.startGameSession(request);
      if(request.method==='POST'&&path==='/internal/session/end')return await this.endGameSession(request);
      if(request.method==='POST'&&path==='/internal/game/settle')return await this.settleGame(request);
      if(request.method==='POST'&&path==='/internal/force-quit')return await this.forceQuit(request);
      return json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404);
    }catch(error){return json({ok:false,error:{code:error.code||'INTERNAL_ERROR',message:error.message||'Request failed.'}},error.status||500);}
  }
}

export {PROVISIONAL_GAMES,blankStats,scoreFor,passwordProblem,locationFromRequest,connectionFromRequest,timeZoneFromRequest,dayInTimeZone};
