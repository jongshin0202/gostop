import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../server/worker.mjs';

const origin='https://gostoplive.com';

function preflight(path,method='POST'){
  return worker.fetch(new Request('https://gostop-authority.jwshin1.workers.dev'+path,{
    method:'OPTIONS',
    headers:{
      Origin:origin,
      'Access-Control-Request-Method':method,
      'Access-Control-Request-Headers':method==='GET'?'authorization':'content-type,authorization'
    }
  }),{});
}

test('every player-facing browser API route accepts production CORS preflight',async()=>{
  const routes=[
    ['/api/auth/register','POST'],
    ['/api/auth/verify-email','POST'],
    ['/api/auth/resend-verification','POST'],
    ['/api/auth/login','POST'],
    ['/api/auth/logout','POST'],
    ['/api/me','GET'],
    ['/api/account/notices/ack','POST'],
    ['/api/referrals/create','POST'],
    ['/api/referrals/collect','POST'],
    ['/api/social','GET'],
    ['/api/social/search','POST'],
    ['/api/social/request','POST'],
    ['/api/social/respond','POST'],
    ['/api/social/unfriend','POST'],
    ['/api/player-profile','POST'],
    ['/api/leaderboards','GET'],
    ['/api/solo','POST'],
    ['/api/solo/leave-for-challenge','POST'],
    ['/api/rooms','POST'],
    ['/api/rooms/ABCDEFGHJK2345/join','POST'],
    ['/api/rooms/ABCDEFGHJK2345/decline-reconnect','POST']
  ];
  for(const [path,method] of routes){
    const response=await preflight(path,method);
    assert.equal(response.status,204,path);
    assert.equal(response.headers.get('access-control-allow-origin'),origin,path);
    assert.match(response.headers.get('access-control-allow-methods')||'',new RegExp(method),path);
  }
});

test('Player Info preflight specifically remains covered because JSON plus Authorization triggers browser OPTIONS',async()=>{
  const response=await preflight('/api/player-profile','POST');
  assert.equal(response.status,204);
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.match(response.headers.get('access-control-allow-headers')||'',/content-type/);
  assert.match(response.headers.get('access-control-allow-headers')||'',/authorization/);
});

test('unknown API paths do not get silently whitelisted by the CORS classifier',async()=>{
  const response=await preflight('/api/not-a-real-player-route','POST');
  assert.equal(response.status,404);
});
