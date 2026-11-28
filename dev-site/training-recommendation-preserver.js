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
const safeTwo=globalThis.GoStopDevTrainingSafeTwoTable;
const modelInference=globalThis.GoStopDevTrainingModelInference;
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
// Dev-only English fallback: production cardName() has no 'en' DATA entry.
const monthNames=['Pine','Plum','Cherry','Vine','Iris','Rose','Bush','Hill','Daisy','Star','Berry','Willow'];
function cardLabel(id){
 const lang=document.documentElement.lang||'en',deck=globalThis.GoStopEngine?.masterDeck||[];
 const canonical=globalThis.GoStopDevTrainingCardLabels?.label?.(id,deck,lang);
 if(canonical)return canonical;
 const card=Array.isArray(deck)?deck.find(c=>c.id===id):null;
 const localized=card&&globalThis.GoStopTrainingLocales?.cardName?.(lang,card);
 if(localized)return localized;
 if(lang==='en'&&card){
  const family=monthNames[card.month-1];
  const kind=card.flags?.includes('doublePi')?'2x Single':
   card.type==='bright'?'Bright':
   card.type==='ribbon'?(card.ribbonSet==='red'?'Red ':card.ribbonSet==='blue'?'Blue ':'Plain ')+'Stripe':
   card.flags?.includes('godori')?'Bird Picture':
   card.type==='animal'?'Picture':card.type==='pi'?'Single':null;
  if(family&&kind)return family+' '+kind;
 }
 const el=hand.querySelector('[data-card-id="'+id+'"]')||floor.querySelector('[data-card-id="'+id+'"]');
 const candidate=el?.title||el?.querySelector('img')?.alt||'';
 const safe=globalThis.GoStopDevTrainingCardLabels?.sanitize?.(candidate,deck,lang);
 if(safe&&safe!==candidate)return safe;
 const family=monthNames[Number(/^m(\d{1,2})-/i.exec(String(id))?.[1]||0)-1];
 return candidate&&!/\bm\d{1,2}-\d+\b/i.test(candidate)?candidate:
  family?family+' card':'Card';
}
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
 const name=cardLabel(chosen.handId);
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
 const name=cardLabel(choice.handId);
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
 en:(h,f)=>'Play '+h+' onto '+f+'. You hold two cards of this family; capture it first.',
 ko:(h,f)=>h+'을 '+f+'에 내세요. 손에 같은 월 패가 두 장 있으므로 이 패부터 먹으세요.',
 es:(h,f)=>'Juega '+h+' sobre '+f+'. Tienes dos cartas de esta familia; captúrala primero.',
 fr:(h,f)=>'Jouez '+h+' sur '+f+'. Vous avez deux cartes de cette famille ; prenez-la d’abord.',
 de:(h,f)=>'Spiele '+h+' auf '+f+'. Du hast zwei Karten dieser Familie; fange sie zuerst.',
 ja:(h,f)=>h+'を'+f+'に出しましょう。同じ月の手札が2枚あるので先に取りましょう。',
 zh:(h,f)=>'用'+h+'配对'+f+'。手中有两张同月牌，先收这一组。'
};
function familyCaptureOverride(currentHandId,currentFloorId){
 const deck=globalThis.GoStopEngine?.masterDeck||[];
 const picked=family?.select?.({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  ownCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  deck,recommendedHandId:currentHandId,recommendedFloorId:currentFloorId
 });
 if(!picked||!hand.querySelector('.hand-card[data-card-id="'+picked.handId+'"]')||
   !floor.querySelector('.floor-card[data-card-id="'+picked.floorId+'"]'))return null;
 const lang=document.documentElement.lang||'en';
 return {...picked,familyPriority:true,text:(familyCopy[lang]||familyCopy.en)(
  cardLabel(picked.handId),cardLabel(picked.floorId))};
}
function safeTwoTableOverride(currentHandId,currentFloorId){
 if(!currentHandId||!currentFloorId||!safeTwo?.select)return null;
 // Opponent's publicly revealed Shake is a protected immediate capture.
 // Never postpone it merely because this family's two table cards could
 // otherwise support a later capture.
 const revealed=shaken?.getStatus?.()?.revealedMonths||[];
 const month=id=>Number(/^m(\d{1,2})-[1-4]$/.exec(id)?.[1]||0);
 if(revealed.some(m=>
  cardIds('#playerHand .hand-card[data-card-id]').some(id=>month(id)===m)&&
  cardIds('#floor .floor-card[data-card-id]').some(id=>month(id)===m)))return null;
 const deck=globalThis.GoStopEngine?.masterDeck||[];
 const chosen=safeTwo.select({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  ownCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  opponentCapturedIds:cardIds('#aiCaptured .captured-mini[data-card-id]'),
  deck,scorePlayer:globalThis.GoStopEngine?.scorePlayer,
  recommendedHandId:currentHandId,recommendedFloorId:currentFloorId
 });
 if(!chosen||!hand.querySelector('.hand-card[data-card-id="'+chosen.handId+'"]')||
  !floor.querySelector('.floor-card[data-card-id="'+chosen.floorId+'"]'))return null;
 const lang=document.documentElement.lang||'en';
 const label=cardLabel;
 const action=lang==='en'?'Play '+label(chosen.handId)+' onto '+
  label(chosen.floorId)+'. ':label(chosen.handId)+' → '+label(chosen.floorId)+'. ';
 return {...chosen,safeTwoPriority:true,text:action+safeTwo.explain(chosen.deferredMonth,lang)};
}
const modelCopy={
 en:(h,f,v)=>'Play '+h+' onto '+f+'. These legal captures have equivalent protected strategy priority; activated Training model v'+v+' favors this choice from confirmed expert feedback.',
 ko:(h,f,v)=>h+'을 '+f+'에 내세요. 보호된 전략 우선순위가 같은 수 중에서 확정된 전문가 피드백을 반영한 개발 훈련 모델 v'+v+'이 이 선택을 추천합니다.',
 es:(h,f,v)=>'Juega '+h+' sobre '+f+'. Entre capturas de igual prioridad estratégica, el modelo de entrenamiento v'+v+' prefiere esta opción según opiniones confirmadas.',
 fr:(h,f,v)=>'Jouez '+h+' sur '+f+'. Parmi les prises de même priorité protégée, le modèle v'+v+' privilégie ce choix selon les avis confirmés.',
 de:(h,f,v)=>'Spiele '+h+' auf '+f+'. Bei gleichrangigen sicheren Zügen bevorzugt das Trainingsmodell v'+v+' diese bestätigte Expertenwahl.',
 ja:(h,f,v)=>h+'を'+f+'に出してください。固定戦略上同じ優先度の合法手から、確定した指導内容を学んだモデルv'+v+'が選びました。',
 zh:(h,f,v)=>'先用'+h+'配对'+f+'。在同等受保护战略优先级的合法走法中，训练模型v'+v+'根据确认的专家反馈推荐此选择。'
};
function modelOverride(currentHandId,currentFloorId){
 if(!currentHandId||!currentFloorId||!modelInference?.choose)return null;
 // Already revealed opponent Shake families take precedence over learned
 // weights even when the native recommendation already targets that family.
 const revealed=shaken?.getStatus?.()?.revealedMonths||[];
 const handIds=cardIds('#playerHand .hand-card[data-card-id]');
 const floorIds=cardIds('#floor .floor-card[data-card-id]');
 const month=id=>Number(/^m(\d{1,2})-/.exec(id)?.[1]||0);
 if(revealed.some(m=>handIds.some(id=>month(id)===m)&&floorIds.some(id=>month(id)===m)))
  return null;
 const deck=globalThis.GoStopEngine?.masterDeck||[];
 const picked=modelInference.choose({
  handIds:cardIds('#playerHand .hand-card[data-card-id]'),
  floorIds:cardIds('#floor .floor-card[data-card-id]'),
  ownCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  opponentCapturedIds:cardIds('#aiCaptured .captured-mini[data-card-id]'),
  deck,scorePlayer:globalThis.GoStopEngine?.scorePlayer,
  recommendedHandId:currentHandId,recommendedFloorId:currentFloorId
 });
 if(!picked||!hand.querySelector('.hand-card[data-card-id="'+picked.handId+'"]')||
  !floor.querySelector('.floor-card[data-card-id="'+picked.floorId+'"]'))return null;
 const deferred=safeTwo?.eligible?.({
  handIds,floorIds,
  ownCapturedIds:cardIds('#playerCaptured .captured-mini[data-card-id]'),
  opponentCapturedIds:cardIds('#aiCaptured .captured-mini[data-card-id]'),
  deck,scorePlayer:globalThis.GoStopEngine?.scorePlayer
 })||[];
 if(deferred.some(x=>x.handId===picked.handId&&x.floorIds.includes(picked.floorId))&&
  !deferred.some(x=>x.handId===currentHandId&&x.floorIds.includes(currentFloorId)))
  return null;
 const lang=document.documentElement.lang||'en';
 const label=cardLabel;
 return {...picked,modelPriority:true,text:(modelCopy[lang]||modelCopy.en)(
  label(picked.handId),label(picked.floorId),picked.version)};
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
 if(!best||!original||!original.evidence||best.cardId===currentHandId||
   best.maximumGain>=original.maximumGain)return null;
 const lang=document.documentElement.lang||'en';
 const label=cardLabel;
 const copy=logic.riskyDiscardCopy(label(best.cardId),label(currentHandId),original,
  lang,label(original.evidence.matchingId));
 if(!copy)return null;
 return {handId:best.cardId,floorId:null,riskOverride:true,text:copy};
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
  const originalTitle=title.textContent?.trim()||'';
  const sourceText=text.textContent?.trim()||'';
  const originalText=globalThis.GoStopDevTrainingCardLabels?.sanitize?.(sourceText)||
   sourceText;
  if(originalText){
   const corrective=bombBlankOverride(recommendedFloor?.dataset.cardId||null,originalTitle)||
    reservedPileOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    shakenOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    familyCaptureOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    saferDiscardOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    safeTwoTableOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null)||
    modelOverride(recommendation.dataset.cardId,recommendedFloor?.dataset.cardId||null);
   lock={handSignature:sig,floorSignature:tableSig,hand:corrective?.handId||recommendation.dataset.cardId,
    floor:corrective?.floorId||recommendedFloor?.dataset.cardId||null,
    title:originalTitle,text:corrective?.text||originalText,ppeokOverride:!!corrective?.stackCardIds,shakenOverride:!!(corrective&&!corrective.stackCardIds&&!corrective.riskOverride&&!corrective.blankOverride&&!corrective.familyPriority&&!corrective.safeTwoPriority&&!corrective.modelPriority),riskOverride:!!corrective?.riskOverride,blankOverride:!!corrective?.blankOverride,familyPriority:!!corrective?.familyPriority,safeTwoPriority:!!corrective?.safeTwoPriority,modelPriority:!!corrective?.modelPriority};
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
  if(corrected&&text.textContent===corrected&&!lock.familyPriority&&!lock.blankOverride&&!lock.ppeokOverride&&!lock.shakenOverride&&!lock.riskOverride&&!lock.safeTwoPriority&&!lock.modelPriority){
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
  text:lock?.text||null,ppeokOverride:!!lock?.ppeokOverride,riskOverride:!!lock?.riskOverride,bombBlankOverride:!!lock?.blankOverride,familyPriority:!!lock?.familyPriority,safeTwoPriority:!!lock?.safeTwoPriority,modelPriority:!!lock?.modelPriority}), // diagnostic only, not local persistence
}),configurable:true});
})();
