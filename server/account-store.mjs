const encoder=new TextEncoder();
const COMMON_PASSWORDS=new Set(['12345','123456','12345678','password','password1','qwerty','qwerty123','abc123','letmein','111111','000000']);
const PROVISIONAL_GAMES=10;
const SESSION_TTL_MS=1000*60*60*24*30;
const PBKDF2_ITERATIONS=100000;
const EMAIL_VERIFY_TTL_MS=1000*60*60*24;
const EMAIL_VERIFY_RESEND_MS=1000*60;
const FRIENDLY_REFERRAL_BONUS_COINS=200;
const FRIENDLY_REFERRAL_TTL_MS=1000*60*60*24*7;
const FRIENDLY_REFERRAL_QUALIFYING_GAMES=10;
const FRIENDLY_REFERRAL_NETWORK_WINDOW_MS=1000*60*60*24*7;
const FRIENDLY_REFERRAL_NETWORK_AWARD_LIMIT=3;

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const normalizeNickname=value=>String(value||'').trim().replace(/\s+/g,' ');
const nicknameKey=value=>normalizeNickname(value).toLowerCase();
const normalizeReferralDeviceId=value=>{const id=String(value||'').trim();return /^[A-Za-z0-9._:-]{8,128}$/.test(id)?id:'';};
const canonicalReferralEmail=value=>{const email=normalizeEmail(value),at=email.lastIndexOf('@');if(at<=0)return email;let local=email.slice(0,at),domain=email.slice(at+1);if(domain==='gmail.com'||domain==='googlemail.com'){local=local.split('+')[0].replace(/\./g,'');domain='gmail.com';}return `${local}@${domain}`;};
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
  const active=account.activeRanked&&typeof account.activeRanked==='object'?account.activeRanked:null,progress=account.friendlyReferralQualification&&typeof account.friendlyReferralQualification==='object'?account.friendlyReferralQualification:null,invites=Array.isArray(account.friendlyReferralInvites)?account.friendlyReferralInvites:[];
  return {id:account.id,email:account.email,nickname:account.nickname,walletCoins:account.walletCoins,forceQuits:account.forceQuits||0,computerBankruptcies:account.computerBankruptcies||0,createdAt:account.createdAt,emailVerified:account.emailVerified!==false,countryCode:account.location?.countryCode||null,regionCode:account.location?.regionCode||null,activeRanked:active?{sessionId:active.sessionId||null,mode:active.mode||null,roomCode:active.roomCode||null,startedAt:active.startedAt||null}:null,friendlyReferralProgress:progress?{inviterAccountId:progress.inviterAccountId||null,qualifyingGamesPlayed:Math.max(0,Number(progress.qualifyingGamesPlayed)||0),gamesRequired:Math.max(1,Number(progress.gamesRequired)||FRIENDLY_REFERRAL_QUALIFYING_GAMES),inviterRewardReady:!!progress.inviterRewardReadyAt,inviterRewardCollected:!!progress.inviterRewardCollectedAt}:null,friendlyReferralInvites:invites.slice(-10).map(item=>({referralId:item.referralId,friendNickname:item.friendNickname||'Friend',qualifyingGamesPlayed:Math.max(0,Number(item.qualifyingGamesPlayed)||0),gamesRequired:Math.max(1,Number(item.gamesRequired)||FRIENDLY_REFERRAL_QUALIFYING_GAMES),rewardReady:!!item.rewardReadyAt,rewardCollected:!!item.rewardCollectedAt,createdAt:item.createdAt||null})),friendCount:Array.isArray(account.friendIds)?account.friendIds.length:0,incomingFriendRequestCount:Array.isArray(account.friendRequestsIncoming)?account.friendRequestsIncoming.length:0};
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
  constructor(state,env,{cryptoApi=globalThis.crypto,now=()=>new Date().toISOString(),fetchApi=globalThis.fetch}={}){this.state=state;this.storage=state.storage;this.env=env||{};this.crypto=cryptoApi;this.now=now;this.fetchApi=fetchApi;}
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
  async referralFromToken(token){
    const value=String(token||'').trim();if(!/^[a-f0-9]{64}$/i.test(value))return null;
    const tokenHash=await hashToken(this.crypto,value),referral=await this.storage.get(`referral:${tokenHash}`);return referral?{tokenHash,referral}:null;
  }
  async activeFriendlyNetworkClaims(networkHash){
    if(!networkHash)return [];
    const key=`friendlyReferralNetwork:${networkHash}`,record=await this.storage.get(key),nowMs=Date.parse(this.now()),cutoff=nowMs-FRIENDLY_REFERRAL_NETWORK_WINDOW_MS,claims=(Array.isArray(record?.claims)?record.claims:[]).filter(item=>Number.isFinite(Date.parse(item?.createdAt))&&Date.parse(item.createdAt)>cutoff);
    if((record?.claims?.length||0)!==claims.length)await this.storage.put(key,{claims,updatedAt:this.now()});
    return claims;
  }
  async markFriendlyReferralFailure(account,reason){
    delete account.pendingFriendlyReferral;account.pendingFriendlyReferralFailure={reason:String(reason||'REFERRAL_NOT_ELIGIBLE'),createdAt:this.now()};account.updatedAt=this.now();await this.storage.put(`account:${account.id}`,account);
    return {attached:false,reason:account.pendingFriendlyReferralFailure.reason};
  }
  async createFriendlyReferral(request){
    const inviter=await this.requireAccount(request),body=await request.json().catch(()=>({})),roomCode=String(body.roomCode||'').trim().toUpperCase(),deviceId=normalizeReferralDeviceId(body.deviceId);
    if(!/^[A-Z2-9]{14}$/.test(roomCode))return json({ok:false,error:{code:'INVALID_ROOM_CODE',message:'Room code is invalid.'}},400);
    if(!deviceId)return json({ok:false,error:{code:'REFERRAL_DEVICE_REQUIRED',message:'This device cannot create a referral bonus link.'}},400);
    const registry=await this.storage.get(`roomRegistry:${roomCode}`);
    if(!registry||registry.mode!=='free')return json({ok:false,error:{code:'FRIENDLY_ROOM_REQUIRED',message:'Referral links can only be created for Friendly Play With Friend rooms.'}},409);
    const connection=connectionFromRequest(request),inviterDeviceHash=await hashToken(this.crypto,`device:${deviceId}`),inviterNetworkHash=connection?.ip?await hashToken(this.crypto,`network:${connection.ip}`):null;
    const token=randomHex(this.crypto,32),tokenHash=await hashToken(this.crypto,token),createdAt=this.now(),expiresAt=new Date(Date.parse(createdAt)+FRIENDLY_REFERRAL_TTL_MS).toISOString(),id=randomId(this.crypto,'ref');
    await this.storage.put(`referral:${tokenHash}`,{id,inviterAccountId:inviter.id,roomCode,createdAt,expiresAt,inviterDeviceHash,inviterNetworkHash,usedByAccountId:null,usedAt:null,qualifyingGamesPlayed:0,qualifyingGamesRequired:FRIENDLY_REFERRAL_QUALIFYING_GAMES,inviterRewardReadyAt:null,inviterRewardCollectedAt:null});
    return json({ok:true,referralToken:token,expiresAt});
  }
  async attachFriendlyReferral(account,token,stage,request,rawDeviceId){
    const found=await this.referralFromToken(token),offerStage=stage==='session-end'?'session-end':stage==='game10'?'game10':null;
    if(!found||!offerStage)return this.markFriendlyReferralFailure(account,'INVALID_REFERRAL');
    const {tokenHash,referral}=found,nowMs=Date.parse(this.now());
    if(referral.usedByAccountId||!Number.isFinite(Date.parse(referral.expiresAt))||Date.parse(referral.expiresAt)<=nowMs||referral.inviterAccountId===account.id)return this.markFriendlyReferralFailure(account,'REFERRAL_NOT_ELIGIBLE');
    const inviter=await this.accountById(referral.inviterAccountId);
    if(!inviter||inviter.suspended||inviter.emailVerified===false)return this.markFriendlyReferralFailure(account,'REFERRAL_NOT_ELIGIBLE');
    const deviceId=normalizeReferralDeviceId(rawDeviceId);if(!deviceId)return this.markFriendlyReferralFailure(account,'DEVICE_REQUIRED');
    const connection=connectionFromRequest(request),inviteeDeviceHash=await hashToken(this.crypto,`device:${deviceId}`),inviteeNetworkHash=connection?.ip?await hashToken(this.crypto,`network:${connection.ip}`):null,inviteeEmailHash=await hashToken(this.crypto,`email:${canonicalReferralEmail(account.email)}`);
    if(referral.inviterDeviceHash&&safeEqual(referral.inviterDeviceHash,inviteeDeviceHash))return this.markFriendlyReferralFailure(account,'SAME_DEVICE');
    if(await this.storage.get(`friendlyReferralDevice:${inviteeDeviceHash}`))return this.markFriendlyReferralFailure(account,'DEVICE_ALREADY_REWARDED');
    if(await this.storage.get(`friendlyReferralEmail:${inviteeEmailHash}`))return this.markFriendlyReferralFailure(account,'EMAIL_ALREADY_REWARDED');
    const networkClaims=await this.activeFriendlyNetworkClaims(inviteeNetworkHash);
    if(inviteeNetworkHash&&networkClaims.length>=FRIENDLY_REFERRAL_NETWORK_AWARD_LIMIT)return this.markFriendlyReferralFailure(account,'NETWORK_LIMIT');
    delete account.pendingFriendlyReferralFailure;
    account.pendingFriendlyReferral={tokenHash,referralId:referral.id,inviterAccountId:referral.inviterAccountId,roomCode:referral.roomCode,stage:offerStage,inviteeDeviceHash,inviteeNetworkHash,inviteeEmailHash,sameNetwork:!!inviteeNetworkHash&&!!referral.inviterNetworkHash&&safeEqual(inviteeNetworkHash,referral.inviterNetworkHash),attachedAt:this.now()};
    await this.storage.put(`account:${account.id}`,account);return {attached:true};
  }
  async completeFriendlyReferral(account){
    const pending=account.pendingFriendlyReferral;
    if(!pending){
      const failure=account.pendingFriendlyReferralFailure;if(!failure)return null;delete account.pendingFriendlyReferralFailure;account.updatedAt=this.now();await this.storage.put(`account:${account.id}`,account);return {eligible:false,reason:failure.reason,inviteeCoins:0};
    }
    if(account.friendlyReferralSignupAwardedAt)return null;
    const referral=await this.storage.get(`referral:${pending.tokenHash}`),createdAt=this.now();
    if(!referral||referral.id!==pending.referralId||referral.inviterAccountId!==pending.inviterAccountId||referral.usedByAccountId&&referral.usedByAccountId!==account.id||Date.parse(referral.expiresAt)<=Date.parse(createdAt)){await this.markFriendlyReferralFailure(account,'REFERRAL_NOT_ELIGIBLE');return {eligible:false,reason:'REFERRAL_NOT_ELIGIBLE',inviteeCoins:0};}
    const inviter=await this.accountById(referral.inviterAccountId);
    if(!inviter||inviter.id===account.id||inviter.suspended||inviter.emailVerified===false){await this.markFriendlyReferralFailure(account,'REFERRAL_NOT_ELIGIBLE');return {eligible:false,reason:'REFERRAL_NOT_ELIGIBLE',inviteeCoins:0};}
    if(!pending.inviteeDeviceHash||await this.storage.get(`friendlyReferralDevice:${pending.inviteeDeviceHash}`)){await this.markFriendlyReferralFailure(account,'DEVICE_ALREADY_REWARDED');return {eligible:false,reason:'DEVICE_ALREADY_REWARDED',inviteeCoins:0};}
    if(!pending.inviteeEmailHash||await this.storage.get(`friendlyReferralEmail:${pending.inviteeEmailHash}`)){await this.markFriendlyReferralFailure(account,'EMAIL_ALREADY_REWARDED');return {eligible:false,reason:'EMAIL_ALREADY_REWARDED',inviteeCoins:0};}
    const networkClaims=await this.activeFriendlyNetworkClaims(pending.inviteeNetworkHash);
    if(pending.inviteeNetworkHash&&networkClaims.length>=FRIENDLY_REFERRAL_NETWORK_AWARD_LIMIT){await this.markFriendlyReferralFailure(account,'NETWORK_LIMIT');return {eligible:false,reason:'NETWORK_LIMIT',inviteeCoins:0};}
    referral.usedByAccountId=account.id;referral.usedAt=createdAt;referral.stage=pending.stage;referral.inviteeDeviceHash=pending.inviteeDeviceHash;referral.inviteeNetworkHash=pending.inviteeNetworkHash;referral.inviteeEmailHash=pending.inviteeEmailHash;referral.sameNetwork=!!pending.sameNetwork;referral.qualifyingGamesPlayed=0;referral.qualifyingGamesRequired=FRIENDLY_REFERRAL_QUALIFYING_GAMES;referral.inviterRewardReadyAt=null;referral.inviterRewardCollectedAt=null;
    const inviteeBefore=Number(account.walletCoins)||0;account.walletCoins=inviteeBefore+FRIENDLY_REFERRAL_BONUS_COINS;account.friendlyReferralSignupAwardedAt=createdAt;account.friendlyReferralQualification={referralId:referral.id,tokenHash:pending.tokenHash,inviterAccountId:inviter.id,roomCode:referral.roomCode,sourceStage:pending.stage,signupAt:createdAt,qualifyingGamesPlayed:0,gamesRequired:FRIENDLY_REFERRAL_QUALIFYING_GAMES,inviterRewardReadyAt:null,inviterRewardCollectedAt:null};account.updatedAt=createdAt;delete account.pendingFriendlyReferral;delete account.pendingFriendlyReferralFailure;
    await this.storage.put(`referral:${pending.tokenHash}`,referral);await this.storage.put(`account:${account.id}`,account);
    await this.storage.put(`friendlyReferralDevice:${pending.inviteeDeviceHash}`,{accountId:account.id,referralId:referral.id,createdAt});
    await this.storage.put(`friendlyReferralEmail:${pending.inviteeEmailHash}`,{accountId:account.id,referralId:referral.id,createdAt});
    if(pending.inviteeNetworkHash){const claims=[...networkClaims,{accountId:account.id,referralId:referral.id,createdAt}];await this.storage.put(`friendlyReferralNetwork:${pending.inviteeNetworkHash}`,{claims,updatedAt:createdAt});}
    await this.appendLedger(account.id,{type:'friendly-referral-signup',amount:FRIENDLY_REFERRAL_BONUS_COINS,createdAt,referralId:referral.id,inviterAccountId:inviter.id,stage:pending.stage});
    const noticeId=`friendly-referral-signup:${referral.id}:${account.id}`,notice={id:noticeId,type:'friendly-referral-signup-complete',coins:FRIENDLY_REFERRAL_BONUS_COINS,friendAccountId:account.id,friendNickname:account.nickname,referralId:referral.id,roomCode:referral.roomCode,stage:pending.stage,qualifyingGamesPlayed:0,qualifyingGamesRequired:FRIENDLY_REFERRAL_QUALIFYING_GAMES,createdAt};
    const inviteProgress={referralId:referral.id,friendAccountId:account.id,friendNickname:account.nickname,qualifyingGamesPlayed:0,gamesRequired:FRIENDLY_REFERRAL_QUALIFYING_GAMES,rewardReadyAt:null,rewardCollectedAt:null,createdAt};
    inviter.friendlyReferralInvites=[...(Array.isArray(inviter.friendlyReferralInvites)?inviter.friendlyReferralInvites:[]).filter(item=>item?.referralId!==referral.id),inviteProgress].slice(-50);
    inviter.pendingNotices=[...(Array.isArray(inviter.pendingNotices)?inviter.pendingNotices:[]).filter(item=>item?.id!==noticeId),notice];inviter.updatedAt=createdAt;await this.storage.put(`account:${inviter.id}`,inviter);
    return {eligible:true,inviteeCoins:FRIENDLY_REFERRAL_BONUS_COINS,inviterAccountId:inviter.id,inviterNickname:inviter.nickname,friendAccountId:account.id,friendNickname:account.nickname,stage:pending.stage,inviterRewardPending:true,qualifyingGamesRequired:FRIENDLY_REFERRAL_QUALIFYING_GAMES};
  }
  async progressFriendlyReferralForGame(account,game){
    const progress=account?.friendlyReferralQualification;if(!progress||progress.inviterRewardReadyAt||progress.inviterRewardCollectedAt)return null;
    if(!['solo','online'].includes(String(game?.mode||'')))return null;
    if(Number.isFinite(Date.parse(progress.signupAt))&&Number.isFinite(Date.parse(game?.recordedAt))&&Date.parse(game.recordedAt)<Date.parse(progress.signupAt))return null;
    const participants=Array.isArray(game?.participants)?game.participants:[];if(!participants.some(item=>String(item?.accountId||'')===String(account.id)))return null;
    if(participants.some(item=>String(item?.accountId||'')===String(progress.inviterAccountId)))return null;
    const gameId=String(game?.gameId||'');if(!gameId)return null;const countedKey=`friendlyReferralGame:${progress.referralId}:${gameId}`;if(await this.storage.get(countedKey))return null;
    const createdAt=this.now(),required=Math.max(1,Number(progress.gamesRequired)||FRIENDLY_REFERRAL_QUALIFYING_GAMES);await this.storage.put(countedKey,{accountId:account.id,referralId:progress.referralId,gameId,createdAt});
    progress.qualifyingGamesPlayed=Math.min(required,Math.max(0,Number(progress.qualifyingGamesPlayed)||0)+1);account.friendlyReferralQualification=progress;account.updatedAt=createdAt;
    const referral=progress.tokenHash?await this.storage.get(`referral:${progress.tokenHash}`):null;if(referral){referral.qualifyingGamesPlayed=progress.qualifyingGamesPlayed;referral.qualifyingGamesRequired=required;}
    const inviter=await this.accountById(progress.inviterAccountId);
    if(inviter){
      const invites=Array.isArray(inviter.friendlyReferralInvites)?inviter.friendlyReferralInvites:[],invite=invites.find(item=>item?.referralId===progress.referralId);
      if(invite){invite.friendNickname=account.nickname;invite.qualifyingGamesPlayed=progress.qualifyingGamesPlayed;invite.gamesRequired=required;}
      if(progress.qualifyingGamesPlayed>=required){
        progress.inviterRewardReadyAt=progress.inviterRewardReadyAt||createdAt;if(referral)referral.inviterRewardReadyAt=referral.inviterRewardReadyAt||progress.inviterRewardReadyAt;if(invite)invite.rewardReadyAt=invite.rewardReadyAt||progress.inviterRewardReadyAt;
        const noticeId=`friendly-referral-ready:${progress.referralId}:${account.id}`,notice={id:noticeId,type:'friendly-referral-collect',coins:FRIENDLY_REFERRAL_BONUS_COINS,friendAccountId:account.id,friendNickname:account.nickname,referralId:progress.referralId,roomCode:progress.roomCode,stage:'qualification',qualifyingGamesPlayed:progress.qualifyingGamesPlayed,qualifyingGamesRequired:required,createdAt,collectedAt:null};inviter.pendingNotices=[...(Array.isArray(inviter.pendingNotices)?inviter.pendingNotices:[]).filter(item=>item?.id!==noticeId),notice];
      }
      inviter.updatedAt=createdAt;await this.storage.put(`account:${inviter.id}`,inviter);
    }
    await this.storage.put(`account:${account.id}`,account);if(referral)await this.storage.put(`referral:${progress.tokenHash}`,referral);return {qualifyingGamesPlayed:progress.qualifyingGamesPlayed,qualifyingGamesRequired:required,rewardReady:!!progress.inviterRewardReadyAt};
  }
  async progressFriendlyReferralsForGame(game){
    const seen=new Set();for(const item of Array.isArray(game?.participants)?game.participants:[]){const accountId=String(item?.accountId||'');if(!accountId||seen.has(accountId))continue;seen.add(accountId);const account=await this.accountById(accountId);if(account)await this.progressFriendlyReferralForGame(account,game);}
  }
  async collectFriendlyReferral(request){
    const account=await this.requireAccount(request),body=await request.json().catch(()=>({})),noticeId=String(body.noticeId||''),notices=Array.isArray(account.pendingNotices)?account.pendingNotices:[],notice=notices.find(item=>item?.id===noticeId&&item?.type==='friendly-referral-collect');
    if(!notice)return json({ok:false,error:{code:'REFERRAL_REWARD_NOT_FOUND',message:'This referral reward is no longer available.'}},404);
    if(notice.collectedAt)return json({ok:true,duplicate:true,collectedCoins:0,account:publicAccount(account),notices:this.noticeList(account),notice});
    if(Math.max(0,Number(notice.qualifyingGamesPlayed)||0)<Math.max(1,Number(notice.qualifyingGamesRequired)||FRIENDLY_REFERRAL_QUALIFYING_GAMES))return json({ok:false,error:{code:'REFERRAL_GAMES_REQUIRED',message:'Your friend has not completed the required games yet.'}},409);
    const createdAt=this.now(),walletBefore=Number(account.walletCoins)||0,walletAfter=walletBefore+FRIENDLY_REFERRAL_BONUS_COINS;account.walletCoins=walletAfter;account.updatedAt=createdAt;notice.collectedAt=createdAt;notice.walletBefore=walletBefore;notice.walletAfter=walletAfter;
    const invite=(Array.isArray(account.friendlyReferralInvites)?account.friendlyReferralInvites:[]).find(item=>item?.referralId===notice.referralId);if(invite){invite.rewardReadyAt=invite.rewardReadyAt||notice.createdAt||createdAt;invite.rewardCollectedAt=createdAt;invite.qualifyingGamesPlayed=Math.max(Number(invite.qualifyingGamesPlayed)||0,Number(notice.qualifyingGamesPlayed)||0);}
    const friend=notice.friendAccountId?await this.accountById(notice.friendAccountId):null;if(friend?.friendlyReferralQualification?.referralId===notice.referralId){friend.friendlyReferralQualification.inviterRewardCollectedAt=createdAt;friend.updatedAt=createdAt;await this.storage.put(`account:${friend.id}`,friend);const tokenHash=friend.friendlyReferralQualification.tokenHash;if(tokenHash){const referral=await this.storage.get(`referral:${tokenHash}`);if(referral){referral.inviterRewardCollectedAt=createdAt;await this.storage.put(`referral:${tokenHash}`,referral);}}}
    await this.storage.put(`account:${account.id}`,account);await this.appendLedger(account.id,{type:'friendly-referral-invite',amount:FRIENDLY_REFERRAL_BONUS_COINS,createdAt,referralId:notice.referralId,friendAccountId:notice.friendAccountId,stage:'qualification'});
    return json({ok:true,collectedCoins:FRIENDLY_REFERRAL_BONUS_COINS,account:publicAccount(account),notices:this.noticeList(account),notice});
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
    const signupAwarded=await this.awardSignup(account),dailyAwarded=await this.awardDaily(account,request),referral=await this.completeFriendlyReferral(account),session=await this.createSession(account);await this.recordConnection(account,request,'verify-email');
    return json({ok:true,account:publicAccount(account),session,awards:{signupCoins:signupAwarded?100:0,dailyCoins:dailyAwarded?100:0,referralCoins:referral?.inviteeCoins||0},referral,notices:this.noticeList(account)});
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
    const email=normalizeEmail(body.email),nickname=normalizeNickname(body.nickname),password=String(body.password||''),confirm=String(body.confirmPassword??password),referralToken=String(body.referralToken||''),referralStage=String(body.referralStage||''),referralDeviceId=normalizeReferralDeviceId(body.deviceId);
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
    if(referralToken&&referralStage)await this.attachFriendlyReferral(account,referralToken,referralStage,request,referralDeviceId);
    if(verificationRequired){try{const sent=await this.sendVerificationEmail(account,{bypassRateLimit:true});return json({ok:true,verificationPending:true,email:account.email,emailSent:sent.sent,expiresAt:sent.expiresAt},202);}catch(error){return json({ok:false,error:{code:error.code||'EMAIL_SEND_FAILED',message:error.message,email:account.email}},error.status||503);}}
    await this.appendLedger(id,{type:'signup',amount:100,createdAt:this.now()});account.signupAwardedAt=this.now();await this.storage.put(`account:${id}`,account);await this.awardDaily(account,request);const referral=await this.completeFriendlyReferral(account);
    const session=await this.createSession(account);await this.recordConnection(account,request,'register');
    return json({ok:true,account:publicAccount(account),session,awards:{signupCoins:100,dailyCoins:100,referralCoins:referral?.inviteeCoins||0},referral,notices:this.noticeList(account)},201);
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

  socialIds(account,key){return [...new Set((Array.isArray(account?.[key])?account[key]:[]).map(item=>typeof item==='string'?item:item?.accountId).filter(Boolean).map(String))];}
  socialRequestEntries(account,key){return (Array.isArray(account?.[key])?account[key]:[]).map(item=>typeof item==='string'?{accountId:item,createdAt:null}:item).filter(item=>item?.accountId).map(item=>({accountId:String(item.accountId),createdAt:item.createdAt||null}));}
  friendState(account,targetId){
    const id=String(targetId||'');if(!id)return 'none';if(id===String(account?.id||''))return 'self';
    if(this.socialIds(account,'friendIds').includes(id))return 'friend';
    if(this.socialRequestEntries(account,'friendRequestsIncoming').some(item=>item.accountId===id))return 'incoming';
    if(this.socialRequestEntries(account,'friendRequestsOutgoing').some(item=>item.accountId===id))return 'outgoing';
    return 'none';
  }
  async socialHistory(accountId){
    const result=new Map(),touch=(otherId,recordedAt,delta={})=>{const id=String(otherId||'');if(!id||id===String(accountId))return;let row=result.get(id);if(!row){row={accountId:id,gamesPlayedTogether:0,wins:0,losses:0,draws:0,coinsWon:0,coinsLost:0,lastPlayedAt:null};result.set(id,row);}row.gamesPlayedTogether+=Number(delta.game)||0;row.wins+=Number(delta.win)||0;row.losses+=Number(delta.loss)||0;row.draws+=Number(delta.draw)||0;row.coinsWon+=Math.max(0,Number(delta.coinsWon)||0);row.coinsLost+=Math.max(0,Number(delta.coinsLost)||0);if(recordedAt&&(!row.lastPlayedAt||Date.parse(recordedAt)>Date.parse(row.lastPlayedAt)))row.lastPlayedAt=recordedAt;};
    const games=[...(await this.storage.list({prefix:'game:'})).values()];
    for(const game of games){
      const recordedAt=game?.recordedAt||null,participants=Array.isArray(game?.participants)?game.participants:[],mine=participants.find(item=>String(item?.accountId||'')===String(accountId));
      if(mine&&participants.length>=2){
        const winnerId=String(game.winnerPlayerId||''),hasWinner=!!winnerId||participants.some(item=>item?.won===true),mineWon=mine.won===true||!!winnerId&&String(mine.playerId||'')===winnerId;
        for(const other of participants)if(other!==mine&&other?.accountId){const walletDelta=Number(mine.walletDelta)||0;touch(other.accountId,recordedAt,{game:1,win:mineWon?1:0,loss:hasWinner&&!mineWon?1:0,draw:hasWinner?0:1,coinsWon:walletDelta>0?walletDelta:0,coinsLost:walletDelta<0?Math.abs(walletDelta):0});}
        continue;
      }
      if(game?.type==='abandonment'){
        const quitter=String(game.accountId||''),opponent=String(game.opponentAccountId||'');if(!opponent)continue;
        if(quitter===String(accountId))touch(opponent,recordedAt,{game:1,loss:game.settlementType==='nagari'?0:1,draw:game.settlementType==='nagari'?1:0,coinsLost:Math.max(0,Number(game.penaltyCoins)||0)});
        else if(opponent===String(accountId))touch(quitter,recordedAt,{game:1,win:game.settlementType==='nagari'?0:1,draw:game.settlementType==='nagari'?1:0,coinsWon:Math.max(0,Number(game.opponentRewardCoins??game.fairPoints)||0)});
      }
    }
    return [...result.values()].sort((a,b)=>Date.parse(b.lastPlayedAt||0)-Date.parse(a.lastPlayedAt||0)||b.gamesPlayedTogether-a.gamesPlayedTogether);
  }
  socialSkillSimilarity(a,b){
    const aStats=canonicalGlobalStats(a),bStats=canonicalGlobalStats(b),rate=x=>{const g=Math.max(0,Number(x.gamesPlayed)||0);return g?(Number(x.totalCoinsWon)||0)/g:0;},gap=(x,y,floor)=>Math.abs(x-y)/Math.max(floor,Math.abs(x),Math.abs(y));
    const d=gap(rate(aStats),rate(bStats),1)*.55+gap(Number(aStats.gamesPlayed)||0,Number(bStats.gamesPlayed)||0,10)*.25+gap(Number(a.walletCoins)||0,Number(b.walletCoins)||0,100)*.20;
    return Math.max(0,Math.min(100,Math.round((1-d)*100)));
  }
  async socialProfileMap(account,ids){
    const profiles=await this.directoryProfiles({requesterAccountId:account.id,accountIds:[...new Set(ids.map(String).filter(Boolean))]}),map=new Map(profiles.map(item=>[String(item.accountId),item]));
    return map;
  }
  async socialSnapshot(request){
    const account=await this.requireAccount(request),friends=this.socialIds(account,'friendIds'),incoming=this.socialRequestEntries(account,'friendRequestsIncoming'),outgoing=this.socialRequestEntries(account,'friendRequestsOutgoing'),history=await this.socialHistory(account.id);
    const allAccounts=[...(await this.storage.list({prefix:'account:'})).values()].filter(item=>item?.id&&item.id!==account.id&&!item.suspended&&item.emailVerified!==false),friendSet=new Set(friends),pendingSet=new Set([...incoming,...outgoing].map(item=>item.accountId)),myFriends=new Set(friends),historyById=new Map(history.map(item=>[item.accountId,item]));
    const referralBoost=new Set([...(Array.isArray(account.friendlyReferralInvites)?account.friendlyReferralInvites:[]).map(item=>String(item.friendAccountId||'')),String(account.friendlyReferralQualification?.inviterAccountId||'')].filter(Boolean)),candidates=[];
    for(const candidate of allAccounts){
      if(friendSet.has(candidate.id)||pendingSet.has(candidate.id))continue;
      const candidateFriends=new Set(this.socialIds(candidate,'friendIds')),mutualFriends=[...candidateFriends].filter(id=>myFriends.has(id)).length,h=historyById.get(candidate.id),similarity=this.socialSkillSimilarity(account,candidate),played=Math.min(20,Number(h?.gamesPlayedTogether)||0),recent=Number.isFinite(Date.parse(h?.lastPlayedAt))?Math.max(0,10-Math.floor((Date.parse(this.now())-Date.parse(h.lastPlayedAt))/(1000*60*60*24*7))):0,referral=referralBoost.has(candidate.id)?1:0,score=similarity*.5+Math.min(20,played*3)+Math.min(15,mutualFriends*5)+recent+referral*15;
      let reason;if(referral)reason=account.friendlyReferralQualification?.inviterAccountId===candidate.id?'Invited you to GoStop Live':'You invited this player';else if(played)reason='Played '+played+' game'+(played===1?'':'s')+' together';else if(mutualFriends)reason=mutualFriends+' mutual friend'+(mutualFriends===1?'':'s');else reason=similarity+'% skill match';
      candidates.push({accountId:candidate.id,recommendationScore:Math.round(score),similarity,mutualFriends,playedTogether:played,lastPlayedAt:h?.lastPlayedAt||null,reason});
    }
    candidates.sort((a,b)=>b.recommendationScore-a.recommendationScore||b.similarity-a.similarity);
    const recommendationIds=candidates.slice(0,12).map(item=>item.accountId),ids=[...friends,...incoming.map(x=>x.accountId),...outgoing.map(x=>x.accountId),...history.slice(0,50).map(x=>x.accountId),...recommendationIds],profiles=await this.socialProfileMap(account,ids);
    const decorate=(id,extra={})=>{const profile=profiles.get(String(id));return profile?{...profile,friendState:this.friendState(account,id),...extra}:null;};
    return json({ok:true,friends:friends.map(id=>decorate(id)).filter(Boolean),incoming:incoming.map(item=>decorate(item.accountId,{requestCreatedAt:item.createdAt})).filter(Boolean),outgoing:outgoing.map(item=>decorate(item.accountId,{requestCreatedAt:item.createdAt})).filter(Boolean),history:history.slice(0,50).map(item=>decorate(item.accountId,item)).filter(Boolean),recommendations:candidates.slice(0,12).map(item=>decorate(item.accountId,item)).filter(Boolean)});
  }
  async socialSearch(request){
    const account=await this.requireAccount(request),body=await request.json().catch(()=>({})),query=String(body.query||'').trim();if(!query)return json({ok:true,players:[]});
    const players=(await this.directoryProfiles({requesterAccountId:account.id,query})).filter(item=>item.accountId!==account.id).slice(0,20).map(item=>({...item,friendState:this.friendState(account,item.accountId)}));return json({ok:true,players});
  }
  async sendFriendRequest(request){
    const account=await this.requireAccount(request),body=await request.json().catch(()=>({})),targetId=String(body.accountId||''),target=await this.accountById(targetId);
    if(!target||target.suspended||target.emailVerified===false)return json({ok:false,error:{code:'PLAYER_NOT_FOUND',message:'Player not found.'}},404);
    if(target.id===account.id)return json({ok:false,error:{code:'FRIEND_SELF',message:'You cannot friend yourself.'}},400);
    if(this.socialIds(account,'friendIds').includes(target.id))return json({ok:true,state:'friend',account:publicAccount(account)});
    const now=this.now(),targetIncoming=this.socialRequestEntries(target,'friendRequestsIncoming'),targetOutgoing=this.socialRequestEntries(target,'friendRequestsOutgoing'),myIncoming=this.socialRequestEntries(account,'friendRequestsIncoming'),myOutgoing=this.socialRequestEntries(account,'friendRequestsOutgoing');
    if(myIncoming.some(item=>item.accountId===target.id)||targetOutgoing.some(item=>item.accountId===account.id)){
      account.friendIds=[...new Set([...this.socialIds(account,'friendIds'),target.id])];target.friendIds=[...new Set([...this.socialIds(target,'friendIds'),account.id])];
      account.friendRequestsIncoming=myIncoming.filter(item=>item.accountId!==target.id);account.friendRequestsOutgoing=myOutgoing.filter(item=>item.accountId!==target.id);target.friendRequestsIncoming=targetIncoming.filter(item=>item.accountId!==account.id);target.friendRequestsOutgoing=targetOutgoing.filter(item=>item.accountId!==account.id);account.updatedAt=now;target.updatedAt=now;await this.storage.put('account:'+account.id,account);await this.storage.put('account:'+target.id,target);return json({ok:true,state:'friend',autoAccepted:true,account:publicAccount(account)});
    }
    if(!myOutgoing.some(item=>item.accountId===target.id))account.friendRequestsOutgoing=[...myOutgoing,{accountId:target.id,createdAt:now}].slice(-100);
    if(!targetIncoming.some(item=>item.accountId===account.id))target.friendRequestsIncoming=[...targetIncoming,{accountId:account.id,createdAt:now}].slice(-100);
    account.updatedAt=now;target.updatedAt=now;await this.storage.put('account:'+account.id,account);await this.storage.put('account:'+target.id,target);return json({ok:true,state:'outgoing',account:publicAccount(account)});
  }
  async respondFriendRequest(request){
    const account=await this.requireAccount(request),body=await request.json().catch(()=>({})),targetId=String(body.accountId||''),accept=body.accept===true,target=await this.accountById(targetId),incoming=this.socialRequestEntries(account,'friendRequestsIncoming');
    if(!target||!incoming.some(item=>item.accountId===targetId))return json({ok:false,error:{code:'FRIEND_REQUEST_NOT_FOUND',message:'Friend request not found.'}},404);
    const now=this.now();account.friendRequestsIncoming=incoming.filter(item=>item.accountId!==targetId);target.friendRequestsOutgoing=this.socialRequestEntries(target,'friendRequestsOutgoing').filter(item=>item.accountId!==account.id);
    if(accept){account.friendIds=[...new Set([...this.socialIds(account,'friendIds'),target.id])];target.friendIds=[...new Set([...this.socialIds(target,'friendIds'),account.id])];}
    account.updatedAt=now;target.updatedAt=now;await this.storage.put('account:'+account.id,account);await this.storage.put('account:'+target.id,target);return json({ok:true,state:accept?'friend':'none',account:publicAccount(account)});
  }
  async unfriend(request){
    const account=await this.requireAccount(request),body=await request.json().catch(()=>({})),targetId=String(body.accountId||''),target=await this.accountById(targetId);
    account.friendIds=this.socialIds(account,'friendIds').filter(id=>id!==targetId);account.friendRequestsIncoming=this.socialRequestEntries(account,'friendRequestsIncoming').filter(item=>item.accountId!==targetId);account.friendRequestsOutgoing=this.socialRequestEntries(account,'friendRequestsOutgoing').filter(item=>item.accountId!==targetId);account.updatedAt=this.now();await this.storage.put('account:'+account.id,account);
    if(target){target.friendIds=this.socialIds(target,'friendIds').filter(id=>id!==account.id);target.friendRequestsIncoming=this.socialRequestEntries(target,'friendRequestsIncoming').filter(item=>item.accountId!==account.id);target.friendRequestsOutgoing=this.socialRequestEntries(target,'friendRequestsOutgoing').filter(item=>item.accountId!==account.id);target.updatedAt=this.now();await this.storage.put('account:'+target.id,target);}
    return json({ok:true,state:'none',account:publicAccount(account)});
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
    const game={...body,participants:storedParticipants,recordedAt};await this.storage.put(`game:${body.gameId}`,game);await this.progressFriendlyReferralsForGame(game);return json({ok:true,game});
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
      if(request.method==='POST'&&path==='/referrals/create')return await this.createFriendlyReferral(request);
      if(request.method==='POST'&&path==='/referrals/collect')return await this.collectFriendlyReferral(request);
      if(request.method==='GET'&&path==='/social')return await this.socialSnapshot(request);
      if(request.method==='POST'&&path==='/social/search')return await this.socialSearch(request);
      if(request.method==='POST'&&path==='/social/request')return await this.sendFriendRequest(request);
      if(request.method==='POST'&&path==='/social/respond')return await this.respondFriendRequest(request);
      if(request.method==='POST'&&path==='/social/unfriend')return await this.unfriend(request);
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
