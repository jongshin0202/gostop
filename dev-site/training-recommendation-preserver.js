/* Development-only Training recommendation presentation guard.
 * Observes the frozen game's existing recommendation and keeps that same
 * advice visible while a player previews another hand card / table target.
 * Does not intercept or modify game input, rules, state or model weights.
 * Delete this file and its dev build inclusion to remove the feature.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const $=id=>document.getElementById(id);
const panel=$('trainingCoachPanel'),title=$('trainingCoachTitle'),text=$('trainingCoachText');
const hand=$('playerHand'),floor=$('floor');
const ppeok=globalThis.GoStopDevReservedPpeokPriority;
const shaken=globalThis.GoStopDevOpponentShakeLogic;
if(!panel||!title||!text||!hand||!floor)return;
const SCOPE='dev-training-recommendation-lock';
let trainingActive=false,lock=null,suppressed=false;
const handSignature=()=>[...hand.querySelectorAll('.hand-card[data-card-id]')].map(node=>node.dataset.cardId)
 .filter(Boolean).sort().join('|');
const specialIsOpen=()=>!!document.querySelector('#shakeDialog[open],#bombDialog[open],#gukjinDialog[open],#decisionDialog[open],#resultDialog[open]');

const cardIds=selector=>[...document.querySelectorAll(selector)].map(el=>el.dataset.cardId).filter(Boolean);
const pileText={
 en:name=>'Play '+name+' onto the three-card pile first. Capture all four cards and take one Single from the computer.',
 ko:name=>'손에 있는 '+name+'을 세 장이 쌓인 바닥패에 먼저 내세요. 같은 종류의 네 장을 모두 먹고 상대 피 한 장도 가져옵니다.',
 es:name=>'Juega '+name+' primero sobre la pila de tres cartas. Captura las cuatro cartas y toma un simple al rival.',
 fr:name=>'Jouez d’abord '+name+' sur la pile de trois cartes. Prenez les quatre cartes et une carte simple à l’adversaire.',
 de:name=>'Spiele '+name+' zuerst auf den Dreierstapel. Nimm alle vier Karten und eine Einzelkarte vom Gegner.',
 ja:name=>'まず'+name+'を3枚の山に出してください。同じ月の4枚を取り、相手のカスを1枚もらえます。',
 zh:name=>'先用'+name+'拿下桌面上的三张叠牌。收齐四张牌，并从对手那里拿走一张散牌。'
};
function reservedPileOverride(currentHandId,currentFloorId){
 if(!ppeok?.select||!currentHandId||!currentFloorId)return null;
 const stacks=[...floor.querySelectorAll('.floor-stack-three[data-stack-month]')]
  .map(el=>({cardIds:[...el.querySelectorAll('.floor-card[data-card-id]')]
   .map(card=>card.dataset.cardId)}));
 const chosen=ppeok.select({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  humanCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  opponentCapturedIds:cardIds('#aiCaptured .captured-mini[data-card-id]'),
  opponentSingleIds:cardIds('#aiCaptured .capture-group[data-capture-type="pi"] .captured-mini[data-card-id]'),
  stacks,recommendedHandId:currentHandId,recommendedFloorId:currentFloorId
 });
 if(!chosen||!hand.querySelector('.hand-card[data-card-id="'+chosen.handId+'"]')||
    !floor.querySelector('.floor-card[data-card-id="'+chosen.floorId+'"]'))return null;
 const el=hand.querySelector('.hand-card[data-card-id="'+chosen.handId+'"]');
 const lang=document.documentElement.lang||'en';
 const deck=globalThis.GoStopEngine?.masterDeck||[];
 const card=Array.isArray(deck)?deck.find(item=>item.id===chosen.handId):null;
 const name=(card&&globalThis.GoStopTrainingLocales?.cardName?.(lang,card))||
  el.title||chosen.handId;
 return {...chosen,text:(pileText[lang]||pileText.en)(name)};
}

const shakenCopy={
 en:name=>'Capture the computer’s Shaken '+name+' card now. Deny the revealed Shake family unless another capture completes an immediate winning set.',
 ko:name=>'상대가 흔들어 공개한 '+name+' 패를 지금 먹으세요. 지금 당장 점수를 확정하는 더 중요한 패가 없다면 우선 가져오는 것이 좋습니다.',
 es:name=>'Captura ahora la carta '+name+' que el rival reveló al sacudir.',
 fr:name=>'Capturez maintenant la carte '+name+' révélée par l’adversaire.',
 de:name=>'Fange jetzt die Karte '+name+' aus dem offenen Shake des Gegners.',
 ja:name=>'相手が振りで公開した'+name+'を先に取りましょう。',
 zh:name=>'优先收下对手摇牌时公开的'+name+'，除非另一张能立即完成关键得分。'
};
function shakenCaptureOverride(currentHandId,currentFloorId){
 if(!shaken?.select||!currentHandId||!currentFloorId)return null;
 const publicShake=globalThis.GoStopDevOpponentShake?.getStatus?.();
 if(!publicShake?.active||!publicShake.revealedIds?.length)return null;
 const deck=globalThis.GoStopEngine?.masterDeck,score=globalThis.GoStopEngine?.score;
 if(!Array.isArray(deck)||typeof score!=='function')return null;
 const selected=shaken.select({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  humanCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  opponentCapturedIds:cardIds('#aiCaptured .captured-mini[data-card-id]'),
  revealedOpponentIds:publicShake.revealedIds,
  recommendedHandId:currentHandId,recommendedFloorId:currentFloorId,deck,score
 });
 if(!selected||!hand.querySelector('.hand-card[data-card-id="'+selected.handId+'"]')||
  !floor.querySelector('.floor-card[data-card-id="'+selected.floorId+'"]'))return null;
 const el=hand.querySelector('.hand-card[data-card-id="'+selected.handId+'"]');
 const lang=document.documentElement.lang||'en';
 const card=deck.find(c=>c.id===selected.handId);
 const name=(card&&globalThis.GoStopTrainingLocales?.cardName?.(lang,card))||
   el.title||selected.handId;
 return {...selected,text:(shakenCopy[lang]||shakenCopy.en)(name)};
}

function reset(){
 lock=null;
 document.documentElement.classList.remove(SCOPE);
}
function sync(){
 if(!trainingActive){reset();return;}
 if(specialIsOpen()){
  if(lock){reset();suppressed=true;}
  return;
 }
 const sig=handSignature();
 if(lock&&(!sig||sig!==lock.handSignature||!hand.querySelector('[data-card-id="'+lock.hand+'"]'))){
  // The played card has left the hand. Do not immediately re-capture the old
  // glowing hint while a frozen-game render is still in progress.
  reset();suppressed=true;
 }
 const recommendation=hand.querySelector('.hand-card.matchable[data-card-id]');
 // A new turn first clears the old hint, then displays a new one. Require that
 // clearing transition before taking another initial recommendation snapshot.
 if(suppressed&&!recommendation)suppressed=false;
 if(!lock&&!suppressed&&recommendation&&!panel.hidden){
  const recommendedFloor=floor.querySelector('.floor-card.training-recommended[data-card-id]');
  const originalTitle=title.textContent?.trim()||'',originalText=text.textContent?.trim()||'';
  if(originalText){
   const nativeHand=recommendation.dataset.cardId,nativeFloor=recommendedFloor?.dataset.cardId||null;
   const pile=reservedPileOverride(nativeHand,nativeFloor);
   const shake=(!pile&&nativeFloor)?shakenCaptureOverride(nativeHand,nativeFloor):null;
   const corrective=pile||shake;
   lock={handSignature:sig,hand:corrective?.handId||nativeHand,
    floor:corrective?.floorId||nativeFloor,
    title:originalTitle,text:corrective?.text||originalText,
    ppeokOverride:!!pile,shakeOverride:!!shake};
   document.documentElement.classList.add(SCOPE);
  }
 }
 if(!lock)return;
 // Keep the same visible recommendation, even if the frozen game temporarily
 // replaces it with "Target Choice" text for an alternative card.
 if(panel.hidden)panel.hidden=false;
 if(title.textContent!==lock.title)title.textContent=lock.title;
 if(text.textContent!==lock.text){
  // The context coach deliberately shortens inaccurate no-capture advice.
  // Accept that correction into our preserved snapshot instead of writing
  // the old text back and causing two observers to fight indefinitely.
  const corrected=globalThis.GoStopDevTrainingContextCoach?.getStatus?.()?.lastAppliedCopy;
  if(corrected&&text.textContent===corrected){
   lock.text=corrected;
  }else{
   text.textContent=lock.text;
  }
 }
 // Restore ONLY visual classes. Target options remain clickable and retain
 // their distinct target-option outline; nothing about a move is changed.
 hand.querySelectorAll('.hand-card.matchable[data-card-id]').forEach(el=>{
  if(el.dataset.cardId!==lock.hand)el.classList.remove('matchable');
 });
 const recommendedHand=hand.querySelector('.hand-card[data-card-id="'+lock.hand+'"]');
 if(recommendedHand&&!recommendedHand.classList.contains('matchable'))recommendedHand.classList.add('matchable');
 floor.querySelectorAll('.floor-card.training-recommended[data-card-id]').forEach(el=>{
  if(el.dataset.cardId!==lock.floor)el.classList.remove('training-recommended');
 });
 if(lock.floor){
  const recommendedFloor=floor.querySelector('.floor-card[data-card-id="'+lock.floor+'"]');
  if(recommendedFloor&&!recommendedFloor.classList.contains('training-recommended'))recommendedFloor.classList.add('training-recommended');
 }
}
const observer=new MutationObserver(sync);
observer.observe(hand,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-card-id','disabled']});
observer.observe(floor,{subtree:true,childList:true,attributes:true,attributeFilter:['class','data-card-id']});
observer.observe(panel,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class','style']});
document.addEventListener('click',event=>{
 const target=event.target;
 if(target?.closest?.('#trainingModeBtn')){
  trainingActive=true;reset();suppressed=false;queueMicrotask(sync);
 }else if(target?.closest?.('#quitYesBtn,#playSoloBtn,#resultQuitBtn')){
  trainingActive=false;reset();suppressed=false;
 }else if(target?.closest?.('#trainingCoachDismiss')){
  reset();suppressed=true; // User explicitly dismissed this advice.
 }
},{capture:true});
Object.defineProperty(globalThis,'GoStopTrainingRecommendationDev',{value:Object.freeze({
 getStatus:()=>({active:trainingActive,locked:!!lock,
  hand:lock?.hand||null,floor:lock?.floor||null,
  text:lock?.text||null,ppeokOverride:!!lock?.ppeokOverride,
  shakeOverride:!!lock?.shakeOverride}), // diagnostic only, not local persistence
}),configurable:true});
})();
