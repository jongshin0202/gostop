// Read-only development push service test; never creates a user invitation.
const service='https://gostop-offline-invites-dev.jwshin1.workers.dev';
const origin='https://gostop-dev.vercel.app';
const get=async(path,options={})=>fetch(service+path,{signal:AbortSignal.timeout(10000),...options});
const unauthorized=await get('/api/invites/state',{headers:{Origin:origin}});
if(unauthorized.status!==401||unauthorized.headers.get('access-control-allow-origin')!==origin)throw Error('Auth/CORS restriction failed: '+unauthorized.status);
console.log('PASS development invite API requires authentication');
const pub=await get('/api/invites/public-key',{headers:{Origin:origin}});
const data=await pub.json();
if(!pub.ok||!data.ok||typeof data.publicKey!=='string'||data.publicKey.length<70)throw Error('Push signing public key unavailable: '+pub.status);
console.log('PASS stable VAPID public key returned');
const deny=await get('/api/invites/state',{headers:{Origin:'https://gostoplive.com'}});
if(deny.status!==403||deny.headers.has('access-control-allow-origin'))throw Error('Production origin was not denied');
console.log('PASS public production origin rejected');
const pre=await get('/api/invites/preference',{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'}});
if(pre.status!==204)throw Error('Development browser preflight failed '+pre.status);
console.log('PASS Android browser CORS preflight');
