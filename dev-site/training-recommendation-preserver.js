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
const shaken=globalThis.GoStopDevShakenPriority;
const family=globalThis.GoStopDevTrainingFamilyCapture;
if(!panel||!title||!text||!hand||!floor)return;
const SCOPE='dev-training-recommendation-lock';
let trainingActive=false,lock=null,suppressed=false;
const handSignature=()=>[
 ...[...hand.querySelectorAll('.hand-card[data-card-id]')].map(node=>node.dataset.cardId).filter(Boolean),
 ...[...hand.querySelectorAll('.blank-turn-card')].map((_,i)=>'bomb-blank-'+i)
].sort().join('|');
const floorSignature=()=>cardIds('#floor .floor-card[data-card-id]').sort().join('|');
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
 en:name=>'Capture the opponent’s shaken '+name+' card before it can be reclaimed. Secure the revealed family first.',
 ko:name=>'상대가 흔든 '+name+' 패를 먼저 먹으세요. 상대의 흔든 패를 차단하는 것이 우선입니다.',
 es:name=>'Captura primero la carta '+name+' de la familia que sacudió el rival.',
 fr:name=>'Capturez d’abord la carte '+name+' de la famille révélée par l’adversaire.',
 de:name=>'Nimm zuerst die '+name+'-Karte aus der vom Gegner geschüttelten Familie.',
 ja:name=>'相手が振った'+name+'の札を優先して取ってください。',
 zh:name=>'优先收取对手已亮出并摇牌的'+name+'。'
};
function shakenOverride(currentHandId,currentFloorId){
 if(!shaken?.choose||!currentHandId||!currentFloorId)return null;
 const deck=globalThis.GoStopEngine?.masterDeck||[];
 if(!Array.isArray(deck))return null;
 const choice=shaken.choose({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  ownCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  deck,scorePlayer:globalThis.GoStopEngine?.scorePlayer,
  recommendedHandId:currentHandId,recommendedFloorId:currentFloorId
 });
 if(!choice)return null;
 const el=hand.querySelector('.hand-card[data-card-id="'+choice.handId+'"]');
 if(!el||!floor.querySelector('.floor-card[data-card-id="'+choice.floorId+'"]'))return null;
 const lang=document.documentElement.lang||'en';
 const card=deck.find(x=>x.id===choice.handId);
 const name=(card&&globalThis.GoStopTrainingLocales?.cardName?.(lang,card))||el.title||choice.handId;
 return {...choice,text:(shakenCopy[lang]||shakenCopy.en)(name)};
}

function bombBlankOverride(currentFloorId,originalTitle){
 if(currentFloorId||!/^(Recommended Move|추천 수|Jugada recomendada|Coup conseillé|Empfohlener Zug|おすすめの一手|推荐出牌)$/i.test(originalTitle))return null;
 const available=[...hand.querySelectorAll('.blank-turn-card:not(:disabled)')];
 if(!available.length)return null;
 const logic=globalThis.GoStopDevTrainingAdviceLogic;
 if(!logic?.recommendBombBlank?.({
  hand:cardIds('#playerHand .hand-card[data-card-id]'),
  floor:cardIds('#floor .floor-card[data-card-id]'),
  availableBlankTurns:available.length
 }))return null;
 return {blankOverride:true,text:logic.bombBlankText(document.documentElement.lang||'en')};
}
const familyCopy={
 en:(h,f)=>'Play '+h+' onto '+f+' first. Two cards in your hand share this family with a card on the table. Secure that capture before an unrelated 2x Single.',
 ko:(h,f)=>h+'을 '+f+'에 먼저 내세요. 손에 같은 월 패가 두 장 있고 바닥에도 한 장 있으므로 별개 월의 쌍피보다 이 패를 먼저 먹으세요.',
 es:(h,f)=>'Juega '+h+' sobre '+f+' primero. Tienes dos cartas de esta familia en la mano y una en la mesa. Asegura esta captura antes que un doble simple distinto.',
 fr:(h,f)=>'Jouez d’abord '+h+' sur '+f+'. Vous avez dos cartes de cette famille en main et une sur la table. Assurez cette prise avant un double simple distinct.',
 de:(h,f)=>'Spiele zuerst '+h+' auf '+f+'. Zwei Handkarten dieser Familie passen zur Tischkarte. Sichere diesen Fang vor einer anderen Doppel-Einzelkarte.',
 ja:(h,f)=>'まず'+h+'を'+f+'に出しましょう。同じ月が手札に2枚、場に1枚あります。別の二枚カスよりこの組を先に取ってください。',
 zh:(h,f)=>'先用'+h+'配对'+f+'。手里有两张同月牌，桌面还有一张。先确保收取这一组，而不是先收其他双散牌。'
};
function familyCaptureOverride(currentHandId,currentFloorId){
 const deck=globalThis.GoStopEngine?.masterDeck||[];
 const picked=family?.select?.({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  deck,recommendedHandId:currentHandId,recommendedFloorId:currentFloorId
 });
 if(!picked||!hand.querySelector('.hand-card[data-card-id="'+picked.handId+'"]')||
   !floor.querySelector('.floor-card[data-card-id="'+picked.floorId+'"]'))return null;
 const lang=document.documentElement.lang||'en';
 const label=id=>{
  const c=deck.find(v=>v.id===id);
  const el=hand.querySelector('[data-card-id="'+id+'"]')||floor.querySelector('[data-card-id="'+id+'"]');
  return (c&&globalThis.GoStopTrainingLocales?.cardName?.(lang,c))||el?.title||id;
 };
 return {...picked,familyPriority:true,text:(familyCopy[lang]||familyCopy.en)(label(picked.handId),label(picked.floorId))};
}
function saferDiscardOverride(currentHandId,currentFloorId){
 if(currentFloorId||!currentHandId)return null;
 const logic=globalThis.GoStopDevTrainingAdviceLogic,engine=globalThis.GoStopEngine;
 if(!logic?.safestDiscard||!engine?.scorePlayer)return null;
 const deck=engine.masterDeck||[];
 const visible={
  hand:cardIds('#playerHand .hand-card[data-card-id]'),
  floor:cardIds('#floor .floor-card[data-card-id]'),
  humanCaptured:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  computerCaptured:cardIds('#aiCaptured .captured-mini[data-card-id]')
 };
 const ranked=logic.safestDiscard(visible,deck,engine.scorePlayer);
 const best=ranked?.choice,original=logic.discardDanger?.(currentHandId,visible,deck,engine.scorePlayer);
 if(!best||!original||best.cardId===currentHandId||
   best.maximumGain>=original.maximumGain)return null;
 const lang=document.documentElement.lang||'en';
 const label=id=>{
  const card=deck.find(c=>c.id===id),element=hand.querySelector('[data-card-id="'+id+'"]');
  return globalThis.GoStopTrainingLocales?.cardName?.(lang,card)||
   element?.title||element?.querySelector('img')?.alt||id;
 };
 return {handId:best.cardId,floorId:null,riskOverride:true,
  text:logic.riskyDiscardCopy(label(best.cardId),label(currentHandId),original,lang)};
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
 const sig=handSignature(),tableSig=floorSignature();
 if(lock&&(!sig||sig!==lock.handSignature||tableSig!==lock.floorSignature||!hand.querySelector('[data-card-id="'+lock.hand+'"]')||lock.blankOverride&&!hand.querySelector('.blank-turn-card:not(:disabled)'))){
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
   const corrective=bombBlankOverride(recommendedFloor?.dataset.cardId||null,originalTitle)||
    reservedPileOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    shakenOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    familyCaptureOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    saferDiscardOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null);
   lock={handSignature:sig,floorSignature:tableSig,hand:corrective?.handId||recommendation.dataset.cardId,
    floor:corrective?.floorId||recommendedFloor?.dataset.cardId||null,
    title:originalTitle,text:corrective?.text||originalText,ppeokOverride:!!corrective?.stackCardIds,shakenOverride:!!(corrective&&!corrective.stackCardIds&&!corrective.riskOverride&&!corrective.blankOverride&&!corrective.familyPriority),riskOverride:!!corrective?.riskOverride,blankOverride:!!corrective?.blankOverride,familyPriority:!!corrective?.familyPriority};
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
 const recommendedHand=lock.blankOverride
  ?hand.querySelector('.blank-turn-card:not(:disabled)')
  :hand.querySelector('.hand-card[data-card-id="'+lock.hand+'"]');
 hand.querySelectorAll('.hand-card.matchable').forEach(el=>{
  if(el!==recommendedHand)el.classList.remove('matchable');
 });
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
  hand:lock?.blankOverride?null:lock?.hand||null,floor:lock?.floor||null,
  text:lock?.text||null,ppeokOverride:!!lock?.ppeokOverride,riskOverride:!!lock?.riskOverride,bombBlankOverride:!!lock?.blankOverride,familyPriority:!!lock?.familyPriority}), // diagnostic only, not local persistence
}),configurable:true});
})();
