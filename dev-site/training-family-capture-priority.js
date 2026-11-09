/* Development-only Training family-capture priority.
 * Two physical cards in hand + one table card in the SAME month are a
 * guaranteed immediately available capture pair. Prefer it to a capture from
 * a different month whose single 2x-Single value otherwise dominates.
 * No private cards, game state mutations, or learned weight changes.
 */
((root)=>{
'use strict';
const month=id=>{
 const n=Number(/^m(\d{1,2})-[1-4]$/.exec(String(id||''))?.[1]||0);
 return n>=1&&n<=12?n:0;
};
const unique=v=>[...new Set(Array.isArray(v)?v:[])];
const cardPriority=c=>c?.type==='bright'?600:
 c?.type==='ribbon'?500:
 c?.type==='pi'&&c.flags?.includes('doublePi')?450:
 c?.flags?.includes('godori')?420:
 c?.type==='pi'?350:
 c?.type==='animal'?300:0;
function select({handIds=[],floorIds=[],ownCapturedIds=[],deck=[],
 recommendedHandId=null,recommendedFloorId=null}={}){
 const hand=unique(handIds),floor=unique(floorIds);
 if(!hand.length||!floor.length||!Array.isArray(deck))return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const recHand=byId.get(recommendedHandId),recTarget=byId.get(recommendedFloorId);
 if(!recHand||!recTarget)return null;
 // Protect immediate scoring goals from the family-lock correction.
 // Bright capture, live 5-BIRDIES birdie and completion of a third same-set
 // Stripe are strategic hard priorities and must not be displaced.
 if(recTarget.type==='bright'||recTarget.flags?.includes('godori'))return null;
 if(recTarget.type==='ribbon'&&recTarget.ribbonSet){
  const already=unique(ownCapturedIds).map(id=>byId.get(id)).filter(c=>
   c?.type==='ribbon'&&c.ribbonSet===recTarget.ribbonSet).length;
  if(already>=2)return null;
 }
 const picks=[];
 for(let m=1;m<=12;m++){
  const holding=hand.filter(id=>month(id)===m);
  const targets=floor.filter(id=>month(id)===m);
  // Precisely the reported family-lock pattern. This is a playable capture,
  // not an inference from hidden or undealt cards.
  if(holding.length!==2||targets.length!==1)continue;
  const handCard=holding.sort((a,b)=>cardPriority(byId.get(b))-cardPriority(byId.get(a))||
   a.localeCompare(b))[0];
  if(!byId.has(handCard)||!byId.has(targets[0]))continue;
  picks.push({handId:handCard,floorId:targets[0],month:m,
   handFamilyCount:2,tableFamilyCount:1,
   weight:cardPriority(byId.get(handCard))+cardPriority(byId.get(targets[0]))});
 }
 picks.sort((a,b)=>b.weight-a.weight||a.month-b.month||a.handId.localeCompare(b.handId));
 const chosen=picks[0];
 if(!chosen||recommendedHandId===chosen.handId&&recommendedFloorId===chosen.floorId)
  return null; // Native advice already obeyed the family priority.
 return {...chosen,changed:true,
  alternativeHandId:recommendedHandId,alternativeFloorId:recommendedFloorId};
}
const api=Object.freeze({select,month,cardPriority});
root.GoStopDevTrainingFamilyCapture=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
