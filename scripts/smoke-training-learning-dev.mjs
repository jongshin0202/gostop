// Safe, unauthenticated live smoke. Runs ONLY against the isolated learning Worker.
const endpoint='https://gostop-training-learning-dev.jwshin1.workers.dev';
const dev='https://gostop-dev.vercel.app';
const opts={headers:{Origin:dev},signal:AbortSignal.timeout(12000)};
const auth=await fetch(endpoint+'/api/training/state',opts);
if(auth.status!==401||auth.headers.get('access-control-allow-origin')!==dev)
  throw new Error('Unauthenticated development learning API must return 401 with development-only CORS. Got '+auth.status);
console.log('PASS training learning storage rejects unauthenticated access');
const prod=await fetch(endpoint+'/api/training/state',{headers:{Origin:'https://gostoplive.com'},signal:AbortSignal.timeout(12000)});
if(prod.status!==403||prod.headers.has('access-control-allow-origin'))
  throw new Error('Production origin must not access learning API. Got '+prod.status);
console.log('PASS production origin is denied access');
const pre=await fetch(endpoint+'/api/training/feedback',{method:'OPTIONS',headers:{Origin:dev,
  'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(12000)});
if(pre.status!==204||pre.headers.get('access-control-allow-origin')!==dev)throw new Error('Learning CORS preflight failed');
console.log('PASS development-only feedback preflight');
