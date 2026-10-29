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
  console.log('PASS dev leaderboard GET via '+origin+' (HTTP '+response.status+', CORS allowed)');
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
