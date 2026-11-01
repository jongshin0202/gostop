/* Separate-development-only cloud learning client.
 * Does not modify game state or store training data in the browser.
 * Authentication is obtained from the existing development login on each request.
 */
(()=>{
'use strict';
if(!/^gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app$/.test(location.hostname)&&
   !['localhost','127.0.0.1'].includes(location.hostname))return;
const API='https://gostop-training-learning-dev.jwshin1.workers.dev';
const config=globalThis.__GoStopLearningTestConfig||{};
const endpoint=config.endpoint||API;
async function call(path,{method='GET',payload}={}){
 const token=localStorage.getItem('gostop-auth-token')||'';
 if(!token)throw new Error('Log in to your development account to synchronize Training feedback.');
 const response=await fetch(endpoint+path,{
  method,headers:{authorization:'Bearer '+token,...(payload?{'content-type':'application/json'}:{})},
  ...(payload?{body:JSON.stringify(payload)}:{}),
  signal:AbortSignal.timeout(10000),cache:'no-store'
 });
 let data;try{data=await response.json();}catch{throw new Error('Training learning server returned an invalid response.');}
 if(!response.ok||!data?.ok)throw new Error(data?.error||'Training learning server unavailable ('+response.status+').');
 return data;
}
globalThis.GoStopTrainingCloud=Object.freeze({
 state:()=>call('/api/training/state'),
 history:()=>call('/api/training/history'),
 review:gameId=>call('/api/training/review?gameId='+encodeURIComponent(gameId)),
 finalize:(gameId,{reviewVersion,keptFeedbackIds,hadDisagreement=false})=>
  call('/api/training/finalize',{method:'POST',
   payload:{gameId,reviewVersion,keptFeedbackIds,hadDisagreement}}),
 feedback:payload=>call('/api/training/feedback',{method:'POST',payload}),
 specialFeedback:payload=>call('/api/training/special-feedback',{method:'POST',payload}),
 goStopFeedback:payload=>call('/api/training/go-stop-feedback',{method:'POST',payload}),
 openingFeedback:payload=>call('/api/training/opening-feedback',{method:'POST',payload}),
 complete:(gameId,options={})=>call('/api/training/complete',{method:'POST',payload:{gameId,...options}})
});
})();