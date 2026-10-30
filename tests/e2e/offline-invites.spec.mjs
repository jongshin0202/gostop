import {test,expect} from '@playwright/test';

const origin='http://127.0.0.1:4173';
async function setup(page,{incoming=false}={}){
  const data={enabled:true,invite:incoming?{requestId:'invite_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',senderId:'acct-friend-12345',targetId:'acct-self-12345',expiresAt:Date.now()+30000,status:'pending'}:null,friendOnline:false};
  const json=(route,obj,status=200)=>route.fulfill({status,contentType:'application/json',
    headers:{'access-control-allow-origin':origin,'access-control-allow-headers':'authorization,content-type'},
    body:JSON.stringify(obj)});
  await page.route('https://gostop-offline-invites-dev.jwshin1.workers.dev/**',route=>{
    const req=route.request(),path=new URL(req.url()).pathname;
    const body=req.postDataJSON?.()||{};
    if(path.endsWith('/state'))return json(route,{ok:true,enabled:data.enabled,invites:[],subscribedDevices:0});
    if(path.endsWith('/preference')){data.enabled=body.enabled;return json(route,{ok:true,enabled:data.enabled});}
    if(path.endsWith('/request')){
      data.invite={requestId:'invite_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',senderId:'acct-self-12345',
        targetId:'acct-friend-12345',expiresAt:Date.now()+30000,status:'pending'};
      return json(route,{ok:true,invite:data.invite,deliveredDevices:1});
    }
    if(path.endsWith('/status'))return json(route,{ok:true,invite:data.invite});
    if(path.endsWith('/cancel')){data.invite.status='cancelled';return json(route,{ok:true,invite:data.invite});}
    if(path.endsWith('/accept')){data.invite.status='accepted';return json(route,{ok:true,invite:data.invite});}
    if(path.endsWith('/room')){data.invite.status='room-ready';data.invite.roomCode=body.roomCode;return json(route,{ok:true,invite:data.invite});}
    return json(route,{ok:false,error:'NOT_FOUND'},404);
  });
  await page.route('https://gostop-authority-dev.jwshin1.workers.dev/api/social',route=>json(route,{ok:true,
    friends:[{accountId:'acct-friend-12345',nickname:'Friend',friendState:'friend'}]}));
  await page.goto('/training-learning/test-fixture.html'+(incoming?'?offlineInvite=invite_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa':''));
  await page.setContent('<html><body><div id="settingsControlsHost"></div><button id="accountSettingsBtn"></button><dialog id="settingsDialog"></dialog><section id="socialScreen"><div id="socialList"><article data-social-account-id="acct-friend-12345"><small class="player-status offline">Offline</small><div class="social-actions"></div></article></div></section></body></html>');
  await page.evaluate(()=>{
    globalThis.GoStopRanked={getAccount:()=>({id:'acct-self-12345',nickname:'Self'}),getAuthToken:()=> 'test-auth-long-secret'};
    globalThis.GoStopGameBridge={
      prepareForMultiplayerChallenge:()=>true,
      createCompetitiveRoom:async()=>({roomCode:'ABCDEFGHJKLMNP'}),
      joinCompetitiveRoom:async()=>{globalThis.__joinedInviteRoom='ABCDEFGHJKLMNP';return {roomCode:'ABCDEFGHJKLMNP'}; }
    };
  });
  await page.addScriptTag({path:'offline-invites/client.js'});
  return data;
}
test('offline friend request shows a cancellable 30-second pending dialog',async({page})=>{
  const data=await setup(page);
  const action=page.getByRole('button',{name:'Request Competitive Game'});
  await expect(action).toBeVisible({timeout:15000});
  await action.click();
  const dialog=page.locator('#devInviteDialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Request in Progress');
  await expect(dialog).toContainText('seconds remaining');
  await dialog.getByRole('button',{name:'Cancel'}).click();
  await expect(dialog).not.toBeVisible();
  expect(data.invite.status).toBe('cancelled');
});
test('settings checkbox defaults on and disabling is stored through server',async({page})=>{
  const data=await setup(page);
  const checkbox=page.locator('#devInviteEnabled');
  await expect(checkbox).toBeChecked();
  await checkbox.uncheck();
  await expect(checkbox).not.toBeChecked();
  await expect.poll(()=>data.enabled).toBe(false);
});
test('already-online friends are not offered the offline invitation button',async({page})=>{
  await setup(page);
  await page.locator('.player-status').evaluate(el=>{el.classList.remove('offline');el.textContent='Online';});
  await expect(page.locator('.devInviteOfflineButton')).toHaveCount(0,{timeout:8000});
});
test('accepted request uses existing Competitive room bridge, not game state edits',async({page})=>{
  const data=await setup(page);
  await page.getByRole('button',{name:'Request Competitive Game'}).click();
  data.invite.status='accepted';
  await expect.poll(()=>data.invite.status,{timeout:15000}).toBe('room-ready');
  await expect(page.locator('#devInviteDialog')).not.toBeVisible();
  expect(data.invite.roomCode).toBe('ABCDEFGHJKLMNP');
});
test('notification Play action opens the app and joins the accepted Competitive game',async({page})=>{
  const data=await setup(page,{incoming:true});
  await expect.poll(()=>data.invite.status,{timeout:12000}).toBe('accepted');
  data.invite.status='room-ready';data.invite.roomCode='ABCDEFGHJKLMNP';
  await expect.poll(async()=>page.evaluate(()=>globalThis.__joinedInviteRoom),{timeout:12000}).toBe('ABCDEFGHJKLMNP');
  expect(new URL(page.url()).searchParams.has('offlineInvite')).toBe(false);
});
