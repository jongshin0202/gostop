import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {AccountStore} from '../server/account-store.mjs';
import {parseClientMessage,PROTOCOL_VERSION} from '../server/protocol.mjs';

class MemoryStorage{
  constructor(){this.map=new Map();}
  async get(key){return this.map.get(key);}
  async put(key,value){this.map.set(key,structuredClone(value));}
  async delete(key){this.map.delete(key);}
  async list({prefix=''}={}){return new Map([...this.map].filter(([key])=>key.startsWith(prefix)).map(([key,value])=>[key,structuredClone(value)]));}
}
const store=()=>new AccountStore({storage:new MemoryStorage()},{},{cryptoApi:globalThis.crypto,now:()=> '2026-09-21T23:00:00.000Z'});
const request=(path,{method='POST',body,token,ip}={})=>new Request(`https://accounts${path}`,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{}),...(ip?{'x-gostop-ip':ip}:{})},body:body===undefined?undefined:JSON.stringify(body)});
async function register(accountStore,email,nickname,extra={},options={}){const response=await accountStore.fetch(request('/register',{body:{email,nickname,password:'BetterPass9',confirmPassword:'BetterPass9',...extra},ip:options.ip}));assert.equal(response.status,201);return response.json();}
async function registerRoom(accountStore,roomCode,mode='free'){const response=await accountStore.fetch(request('/internal/room/register',{body:{roomCode,mode}}));assert.equal(response.status,200);}
async function registerFreeRoom(accountStore,roomCode){return registerRoom(accountStore,roomCode,'free');}
async function createReferral(accountStore,token,roomCode,{deviceId='host-device-0001',ip='198.51.100.10'}={}){const response=await accountStore.fetch(request('/referrals/create',{body:{roomCode,deviceId},token,ip}));assert.equal(response.status,200);const data=await response.json();assert.match(data.referralToken,/^[a-f0-9]{64}$/);return data.referralToken;}
async function me(accountStore,token){return (await accountStore.fetch(request('/me',{method:'GET',token}))).json();}
async function settle(accountStore,gameId,mode,participants){const response=await accountStore.fetch(request('/internal/game/settle',{body:{gameId,mode,winnerPlayerId:null,finalPoints:0,participants:participants.map(account=>({accountId:account.id,playerId:`player-${account.id}`,nickname:account.nickname,won:false,walletDelta:0,coinsWon:0,points:0,milestones:{}})),recordedAt:'2026-09-21T23:00:00.000Z'}}));assert.equal(response.status,200);return response.json();}

test('shared online room can issue a referral token so a guest can play before signup',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'online-host@example.com','OnlineHost'),roomCode='ZXCV2345BNML67';
  await registerRoom(accountStore,roomCode,'online');
  const referralToken=await createReferral(accountStore,inviter.session.token,roomCode,{deviceId:'online-host-device'});
  assert.match(referralToken,/^[a-f0-9]{64}$/);
});

test('Friendly referral gives the verified new player 200 extra Coins immediately while inviter reward stays pending',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'host@example.com','HostPlayer'),roomCode='ABCD2345EFGH67';
  assert.equal(inviter.account.walletCoins,200);await registerFreeRoom(accountStore,roomCode);
  const referralToken=await createReferral(accountStore,inviter.session.token,roomCode);
  const guest=await register(accountStore,'guest@example.com','GuestPlayer',{referralToken,referralStage:'game10',deviceId:'guest-device-0001'},{ip:'198.51.100.20'});
  assert.equal(guest.account.walletCoins,400);assert.equal(guest.awards.referralCoins,200);assert.equal(guest.referral.eligible,true);assert.equal(guest.referral.inviterRewardPending,true);
  const storedGuest=await accountStore.accountByEmail('guest@example.com');assert.equal(storedGuest.friendlyReferralQualification.qualifyingGamesPlayed,0);assert.equal(storedGuest.friendlyReferralQualification.gamesRequired,10);
  const host=await me(accountStore,inviter.session.token);assert.equal(host.account.walletCoins,200);
  assert.equal(guest.account.friendlyReferralProgress.qualifyingGamesPlayed,0);assert.equal(guest.account.friendlyReferralProgress.gamesRequired,10);
  assert.equal(host.account.friendlyReferralInvites.length,1);assert.equal(host.account.friendlyReferralInvites[0].friendNickname,'GuestPlayer');assert.equal(host.account.friendlyReferralInvites[0].qualifyingGamesPlayed,0);
  const notice=host.notices.find(item=>item.type==='friendly-referral-signup-complete');assert.ok(notice);assert.equal(notice.friendNickname,'GuestPlayer');assert.equal(notice.qualifyingGamesRequired,10);
  assert.equal(host.notices.some(item=>item.type==='friendly-referral-collect'),false);
});

test('inviter earns the 200-Coin collect reward only after ten unique Competitive games that do not include the inviter',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'qualifier-host@example.com','QualifierHost'),roomCode='JKLM2345NPQR67';
  await registerFreeRoom(accountStore,roomCode);const referralToken=await createReferral(accountStore,inviter.session.token,roomCode,{deviceId:'qualifier-host-device'});
  const guest=await register(accountStore,'qualifier-guest@example.com','QualifierGuest',{referralToken,referralStage:'session-end',deviceId:'qualifier-guest-device'},{ip:'198.51.100.21'});
  const inviterAccount=await accountStore.accountByEmail('qualifier-host@example.com'),guestAccount=await accountStore.accountByEmail('qualifier-guest@example.com');
  await settle(accountStore,'against-inviter','online',[guestAccount,inviterAccount]);
  let stored=await accountStore.accountByEmail('qualifier-guest@example.com');assert.equal(stored.friendlyReferralQualification.qualifyingGamesPlayed,0);
  for(let i=1;i<=9;i++)await settle(accountStore,`qualifying-${i}`,'solo',[guestAccount]);
  await settle(accountStore,'qualifying-9','solo',[guestAccount]);
  stored=await accountStore.accountByEmail('qualifier-guest@example.com');assert.equal(stored.friendlyReferralQualification.qualifyingGamesPlayed,9);
  await accountStore.fetch(request('/force-quit',{body:{accountId:guestAccount.id,gameId:'forced-does-not-count',penaltyCoins:0}}));
  stored=await accountStore.accountByEmail('qualifier-guest@example.com');assert.equal(stored.friendlyReferralQualification.qualifyingGamesPlayed,9);
  let host=await me(accountStore,inviter.session.token);assert.equal(host.account.walletCoins,200);assert.equal(host.notices.some(item=>item.type==='friendly-referral-collect'),false);assert.equal(host.account.friendlyReferralInvites[0].qualifyingGamesPlayed,9);assert.equal(host.account.friendlyReferralInvites[0].rewardReady,false);
  await settle(accountStore,'qualifying-10','solo',[guestAccount]);
  stored=await accountStore.accountByEmail('qualifier-guest@example.com');assert.equal(stored.friendlyReferralQualification.qualifyingGamesPlayed,10);assert.ok(stored.friendlyReferralQualification.inviterRewardReadyAt);
  host=await me(accountStore,inviter.session.token);assert.equal(host.account.walletCoins,200);assert.equal(host.account.friendlyReferralInvites[0].qualifyingGamesPlayed,10);assert.equal(host.account.friendlyReferralInvites[0].rewardReady,true);
  const ready=host.notices.find(item=>item.type==='friendly-referral-collect');assert.ok(ready);assert.equal(ready.qualifyingGamesPlayed,10);
  const collectedResponse=await accountStore.fetch(request('/referrals/collect',{body:{noticeId:ready.id},token:inviter.session.token}));assert.equal(collectedResponse.status,200);const collected=await collectedResponse.json();
  assert.equal(collected.collectedCoins,200);assert.equal(collected.account.walletCoins,400);assert.equal(collected.account.friendlyReferralInvites[0].rewardCollected,true);
  const duplicate=await (await accountStore.fetch(request('/referrals/collect',{body:{noticeId:ready.id},token:inviter.session.token}))).json();assert.equal(duplicate.collectedCoins,0);assert.equal(duplicate.account.walletCoins,400);
});

test('email verification completes the invited-player 200-Coin reward but does not pay the inviter before qualification',async()=>{
  const sent=[],env={EMAIL_VERIFICATION_REQUIRED:'true',RESEND_API_KEY:'re_test',EMAIL_FROM:'GoStop Live <noreply@gostoplive.com>',EMAIL_VERIFY_BASE_URL:'https://gostoplive.com'};
  const accountStore=new AccountStore({storage:new MemoryStorage()},env,{cryptoApi:globalThis.crypto,now:()=> '2026-09-21T23:00:00.000Z',fetchApi:async(url,options={})=>{sent.push({url,options});return new Response(JSON.stringify({id:`email-${sent.length}`}),{status:200,headers:{'content-type':'application/json'}});}});
  const registerPending=async(email,nickname,extra={},ip='198.51.100.30')=>{const response=await accountStore.fetch(request('/register',{body:{email,nickname,password:'BetterPass9',confirmPassword:'BetterPass9',...extra},ip}));assert.equal(response.status,202);return response.json();};
  const tokenFromLastEmail=()=>{const html=JSON.parse(sent.at(-1).options.body).html,match=String(html).match(/#verify=([a-f0-9]{64})/i);assert.ok(match);return match[1];};
  await registerPending('verifiedhost@example.com','VerifiedHost');const hostVerified=await (await accountStore.fetch(request('/verify-email',{body:{token:tokenFromLastEmail()}}))).json();
  const roomCode='STUV2345WXYZ67';await registerFreeRoom(accountStore,roomCode);const referralToken=await createReferral(accountStore,hostVerified.session.token,roomCode,{deviceId:'verified-host-device',ip:'198.51.100.31'});
  await registerPending('verifiedguest@example.com','VerifiedGuest',{referralToken,referralStage:'game10',deviceId:'verified-guest-device'},'198.51.100.32');
  const pendingGuest=await accountStore.accountByEmail('verifiedguest@example.com');assert.equal(pendingGuest.walletCoins,0);assert.ok(pendingGuest.pendingFriendlyReferral);
  const guestVerified=await (await accountStore.fetch(request('/verify-email',{body:{token:tokenFromLastEmail()}}))).json();assert.equal(guestVerified.account.walletCoins,400);assert.equal(guestVerified.awards.referralCoins,200);
  const host=await me(accountStore,hostVerified.session.token);assert.equal(host.account.walletCoins,200);assert.ok(host.notices.some(item=>item.type==='friendly-referral-signup-complete'&&item.friendNickname==='VerifiedGuest'));assert.equal(host.notices.some(item=>item.type==='friendly-referral-collect'),false);
});

test('same-device referral farming is denied while normal signup and daily Coins still work',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'same-device-host@example.com','SameDeviceHost'),roomCode='ZXCV2345BNMQ67';
  await registerFreeRoom(accountStore,roomCode);const referralToken=await createReferral(accountStore,inviter.session.token,roomCode,{deviceId:'shared-device-0001',ip:'198.51.100.40'});
  const guest=await register(accountStore,'same-device-guest@example.com','SameDeviceGuest',{referralToken,referralStage:'game10',deviceId:'shared-device-0001'},{ip:'198.51.100.41'});
  assert.equal(guest.account.walletCoins,200);assert.equal(guest.awards.referralCoins,0);assert.equal(guest.referral.eligible,false);assert.equal(guest.referral.reason,'SAME_DEVICE');
  const host=await me(accountStore,inviter.session.token);assert.equal(host.account.walletCoins,200);assert.equal(host.notices.some(item=>String(item.type||'').startsWith('friendly-referral')),false);
});

test('Gmail alias reuse cannot receive a second Friendly referral bonus',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'alias-host@example.com','AliasHost'),roomCode='QWER2345TYUI67';
  await registerFreeRoom(accountStore,roomCode);
  const firstToken=await createReferral(accountStore,inviter.session.token,roomCode,{deviceId:'alias-host-device'});
  const first=await register(accountStore,'john.smith+learn@gmail.com','AliasGuestOne',{referralToken:firstToken,referralStage:'game10',deviceId:'alias-guest-device-1'});assert.equal(first.awards.referralCoins,200);
  const secondToken=await createReferral(accountStore,inviter.session.token,roomCode,{deviceId:'alias-host-device'});
  const second=await register(accountStore,'johnsmith@gmail.com','AliasGuestTwo',{referralToken:secondToken,referralStage:'game10',deviceId:'alias-guest-device-2'});
  assert.equal(second.awards.referralCoins,0);assert.equal(second.referral.eligible,false);assert.equal(second.referral.reason,'EMAIL_ALREADY_REWARDED');
});

test('a network can receive only three new Friendly referral bonuses within seven days',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'network-host@example.com','NetworkHost'),roomCode='ASDF2345GHJK67',ip='203.0.113.55';
  await registerFreeRoom(accountStore,roomCode);
  for(let i=1;i<=4;i++){
    const referralToken=await createReferral(accountStore,inviter.session.token,roomCode,{deviceId:'network-host-device',ip:'198.51.100.50'});
    const guest=await register(accountStore,`network-guest-${i}@example.com`,`NetworkGuest${i}`,{referralToken,referralStage:'game10',deviceId:`network-guest-device-${i}`},{ip});
    assert.equal(guest.awards.referralCoins,i<=3?200:0);if(i===4){assert.equal(guest.referral.eligible,false);assert.equal(guest.referral.reason,'NETWORK_LIMIT');}
  }
});

test('Friendly referral room messages are protocol-validated and malformed stages fail closed',()=>{
  assert.equal(parseClientMessage({type:'friendlyReferral',protocolVersion:PROTOCOL_VERSION,status:'offerShown',stage:'game10'}).status,'offerShown');
  assert.throws(()=>parseClientMessage({type:'friendlyReferral',protocolVersion:PROTOCOL_VERSION,status:'signupStarted',stage:'later'}),/malformed/i);
});

test('Friendly room authority exposes completed-game count and relays signup status without making it a ranked action',()=>{
  const room=fs.readFileSync(new URL('../server/room-core.mjs',import.meta.url),'utf8'),finalRoom=fs.readFileSync(new URL('../server/ranked-room-final.mjs',import.meta.url),'utf8');
  assert.match(room,/friendlyGamesPlayed:this\.isRanked\(\)\?null:Math\.max\(0,Number\(this\.room\.sessionStats\?\.gamesPlayed\)\|\|0\)/);
  assert.match(room,/message\.type==='friendlyReferral'/);assert.match(room,/envelope\('friendlyReferral',\{status:message\.status,stage:message\.stage\}\)/);
  assert.match(finalRoom,/settledGameIds\.push\(gameId\);this\.room\.sessionStats\.gamesPlayed=\(Number\(this\.room\.sessionStats\.gamesPlayed\)\|\|0\)\+1/);
});

test('Friendly Play With Friend offers signup after game ten and session end, then delays inviter reward until ten outside Competitive games',()=>{
  const ranked=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),online=fs.readFileSync(new URL('../online-client.js',import.meta.url),'utf8'),accountStoreSource=fs.readFileSync(new URL('../server/account-store.mjs',import.meta.url),'utf8');
  assert.match(ranked,/Get 200 Bonus Coins/);assert.match(ranked,/friendlyGamesPlayed/);assert.match(ranked,/showFriendlySignupOffer\('game10'\)/);assert.match(ranked,/showFriendlySignupOffer\('session-end'\)/);
  assert.match(ranked,/You will earn 200 bonus Coins after they complete 10 Competitive games outside games played with you/);
  assert.match(ranked,/Your friend is signing up/);assert.match(ranked,/Your friend has declined signing up/);
  assert.match(ranked,/200 Bonus Coins Ready/);assert.match(ranked,/Collect 200 Bonus Coins/);assert.match(ranked,/You have collected 200 Bonus Coins!/);
  assert.match(ranked,/id="freeShareBtn"[^>]*>Share Invite</);assert.match(ranked,/navigator\.share\(\{title:'GoStop Live!',text,url:link\.href\}\)/);assert.match(ranked,/No account needed to start/);
  assert.match(ranked,/gostop-friendly-friend-joined/);assert.match(ranked,/Your friend joined! Have fun!/);
  assert.match(ranked,/friendlyReferralProgressHtml/);assert.match(ranked,/Help your friend earn 200 Coins/);assert.match(ranked,/referral progress:/);
  assert.match(ranked,/FRIENDLY_REFERRAL_PROGRESS_POLL_MS=15000/);assert.match(ranked,/syncFriendlyReferralProgressPoll/);
  assert.match(ranked,/addEventListener\('storage'/);assert.match(ranked,/event\.key!==TOKEN_KEY/);assert.match(ranked,/showAccountSuccess\('verified',\{awards:\{referralCoins:200\}/);
  assert.match(ranked,/id="registrationCompetitive"[^>]*hidden>Try Competitive Gaming</);assert.match(ranked,/focusCompetitiveGaming/);assert.match(ranked,/resumeFriendlyRoom\(context\.roomCode\)/);
  assert.match(ranked,/body\.referralToken=friendly\.token;body\.referralStage=friendly\.stage;body\.deviceId=friendlyDeviceId\(\)/);
  assert.match(ranked,/body:\{roomCode,deviceId:friendlyDeviceId\(\)\}/);
  assert.match(ranked,/url\.searchParams\.set\('ref',referralToken\)/);
  assert.match(accountStoreSource,/friendlyReferralInvites/);assert.match(accountStoreSource,/progressFriendlyReferralForGame/);assert.match(accountStoreSource,/participants\.some\(item=>String\(item\?\.accountId\|\|''\)===String\(progress\.inviterAccountId\)\)/);
  assert.match(app,/resumeFriendlyRoom\(roomCode\)/);assert.match(app,/gostop-friendly-friend-joined/);assert.match(app,/handleFriendlyTerminal\?\.\(snapshot\)/);assert.match(app,/handleFriendlySessionEnd\?\.\(snapshot\)/);assert.match(online,/sendFriendlyReferral\(status,stage\)/);
});
