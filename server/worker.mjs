export {GameRoom} from './game-room.mjs';
export {AccountStore} from './ranked-account-store.mjs';
export {Lobby} from './lobby.mjs';
export {BackupStore} from './backup-store.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode(cryptoApi){const bytes=new Uint8Array(14),limit=256-(256%alphabet.length);cryptoApi.getRandomValues(bytes);let result='';for(const byte of bytes){if(byte>=limit)return roomCode(cryptoApi);result+=alphabet[byte%alphabet.length];}return result;}
export function configuredOrigins(env){return new Set(String(env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean));}
export function configuredAdminOrigins(env){return new Set(String(env.ADMIN_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean));}
export function isAllowedAdminOrigin(origin,env){if(!origin)return false;try{const url=new URL(origin);if(url.origin!==origin)return false;if((url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]')&&['http:','https:'].includes(url.protocol))return true;if(url.protocol==='https:'&&(url.hostname==='gostoplive.com'||url.hostname==='www.gostoplive.com'||url.hostname==='admin.gostoplive.com'))return true;return configuredAdminOrigins(env).has(origin);}catch(_){return false;}}
export function isAllowedOrigin(origin,env){if(!origin)return false;try{const url=new URL(origin);if(url.origin!==origin)return false;if((url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]')&&['http:','https:'].includes(url.protocol))return true;if(url.protocol==='https:'&&(url.hostname==='gostoplive.com'||url.hostname==='www.gostoplive.com'||url.hostname==='jongshin0202.github.io'))return true;if(url.protocol==='https:'&&url.hostname.endsWith('.vercel.app')&&(url.hostname==='gostop.vercel.app'||url.hostname.startsWith('gostop-')))return true;return configuredOrigins(env).has(origin);}catch(_){return false;}}
const corsHeaders=origin=>({'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type,authorization','access-control-max-age':'86400','vary':'Origin'});
const safeTokenEqual=(a,b)=>{a=String(a||'');b=String(b||'');if(!a||!b||a.length!==b.length)return false;let diff=0;for(let i=0;i<a.length;i++)diff|=a.charCodeAt(i)^b.charCodeAt(i);return diff===0;};
const adminAuthorized=(request,env)=>{const auth=request.headers.get('Authorization')||'',token=auth.startsWith('Bearer ')?auth.slice(7).trim():'';return !!env.ADMIN_TOKEN&&safeTokenEqual(token,env.ADMIN_TOKEN);};
function withCors(response,origin){const next=new Response(response.body,response);for(const [key,value] of Object.entries(corsHeaders(origin)))next.headers.set(key,value);return next;}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
const accountStub=env=>env.ACCOUNT_STORE.get(env.ACCOUNT_STORE.idFromName('global'));
async function registerAllocatedRoom(env,roomCodeValue,mode){try{await accountStub(env).fetch(new Request('https://accounts/internal/room/register',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({roomCode:roomCodeValue,mode})}));}catch(_){}}
const coarseCode=(value,max=8)=>{const code=String(value||'').trim().toUpperCase();return code&&new RegExp(`^[A-Z0-9-]{1,${max}}$`).test(code)?code:null;};
function geoHeadersFor(request){const headers=new Headers(),country=coarseCode(request.cf?.country||request.headers.get('CF-IPCountry'),2),region=coarseCode(request.cf?.regionCode),regionName=String(request.cf?.region||'').trim(),city=String(request.cf?.city||'').trim(),postalCode=String(request.cf?.postalCode||'').trim(),timeZone=String(request.cf?.timezone||'').trim(),ip=String(request.headers.get('CF-Connecting-IP')||'').trim();if(country)headers.set('x-gostop-country',country);if(region)headers.set('x-gostop-region',region);if(regionName&&regionName.length<=80)headers.set('x-gostop-region-name',regionName);if(city&&city.length<=100)headers.set('x-gostop-city',city);if(postalCode&&postalCode.length<=24)headers.set('x-gostop-postal',postalCode);if(timeZone&&timeZone.length<=64&&/^[A-Za-z0-9_+./-]+$/.test(timeZone))headers.set('x-gostop-timezone',timeZone);if(ip&&ip.length<=64)headers.set('x-gostop-ip',ip);return headers;}
function copyGeoHeaders(source,target){for(const name of ['x-gostop-country','x-gostop-region','x-gostop-region-name','x-gostop-city','x-gostop-postal','x-gostop-timezone','x-gostop-ip']){const value=source.get(name);if(value)target.set(name,value);}return target;}
async function forwardAccount(request,env,path){const headers=geoHeadersFor(request),auth=request.headers.get('Authorization');if(auth)headers.set('Authorization',auth);headers.set('x-gostop-event',path.replace(/^\//,'')||'request');if(request.headers.get('content-type'))headers.set('content-type',request.headers.get('content-type'));const init={method:request.method,headers};if(!['GET','HEAD'].includes(request.method))init.body=await request.text();return accountStub(env).fetch(new Request(`https://accounts${path}`,init));}
async function forwardAdmin(request,env,path){const headers=geoHeadersFor(request);headers.set('x-gostop-admin','1');headers.set('x-gostop-event','admin');if(request.headers.get('content-type'))headers.set('content-type',request.headers.get('content-type'));const init={method:request.method,headers};if(!['GET','HEAD'].includes(request.method))init.body=await request.text();return accountStub(env).fetch(new Request(`https://accounts/admin${path}`,init));}
async function reconcileActiveRanked(env,account){
  const active=account?.activeRanked;if(!active?.roomCode||!active?.sessionId||!account?.id)return account;
  try{
    const room=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(active.roomCode)),response=await room.fetch(new Request('https://room/reconcile-active',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:account.id,sessionId:active.sessionId})}));
    if(!response.ok)return account;const status=await response.json();
    if(status.active!==false)return {...account,activeRanked:{...active,connected:status.connected!==false,reconnectUntil:Number(status.reconnectUntil)||null,runtimeOrphanUntil:Number(status.runtimeOrphanUntil)||null}};
    const cleared=await accountStub(env).fetch(new Request('https://accounts/internal/active-ranked/clear',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:account.id,sessionId:active.sessionId})}));
    if(!cleared.ok)return account;return (await cleared.json()).account||account;
  }catch(_){return account;}
}
async function resolveAccount(request,env){const auth=request.headers.get('Authorization');if(!auth)return null;const headers=geoHeadersFor(request);headers.set('Authorization',auth);headers.set('x-gostop-event','game-resolve');const response=await accountStub(env).fetch(new Request('https://accounts/internal/resolve',{headers}));if(!response.ok)return null;return reconcileActiveRanked(env,(await response.json()).account||null);}
async function requireAccount(request,env){const account=await resolveAccount(request,env);return account||null;}
async function allocateRoom(env,{solo=false,account=null}={}){
  for(let attempt=0;attempt<5;attempt++){
    const code=roomCode(globalThis.crypto),stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code)),path=solo?'/initialize-solo':'/initialize',body=solo?{roomCode:code}:{roomCode:code,account};
    const response=await stub.fetch(new Request(`https://room${path}`,{method:'POST',body:JSON.stringify(body),headers:{'content-type':'application/json'}}));if(response.status!==409){if(response.ok)await registerAllocatedRoom(env,code,solo?'solo':account?'online':'free');return response;}
  }
  return json({ok:false,error:{code:'ROOM_CODE_EXHAUSTED',message:'Could not allocate a room code.'}},503);
}
export default {async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin'),adminRoute=/^\/api\/admin(?:\/|$)/.test(url.pathname),apiRoute=/^\/api\/(?:rooms|solo|auth|account|referrals|social|me|leaderboards|player-profile|lobby|admin)(?:\/|$)/.test(url.pathname);
  if(adminRoute&&origin&&!isAllowedAdminOrigin(origin,env))return json({ok:false,error:{code:'ADMIN_ORIGIN_NOT_ALLOWED',message:'Admin origin is not allowed.'}},403);
  if(apiRoute&&!adminRoute&&!isAllowedOrigin(origin,env))return json({ok:false,error:{code:'ORIGIN_NOT_ALLOWED',message:'Request origin is not allowed.'}},403);
  if(request.method==='OPTIONS'){
    if(!apiRoute)return json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404);
    const requestedMethod=request.headers.get('Access-Control-Request-Method'),requestedHeaders=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
    if(!['GET','POST'].includes(requestedMethod)||requestedHeaders.some(header=>!['content-type','authorization'].includes(header)))return withCors(json({ok:false,error:{code:'CORS_PREFLIGHT_REJECTED',message:'Requested CORS method or headers are not allowed.'}},403),origin);
    return new Response(null,{status:204,headers:corsHeaders(origin)});
  }
  let match;
  try{
    if(url.pathname==='/api/admin/health'&&request.method==='GET'){
      if(!env.ADMIN_TOKEN)return withCors(json({ok:false,error:{code:'ADMIN_NOT_CONFIGURED',message:'ADMIN_TOKEN is not configured.'}},503),origin);
      if(!adminAuthorized(request,env))return withCors(json({ok:false,error:{code:'ADMIN_AUTH_REQUIRED',message:'Admin authorization required.'}},401),origin);
      return withCors(json({ok:true,service:'gostop-authority',admin:true}),origin);
    }
    if(url.pathname.startsWith('/api/admin/')){
      if(!env.ADMIN_TOKEN)return withCors(json({ok:false,error:{code:'ADMIN_NOT_CONFIGURED',message:'ADMIN_TOKEN is not configured.'}},503),origin);
      if(!adminAuthorized(request,env))return withCors(json({ok:false,error:{code:'ADMIN_AUTH_REQUIRED',message:'Admin authorization required.'}},401),origin);
      return withCors(await forwardAdmin(request,env,url.pathname.slice('/api/admin'.length)+url.search),origin);
    }
    if(request.method==='GET'&&url.pathname==='/api/lobby/ws'){
      const headers=new Headers(request.headers);copyGeoHeaders(geoHeadersFor(request),headers);const stub=env.LOBBY.get(env.LOBBY.idFromName('global'));return stub.fetch(new Request('https://lobby/connect',{headers}));
    }
    if(request.method==='POST'&&url.pathname==='/api/auth/register')return withCors(await forwardAccount(request,env,'/register'),origin);
    if(request.method==='POST'&&url.pathname==='/api/auth/verify-email')return withCors(await forwardAccount(request,env,'/verify-email'),origin);
    if(request.method==='POST'&&url.pathname==='/api/auth/resend-verification')return withCors(await forwardAccount(request,env,'/resend-verification'),origin);
    if(request.method==='POST'&&url.pathname==='/api/auth/login')return withCors(await forwardAccount(request,env,'/login'),origin);
    if(request.method==='POST'&&url.pathname==='/api/auth/logout')return withCors(await forwardAccount(request,env,'/logout'),origin);
    if(request.method==='GET'&&url.pathname==='/api/me'){const response=await forwardAccount(request,env,'/me');if(!response.ok)return withCors(response,origin);const data=await response.json();if(data.account)data.account=await reconcileActiveRanked(env,data.account);return withCors(json(data,response.status),origin);}
    if(request.method==='POST'&&url.pathname==='/api/account/notices/ack')return withCors(await forwardAccount(request,env,'/notices/ack'),origin);
    if(request.method==='POST'&&url.pathname==='/api/referrals/create')return withCors(await forwardAccount(request,env,'/referrals/create'),origin);
    if(request.method==='POST'&&url.pathname==='/api/referrals/collect')return withCors(await forwardAccount(request,env,'/referrals/collect'),origin);
    if(request.method==='GET'&&url.pathname==='/api/social')return withCors(await forwardAccount(request,env,'/social'),origin);
    if(request.method==='POST'&&url.pathname==='/api/social/search')return withCors(await forwardAccount(request,env,'/social/search'),origin);
    if(request.method==='POST'&&url.pathname==='/api/social/request')return withCors(await forwardAccount(request,env,'/social/request'),origin);
    if(request.method==='POST'&&url.pathname==='/api/social/respond')return withCors(await forwardAccount(request,env,'/social/respond'),origin);
    if(request.method==='POST'&&url.pathname==='/api/social/unfriend')return withCors(await forwardAccount(request,env,'/social/unfriend'),origin);
    if(request.method==='POST'&&url.pathname==='/api/player-profile')return withCors(await forwardAccount(request,env,'/player-profile'),origin);
    if(request.method==='GET'&&url.pathname==='/api/leaderboards')return withCors(await forwardAccount(request,env,'/leaderboards'),origin);
    if(request.method==='POST'&&url.pathname==='/api/solo'){
      const account=await requireAccount(request,env);if(!account)return withCors(json({ok:false,error:{code:'AUTH_REQUIRED',message:'Login required.'}},401),origin);
      if(account.activeRanked?.roomCode){
        if(account.activeRanked.mode==='solo')return withCors(json({ok:true,account,room:{roomCode:account.activeRanked.roomCode,rankedMode:'solo',resume:true}}),origin);
        return withCors(json({ok:false,error:{code:'ACTIVE_RANKED_GAME',message:'Finish or leave the active Online Play game before starting Solo Play.',activeRanked:account.activeRanked}},409),origin);
      }
      const response=await allocateRoom(env,{solo:true});if(!response.ok)return withCors(response,origin);const data=await response.json();return withCors(json({ok:true,account,room:{roomCode:data.room.roomCode,rankedMode:'solo'}}),origin);
    }
    if(request.method==='POST'&&url.pathname==='/api/solo/leave-for-challenge'){
      const account=await requireAccount(request,env);if(!account)return withCors(json({ok:false,error:{code:'AUTH_REQUIRED',message:'Login required.'}},401),origin);
      if(account.activeRanked?.mode==='online')return withCors(json({ok:false,error:{code:'ACTIVE_TWO_PLAYER_GAME',message:'Finish or leave the active Online Play game first.'}},409),origin);
      if(account.activeRanked?.mode==='solo'&&account.activeRanked.roomCode){
        const stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(account.activeRanked.roomCode)),response=await stub.fetch(new Request('https://room/leave-solo-for-challenge',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:account.id})}));
        if(!response.ok)return withCors(response,origin);
      }
      const refreshed=await requireAccount(request,env);return withCors(json({ok:true,account:refreshed}),origin);
    }
    if(request.method==='POST'&&url.pathname==='/api/rooms'){
      const account=await resolveAccount(request,env);
      if(account?.activeRanked?.roomCode)return withCors(json({ok:false,error:{code:'ACTIVE_RANKED_GAME',message:'Only one Coin game can be active at a time.',activeRanked:account.activeRanked}},409),origin);
      return withCors(await allocateRoom(env,{account}),origin);
    }
    if((match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{14})\/join$/))&&request.method==='POST'){
      const account=await resolveAccount(request,env);
      if(account?.activeRanked?.roomCode&&account.activeRanked.roomCode!==match[1])return withCors(json({ok:false,error:{code:'ACTIVE_RANKED_GAME',message:'Only one Coin game can be active at a time.',activeRanked:account.activeRanked}},409),origin);
      const body=await request.json().catch(()=>({})),stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(match[1]));return withCors(await stub.fetch(new Request('https://room/join',{method:'POST',body:JSON.stringify({...body,account}),headers:{'content-type':'application/json'}})),origin);
    }
    if((match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{14})\/decline-reconnect$/))&&request.method==='POST'){
      const account=await requireAccount(request,env);if(!account)return withCors(json({ok:false,error:{code:'AUTH_REQUIRED',message:'Login required.'}},401),origin);
      if(account.activeRanked?.roomCode!==match[1]||!['solo','online'].includes(account.activeRanked?.mode))return withCors(json({ok:false,error:{code:'RECONNECT_NOT_PENDING',message:'There is no active Competitive reconnect for this room.'}},409),origin);
      const stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(match[1])),response=await stub.fetch(new Request('https://room/decline-reconnect',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({accountId:account.id,sessionId:account.activeRanked.sessionId})}));return withCors(response,origin);
    }
    if((match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{14})\/ws$/))&&request.method==='GET'){
      const stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(match[1]));return stub.fetch(new Request('https://room/connect',{headers:request.headers}));
    }
    return withCors(json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404),origin);
  }catch(_){return withCors(json({ok:false,error:{code:'INTERNAL_ERROR',message:'The service could not complete the request.'}},500),origin);}
}};