/* Development-only copy correction for the Training Sake Cup choice.
 * Leave the existing recommendation, card values, game rules and buttons alone.
 * The frozen English text repeats "Use as Single / Use as 2 Singles" and can
 * make the TOTAL captured Single value sound like this card's individual value.
 */
(()=>{
'use strict';
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname))return;
const dialog=document.getElementById('gukjinDialog');
const reason=document.getElementById('gukjinTrainingReason');
const singleButton=document.getElementById('gukjinSingleBtn');
if(!dialog||!reason||!singleButton)return;
const oldEnglish=/^Recommended: Use as Single\. Use as 2 Singles\./;
const clearEnglish='Recommended: Use as Single. The Sake Cup counts as 2 Singles.';
function correctVisibleCopy(){
  if(!dialog.open||reason.hidden||!singleButton.classList.contains('training-choice-recommended'))return;
  const current=reason.textContent?.trim()||'';
  if(oldEnglish.test(current)&&current!==clearEnglish)reason.textContent=clearEnglish;
}
const observer=new MutationObserver(correctVisibleCopy);
observer.observe(dialog,{attributes:true,attributeFilter:['open']});
observer.observe(reason,{childList:true,characterData:true,subtree:true,attributes:true,attributeFilter:['hidden']});
correctVisibleCopy();
})();
