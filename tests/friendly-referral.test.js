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
const request=(path,{method='POST',body,token}={})=>new Request(`https://accounts${path}`,{method,headers:{...(body!==undefined?{'content-type':'application/json'}:{}),...(token?{authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
async function register(accountStore,email,nickname,extra={}){const response=await accountStore.fetch(request('/register',{body:{email,nickname,password:'BetterPass9',confirmPassword:'BetterPass9',...extra}}));assert.equal(response.status,201);return response.json();}
async function registerFreeRoom(accountStore,roomCode){const response=await accountStore.fetch(request('/internal/room/register',{body:{roomCode,mode:'free'}}));assert.equal(response.status,200);}
async function createReferral(accountStore,token,roomCode){const response=await accountStore.fetch(request('/referrals/create',{body:{roomCode},token}));assert.equal(response.status,200);const data=await response.json();assert.match(data.referralToken,/^[a-f0-9]{64}$/);return data.referralToken;}
async function me(accountStore,token){return (await accountStore.fetch(request('/me',{method:'GET',token}))).json();}

test('game-10 Friendly referral gives the new player 200 extra Coins and auto-credits the inviter 200',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'host@example.com','HostPlayer'),roomCode='ABCD2345EFGH67';
  assert.equal(inviter.account.walletCoins,200);await registerFreeRoom(accountStore,roomCode);
  const referralToken=await createReferral(accountStore,inviter.session.token,roomCode);
  const guest=await register(accountStore,'guest@example.com','GuestPlayer',{referralToken,referralStage:'game10'});
  assert.equal(guest.account.walletCoins,400);assert.equal(guest.awards.referralCoins,200);assert.equal(guest.referral.stage,'game10');
  const host=await me(accountStore,inviter.session.token);assert.equal(host.account.walletCoins,400);
  const notice=host.notices.find(item=>item.type==='friendly-referral-complete');assert.ok(notice);assert.equal(notice.friendNickname,'GuestPlayer');assert.equal(notice.coins,200);assert.equal(notice.autoCredited,true);
});

test('session-end Friendly referral holds inviter reward until Collect 200 Bonus Coins and collection is idempotent',async()=>{
  const accountStore=store(),inviter=await register(accountStore,'collector@example.com','Collector'),roomCode='JKLM2345NPQR67';
  await registerFreeRoom(accountStore,roomCode);const referralToken=await createReferral(accountStore,inviter.session.token,roomCode);
  const guest=await register(accountStore,'endguest@example.com','EndGuest',{referralToken,referralStage:'session-end'});
  assert.equal(guest.account.walletCoins,400);assert.equal(guest.awards.referralCoins,200);
  let host=await me(accountStore,inviter.session.token);assert.equal(host.account.walletCoins,200);
  const notice=host.notices.find(item=>item.type==='friendly-referral-collect');assert.ok(notice);assert.equal(notice.collectedAt,null);
  const collectedResponse=await accountStore.fetch(request('/referrals/collect',{body:{noticeId:notice.id},token:inviter.session.token}));assert.equal(collectedResponse.status,200);const collected=await collectedResponse.json();
  assert.equal(collected.collectedCoins,200);assert.equal(collected.account.walletCoins,400);assert.ok(collected.notice.collectedAt);
  const duplicate=await (await accountStore.fetch(request('/referrals/collect',{body:{noticeId:notice.id},token:inviter.session.token}))).json();
  assert.equal(duplicate.collectedCoins,0);assert.equal(duplicate.account.walletCoins,400);
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

test('Friendly Play With Friend client offers signup after game ten and again at session end with inviter status and collection UI',()=>{
  const ranked=fs.readFileSync(new URL('../ranked-client.js',import.meta.url),'utf8'),app=fs.readFileSync(new URL('../app.js',import.meta.url),'utf8'),online=fs.readFileSync(new URL('../online-client.js',import.meta.url),'utf8');
  assert.match(ranked,/Get 200 Bonus Coins Each/);assert.match(ranked,/friendlyGamesPlayed/);assert.match(ranked,/showFriendlySignupOffer\('game10'\)/);assert.match(ranked,/showFriendlySignupOffer\('session-end'\)/);
  assert.match(ranked,/If your invited friend signs up now, we will give you and your friend 200 Coins each as a thank you/);
  assert.match(ranked,/Your friend is signing up/);assert.match(ranked,/Your friend has declined signing up/);
  assert.match(ranked,/Collect 200 Bonus Coins/);assert.match(ranked,/You have collected 200 Bonus Coins!/);
  assert.match(ranked,/body\.referralToken=friendly\.token;body\.referralStage=friendly\.stage/);
  assert.match(ranked,/url\.searchParams\.set\('ref',referralToken\)/);
  assert.match(app,/handleFriendlyTerminal\?\.\(snapshot\)/);assert.match(app,/handleFriendlySessionEnd\?\.\(snapshot\)/);
  assert.match(online,/sendFriendlyReferral\(status,stage\)/);
});
