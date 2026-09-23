import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
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


test('Player Info POST is forwarded through the public Worker with auth, JSON body, and CORS intact',async()=>{
  let seen=null;
  const env={
    ACCOUNT_STORE:{
      idFromName:name=>name,
      get:()=>({
        fetch:async request=>{
          seen={
            url:request.url,
            method:request.method,
            authorization:request.headers.get('authorization'),
            contentType:request.headers.get('content-type'),
            body:await request.text()
          };
          return new Response(JSON.stringify({ok:true,player:{accountId:'acct-self',nickname:'SelfPlayer'}}),{
            status:200,
            headers:{'content-type':'application/json'}
          });
        }
      })
    }
  };
  const response=await worker.fetch(new Request('https://gostop-authority.jwshin1.workers.dev/api/player-profile',{
    method:'POST',
    headers:{
      Origin:origin,
      Authorization:'Bearer self-token',
      'content-type':'application/json'
    },
    body:JSON.stringify({accountId:'acct-self'})
  }),env);
  assert.equal(response.status,200);
  assert.equal(response.headers.get('access-control-allow-origin'),origin);
  assert.equal(seen.url,'https://accounts/player-profile');
  assert.equal(seen.method,'POST');
  assert.equal(seen.authorization,'Bearer self-token');
  assert.equal(seen.contentType,'application/json');
  assert.deepEqual(JSON.parse(seen.body),{accountId:'acct-self'});
  const data=await response.json();
  assert.equal(data.player.nickname,'SelfPlayer');
});


test('all literal player API paths used by browser clients are recognized by the Worker CORS classifier',async()=>{
  const sourceFiles=['ranked-client.js','online-client.js','app.js'];
  const paths=new Set();
  for(const file of sourceFiles){
    const source=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const match of source.matchAll(/['"`](\/api\/[^'"`\\s?$\\{]+)/g))paths.add(match[1]);
  }
  assert.ok(paths.size>=10,'expected a substantial browser API surface');
  for(const path of [...paths].sort()){
    const response=await preflight(path,'POST');
    assert.equal(response.status,204,path);
    assert.equal(response.headers.get('access-control-allow-origin'),origin,path);
  }
});
