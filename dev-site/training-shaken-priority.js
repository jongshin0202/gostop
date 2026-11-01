/* Development-only opponent shake capture priority. Only observed, publicly
 * revealed opponent shake families are considered. No hidden-hand access.
 * Never changes scoring or game actions.
 */
(function(root){
'use strict';
const month=id=>Number(/^m(\d{1,2})-[1-4]$/.exec(String(id||''))?.[1]||0);
function choose({shakenMonths=[],handIds=[],floorIds=[],recommendedHandId,
 recommendedFloorId,deck=[],ownCapturedIds=[]}={}){
 const revealed=new Set(shakenMonths);
 if(!revealed.size||!recommendedHandId||!recommendedFloorId)return null;
 const cards=new Map(deck.map(c=>[c.id,c])),native=cards.get(recommendedFloorId);
 if(!native||!handIds.includes(recommendedHandId)||!floorIds.includes(recommendedFloorId))return null;
 // Do not override an irreplaceable Bright, five-bird completion, completed
 // scoring stripe set, or an immediate score-completing capture.
 const owned=ownCapturedIds.map(id=>cards.get(id)).filter(Boolean);
 const brightCount=owned.filter(c=>c.type==='bright').length;
 const birdies=owned.filter(c=>c.flags?.includes('godori')).length;
 const ribbons=owned.filter(c=>c.type==='ribbon');
 const ribbonCount=ribbons.filter(c=>c.ribbonSet===native.ribbonSet).length;
 const mustHave=native.type==='bright'&&(brightCount===2||brightCount===4)||
  native.flags?.includes('godori')&&birdies===2||
  native.type==='ribbon'&&native.ribbonSet&&ribbonCount===2;
 if(mustHave)return null;
 for(const m of [...revealed].sort((a,b)=>a-b)){
  if(month(recommendedFloorId)===m)return null; // Already capturing shake family.
  const h=handIds.find(id=>month(id)===m);
  const f=floorIds.find(id=>month(id)===m);
  if(h&&f)return {handId:h,floorId:f,month:m};
 }
 return null;
}
const api=Object.freeze({choose,month});
root.GoStopDevShakenPriorityLogic=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
if(!/^(?:gostop-dev(?:-[a-z0-9-]+)?\.vercel\.app|localhost|127\.0\.0\.1)$/.test(root.location?.hostname||''))return;
const dialog=document.getElementById('shakeRevealDialog');
const revealedMonths=new Set();let training=false;
function record(){
 if(!training||!dialog?.open)return;
 const ids=[...dialog.querySelectorAll('.magnified-card[data-card-id]')].map(x=>x.dataset.cardId);
 const m=month(ids[0]);
 if(ids.length>=3&&m&&ids.every(id=>month(id)===m))revealedMonths.add(m);
}
if(dialog)new MutationObserver(record).observe(dialog,{attributes:true,childList:true,subtree:true,attributeFilter:['open','data-card-id']});
document.addEventListener('click',e=>{
 if(e.target?.closest?.('#trainingModeBtn,#playAgainBtn,#newGameYesBtn')){
  training=true;revealedMonths.clear();
 }else if(e.target?.closest?.('#playSoloBtn,#quitYesBtn,#resultQuitBtn')){
  training=false;revealedMonths.clear();
 }
},true);
root.GoStopDevShakenPriority=Object.freeze({choose:context=>training?choose({...context,shakenMonths:[...revealedMonths]}):null,
 getStatus:()=>({active:training,revealedMonths:[...revealedMonths]})});
})(typeof globalThis!=='undefined'?globalThis:this);
