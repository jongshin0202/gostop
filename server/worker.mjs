export {GameRoom} from './game-room.mjs';
const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function roomCode(cryptoApi){const bytes=new Uint8Array(14),limit=256-(256%alphabet.length);cryptoApi.getRandomValues(bytes);let result='';for(const byte of bytes){if(byte>=limit)return roomCode(cryptoApi);result+=alphabet[byte%alphabet.length];}return result;}
export function configuredOrigins(env){return new Set(String(env.ALLOWED_ORIGINS||'').split(',').map(value=>value.trim()).filter(Boolean));}
export function isAllowedOrigin(origin,env){if(!origin)return false;try{const url=new URL(origin);if(url.origin!==origin)return false;if((url.hostname==='localhost'||url.hostname==='127.0.0.1'||url.hostname==='[::1]')&&['http:','https:'].includes(url.protocol))return true;return configuredOrigins(env).has(origin);}catch(_){return false;}}
const corsHeaders=origin=>({'access-control-allow-origin':origin,'access-control-allow-methods':'GET,POST,OPTIONS','access-control-allow-headers':'content-type','access-control-max-age':'86400','vary':'Origin'});
function withCors(response,origin){const next=new Response(response.body,response);for(const [key,value] of Object.entries(corsHeaders(origin)))next.headers.set(key,value);return next;}
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json','cache-control':'no-store'}});
export default {async fetch(request,env){
  const url=new URL(request.url),origin=request.headers.get('Origin'),apiRoute=/^\/api\/rooms(?:\/|$)/.test(url.pathname);
  if(apiRoute&&!isAllowedOrigin(origin,env))return json({ok:false,error:{code:'ORIGIN_NOT_ALLOWED',message:'Request origin is not allowed.'}},403);
  if(request.method==='OPTIONS'){
    if(!apiRoute)return json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404);
    const requestedMethod=request.headers.get('Access-Control-Request-Method'),requestedHeaders=(request.headers.get('Access-Control-Request-Headers')||'').toLowerCase().split(',').map(value=>value.trim()).filter(Boolean);
    if(requestedMethod!=='POST'||requestedHeaders.some(header=>header!=='content-type'))return withCors(json({ok:false,error:{code:'CORS_PREFLIGHT_REJECTED',message:'Requested CORS method or headers are not allowed.'}},403),origin);
    return new Response(null,{status:204,headers:corsHeaders(origin)});
  }
  let match;
  try{
    if(request.method==='POST'&&url.pathname==='/api/rooms'){
      for(let attempt=0;attempt<5;attempt++){const code=roomCode(globalThis.crypto),stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(code)),response=await stub.fetch(new Request('https://room/initialize',{method:'POST',body:JSON.stringify({roomCode:code}),headers:{'content-type':'application/json'}}));if(response.status!==409)return withCors(response,origin);}
      return withCors(json({ok:false,error:{code:'ROOM_CODE_EXHAUSTED',message:'Could not allocate a room code.'}},503),origin);
    }
    if((match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{14})\/join$/))&&request.method==='POST'){
      const stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(match[1]));return withCors(await stub.fetch(new Request('https://room/join',{method:'POST',body:await request.text(),headers:{'content-type':'application/json'}})),origin);
    }
    if((match=url.pathname.match(/^\/api\/rooms\/([A-Z2-9]{14})\/ws$/))&&request.method==='GET'){
      const stub=env.GAME_ROOMS.get(env.GAME_ROOMS.idFromName(match[1]));return stub.fetch(new Request('https://room/connect',{headers:request.headers}));
    }
    return withCors(json({ok:false,error:{code:'NOT_FOUND',message:'Endpoint not found.'}},404),origin);
  }catch(_){return withCors(json({ok:false,error:{code:'INTERNAL_ERROR',message:'The room service could not complete the request.'}},500),origin);}
}};
