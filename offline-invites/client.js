/* Offline Competitive invitations: development-only optional overlay.
 * Reads existing account and friend APIs; uses existing game bridge; no core edits.
 */
(()=>{
'use strict';
if(!/^gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app$/.test(location.hostname)&&!['localhost','127.0.0.1'].includes(location.hostname))return;
const endpoint='https://gostop-offline-invites-dev.jwshin1.workers.dev/api/invites';
const $=id=>document.getElementById(id);
const account=()=>globalThis.GoStopRanked?.getAccount?.(),auth=()=>globalThis.GoStopRanked?.getAuthToken?.();
const requestIdFromUrl=new URLSearchParams(location.search).get('offlineInvite');
const settingsFromUrl=new URLSearchParams(location.search).has('devInviteSettings');
let pending=null,interval=null,busy=false,invitationOpened=false,lastAccountId=null,lastFriendsCheck=0,friends=null,prefs=null;
const style=document.createElement('style');
style.textContent='#devInvitePreferences{display:grid;gap:9px;padding:11px;margin:8px 0;border:1px solid #b79358;border-radius:9px;background:#25180d;color:#fae5be;font:13px/1.4 system-ui}#devInvitePreferences label{display:flex;gap:8px;align-items:center}#devInvitePreferences button,.devInviteOfflineButton{padding:9px;border:1px solid #be985b;border-radius:8px;color:#fae5be;background:#51351c;cursor:pointer}#devInvitePreferences input{width:18px;height:18px;accent-color:#eaba63}#devInviteDialog{max-width:min(460px,95vw);background:#20150d;color:#fae5be;border:2px solid #be985b;border-radius:13px;padding:18px;font:15px/1.5 system-ui}#devInviteDialog::backdrop{background:rgba(0,0,0,.7)}#devInviteDialog button{padding:9px 20px;border-radius:9px;background:#55371f;border:1px solid #be985b;color:#fff}';
document.head.appendChild(style);
const dialog=document.createElement('dialog');dialog.id='devInviteDialog';
dialog.innerHTML='<h2 id="devInviteDialogTitle">Request in Progress</h2><p id="devInviteDialogStatus"></p><p id="devInviteDialogCountdown"></p><p id="devInviteDialogError" role="alert"></p><button id="devInviteDialogCancel" type="button">Cancel</button>';
document.body.appendChild(dialog);
const prefsHost=$('settingsControlsHost');
const settings=document.createElement('section');settings.id='devInvitePreferences';
settings.innerHTML='<label><input id="devInviteEnabled" type="checkbox" checked>Allow offline Competitive game requests from friends</label><button id="devInviteAllowAlerts" type="button">Enable phone notifications</button><p id="devInvitePreferenceStatus">On by default. Turn off to stop friends requesting games while you are offline.</p>';
prefsHost?.appendChild(settings);
function err(message){$('devInviteDialogError').textContent=String(message||'');}
async function api(path,data){
 const token=auth();if(!token)throw new Error('Log in to the development account.');
 const response=await fetch(endpoint+path,{method:data===undefined?'GET':'POST',
  headers:{authorization:'Bearer '+token,...(data===undefined?{}:{'content-type':'application/json'})},
  ...(data===undefined?{}:{body:JSON.stringify(data)}),cache:'no-store',signal:AbortSignal.timeout(9000)});
 const result=await response.json().catch(()=>null);
 if(!response.ok||!result?.ok)throw new Error(result?.error||'Invitation service unavailable');
 return result;
}
function closeRequest(){if(interval)clearInterval(interval);interval=null;pending=null;if(dialog.open)dialog.close();}
async function closeNotification(id){
 try{
  const registration=await navigator.serviceWorker.getRegistration('/dev-invites/');
  for(const note of await registration?.getNotifications({tag:'gostop-dev-request-'+id})||[])note.close();
 }catch(_){}
}
async function createRoom(invite){
 if(!pending||pending.roomStarting)return;
 pending.roomStarting=true;
 try{
  const bridge=globalThis.GoStopGameBridge;
  if(!bridge?.prepareForMultiplayerChallenge?.())throw new Error('Finish your active two-player game first.');
  const room=await bridge.createCompetitiveRoom();
  if(!room?.roomCode)throw new Error('Could not create Competitive room.');
  await api('/room',{requestId:invite.requestId,roomCode:room.roomCode});
  closeRequest();
 }catch(error){err(error.message);pending.roomStarting=false;}
}
async function refreshOutgoing(){
 if(!pending||busy)return;busy=true;
 try{
  const response=await api('/status?requestId='+encodeURIComponent(pending.requestId));
  const invite=response.invite;
  if(invite.status==='accepted'){$('devInviteDialogStatus').textContent='Accepted. Starting Competitive game…';await createRoom(invite);return;}
  if(invite.status!=='pending'){closeRequest();return;}
  const seconds=Math.max(0,Math.ceil((invite.expiresAt-Date.now())/1000));
  $('devInviteDialogCountdown').textContent=seconds+' seconds remaining';
 }catch(error){err(error.message);}
 finally{busy=false;}
}
async function sendOfflineRequest(friend){
 if(pending)return;
 try{
  const data=await api('/request',{targetId:friend.accountId});
  pending=data.invite;
  $('devInviteDialogTitle').textContent='Request in Progress';
  $('devInviteDialogStatus').textContent='Waiting for '+friend.nickname+' to respond…';
  $('devInviteDialogCountdown').textContent='30 seconds remaining';err('');
  if(!dialog.open)dialog.showModal();
  interval=setInterval(()=>void refreshOutgoing(),1200);
  await refreshOutgoing();
 }catch(error){window.alert(error.message);}
}
$('devInviteDialogCancel').addEventListener('click',async()=>{
 if(!pending)return;
 const id=pending.requestId;
 $('devInviteDialogCancel').disabled=true;
 try{await api('/cancel',{requestId:id});await closeNotification(id);closeRequest();}
 catch(error){err(error.message);}
 finally{$('devInviteDialogCancel').disabled=false;}
});
async function fetchFriends(){
 if(!auth()||!account()||$('socialScreen')?.hidden!==false)return;
 try{
  const response=await fetch('https://gostop-authority-dev.jwshin1.workers.dev/api/social',{
   headers:{authorization:'Bearer '+auth()},cache:'no-store',signal:AbortSignal.timeout(8000)});
  if(!response.ok)return;
  const data=await response.json();
  friends=new Map((data.friends||[]).map(p=>[p.accountId,p]));
  renderButtons();
 }catch(_){}
}
function renderButtons(){
 const host=$('socialList');if(!host||!friends||$('socialScreen')?.hidden!==false)return;
 for(const row of host.querySelectorAll('[data-social-account-id]')){
  const player=friends.get(row.dataset.socialAccountId),button=row.querySelector('.devInviteOfflineButton');
  if(!player||player.friendState!=='friend'||!row.querySelector('.player-status.offline')){button?.remove();continue;}
  if(button)continue;
  const target=row.querySelector('.social-actions');if(!target)continue;
  const b=document.createElement('button');b.type='button';b.className='devInviteOfflineButton';
  b.textContent='Request Competitive Game';
  b.addEventListener('click',event=>{event.stopPropagation();void sendOfflineRequest(player);});
  target.prepend(b);
 }
}
if($('socialList'))new MutationObserver(renderButtons).observe($('socialList'),{childList:true,subtree:true});
const on=$('devInviteEnabled'),notify=$('devInviteAllowAlerts'),status=$('devInvitePreferenceStatus');
on?.addEventListener('change',async()=>{
 on.disabled=true;
 try{const result=await api('/preference',{enabled:on.checked});prefs=result;status.textContent=on.checked?'Offline invitations enabled.':'Offline invitations disabled on all devices.';}
 catch(error){on.checked=!on.checked;status.textContent=error.message;}
 finally{on.disabled=false;}
});
async function enablePush(){
 if(!('serviceWorker' in navigator)||!('PushManager' in window)||!('Notification' in window))throw new Error('This browser does not support Web Push.');
 let permission=Notification.permission;
 if(permission==='default')permission=await Notification.requestPermission();
 if(permission!=='granted')throw new Error('Notification permission is not granted.');
 const reg=await navigator.serviceWorker.register('/dev-invites/sw.js',{scope:'/dev-invites/'});
 if(!reg.active){
  const installing=reg.installing||reg.waiting;
  if(!installing)throw new Error('Notification worker has not activated yet. Retry enabling phone alerts.');
  await new Promise((resolve,reject)=>{
   if(installing.state==='activated')return resolve();
   const deadline=setTimeout(()=>reject(new Error('Notification worker could not activate.')),10000);
   installing.addEventListener('statechange',()=>{
    if(installing.state==='activated'){clearTimeout(deadline);resolve();}
    else if(installing.state==='redundant'){clearTimeout(deadline);reject(new Error('Notification worker activation failed.'));}
   });
  });
 }
 const key=await fetch(endpoint+'/public-key',{headers:{Origin:location.origin},signal:AbortSignal.timeout(9000)}).then(r=>r.json());
 if(!key.ok)throw new Error('Cannot obtain push signing key.');
 const encoded=key.publicKey.replace(/-/g,'+').replace(/_/g,'/');
 const raw=atob(encoded+'='.repeat((4-encoded.length%4)%4));
 const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({
  userVisibleOnly:true,applicationServerKey:Uint8Array.from(raw,c=>c.charCodeAt(0))
 });
 await api('/subscribe',{subscription:sub.toJSON()});
 return true;
}
notify?.addEventListener('click',async()=>{
 notify.disabled=true;
 try{await enablePush();status.textContent='Phone notifications enabled for this development account.';}
 catch(error){status.textContent=error.message;}
 finally{notify.disabled=false;}
});
async function refreshPreference(){
 if(!auth())return;
 try{prefs=await api('/state');if(on)on.checked=prefs.enabled;
  if(prefs.enabled&&typeof Notification!=='undefined'&&Notification.permission==='granted')void enablePush().catch(()=>{});
 }catch(_){}
}
async function acceptInvite(id){
 if(invitationOpened)return;invitationOpened=true;
 try{
  const first=(await api('/status?requestId='+encodeURIComponent(id))).invite;
  if(first.status!=='pending'||first.expiresAt<=Date.now())throw new Error('Request expired or cancelled.');
  await api('/accept',{requestId:id});await closeNotification(id);
  const until=Date.now()+30000;
  while(Date.now()<until){
   const result=(await api('/status?requestId='+encodeURIComponent(id))).invite;
   if(result.status==='room-ready'&&result.roomCode){
    if(!globalThis.GoStopGameBridge?.prepareForMultiplayerChallenge?.())throw new Error('Finish your active two-player game first.');
    await globalThis.GoStopGameBridge.joinCompetitiveRoom(result.roomCode);
    history.replaceState(null,'',location.pathname);return;
   }
   if(result.status!=='accepted')throw new Error('Request no longer available.');
   await new Promise(resolve=>setTimeout(resolve,1000));
  }
  throw new Error('Host could not start the game.');
 }catch(error){window.alert(error.message);}
}
let processedSettings=false;
navigator.serviceWorker?.addEventListener('message',event=>{
 if(event.data?.kind==='gostop-dev-invite-closed')void closeNotification(event.data.requestId);
});
setInterval(()=>{
 const id=account()?.id||null;
 if(id&&id!==lastAccountId){lastAccountId=id;void refreshPreference();}
 if(!id)lastAccountId=null;
 if(id&&requestIdFromUrl&&!invitationOpened)void acceptInvite(requestIdFromUrl);
 if(settingsFromUrl&&!processedSettings&&$('accountSettingsBtn')){
  processedSettings=true;$('accountSettingsBtn').click();
 }
 if($('socialScreen')?.hidden===false){
  renderButtons();
  if(Date.now()-lastFriendsCheck>5000){lastFriendsCheck=Date.now();void fetchFriends();}
 }
},1200);
globalThis.GoStopOfflineInvitesDev=Object.freeze({refreshPreference,enablePush});
})();
