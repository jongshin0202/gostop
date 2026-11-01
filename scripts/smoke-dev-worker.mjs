// Live connectivity check against the isolated Cloudflare development Worker only.
// This never writes to production or changes account/game data.
const base='https://gostop-authority-dev.jwshin1.workers.dev';
const origins=['https://gostop-dev.vercel.app','https://gostop-dev-jwshin1-5345s-projects.vercel.app'];
const timeoutMs=12000;
for(const origin of origins){
  const response=await fetch(base+'/api/leaderboards',{
    headers:{Origin:origin},
    signal:AbortSignal.timeout(timeoutMs)
  });
  const body=await response.text();
  const cors=response.headers.get('access-control-allow-origin');
  if(!response.ok||cors!==origin){
    throw new Error('Development leaderboard API failed for '+origin+
      ': status='+response.status+', cors='+cors+', response='+body.slice(0,240));
  }
  let data;
  try{data=JSON.parse(body);}catch{throw new Error('Development leaderboard returned invalid JSON');}
  if(!data||typeof data!=='object'||data.error){
    throw new Error('Development leaderboard API returned an invalid response: '+body.slice(0,240));
  }
  if(!Array.isArray(data.global)||!Array.isArray(data.monthly)){
    throw new Error('Development leaderboard has unexpected response shape');
  }
  console.log('PASS dev leaderboard GET via '+origin+
    ' (HTTP '+response.status+', CORS allowed, global='+data.global.length+
    ', monthly='+data.monthly.length+', month='+data.month+')');
  const preflight=await fetch(base+'/api/auth/login',{
    method:'OPTIONS',
    headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type,authorization'},
    signal:AbortSignal.timeout(timeoutMs)
  });
  if(preflight.status!==204||preflight.headers.get('access-control-allow-origin')!==origin){
    throw new Error('Development login CORS preflight failed: status='+preflight.status);
  }
  console.log('PASS dev login CORS preflight via '+origin);
}


// Read-only admin gateway smoke: canonical DEV origin, token existence, and invalid-token rejection.
// This never authenticates as an admin and never reads/writes player records.
const adminOrigin='https://gostop-admin-dev.vercel.app';
const adminPreflight=await fetch(base+'/api/admin/health',{
  method:'OPTIONS',
  headers:{Origin:adminOrigin,'Access-Control-Request-Method':'POST',
    'Access-Control-Request-Headers':'content-type,authorization'},
  signal:AbortSignal.timeout(timeoutMs)
});
if(adminPreflight.status!==204||
  adminPreflight.headers.get('access-control-allow-origin')!==adminOrigin){
  throw new Error('DEV admin CORS preflight unavailable: status='+adminPreflight.status);
}
console.log('PASS isolated DEV admin origin CORS preflight');
const adminHealth=await fetch(base+'/api/admin/health',{
  headers:{Origin:adminOrigin,Authorization:'Bearer dev-smoke-invalid-'+crypto.randomUUID()},
  signal:AbortSignal.timeout(timeoutMs)
});
const adminBody=await adminHealth.text();
if(adminHealth.status===503){
  throw new Error('Development Worker ADMIN_TOKEN is not configured; set a UNIQUE development admin secret in Cloudflare.');
}
if(adminHealth.status!==401||
  adminHealth.headers.get('access-control-allow-origin')!==adminOrigin){
  throw new Error('Unexpected dev admin authorization response: status='+adminHealth.status+', body='+adminBody.slice(0,200));
}
let adminJson;
try{adminJson=JSON.parse(adminBody);}catch{throw new Error('Development admin health returned invalid JSON');}
if(adminJson?.error?.code!=='ADMIN_AUTH_REQUIRED'){
  throw new Error('Dev admin health did not reject the invalid password as expected');
}
console.log('PASS development-only admin gateway rejects invalid token; no production/admin records accessed');
