/* Removable, development-only Training turn-advice timing bridge.
 * At 3 seconds after a player's hand becomes playable, request the exact
 * recommendation already implemented by the frozen game via #hintBtn.
 * Never change the protected game logic, card inputs or scoring.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const $=id=>document.getElementById(id);
const hand=$('playerHand'),hint=$('hintBtn'),coach=$('trainingCoachPanel'),title=$('trainingCoachTitle');
if(!hand||!hint||!coach||!title)return;
const DELAY_MS=3000;
let active=false,openingSeen=false,signature='',readySince=0,attempts=0;
let queued=false,primaryTimer=null,retries=[],requests=0;
function clearTimer(){if(primaryTimer!==null){clearTimeout(primaryTimer);primaryTimer=null;}}
function clearRetries(){for(const handle of retries)clearTimeout(handle);retries=[];}
function resetHand(){clearTimer();clearRetries();signature='';readySince=0;attempts=0;}
function reset(){openingSeen=false;resetHand();requests=0;}
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
 if(!enabled.length){if(signature)resetHand();return;}
 const next=enabled.map(el=>el.dataset.cardId).filter(Boolean).sort().join('|');
 if(!next)return;
 if(next!==signature){resetHand();signature=next;readySince=performance.now();}
 if(adviceVisible()){clearTimer();return;}
 const remaining=DELAY_MS-(performance.now()-readySince);
 if(remaining>0){
  if(primaryTimer===null){
   primaryTimer=setTimeout(()=>{primaryTimer=null;schedule();},Math.ceil(remaining)+1);
  }
  return;
 }
 if(attempts>=3)return;
 // This is the same native action the user can invoke; it calls the game's
 // recommendHumanCard, never a separate or newly learned strategy.
 attempts++;requests++;hint.click();
 // In case the game is briefly presentation-locked, bound retries can request
 // the same native advice after the 3-second deadline. No early hint is fired.
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
observer.observe(document.body,{childList:true,subtree:false});
// The opening review and other dialogs do not necessarily change the cards
// when dismissed; resume the timing check after their close events as well.
document.addEventListener('close',schedule,true);
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
  active,openingSeen,signature,attempts,requests,adviceVisible:adviceVisible(),
  delayMs:DELAY_MS,readyForMs:readySince?Math.round(performance.now()-readySince):0
 })})});
})();
