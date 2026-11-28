/* Development-only human-readable Training card names.
 * This module only rewrites Training advice text. It never changes cards,
 * player choices, game state, production scripts, or learned weights.
 */
((root)=>{
'use strict';
const MONTHS=Object.freeze(['Pine','Plum','Cherry','Vine','Iris','Rose',
 'Bush','Hill','Daisy','Star','Berry','Willow']);
const TOKEN=/\bm\d{1,2}-\d+\b/gi;
const validId=id=>/^m\d{1,2}-\d+$/i.test(String(id||''));
function label(id,deck=root.GoStopEngine?.masterDeck,lang=typeof document!=='undefined'?
 document.documentElement.lang||'en':'en'){
 if(!validId(id))return null;
 const key=String(id).toLowerCase();
 const month=Number(/^m(\d{1,2})-/.exec(key)?.[1]||0);
 const family=MONTHS[month-1];
 if(!family)return 'Card';
 const cards=Array.isArray(deck)?deck:[];
 const card=cards.find(c=>String(c?.id||'').toLowerCase()===key);
 if(!card)return family+' card'; // Legacy ID: type is unknown; never invent it.
 const localized=root.GoStopTrainingLocales?.cardName?.(lang,card);
 if(localized&&!TOKEN.test(localized))return localized;
 TOKEN.lastIndex=0;
 const kind=card.id==='m9-1'&&card.flags?.includes('switchPi')?'Sake Cup':
  card.flags?.includes('doublePi')?'2x Single':
  card.type==='bright'?'Bright':
  card.type==='ribbon'?(card.ribbonSet==='red'?'Red ':
    card.ribbonSet==='blue'?'Blue ':'Plain ')+'Stripe':
  card.flags?.includes('godori')?'Bird Picture':
  card.type==='animal'?'Picture':
  card.type==='pi'?'Single':'card';
 return family+' '+kind;
}
function sanitize(value,deck=root.GoStopEngine?.masterDeck,lang=typeof document!=='undefined'?
 document.documentElement.lang||'en':'en'){
 return String(value??'').replace(TOKEN,id=>label(id,deck,lang)||'Card');
}
let trainingActive=false;
if(typeof document!=='undefined'&&
 /^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(location.hostname)){
 const text=document.getElementById('trainingCoachText');
 const normalize=()=>{
  if(!trainingActive||!text)return;
  const original=text.textContent||'',readable=sanitize(original);
  if(original!==readable)text.textContent=readable;
 };
 if(text)new MutationObserver(normalize).observe(text,
  {subtree:true,characterData:true,childList:true});
 document.addEventListener('click',event=>{
  if(event.target?.closest?.('#trainingModeBtn,#playAgainBtn,#newGameYesBtn')){
   trainingActive=true;queueMicrotask(normalize);
  }else if(event.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){
   trainingActive=false;
  }
 },{capture:true});
}
const api=Object.freeze({label,sanitize});
root.GoStopDevTrainingCardLabels=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
