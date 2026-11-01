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
// Match the FROZEN Training opening strategy rules (app.js trainingStrategyProfile).
// A single interesting card is not a strategic opening recommendation.
// This pure, read-only mirror exists only for the isolated dev reviewer.
function nativeOpeningStrategies(visible,deck){
 const all=new Map((deck||[]).map(c=>[c.id,c]));
 const cards=field=>[...new Set(visible?.[field]||[])].map(id=>all.get(id)).filter(Boolean);
 const hand=cards('hand'),floor=cards('floor'),mine=cards('humanCaptured'),theirs=cards('computerCaptured');
 const handMonths=new Set(hand.map(c=>c.month)),floorMonths=new Set(floor.map(c=>c.month));
 const byMonth=arr=>new Set(arr.map(c=>c.month));
 const uniqueIds=arr=>new Set(arr.map(c=>c.id));
 const route=(predicate,identity='month')=>{
  const held=hand.filter(predicate),captured=mine.filter(predicate),lost=theirs.filter(predicate);
  const playable=held.filter(c=>floorMonths.has(c.month));
  const claimable=floor.filter(c=>predicate(c)&&handMonths.has(c.month));
  const uniq=identity==='id'?uniqueIds:byMonth;
  const potentialCount=uniq([...captured,...held,...claimable]).size;
  const controlledCount=uniq([...captured,...playable,...claimable]).size;
  const immediateCount=uniq([...playable,...claimable]).size;
  return {lost:lost.length,potentialCount,controlledCount,immediateCount,
   strong:controlledCount>=2,veryStrong:controlledCount>=3};
 };
 const options=[];
 for(const [family,strategy] of [['red','red-stripes'],['blue','blue-stripes'],['grass','plain-stripes']]){
  const r=route(c=>c.type==='ribbon'&&c.ribbonSet===family);
  if(r.lost||r.potentialCount<2)continue;
  options.push({strategy,label:({red:'Red',blue:'Blue',grass:'Plain'}[family]+' Stripes'),score:300+(r.strong?120:0)+(r.veryStrong?120:0)+r.controlledCount*45+r.immediateCount*30+r.potentialCount*20});
 }
 const bright=route(c=>c.type==='bright','id');
 if(5-bright.lost>=3&&bright.potentialCount>=2)
  options.push({strategy:'brights',label:'Brights',score:330+(bright.strong?100:0)+(bright.veryStrong?120:0)+bright.controlledCount*45+bright.immediateCount*30+bright.potentialCount*25});
 const godori=route(c=>c.flags?.includes('godori')&&[2,4,8].includes(c.month));
 if(godori.lost===0&&godori.potentialCount>=2&&godori.immediateCount>0)
  options.push({strategy:'godori',label:'5-BIRDIES',score:360+(godori.strong?120:0)+(godori.veryStrong?140:0)+godori.controlledCount*50+godori.immediateCount*35+godori.potentialCount*30});
 options.sort((a,b)=>b.score-a.score||a.label.localeCompare(b.label));
 return options.length?options.map(o=>o.strategy):['singles'];
}

// Explain exactly WHERE an opening-set card is, without mistaking a
// reachable table card for another card in the player's hand. Counts are
// unique physical card IDs; a floor card is reachable only if the player
// holds a card from that month. This does not affect strategy selection.
function openingRouteLocations(visible,deck,strategy){
 const predicates={
  brights:c=>c.type==='bright',
  godori:c=>c.flags?.includes('godori')&&[2,4,8].includes(c.month),
  'red-stripes':c=>c.type==='ribbon'&&c.ribbonSet==='red',
  'blue-stripes':c=>c.type==='ribbon'&&c.ribbonSet==='blue',
  'plain-stripes':c=>c.type==='ribbon'&&c.ribbonSet==='grass'
 };
 const predicate=predicates[strategy];
 if(!predicate)return null;
 const byId=new Map((deck||[]).map(c=>[c.id,c]));
 const from=key=>[...new Set(visible?.[key]||[])].map(id=>byId.get(id)).filter(Boolean);
 const hand=from('hand'),floor=from('floor'),captured=from('humanCaptured'),lost=from('computerCaptured');
 const handMonths=new Set(hand.map(c=>c.month));
 const held=hand.filter(predicate),mine=captured.filter(predicate);
 const reachable=floor.filter(c=>predicate(c)&&handMonths.has(c.month));
 const opponent=lost.filter(predicate);
 const uniqueIds=rows=>[...new Set(rows.map(c=>c.id))];
 return Object.freeze({
  hand:uniqueIds(held).length,
  captured:uniqueIds(mine).length,
  reachable:uniqueIds(reachable).length,
  opponent:uniqueIds(opponent).length,
  potential:uniqueIds([...held,...mine,...reachable]).length
 });
}
const routeLabels={
 en:{brights:'Brights',godori:'5-BIRDIES','red-stripes':'Red Stripes','blue-stripes':'Blue Stripes','plain-stripes':'Plain Stripes'},
 ko:{brights:'광',godori:'고도리','red-stripes':'홍단','blue-stripes':'청단','plain-stripes':'초단'},
 es:{brights:'Brillantes',godori:'5 pájaros','red-stripes':'Cintas rojas','blue-stripes':'Cintas azules','plain-stripes':'Cintas simples'},
 fr:{brights:'Lumineuses',godori:'5 oiseaux','red-stripes':'Rubans rouges','blue-stripes':'Rubans bleus','plain-stripes':'Rubans simples'},
 de:{brights:'Helle Karten',godori:'5 Vögel','red-stripes':'Rote Bänder','blue-stripes':'Blaue Bänder','plain-stripes':'Einfache Bänder'},
 ja:{brights:'光',godori:'五鳥','red-stripes':'赤短','blue-stripes':'青短','plain-stripes':'草短'},
 zh:{brights:'光牌',godori:'五鸟','red-stripes':'红短','blue-stripes':'蓝短','plain-stripes':'草短'}
};
const countPhrases={
 en:c=>`${c.hand} in hand, ${c.captured} captured, ${c.reachable} reachable on the table`,
 ko:c=>`손패 ${c.hand}장, 획득 ${c.captured}장, 바닥에서 획득 가능 ${c.reachable}장`,
 es:c=>`${c.hand} en mano, ${c.captured} capturadas, ${c.reachable} alcanzables en la mesa`,
 fr:c=>`${c.hand} en main, ${c.captured} capturées, ${c.reachable} accessibles sur la table`,
 de:c=>`${c.hand} auf der Hand, ${c.captured} gesammelt, ${c.reachable} auf dem Tisch erreichbar`,
 ja:c=>`手札 ${c.hand}枚、獲得済み ${c.captured}枚、場から取れる札 ${c.reachable}枚`,
 zh:c=>`手牌 ${c.hand}张、已获得 ${c.captured}张、桌面可拿 ${c.reachable}张`
};
function openingLocationLines(visible,deck,strategies,locale='en'){
 const lang=routeLabels[locale]?locale:'en';
 return (strategies||[]).map(strategy=>{
  const counts=openingRouteLocations(visible,deck,strategy);
  if(!counts)return null;
  return (routeLabels[lang][strategy]||strategy)+': '+countPhrases[lang](counts)+'.';
 }).filter(Boolean);
}

// When the frozen Training coach renders English opening advice, its heading
// is authoritative. Never train on a second recommendation that disagrees
// with what the player saw. Other locales retain the exact native route rules.
function strategiesFromEnglishCoach(text){
 const match=String(text||'').match(/^\s*Best strateg(?:y|ies):\s*([^.!?]+)[.!?]/i);
 if(!match)return null;
 const names={'brights':'brights','5-birdies':'godori','red stripes':'red-stripes',
  'blue stripes':'blue-stripes','plain stripes':'plain-stripes','singles':'singles'};
 const labels=match[1].replace(/,?\s+and\s+/gi,',').split(',').map(s=>s.trim().toLowerCase());
 const options=labels.map(x=>names[x]);
 if(!options.length||options.some(x=>!x)||new Set(options).size!==options.length)return null;
 return options;
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
const api=Object.freeze({evaluate,withLearnedWeights,nativeOpeningStrategies,strategiesFromEnglishCoach,openingRouteLocations,openingLocationLines,STRATEGIES});
root.GoStopDevOpeningEvidence=api;
if(typeof module!=='undefined'&&module.exports)module.exports=api;
})(typeof globalThis!=='undefined'?globalThis:this);
