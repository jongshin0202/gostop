const encoder=new TextEncoder();
const COMMON_PASSWORDS=new Set(['12345','123456','12345678','password','password1','qwerty','qwerty123','abc123','letmein','111111','000000']);
const PROVISIONAL_GAMES=10;
const SESSION_TTL_MS=1000*60*60*24*30;
const PBKDF2_ITERATIONS=100000;
const EMAIL_VERIFY_TTL_MS=1000*60*60*24;
const EMAIL_VERIFY_RESEND_MS=1000*60;

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
const htmlEscape=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

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
  const active=account.activeRanked&&typeof account.activeRanked==='object'?account.activeRanked:null;
  return {id:account.id,email:account.email,nickname:account.nickname,walletCoins:account.walletCoins,forceQuits:account.forceQuits||0,computerBankruptcies:account.computerBankruptcies||0,createdAt:account.createdAt,emailVerified:account.emailVerified!==false,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null,activeRanked:active?{sessionId:active.sessionId||null,mode:active.mode||null,roomCode:active.roomCode||null,startedAt:active.startedAt||null}:null};
}
function blankStats(){return {gamesPlayed:0,wins:0,losses:0,totalCoinsWon:0,milestones:{}};}
function scoreFor(stats){return stats.gamesPlayed?stats.totalCoinsWon/stats.gamesPlayed:0;}
function leaderboardRow(account,stats){const gamesPlayed=Number(stats.gamesPlayed)||0,wins=Number(stats.wins)||0,losses=Number.isFinite(Number(stats.losses))?Number(stats.losses):Math.max(0,gamesPlayed-wins);return {nickname:account.nickname,score:scoreFor(stats),totalCoins:Number(stats.totalCoinsWon)||0,gamesPlayed,wins,losses,provisional:gamesPlayed<PROVISIONAL_GAMES,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null};}
function aggregateMonthlyStats(monthly){
  const total=blankStats();
  for(const stats of Object.values(monthly||{})){
    total.gamesPlayed+=Number(stats?.gamesPlayed)||0;total.wins+=Number(stats?.wins)||0;total.losses+=Number(stats?.losses)||0;total.totalCoinsWon+=Number(stats?.totalCoinsWon)||0;
    for(const [name,count] of Object.entries(stats?.milestones||{}))total.milestones[name]=(total.milestones[name]||0)+(Number(count)||0);
  }
  return total;
}
function canonicalGlobalStats(account){
  const stored=account?.stats?.global||blankStats(),monthly=aggregateMonthlyStats(account?.stats?.monthly);
  const storedGames=Number(stored.gamesPlayed)||0,monthlyGames=Number(monthly.gamesPlayed)||0;
  if(monthlyGames>storedGames)return monthly;
  if(monthlyGames===storedGames&&monthlyGames>0&&(Number(monthly.totalCoinsWon)||0)>(Number(stored.totalCoinsWon)||0))return monthly;
  if(monthlyGames===storedGames&&monthlyGames>0&&(Number(monthly.wins)||0)>(Number(stored.wins)||0))return monthly;
  return stored;
}
function sortRows(rows){return rows.sort((a,b)=>b.score-a.score||b.gamesPlayed-a.gamesPlayed||b.totalCoins-a.totalCoins||a.nickname.localeCompare(b.nickname));}
function rankRows(rows){
  const ranked=sortRows(rows.filter(row=>!row.provisional)).map((row,index)=>({...row,rank:index+1}));
  const notYetRanked=sortRows(rows.filter(row=>row.provisional)).map(row=>({...row,rank:0}));
  return [...ranked,...notYetRanked];
}

export class AccountStore{
  constructor(state,env,{cryptoApi=globalThis.crypto,now=()=>new Date().toISOString(),fetchApi=globalThis.fetch}={}){this.state=state;this.storage=state.storage;this.env=env||{};this.crypto=cryptoApi;this.now=now;this.fetchApi=(...args)=>fetchApi(...args);}
  emailVerificationRequired(){return String(this.env.EMAIL_VERIFICATION_REQUIRED||'').toLowerCase()==='true';}
  emailVerificationConfigured(){return !!String(this.env.RESEND_API_KEY||'').trim()&&!!String(this.env.EMAIL_FROM||'').trim();}
  verificationBaseUrl(){return String(this.env.EMAIL_VERIFY_BASE_URL||'https://gostoplive.com').trim()||'https://gostoplive.com';}

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
  normalizedNotices(account){
    const notices=Array.isArray(account.pendingNotices)?account.pendingNotices:[],acknowledged=new Set(Array.isArray(account.acknowledgedNoticeIds)?account.acknowledgedNoticeIds:[]);
    const unacknowledged=notices.filter(item=>!item?.acknowledgedAt&&!acknowledged.has(item?.id)),daily=unacknowledged.filter(item=>item?.type==='daily-login');
    let latestDaily=null;
    for(const item of daily){const itemTime=Date.parse(item?.createdAt||''),latestTime=Date.parse(latestDaily?.createdAt||'');if(!latestDaily||(Number.isFinite(itemTime)&&(!Number.isFinite(latestTime)||itemTime>latestTime))||(!Number.isFinite(itemTime)&&!Number.isFinite(latestTime)&&String(item?.id||'')>String(latestDaily?.id||'')))latestDaily=item;}
    return unacknowledged.filter(item=>item?.type!=='daily-login'||item===latestDaily);
  }
  noticeList(account){return this.normalizedNotices(account);}
  async prepareNotices(account){const notices=Array.isArray(account.pendingNotices)?account.pendingNotices:[],filtered=this.normalizedNotices(account);if(filtered.length!==notices.length){account.pendingNotices=filtered;account.updatedAt=this.now();await this.storage.put(`account:${account.id}`,account);}return account;}
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
    if(account.emailVerified===false)return false;
    const createdAt=this.now(),timeZone=timeZoneFromRequest(request),today=dayInTimeZone(createdAt,timeZone),latestAt=await this.latestDailyAwardAt(account),lastDay=latestAt?dayInTimeZone(latestAt,timeZone):account.lastDailyAwardDate;
    if(lastDay===today){
      let changed=false;
      if(latestAt&&account.lastDailyAwardAt!==latestAt){account.lastDailyAwardAt=latestAt;changed=true;}
      if(account.lastDailyAwardDate!==today){account.lastDailyAwardDate=today;changed=true;}
      if(account.dailyAwardTimeZone!==timeZone){account.dailyAwardTimeZone=timeZone;changed=true;}
      if(changed)await this.storage.put(`account:${account.id}`,account);
      return false;
    }
    const walletBefore=Number(account.walletCoins)||0,walletAfter=walletBefore+100,notice={id:`daily:${today}`,type:'daily-login',coins:100,walletBefore,walletAfter,createdAt,displayAt:'first-game',timeZone};
    account.lastDailyAwardDate=today;account.lastDailyAwardAt=createdAt;account.dailyAwardTimeZone=timeZone;account.walletCoins=walletAfter;account.pendingNotices=(Array.isArray(account.pendingNotices)?account.pendingNotices:[]).filter(item=>item?.type!=='daily-login');account.pendingNotices.push(notice);await this.storage.put(`account:${account.id}`,account);
    await this.appendLedger(account.id,{type:'daily-login',amount:100,createdAt,day:today,timeZone});
    return true;
  }
  async appendLedger(accountId,entry){const id=randomId(this.crypto,'ledger');await this.storage.put(`ledger:${accountId}:${entry.createdAt}:${id}`,{id,accountId,...entry});}
  async awardSignup(account){
    if(account.signupAwardedAt)return false;
    const createdAt=this.now();account.signupAwardedAt=createdAt;account.walletCoins=(Number(account.walletCoins)||0)+100;account.updatedAt=createdAt;
    await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'signup',amount:100,createdAt});return true;
  }
  async sendVerificationEmail(account,{bypassRateLimit=false}={}){
    if(!this.emailVerificationRequired())return {sent:false,disabled:true};
    if(!this.emailVerificationConfigured())throw Object.assign(new Error('Email verification is temporarily unavailable.'),{status:503,code:'EMAIL_SERVICE_NOT_CONFIGURED'});
    const nowMs=Date.parse(this.now()),lastSentMs=Date.parse(account.emailVerificationSentAt||'');
    if(!bypassRateLimit&&Number.isFinite(lastSentMs)&&nowMs-lastSentMs<EMAIL_VERIFY_RESEND_MS){
      const retryAfterSeconds=Math.max(1,Math.ceil((EMAIL_VERIFY_RESEND_MS-(nowMs-lastSentMs))/1000));
      throw Object.assign(new Error(`Please wait ${retryAfterSeconds} seconds before requesting another verification email.`),{status:429,code:'VERIFICATION_RATE_LIMIT',retryAfterSeconds});
    }
    if(account.emailVerificationTokenHash)await this.storage.delete(`verify:${account.emailVerificationTokenHash}`);
    const token=randomHex(this.crypto,32),tokenHash=await hashToken(this.crypto,token),createdAt=this.now(),expiresAt=new Date(Date.parse(createdAt)+EMAIL_VERIFY_TTL_MS).toISOString();
    account.emailVerificationTokenHash=tokenHash;account.emailVerificationSentAt=createdAt;account.emailVerificationExpiresAt=expiresAt;account.updatedAt=createdAt;
    await this.storage.put(`account:${account.id}`,account);await this.storage.put(`verify:${tokenHash}`,{accountId:account.id,email:account.email,createdAt,expiresAt});
    const verifyUrl=new URL(this.verificationBaseUrl());verifyUrl.hash=`verify=${token}`;
    const safeNickname=htmlEscape(account.nickname),safeUrl=htmlEscape(verifyUrl.toString()),plainUrl=verifyUrl.toString();
    let response;
    try{
      response=await this.fetchApi('https://api.resend.com/emails',{method:'POST',headers:{authorization:`Bearer ${this.env.RESEND_API_KEY}`,'content-type':'application/json'},body:JSON.stringify({from:this.env.EMAIL_FROM,to:[account.email],subject:'Verify your GoStop Live account',text:`Hi ${account.nickname},\n\nVerify your GoStop Live account: ${plainUrl}\n\nThis link expires in 24 hours and can be used only once.\n\nIf you did not create this account, you can ignore this email.`,html:`<div style="font-family:Arial,sans-serif;line-height:1.5;color:#24170f"><h2>Verify your GoStop Live account</h2><p>Hi ${safeNickname},</p><p>Confirm your email address to activate your account and receive your signup and daily Coin rewards.</p><p><a href="${safeUrl}" style="display:inline-block;padding:12px 18px;background:#8f2f22;color:#fff;text-decoration:none;border-radius:8px">Verify Email</a></p><p>This link expires in 24 hours and can be used only once.</p><p>If you did not create this account, you can ignore this email.</p></div>`})});
    }catch(_){
      await this.storage.delete(`verify:${tokenHash}`);delete account.emailVerificationTokenHash;delete account.emailVerificationSentAt;delete account.emailVerificationExpiresAt;await this.storage.put(`account:${account.id}`,account);
      throw Object.assign(new Error('Account created, but the verification email could not be sent. Please try Resend Verification Email.'),{status:503,code:'EMAIL_SEND_FAILED',email:account.email});
    }
    if(!response?.ok){
      await this.storage.delete(`verify:${tokenHash}`);delete account.emailVerificationTokenHash;delete account.emailVerificationSentAt;delete account.emailVerificationExpiresAt;await this.storage.put(`account:${account.id}`,account);
      throw Object.assign(new Error('Account created, but the verification email could not be sent. Please try Resend Verification Email.'),{status:503,code:'EMAIL_SEND_FAILED',email:account.email});
    }
    return {sent:true,email:account.email,expiresAt};
  }
  async verifyEmail(request){
    if(!this.emailVerificationRequired())return json({ok:false,error:{code:'EMAIL_VERIFICATION_DISABLED',message:'Email verification is not enabled.'}},404);
    const body=await request.json().catch(()=>({})),token=String(body.token||'').trim();
    if(!/^[a-f0-9]{64}$/i.test(token))return json({ok:false,error:{code:'INVALID_VERIFICATION_TOKEN',message:'This verification link is invalid.'}},400);
    const tokenHash=await hashToken(this.crypto,token),record=await this.storage.get(`verify:${tokenHash}`);
    if(!record)return json({ok:false,error:{code:'INVALID_VERIFICATION_TOKEN',message:'This verification link is invalid or has already been used.'}},400);
    if(Date.parse(record.expiresAt)<=Date.parse(this.now())){await this.storage.delete(`verify:${tokenHash}`);return json({ok:false,error:{code:'VERIFICATION_EXPIRED',message:'This verification link has expired. Log in and request a new verification email.'}},410);}
    const account=await this.accountById(record.accountId);
    if(!account||account.emailVerificationTokenHash!==tokenHash||normalizeEmail(account.email)!==normalizeEmail(record.email))return json({ok:false,error:{code:'INVALID_VERIFICATION_TOKEN',message:'This verification link is no longer valid.'}},400);
    account.emailVerified=true;account.emailVerifiedAt=this.now();delete account.emailVerificationTokenHash;delete account.emailVerificationExpiresAt;delete account.emailVerificationSentAt;account.updatedAt=this.now();
    await this.storage.put(`account:${account.id}`,account);await this.storage.delete(`verify:${tokenHash}`);
    const signupAwarded=await this.awardSignup(account),dailyAwarded=await this.awardDaily(account,request),session=await this.createSession(account);await this.recordConnection(account,request,'verify-email');
    return json({ok:true,account:publicAccount(account),session,awards:{signupCoins:signupAwarded?100:0,dailyCoins:dailyAwarded?100:0},notices:this.noticeList(account)});
  }
  async resendVerification(request){
    if(!this.emailVerificationRequired())return json({ok:false,error:{code:'EMAIL_VERIFICATION_DISABLED',message:'Email verification is not enabled.'}},404);
    const body=await request.json().catch(()=>({})),email=normalizeEmail(body.email),password=String(body.password||'');
    if(!email||!password)return json({ok:false,error:{code:'INCOMPLETE_LOGIN',message:'Enter your email and password.'}},400);
    const account=await this.accountByEmail(email);
    if(!account)return json({ok:false,error:{code:'INVALID_LOGIN',message:'Email or password is incorrect.'}},401);
    const candidate=await hashPassword(this.crypto,password,account.passwordSalt,account.passwordIterations||PBKDF2_ITERATIONS);
    if(!safeEqual(candidate,account.passwordHash))return json({ok:false,error:{code:'INVALID_LOGIN',message:'Email or password is incorrect.'}},401);
    if(account.emailVerified!==false)return json({ok:true,alreadyVerified:true,email:account.email});
    const sent=await this.sendVerificationEmail(account);return json({ok:true,verificationPending:true,email:account.email,expiresAt:sent.expiresAt});
  }
  async createSession(account){
    const token=randomHex(this.crypto,32),hash=await hashToken(this.crypto,token),expiresAt=new Date(Date.parse(this.now())+SESSION_TTL_MS).toISOString();
    await this.storage.put(`auth:${hash}`,{accountId:account.id,createdAt:this.now(),expiresAt});
    return {token,expiresAt};
  }
  async requireAccount(request){const account=await this.accountFromToken(this.bearer(request));if(!account)throw Object.assign(new Error('Login required.'),{status:401,code:'AUTH_REQUIRED'});if(account.suspended)throw Object.assign(new Error('Account is suspended.'),{status:403,code:'ACCOUNT_SUSPENDED'});if(this.emailVerificationRequired()&&account.emailVerified===false)throw Object.assign(new Error('Verify your email before using this account.'),{status:403,code:'EMAIL_NOT_VERIFIED'});return account;}

  async register(request){
    const body=await request.json().catch(()=>({}));
    const email=normalizeEmail(body.email),nickname=normalizeNickname(body.nickname),password=String(body.password||''),confirm=String(body.confirmPassword??password);
    if(!email||!nickname||!password||!confirm)return json({ok:false,error:{code:'INCOMPLETE_REGISTRATION',message:'Please fill out all registration information.'}},400);
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return json({ok:false,error:{code:'INVALID_EMAIL',message:'Enter a valid email address.'}},400);
    if(nickname.length<3||nickname.length>16||!/^[\p{L}\p{N}_ -]+$/u.test(nickname))return json({ok:false,error:{code:'INVALID_NICKNAME',message:'Nickname must be 3-16 letters, numbers, spaces, underscores, or hyphens.'}},400);
    if(password!==confirm)return json({ok:false,error:{code:'PASSWORD_MISMATCH',message:'Password and confirmation do not match.'}},400);
    const problem=passwordProblem(password);if(problem)return json({ok:false,error:{code:'WEAK_PASSWORD',message:problem}},400);
    if(this.emailVerificationRequired()&&!this.emailVerificationConfigured())return json({ok:false,error:{code:'EMAIL_SERVICE_NOT_CONFIGURED',message:'Email verification is temporarily unavailable.'}},503);
    const existingEmailId=await this.storage.get(`email:${email}`);
    if(existingEmailId){const existing=await this.accountById(existingEmailId);return json({ok:false,error:{code:existing?.emailVerified===false?'EMAIL_PENDING_VERIFICATION':'EMAIL_IN_USE',message:existing?.emailVerified===false?'This email is already awaiting verification. Log in to resend the verification email.':'An account already exists for this email.'}},409);}
    const nickKey=nicknameKey(nickname);if(await this.storage.get(`nickname:${nickKey}`))return json({ok:false,error:{code:'NICKNAME_IN_USE',message:'That nickname is already in use.'}},409);
    const id=randomId(this.crypto,'acct'),salt=randomHex(this.crypto,16),passwordHash=await hashPassword(this.crypto,password,salt),coarseLocation=locationFromRequest(request),verificationRequired=this.emailVerificationRequired();
    const account={id,email,nickname,nicknameKey:nickKey,passwordSalt:salt,passwordHash,passwordIterations:PBKDF2_ITERATIONS,emailVerified:!verificationRequired,walletCoins:verificationRequired?0:100,lastDailyAwardDate:null,forceQuits:0,computerBankruptcies:0,stats:{global:blankStats(),monthly:{}},location:coarseLocation?{...coarseLocation,source:'edge-coarse',updatedAt:this.now()}:null,createdAt:this.now(),updatedAt:this.now()};
    await this.storage.put(`account:${id}`,account);await this.storage.put(`email:${email}`,id);await this.storage.put(`nickname:${nickKey}`,id);
    if(verificationRequired){try{const sent=await this.sendVerificationEmail(account,{bypassRateLimit:true});return json({ok:true,verificationPending:true,email:account.email,emailSent:sent.sent,expiresAt:sent.expiresAt},202);}catch(error){return json({ok:false,error:{code:error.code||'EMAIL_SEND_FAILED',message:error.message,email:account.email}},error.status||503);}}
    await this.appendLedger(id,{type:'signup',amount:100,createdAt:this.now()});account.signupAwardedAt=this.now();await this.storage.put(`account:${id}`,account);await this.awardDaily(account,request);
    const session=await this.createSession(account);await this.recordConnection(account,request,'register');
    return json({ok:true,account:publicAccount(account),session,awards:{signupCoins:100,dailyCoins:100},notices:this.noticeList(account)},201);
  }

  async login(request){
    const body=await request.json().catch(()=>({})),email=normalizeEmail(body.email),password=String(body.password||'');
    const account=await this.accountByEmail(email);if(!account)return json({ok:false,error:{code:'INVALID_LOGIN',message:'Email or password is incorrect.'}},401);
    const candidate=await hashPassword(this.crypto,password,account.passwordSalt,account.passwordIterations||PBKDF2_ITERATIONS);
    if(!safeEqual(candidate,account.passwordHash))return json({ok:false,error:{code:'INVALID_LOGIN',message:'Email or password is incorrect.'}},401);
    if(account.suspended)return json({ok:false,error:{code:'ACCOUNT_SUSPENDED',message:'Account is suspended.'}},403);
    if(this.emailVerificationRequired()&&account.emailVerified===false)return json({ok:false,error:{code:'EMAIL_NOT_VERIFIED',message:'Verify your email before logging in.',email:account.email}},403);
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

  async ensureOutcomeHistoryRepair(){
    const markerKey='migration:outcome-history-v1';if(await this.storage.get(markerKey))return;
    const games=[...(await this.storage.list({prefix:'game:'})).values()],derived=new Map();
    const bucketFor=(accountId,month)=>{let item=derived.get(accountId);if(!item){item={global:{wins:0,losses:0},monthly:{}};derived.set(accountId,item);}if(!item.monthly[month])item.monthly[month]={wins:0,losses:0};return item;};
    const addOutcome=(accountId,recordedAt,won,lost)=>{if(!accountId||(!won&&!lost))return;const month=utcMonth(recordedAt||this.now()),item=bucketFor(accountId,month);if(won){item.global.wins++;item.monthly[month].wins++;}if(lost){item.global.losses++;item.monthly[month].losses++;}};
    for(const game of games){
      const recordedAt=game?.recordedAt||this.now();
      if(Array.isArray(game?.participants)&&game.participants.length){
        const winnerPlayerId=String(game.winnerPlayerId||''),hasWinner=!!winnerPlayerId||game.participants.some(item=>item?.won===true);
        for(const item of game.participants){
          const won=item?.won===true||!!winnerPlayerId&&String(item?.playerId||'')===winnerPlayerId;
          addOutcome(item?.accountId,recordedAt,won,hasWinner&&!won);
        }
        continue;
      }
      if(game?.type==='abandonment'&&game?.settlementType!=='nagari'){
        addOutcome(game.accountId,recordedAt,false,true);
        if(game.opponentAccountId)addOutcome(game.opponentAccountId,recordedAt,true,false);
      }
    }
    for(const [accountId,outcomes] of derived){
      const account=await this.accountById(accountId);if(!account)continue;
      account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};
      account.stats.global.wins=Math.max(Number(account.stats.global.wins)||0,outcomes.global.wins);
      account.stats.global.losses=Math.max(Number(account.stats.global.losses)||0,outcomes.global.losses);
      for(const [month,monthOutcomes] of Object.entries(outcomes.monthly)){
        account.stats.monthly[month]=account.stats.monthly[month]||blankStats();
        account.stats.monthly[month].wins=Math.max(Number(account.stats.monthly[month].wins)||0,monthOutcomes.wins);
        account.stats.monthly[month].losses=Math.max(Number(account.stats.monthly[month].losses)||0,monthOutcomes.losses);
      }
      await this.storage.put(`account:${account.id}`,account);
    }
    await this.storage.put(markerKey,{completedAt:this.now(),gamesScanned:games.length});
  }

  async headToHeadFor(requesterAccountId,opponentIds=[]){
    const ids=new Set((opponentIds||[]).filter(Boolean).map(String)),result={};for(const id of ids)result[id]={wins:0,losses:0,draws:0,coinsWon:0,coinsLost:0,lastPlayedAt:null};
    if(!requesterAccountId||!ids.size)return result;
    const touch=(opponentId,recordedAt)=>{const row=result[opponentId];if(!row)return null;const at=recordedAt||this.now();if(!row.lastPlayedAt||Date.parse(at)>Date.parse(row.lastPlayedAt))row.lastPlayedAt=at;return row;};
    const games=[...(await this.storage.list({prefix:'game:'})).values()];
    for(const game of games){
      if(game?.mode&&game.mode!=='online')continue;
      const recordedAt=game?.recordedAt||this.now();
      if(Array.isArray(game?.participants)&&game.participants.length>=2){
        const mine=game.participants.find(item=>String(item?.accountId||'')===String(requesterAccountId));if(!mine)continue;
        const other=game.participants.find(item=>ids.has(String(item?.accountId||'')));if(!other)continue;
        const row=touch(String(other.accountId),recordedAt);if(!row)continue;
        const winnerPlayerId=String(game.winnerPlayerId||''),hasWinner=!!winnerPlayerId||game.participants.some(item=>item?.won===true),mineWon=mine.won===true||!!winnerPlayerId&&String(mine.playerId||'')===winnerPlayerId;
        if(mineWon)row.wins++;else if(hasWinner)row.losses++;else row.draws++;
        const delta=Number(mine.walletDelta)||0;if(delta>0)row.coinsWon+=delta;else if(delta<0)row.coinsLost+=Math.abs(delta);
        continue;
      }
      if(game?.type==='abandonment'){
        const quitterId=String(game.accountId||''),opponentId=String(game.opponentAccountId||'');let otherId=null,mineQuit=false;
        if(quitterId===String(requesterAccountId)&&ids.has(opponentId)){otherId=opponentId;mineQuit=true;}
        else if(opponentId===String(requesterAccountId)&&ids.has(quitterId))otherId=quitterId;
        if(!otherId)continue;const row=touch(otherId,recordedAt);if(!row)continue;
        if(game.settlementType==='nagari')row.draws++;
        else if(mineQuit){row.losses++;row.coinsLost+=Math.max(0,Number(game.penaltyCoins)||0);}
        else {row.wins++;row.coinsWon+=Math.max(0,Number(game.opponentRewardCoins??game.fairPoints)||0);}
      }
    }
    return result;
  }

  async directoryProfiles({requesterAccountId=null,accountIds=null,query=''}={}){
    await this.ensureOutcomeHistoryRepair();
    const needle=String(query||'').trim().toLowerCase(),wanted=Array.isArray(accountIds)?new Set(accountIds.map(String)):null,month=utcMonth(this.now()),accounts=[...(await this.storage.list({prefix:'account:'})).values()].filter(account=>!account?.suspended&&account?.emailVerified!==false);
    const global=rankRows(accounts.map(account=>({...leaderboardRow(account,canonicalGlobalStats(account)),accountId:account.id,walletCoins:Number(account.walletCoins)||0})));
    const monthly=rankRows(accounts.map(account=>{const lifetime=canonicalGlobalStats(account),row=leaderboardRow(account,account.stats?.monthly?.[month]||blankStats());return {...row,provisional:(Number(lifetime.gamesPlayed)||0)<PROVISIONAL_GAMES,accountId:account.id};})),monthlyById=new Map(monthly.map(row=>[String(row.accountId),row]));
    let players=global.filter(row=>(!wanted||wanted.has(String(row.accountId)))&&(!needle||String(row.nickname||'').toLowerCase().includes(needle)));
    if(needle)players=players.sort((a,b)=>{const an=String(a.nickname||'').toLowerCase(),bn=String(b.nickname||'').toLowerCase(),ax=an===needle?0:an.startsWith(needle)?1:2,bx=bn===needle?0:bn.startsWith(needle)?1:2,ar=Number(a.rank)||Number.MAX_SAFE_INTEGER,br=Number(b.rank)||Number.MAX_SAFE_INTEGER;return ax-bx||ar-br||an.localeCompare(bn);});
    const headToHead=await this.headToHeadFor(requesterAccountId,players.map(row=>row.accountId));
    return players.map(row=>{const monthlyRow=monthlyById.get(String(row.accountId));return {...row,globalRank:Number(row.rank)||0,globalProvisional:!!row.provisional,monthlyRank:Number(monthlyRow?.rank)||0,monthlyProvisional:!!monthlyRow?.provisional,headToHead:headToHead[String(row.accountId)]||{wins:0,losses:0,draws:0,coinsWon:0,coinsLost:0,lastPlayedAt:null}};});
  }

  async leaderboard(){
    await this.ensureOutcomeHistoryRepair();
    const now=this.now(),month=utcMonth(now),accounts=[...(await this.storage.list({prefix:'account:'})).values()].filter(account=>account?.emailVerified!==false);
    const global=rankRows(accounts.map(account=>leaderboardRow(account,canonicalGlobalStats(account))));
    const monthly=rankRows(accounts.map(account=>{const lifetime=canonicalGlobalStats(account),row=leaderboardRow(account,account.stats?.monthly?.[month]||blankStats());return {...row,provisional:(Number(lifetime.gamesPlayed)||0)<PROVISIONAL_GAMES};}));
    return json({ok:true,generatedAt:now,month,provisionalGames:PROVISIONAL_GAMES,global,monthly});
  }

  async playerSearch(request){
    const body=await request.json().catch(()=>({})),needle=String(body.query||'').trim();
    if(!needle)return json({ok:true,players:[]});
    const players=(await this.directoryProfiles({requesterAccountId:body.requesterAccountId||null,query:needle})).slice(0,20);
    return json({ok:true,players});
  }

  async playerProfiles(request){
    const body=await request.json().catch(()=>({})),ids=Array.isArray(body.accountIds)?body.accountIds.map(String).filter(Boolean).slice(0,20):[];
    if(!ids.length)return json({ok:true,players:[]});
    const players=await this.directoryProfiles({requesterAccountId:body.requesterAccountId||null,accountIds:ids});
    return json({ok:true,players});
  }

  async clearActiveRanked(request){
    const body=await request.json().catch(()=>({})),account=await this.accountById(body.accountId);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
    const expected=String(body.sessionId||'');if(account.activeRanked&&(!expected||account.activeRanked.sessionId===expected)){account.activeRanked=null;account.updatedAt=this.now();await this.storage.put(`account:${account.id}`,account);}
    return json({ok:true,account:publicAccount(account)});
  }

  async startGameSession(request){
    const body=await request.json().catch(()=>({})),record={id:body.sessionId||randomId(this.crypto,'session'),mode:body.mode||'unknown',accountIds:Array.isArray(body.accountIds)?body.accountIds.filter(Boolean):[],opponent:body.opponent||null,roomCode:body.roomCode||null,matchId:body.matchId||null,gameSequence:Number(body.gameSequence)||0,startedAt:body.startedAt||this.now(),endedAt:null,summary:null},key=`gameSession:${record.id}`;
    const prior=await this.storage.get(key);if(prior&&!prior.endedAt)return json({ok:true,duplicate:true,session:prior});
    const ranked=(record.mode==='solo'||record.mode==='online')&&record.roomCode,loaded=[];
    if(ranked){
      for(const accountId of record.accountIds){const account=await this.accountById(accountId);if(!account)continue;if(account.activeRanked?.sessionId&&account.activeRanked.sessionId!==record.id)return json({ok:false,error:{code:'ACTIVE_RANKED_GAME',message:'This account already has an active Coin game.',activeRanked:account.activeRanked}},409);loaded.push(account);}
    }
    await this.storage.put(key,record);
    for(const account of loaded){account.activeRanked={sessionId:record.id,mode:record.mode,roomCode:record.roomCode,startedAt:record.startedAt};account.updatedAt=this.now();await this.storage.put(`account:${account.id}`,account);}
    return json({ok:true,session:record},201);
  }
  async endGameSession(request){
    const body=await request.json().catch(()=>({})),key=`gameSession:${body.sessionId}`,record=await this.storage.get(key);if(!record)return json({ok:false,error:{code:'SESSION_NOT_FOUND',message:'Session not found.'}},404);
    record.endedAt=body.endedAt||this.now();record.summary=body.summary||{};await this.storage.put(key,record);
    for(const accountId of record.accountIds||[]){const account=await this.accountById(accountId);if(!account)continue;if(account.activeRanked?.sessionId===record.id){account.activeRanked=null;account.updatedAt=this.now();await this.storage.put(`account:${account.id}`,account);}}
    return json({ok:true,session:record});
  }

  async settleGame(request){
    const body=await request.json().catch(()=>({}));if(!body.gameId||!Array.isArray(body.participants)||!body.participants.length)return json({ok:false,error:{code:'INVALID_SETTLEMENT',message:'Game settlement is incomplete.'}},400);
    if(await this.storage.get(`game:${body.gameId}`))return json({ok:true,duplicate:true});
    const recordedAt=body.recordedAt||this.now(),month=utcMonth(recordedAt),storedParticipants=[],hasWinner=!!body.winnerPlayerId||body.participants.some(item=>!!item?.won);
    for(const item of body.participants){
      const account=await this.accountById(item.accountId);if(!account)continue;
      const walletDelta=Number(item.walletDelta)||0,coinsWon=Math.max(0,Number(item.coinsWon)||0),won=!!item.won;
      account.walletCoins+=walletDelta;account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};account.stats.monthly[month]=account.stats.monthly[month]||blankStats();
      for(const stats of [account.stats.global,account.stats.monthly[month]]){stats.gamesPlayed+=1;if(won){stats.wins+=1;stats.totalCoinsWon+=coinsWon;}else if(hasWinner){stats.losses=(Number(stats.losses)||0)+1;}for(const [name,count] of Object.entries(item.milestones||{}))stats.milestones[name]=(stats.milestones[name]||0)+(Number(count)||0);}
      if(Number(item.computerBankruptcies)>0)account.computerBankruptcies=(account.computerBankruptcies||0)+Number(item.computerBankruptcies);
      account.updatedAt=recordedAt;await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'game',amount:walletDelta,gameId:body.gameId,createdAt:recordedAt});storedParticipants.push({...item,walletAfter:account.walletCoins,adminConnection:account.lastConnection?{...account.lastConnection}:null,adminLocation:account.location?{...account.location}:null});
    }
    const game={...body,participants:storedParticipants,recordedAt};await this.storage.put(`game:${body.gameId}`,game);return json({ok:true,game});
  }

  async forceQuit(request){
    const body=await request.json().catch(()=>({})),account=await this.accountById(body.accountId);if(!account)return json({ok:false,error:{code:'ACCOUNT_NOT_FOUND',message:'Account not found.'}},404);
    const penalty=Math.max(0,Math.trunc(Number(body.penaltyCoins)||0)),gameId=body.gameId||randomId(this.crypto,'abandon');account.walletCoins-=penalty;account.forceQuits=(account.forceQuits||0)+1;
    const month=utcMonth(this.now());account.stats=account.stats||{global:blankStats(),monthly:{}};account.stats.global=account.stats.global||blankStats();account.stats.monthly=account.stats.monthly||{};account.stats.monthly[month]=account.stats.monthly[month]||blankStats();account.stats.global.gamesPlayed+=1;account.stats.global.losses=(Number(account.stats.global.losses)||0)+1;account.stats.monthly[month].gamesPlayed+=1;account.stats.monthly[month].losses=(Number(account.stats.monthly[month].losses)||0)+1;account.updatedAt=this.now();
    await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'force-quit',amount:-penalty,gameId,createdAt:this.now()});await this.storage.put(`forceQuit:${gameId}`,{...body,gameId,penaltyCoins:penalty,recordedAt:this.now()});return json({ok:true,penaltyCoins:penalty,account:publicAccount(account)});
  }

  async resolveSession(request){const account=await this.accountFromToken(this.bearer(request));if(account?.suspended||this.emailVerificationRequired()&&account?.emailVerified===false)return json({ok:true,account:null});if(account){if(this.applyCoarseLocation(account,request))await this.storage.put(`account:${account.id}`,account);await this.recordConnection(account,request,request.headers.get('x-gostop-event')||'game-resolve');}return json({ok:true,account:account?publicAccount(account):null});}

  async registerRoom(request){const body=await request.json().catch(()=>({})),roomCode=String(body.roomCode||'').trim().toUpperCase();if(!/^[A-Z2-9]{14}$/.test(roomCode))return json({ok:false,error:{code:'INVALID_ROOM_CODE',message:'Room code is invalid.'}},400);const record={roomCode,mode:body.mode==='solo'?'solo':body.mode==='free'?'free':'online',createdAt:body.createdAt||this.now()};await this.storage.put(`roomRegistry:${roomCode}`,record);return json({ok:true,room:record});}

  async fetch(request){
    const path=new URL(request.url).pathname;
    try{
      if(request.method==='POST'&&path==='/register')return await this.register(request);
      if(request.method==='POST'&&path==='/verify-email')return await this.verifyEmail(request);
      if(request.method==='POST'&&path==='/resend-verification')return await this.resendVerification(request);
      if(request.method==='POST'&&path==='/login')return await this.login(request);
      if(request.method==='POST'&&path==='/logout')return await this.logout(request);
      if(request.method==='POST'&&path==='/notices/ack')return await this.acknowledgeNotice(request);
      if(request.method==='GET'&&path==='/me')return await this.me(request);
      if(request.method==='GET'&&path==='/leaderboards')return await this.leaderboard();
      if(request.method==='POST'&&path==='/internal/player-search')return await this.playerSearch(request);
      if(request.method==='POST'&&path==='/internal/player-profiles')return await this.playerProfiles(request);
      if(request.method==='POST'&&path==='/internal/active-ranked/clear')return await this.clearActiveRanked(request);
      if(request.method==='POST'&&path==='/internal/room/register')return await this.registerRoom(request);
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
