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
if(!panel||!title||!text||!hand||!floor)return;
const SCOPE='dev-training-recommendation-lock';
let trainingActive=false,lock=null,suppressed=false;
const handSignature=()=>[...hand.querySelectorAll('.hand-card[data-card-id]')].map(node=>node.dataset.cardId)
 .filter(Boolean).sort().join('|');
const specialIsOpen=()=>!!document.querySelector('#shakeDialog[open],#bombDialog[open],#gukjinDialog[open],#decisionDialog[open],#resultDialog[open]');
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
   lock={handSignature:sig,hand:recommendation.dataset.cardId,
    floor:recommendedFloor?.dataset.cardId||null,title:originalTitle,text:originalText};
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
  text:lock?.text||null}), // diagnostic only, not local persistence
}),configurable:true});
})();
