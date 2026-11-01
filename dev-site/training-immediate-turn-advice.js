/* Development-only, removable Training turn-advice timing bridge.
 * Does not calculate recommendations or change card/game state.
 * Requests the frozen game's own #hintBtn recommendation as soon as the
 * first human hand becomes playable (including after a computer-first opening).
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const $=id=>document.getElementById(id);
const hand=$('playerHand'),hint=$('hintBtn'),coach=$('trainingCoachPanel'),title=$('trainingCoachTitle');
if(!hand||!hint||!coach||!title)return;
let active=false,openingSeen=false,signature='',attempts=0,queued=false,retries=[],requests=0;
function clearRetries(){for(const handle of retries)clearTimeout(handle);retries=[];}
function reset(){
 openingSeen=false;signature='';attempts=0;requests=0;clearRetries();
}
function adviceVisible(){
 const rec=hand.querySelector('.hand-card.matchable[data-card-id]');
 return !!rec&&!coach.hidden&&Boolean($('trainingCoachText')?.textContent?.trim())&&
   !/^(?:Opening Strategy|시작 전략)$/i.test(title.textContent.trim());
}
function blockingDialog(){
 return !!document.querySelector(
  '#devOpeningReview[open],#trainingFeedbackDialog[open],#shakeDialog[open],#bombDialog[open],'+
  '#gukjinDialog[open],#decisionDialog[open],#resultDialog[open],#quitConfirmDialog[open]');
}
function scan(){
 queued=false;
 if(!active)return;
 if(document.querySelector('.training-opening-dismiss-layer')){openingSeen=true;return;}
 if(!openingSeen||blockingDialog())return;
 const enabled=[...hand.querySelectorAll('.hand-card[data-card-id]:not(:disabled)')];
 if(!enabled.length)return;
 const nextSignature=enabled.map(el=>el.dataset.cardId).filter(Boolean).sort().join('|');
 if(!nextSignature)return;
 if(nextSignature!==signature){signature=nextSignature;attempts=0;clearRetries();}
 if(adviceVisible()||attempts>=3)return;
 // #hintBtn invokes the original game engine's recommendHumanCard; no
 // alternate evaluator, card click, or mutable game-state access exists here.
 attempts++;requests++;hint.click();
 // If a presentation transition briefly re-locks the hand, retry only
 // for this same hand; NEVER spin, duplicate advice, or act on later games.
 if(!adviceVisible()&&attempts<3){
  const expected=signature;
  const handle=setTimeout(()=>{
   retries=retries.filter(item=>item!==handle);
   if(active&&signature===expected)schedule();
  },240);
  retries.push(handle);
 }
}
function schedule(){if(queued)return;queued=true;queueMicrotask(scan);}
const observer=new MutationObserver(schedule);
observer.observe(hand,{subtree:true,childList:true,attributes:true,
 attributeFilter:['disabled','class','data-card-id']});
// Track the actual opening gate and turn transitions. No edits or handlers
// are installed on any of the game's card-input controls.
observer.observe(document.body,{childList:true,subtree:false});
document.addEventListener('click',event=>{
 const target=event.target;
 if(target?.closest?.('#trainingModeBtn')){active=true;reset();schedule();}
 else if(target?.closest?.('#playAgainBtn,#newGameYesBtn')&&active){reset();schedule();}
 else if(target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){
  active=false;reset();
 }
},{capture:true});
Object.defineProperty(globalThis,'GoStopDevImmediateTrainingAdvice',{configurable:true,
 value:Object.freeze({getStatus:()=>({
  active,openingSeen,signature,attempts,requests,adviceVisible:adviceVisible()
 })})});
})();
