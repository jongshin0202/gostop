/* Pure, development-only visible-table opponent scoring ceiling.
 * The opponent's hand and draw remain unknown. For each possible pair of
 * unseen matching cards, enumerate up to two distinct table captures using
 * the same public scoring function as GoStopEngine. Never read hidden state.
 */
(function(root){
'use strict';
const month=id=>Number(/^m(\d{1,2})-[1-4]$/.exec(String(id||''))?.[1]||0);
const unique=xs=>[...new Set(Array.isArray(xs)?xs:[])];
function analyze({
 deck=[],floorIds=[],stacks=[],playerHandIds=[],playerCapturedIds=[],
 opponentCapturedIds=[],opponentScore=null,score=null
}={}){
 if(!Array.isArray(deck)||deck.length<48||typeof score!=='function'||
    !Number.isInteger(opponentScore)||opponentScore<0)return null;
 const byId=new Map(deck.map(c=>[c.id,c]));
 const get=ids=>unique(ids).map(id=>byId.get(id)).filter(Boolean);
 if(!floorIds.every(id=>byId.has(id)))return null;
 const opponentCaptured=get(opponentCapturedIds),myCaptured=get(playerCapturedIds);
 const base=score(opponentCaptured).total;
 const bonus=Math.max(0,opponentScore-base);
 const known=new Set([...floorIds,...playerHandIds,...playerCapturedIds,...opponentCapturedIds]);
 const unseen=deck.filter(c=>!known.has(c.id));
 const groupList=[],stackIds=new Set();
 for(const stack of stacks){
  const ids=unique(stack.cardIds);
  if(ids.length<2||ids.some(id=>!floorIds.includes(id)))continue;
  ids.forEach(id=>stackIds.add(id));
  groupList.push({month:month(ids[0]),cards:get(ids),pile:true});
 }
 for(const id of unique(floorIds)){
  if(stackIds.has(id))continue;
  const card=byId.get(id);if(card)groupList.push({month:card.month,cards:[card],pile:false});
 }
 const availablePi=myCaptured.filter(c=>c.type==='pi'||c.id==='m9-1').sort((a,b)=>{
  const value=c=>c.flags?.includes('doublePi')||c.id==='m9-1'?2:1;
  return value(b)-value(a);
 });
 const matching=groupList.map(g=>unseen.filter(c=>c.month===g.month));
 let maximum=opponentScore,mostAdded=0;
 const evaluate=(groups,sources)=>{
  const added=new Map();
  groups.flatMap(g=>g.cards).concat(sources).forEach(c=>added.set(c.id,c));
  const additions=[...added.values()];
  // Allow a potential transfer on a pile/sweep/paired same-month capture.
  // This is deliberately an upper bound, not a prediction of the draw.
  const couldSteal=groups.some(g=>g.pile)||
   groups.length===groupList.length||
   (groups.length===2&&groups[0].month===groups[1].month);
  const withSteal=couldSteal&&availablePi.length?
   [...additions,availablePi[0]]:additions;
  const after=score([...opponentCaptured,...withSteal]).total+bonus;
  if(after>maximum){maximum=after;mostAdded=withSteal.length;}
 };
 for(let i=0;i<groupList.length;i++){
  const choices=matching[i];
  for(const a of choices)evaluate([groupList[i]],[a]);
  for(let j=i+1;j<groupList.length;j++){
   for(const a of choices)for(const b of matching[j]){
    if(a.id!==b.id)evaluate([groupList[i],groupList[j]],[a,b]);
   }
  }
 }
 return {maxOpponentScore:maximum,currentOpponentScore:opponentScore,
  canReachSeven:maximum>=7,availableFloorCaptures:groupList.length,
  worstCaseAddedCardCount:mostAdded,method:'visible-table-upper-bound'};
}
const api=Object.freeze({analyze,month});
root.GoStopDevOpponentRisk=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
