/* Pure visible-card evaluation for the separate development opening reviewer.
 * "Suggested" means plausible, not guaranteed. The expert selects final goals.
 */
((root)=>{
'use strict';
const STRATEGIES=['brights','godori','red-stripes','blue-stripes','plain-stripes','singles','pictures','shake-bomb'];
const ribbonMap={'red-stripes':'red','blue-stripes':'blue','plain-stripes':'grass'};
const unique=ids=>[...new Set(ids||[])];
function evaluate(visible,deck){
 const hand=unique(visible?.hand),floor=unique(visible?.floor),
  own=unique(visible?.humanCaptured),lost=unique(visible?.computerCaptured);
 const handSet=new Set(hand),floorSet=new Set(floor),ownSet=new Set(own),lostSet=new Set(lost);
 const byId=new Map((deck||[]).map(c=>[c.id,c]));
 const monthOf=id=>byId.get(id)?.month;
 const allOf=test=>(deck||[]).filter(test);
 const route=(cards)=>{
  const known=cards.filter(c=>handSet.has(c.id)||ownSet.has(c.id));
  const reachable=cards.filter(c=>floorSet.has(c.id)&&hand.some(id=>monthOf(id)===c.month));
  const opponent=cards.filter(c=>lostSet.has(c.id));
  return {known:known.length,reachable:reachable.length,lost:opponent.length,total:cards.length};
 };
 const bright=route(allOf(c=>c.type==='bright'));
 const godori=route(allOf(c=>c.flags?.includes('godori')));
 const red=route(allOf(c=>c.type==='ribbon'&&c.ribbonSet==='red'));
 const blue=route(allOf(c=>c.type==='ribbon'&&c.ribbonSet==='blue'));
 const plain=route(allOf(c=>c.type==='ribbon'&&c.ribbonSet==='grass'));
 const singleUnits=hand.map(id=>byId.get(id)).filter(Boolean).reduce((n,c)=>
  n+(c.type==='pi'?c.flags?.includes('doublePi')?2:1:c.flags?.includes('switchPi')?2:0),0);
 const pictureCount=hand.map(id=>byId.get(id)).filter(c=>c?.type==='animal').length;
 const triple=[...new Set(hand.map(monthOf))].some(m=>m&&hand.filter(id=>monthOf(id)===m).length>=3);
 const info={brights:bright,godori,'red-stripes':red,'blue-stripes':blue,'plain-stripes':plain,
  singles:{known:singleUnits,reachable:0,lost:0,total:10},
  pictures:{known:pictureCount,reachable:0,lost:0,total:5},
  'shake-bomb':{known:triple?3:0,reachable:0,lost:0,total:3}};
 const suggested=[];
 if(bright.lost<=2&&bright.total-bright.lost>=3&&bright.known+bright.reachable>=1)suggested.push('brights');
 if(godori.lost===0&&godori.known+godori.reachable>=1)suggested.push('godori');
 for(const strategy of Object.keys(ribbonMap)){
  const r=info[strategy];
  if(r.lost===0&&r.known+r.reachable>=1)suggested.push(strategy);
 }
 if(singleUnits>=4||suggested.length===0)suggested.push('singles');
 if(pictureCount>=3)suggested.push('pictures');
 if(triple)suggested.push('shake-bomb');
 // A Bright goal with only one known Bright is a *possibility*, never a
 // claim that a three-Bright set is already guaranteed.
 const evidence=[
  1,Math.min(1,bright.known/5),Math.min(1,bright.reachable/5),
  Math.min(1,godori.known/3),Math.min(1,godori.reachable/3),
  Math.min(1,red.known/3),Math.min(1,blue.known/3),Math.min(1,plain.known/3),
  Math.min(1,singleUnits/12),Math.min(1,pictureCount/10),
  Math.min(1,bright.lost/5),Math.min(1,godori.lost/3)
 ];
 return {suggested,info,evidence,strategies:[...STRATEGIES]};
}
function withLearnedWeights(review,model){
 // Never recommend an impossible set. Expert weights influence future games
 // ONLY when downloaded from the verified development learning server.
 if(!model||!Number.isInteger(model.examples)||model.examples<1||
   !Array.isArray(model.weights)||model.weights.length!==STRATEGIES.length)return review;
 const rows=model.weights;
 if(rows.some(row=>!Array.isArray(row)||row.length!==review.evidence.length||
   row.some(w=>typeof w!=='number'||!Number.isFinite(w))))return review;
 const allowed=strategy=>{
  if(strategy==='singles')return true;
  if(strategy==='pictures')return review.info.pictures.known>0;
  if(strategy==='shake-bomb')return review.info['shake-bomb'].known>0;
  const r=review.info[strategy];
  if(!r||r.known+r.reachable<1)return false;
  return strategy==='brights'?r.total-r.lost>=3:r.lost===0;
 };
 const learned=STRATEGIES.filter((strategy,index)=>{
  if(!allowed(strategy))return false;
  const row=rows[index],score=row.reduce((acc,w,i)=>acc+w*review.evidence[i],0);
  return score>=0;
 });
 // A model with too few labels may not yet recognize any route; retain the
 // deterministic prior rather than produce an empty or misleading hint.
 return {...review,suggested:learned.length?learned:review.suggested,modelExamples:model.examples};
}
const api=Object.freeze({evaluate,withLearnedWeights,STRATEGIES});
root.GoStopDevOpeningEvidence=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
