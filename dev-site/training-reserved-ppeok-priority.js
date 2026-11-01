/* Development-only reserved three-card pile preference.
 * Pure, removable comparison over visible cards; it never changes game state.
 * Both captures must be reserved (all four family cards publicly accounted for).
 * Only replace an already recommended single-card capture when the opponent
 * has a Single to transfer and a matching three-card stack is capturable.
 */
(function(root){
'use strict';
const month=id=>{
 const match=/^m(\d{1,2})-[1-4]$/.exec(String(id||''));
 const n=Number(match?.[1]||0);
 return n>=1&&n<=12?n:0;
};
const distinct=items=>[...new Set(Array.isArray(items)?items:[])];
function select({
 handIds=[],floorIds=[],humanCapturedIds=[],opponentCapturedIds=[],
 opponentSingleIds=[],stacks=[],recommendedHandId=null,recommendedFloorId=null
}={}){
 const hand=distinct(handIds),floor=distinct(floorIds);
 const all=distinct([...hand,...floor,...humanCapturedIds,...opponentCapturedIds]);
 const reserved=m=>m>0&&all.filter(id=>month(id)===m).length===4;
 if(!opponentSingleIds.length||!recommendedHandId||!recommendedFloorId)return null;
 if(!hand.includes(recommendedHandId)||!floor.includes(recommendedFloorId))return null;
 const otherMonth=month(recommendedHandId);
 if(!otherMonth||month(recommendedFloorId)!==otherMonth||!reserved(otherMonth))return null;
 const pileCards=new Set(stacks.flatMap(stack=>stack.cardIds||[]));
 if(pileCards.has(recommendedFloorId))return null; // Already a pile.
 const choices=[];
 for(const stack of stacks){
  const cards=distinct(stack.cardIds);
  if(cards.length!==3||!cards.every(id=>floor.includes(id)))continue;
  const m=month(cards[0]);
  if(!m||m===otherMonth||cards.some(id=>month(id)!==m)||!reserved(m))continue;
  const matching=hand.filter(id=>month(id)===m);
  if(matching.length!==1)continue;
  // Floor-stack target selection in the protected game uses the last card.
  choices.push({handId:matching[0],floorId:cards[cards.length-1],
   month:m,stackCardIds:cards,otherHandId:recommendedHandId,
   otherFloorId:recommendedFloorId,stolenSingles:1,totalCapturedCards:4});
 }
 choices.sort((a,b)=>a.month-b.month||a.handId.localeCompare(b.handId));
 return choices[0]||null;
}
const api=Object.freeze({select,month});
root.GoStopDevReservedPpeokPriority=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
