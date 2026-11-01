/* Removable development-only Training advice scheduler.
 * Requests ONLY the frozen game's native #hintBtn, three seconds after
 * the human has an actionable hand. No card/scoring/game-code changes.
 *
 * A previous implementation scheduled a new microtask for every hand DOM
 * mutation, which could starve the browser when several Training observers
 * and native render() updated the same nodes. This version uses bounded
 * macrotasks and never observes its own visual highlight class changes.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const $=id=>document.getElementById(id);
const hand=$('playerHand'),hint=$('hintBtn'),coach=$('trainingCoachPanel'),title=$('trainingCoachTitle');
if(!hand||!hint||!coach||!title)return;
const DELAY_MS=3000,SCAN_DEBOUNCE_MS=35,MAX_ATTEMPTS=2;
let active=false,signature='',readySince=0,attempts=0,requests=0,scans=0;
let scanTimer=null,adviceTimer=null,retryTimer=null;
function clearTimer(handle){if(handle!==null)clearTimeout(handle);}
function resetHand(){
 clearTimer(adviceTimer);clearTimer(retryTimer);
 adviceTimer=null;retryTimer=null;signature='';readySince=0;attempts=0;
}
function reset(){resetHand();requests=0;}
function adviceVisible(){
 const rec=hand.querySelector('.hand-card.matchable[data-card-id]');
 return !!rec&&!coach.hidden&&!!$('trainingCoachText')?.textContent?.trim()&&
  !/^(?:Opening Strategy|시작 전략)$/i.test(title.textContent.trim());
}
function blocked(){
 return !!document.querySelector('.training-opening-dismiss-layer,'+
  '#devOpeningReview[open],#trainingFeedbackDialog[open],'+
  '#shakeDialog[open],#bombDialog[open],#gukjinDialog[open],'+
  '#decisionDialog[open],#resultDialog[open],#quitConfirmDialog[open]');
}
function schedule(){
 if(!active||scanTimer!==null)return;
 // setTimeout, not queueMicrotask: a render/mutation feedback cycle MUST
 // yield back to Chrome and let the user keep playing.
 scanTimer=setTimeout(()=>{scanTimer=null;scan();},SCAN_DEBOUNCE_MS);
}
function scan(){
 scans++;
 if(!active)return;
 if(blocked()) {if(signature)resetHand();return;}
 const enabled=[...hand.querySelectorAll('.hand-card[data-card-id]:not(:disabled)')];
 const next=enabled.map(el=>el.dataset.cardId).filter(Boolean).sort().join('|');
 if(!next){if(signature)resetHand();return;}
 if(next!==signature){
  resetHand();signature=next;readySince=performance.now();
 }
 if(adviceVisible()){clearTimer(adviceTimer);adviceTimer=null;return;}
 const remaining=DELAY_MS-(performance.now()-readySince);
 if(remaining>0){
  if(adviceTimer===null){
   const expected=signature;
   adviceTimer=setTimeout(()=>{
    adviceTimer=null;
    if(active&&signature===expected)schedule();
   },Math.max(1,Math.ceil(remaining)));
  }
  return;
 }
 if(attempts>=MAX_ATTEMPTS)return;
 attempts++;requests++;
 // Native Hint retains the authoritative Training recommendation and
 // explanation. Never synthesize a move or dispatch card input.
 hint.click();
 if(!adviceVisible()&&attempts<MAX_ATTEMPTS&&retryTimer===null){
  const expected=signature;
  retryTimer=setTimeout(()=>{
   retryTimer=null;if(active&&signature===expected)schedule();
  },450);
 }
}
const observer=new MutationObserver(schedule);
observer.observe(hand,{subtree:true,childList:true,attributes:true,
 attributeFilter:['disabled','data-card-id']});
// Close of an opening/feedback dialog may not change hand markup.
document.addEventListener('close',schedule,true);
document.addEventListener('click',event=>{
 const target=event.target;
 if(target?.closest?.('#trainingModeBtn')){
  active=true;reset();schedule();
 }else if(target?.closest?.('#playAgainBtn,#newGameYesBtn')&&active){
  reset();schedule();
 }else if(target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){
  active=false;reset();clearTimer(scanTimer);scanTimer=null;
 }else if(target?.closest?.('.training-opening-dismiss-layer')){
  // The game's own click handler advances the opening presentation.
  setTimeout(schedule,0);
 }
},{capture:true});
Object.defineProperty(globalThis,'GoStopDevImmediateTrainingAdvice',{
 configurable:true,value:Object.freeze({getStatus:()=>({
  active,signature,attempts,requests,scans,adviceVisible:adviceVisible(),
  blocked:blocked(),delayMs:DELAY_MS,
  readyForMs:readySince?Math.round(performance.now()-readySince):0
 })})
});
})();
