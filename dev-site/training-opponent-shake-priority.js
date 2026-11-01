/* Development-only public opponent Shake capture priority.
 * Records only publicly revealed cards for the CURRENT Training hand in RAM.
 * No hidden hands, local storage, or game mutation. No production bundling.
 */
(function(root){
'use strict';
const month=id=>Number(/^m(\d{1,2})-[1-4]$/.exec(String(id||''))?.[1]||0);
const unique=a=>[...new Set(Array.isArray(a)?a:[])];
function select({
 handIds=[],floorIds=[],revealedOpponentIds=[],humanCapturedIds=[],
 opponentCapturedIds=[],recommendedHandId=null,recommendedFloorId=null,
 deck=[],score=null
}={}){
 const hand=unique(handIds),floor=unique(floorIds),revealed=new Set(revealedOpponentIds);
 if(!recommendedHandId||!recommendedFloorId||!hand.includes(recommendedHandId)||
  !floor.includes(recommendedFloorId)||!Array.isArray(deck))return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const nativeHand=byId.get(recommendedHandId),nativeFloor=byId.get(recommendedFloorId);
 if(!nativeHand||!nativeFloor||nativeHand.month!==nativeFloor.month)return null;
 const candidates=[];
 for(const floorId of floor){
  if(!revealed.has(floorId))continue;
  const target=byId.get(floorId);
  if(!target)continue;
  for(const handId of hand){
   const source=byId.get(handId);
   if(!source||source.month!==target.month)continue;
   if(handId===recommendedHandId&&floorId===recommendedFloorId)return null;
   candidates.push({handId,floorId,target,source});
  }
 }
 if(!candidates.length)return null;
 // Never displace an immediate winning capture, a completed Birdie/Bright/
 // Ribbon scoring set, or a card that prevents an imminent opponent set.
 const mine=humanCapturedIds.map(id=>byId.get(id)).filter(Boolean);
 const opponent=opponentCapturedIds.map(id=>byId.get(id)).filter(Boolean);
 const addScore=(captured,a,b)=>typeof score==='function'?
  score([...captured,a,b].filter(Boolean)).total:0;
 const before=typeof score==='function'?score(mine):null;
 const nativeAfter=typeof score==='function'?score([...mine,nativeHand,nativeFloor]):null;
 const beforeOpponent=typeof score==='function'?score(opponent):null;
 const oppWithNative=typeof score==='function'?score([...opponent,nativeFloor]):null;
 const isGodoriCompletion=cards=>[2,4,8].every(m=>cards.some(c=>c.flags?.includes('godori')&&c.month===m));
 const ribbonSetComplete=(cards,kind)=>({
  red:[1,2,3],blue:[6,9,10],grass:[4,5,7]
 }[kind]||[]).every(m=>cards.some(c=>c.month===m&&c.ribbonSet===kind));
 const nativeCritical=target=>{
  if(!before||!nativeAfter)return false;
  const after=addScore(mine,target.source,target.target);
  if(nativeAfter.total>=7&&after<7)return true;
  if(!before.godori&&nativeAfter.godori&&
     !isGodoriCompletion([...mine,target.source,target.target]))return true;
  if(before.bright<3&&nativeAfter.bright>=3&&
     [...mine,target.source,target.target].filter(c=>c.type==='bright').length<3)return true;
  for(const kind of ['red','blue','grass']){
   if(!ribbonSetComplete(mine,kind)&&ribbonSetComplete([...mine,nativeHand,nativeFloor],kind)&&
      !ribbonSetComplete([...mine,target.source,target.target],kind))return true;
  }
  if(beforeOpponent&&oppWithNative?.total>=7&&beforeOpponent.total<7)return true;
  return false;
 };
 candidates.sort((a,b)=>{
  const value=c=>c.target.type==='bright'?5:
   c.target.flags?.includes('godori')?4:c.target.type==='ribbon'?3:
   c.target.flags?.includes('doublePi')?2:1;
  return value(b)-value(a)||a.handId.localeCompare(b.handId);
 });
 const target=candidates.find(c=>!nativeCritical(c));
 return target?{handId:target.handId,floorId:target.floorId,
  reason:'opponent-shaken-card',month:target.target.month}:null;
}
const api=Object.freeze({select,month});
root.GoStopDevOpponentShakeLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(root.location?.hostname||''))return;
const dialog=document.getElementById('shakeRevealDialog');
const cards=document.getElementById('shakeRevealCards');
if(!dialog||!cards)return;
let active=false;
const revealedIds=new Set();
const capture=()=>{
 if(!active||!dialog.open)return;
 const ids=[...cards.querySelectorAll('[data-card-id]')].map(x=>x.dataset.cardId);
 if(ids.length<3||ids.some(id=>month(id)!==month(ids[0])))return;
 ids.forEach(id=>revealedIds.add(id));
};
new MutationObserver(capture).observe(dialog,{subtree:true,childList:true,attributes:true,attributeFilter:['open','data-card-id']});
document.addEventListener('click',event=>{
 if(event.target?.closest?.('#trainingModeBtn,#playAgainBtn,#newGameYesBtn')){
  active=true;revealedIds.clear();
 }else if(event.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){
  active=false;revealedIds.clear();
 }
},{capture:true});
root.GoStopDevOpponentShake=Object.freeze({
 getStatus:()=>({active,revealedIds:[...revealedIds]}),
 capture // may be called by test fixture after public reveal; no hidden state
});
})(typeof globalThis!=='undefined'?globalThis:this);
